//! Read-only parser for Claude Code JSONL session files.

use std::{
    collections::HashMap,
    fs::File,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
};

use chrono::{DateTime, Utc};
use serde_json::{json, Value};

use super::{
    aggregates_from_detail, message_metrics_from_detail, model_aggregates_from_detail,
    per_model_usage, Discovery, Parsed, SessionSource, Unit,
};
use crate::{
    model::{
        AppError, Block, CostBreakdown, Message, Provider, Role, ScanError, SessionDetail,
        SessionSummary, Subagent, Usage,
    },
    pricing,
};

pub struct ClaudeSource {
    projects_dir: PathBuf,
}

impl ClaudeSource {
    pub fn new(projects_dir: PathBuf) -> Self {
        Self { projects_dir }
    }
    pub fn projects_dir(&self) -> &PathBuf {
        &self.projects_dir
    }
    pub fn default_projects_dir() -> PathBuf {
        std::env::var_os("AGENT_DASHBOARD_CLAUDE_DIR")
            .map(PathBuf::from)
            .or_else(|| super::home_dir().map(|h| h.join(".claude").join("projects")))
            .unwrap_or_else(|| PathBuf::from(".claude/projects"))
    }

    fn discover_files(&self) -> Result<Vec<PathBuf>, AppError> {
        let mut files = Vec::new();
        let entries = match std::fs::read_dir(&self.projects_dir) {
            Ok(entries) => entries,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(files),
            Err(e) => return Err(AppError::Io(e.to_string())),
        };
        for entry in entries {
            let entry = entry.map_err(|e| AppError::Io(e.to_string()))?;
            if !entry
                .file_type()
                .map_err(|e| AppError::Io(e.to_string()))?
                .is_dir()
            {
                continue;
            }
            let children =
                std::fs::read_dir(entry.path()).map_err(|e| AppError::Io(e.to_string()))?;
            for child in children {
                let child = child.map_err(|e| AppError::Io(e.to_string()))?;
                if child.path().extension().is_some_and(|ext| ext == "jsonl") {
                    files.push(child.path());
                }
            }
        }
        files.sort();
        Ok(files)
    }

    pub fn parse_file(path: &Path) -> Result<SessionDetail, AppError> {
        Self::parse_file_with_model_costs(path).map(|(detail, _, _, _)| detail)
    }

    pub(crate) fn parse_file_with_model_costs(
        path: &Path,
    ) -> Result<
        (
            SessionDetail,
            HashMap<String, CostBreakdown>,
            HashMap<String, CostBreakdown>,
            Vec<ScanError>,
        ),
        AppError,
    > {
        let file = File::open(path).map_err(|e| AppError::Io(e.to_string()))?;
        let root = parse_events(BufReader::new(file))?;
        let mut model_costs = root.model_costs.clone();
        let mut message_costs = root.message_costs.clone();
        let stem = path
            .file_stem()
            .and_then(|s| s.to_str())
            .unwrap_or_default();
        let mut subagents = Vec::new();
        let mut scan_errors = Vec::new();
        let subagent_dir = path
            .parent()
            .unwrap_or(Path::new("."))
            .join(stem)
            .join("subagents");
        if let Ok(entries) = std::fs::read_dir(subagent_dir) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.extension().is_some_and(|ext| ext == "jsonl") {
                    let parsed = match File::open(&p) {
                        Ok(file) => match parse_events(BufReader::new(file)) {
                            Ok(parsed) => parsed,
                            Err(error) => {
                                eprintln!(
                                    "Skipping unreadable Claude subagent {}: {error:?}",
                                    p.display()
                                );
                                scan_errors.push(ScanError {
                                    path: p.display().to_string(),
                                    message: error.to_string(),
                                    provider: Some(Provider::Claude),
                                });
                                continue;
                            }
                        },
                        Err(error) => {
                            eprintln!(
                                "Skipping unreadable Claude subagent {}: {error}",
                                p.display()
                            );
                            scan_errors.push(ScanError {
                                path: p.display().to_string(),
                                message: error.to_string(),
                                provider: Some(Provider::Claude),
                            });
                            continue;
                        }
                    };
                    for (model, cost) in &parsed.model_costs {
                        add_cost(model_costs.entry(model.clone()).or_default(), *cost);
                    }
                    message_costs.extend(parsed.message_costs);
                    if !parsed.messages.is_empty() {
                        let unpriced_tokens = unpriced_tokens(&parsed.messages);
                        subagents.push(Subagent {
                            id: p
                                .file_stem()
                                .and_then(|s| s.to_str())
                                .unwrap_or_default()
                                .strip_prefix("agent-")
                                .unwrap_or(
                                    p.file_stem().and_then(|s| s.to_str()).unwrap_or_default(),
                                )
                                .to_string(),
                            agent_type: parsed.agent_type,
                            parent_tool_call_id: None,
                            started_at: parsed.started.clone(),
                            ended_at: parsed.ended.clone(),
                            usage: parsed.usage,
                            cost_usd: parsed.cost,
                            cost_breakdown: parsed.cost_breakdown,
                            unpriced_tokens: (unpriced_tokens > 0).then_some(unpriced_tokens),
                            messages: parsed.messages,
                        });
                    }
                }
            }
        }
        subagents.sort_by(|a, b| a.started_at.cmp(&b.started_at));
        let project_path = root.project_path.clone().unwrap_or_default();
        let mut usage = root.usage;
        let mut cost_breakdown = root.cost_breakdown;
        for sub in &subagents {
            add_usage(&mut usage, sub.usage);
            add_cost(&mut cost_breakdown, sub.cost_breakdown);
        }
        let unpriced_tokens = unpriced_tokens(&root.messages).saturating_add(
            subagents
                .iter()
                .map(|subagent| subagent.unpriced_tokens.unwrap_or(0))
                .sum::<u64>(),
        );
        let mut model_counts: HashMap<String, u64> = HashMap::new();
        for m in &root.messages {
            if let Some(model) = &m.model {
                *model_counts.entry(model.clone()).or_default() += m
                    .usage
                    .map(|u| {
                        u.input_tokens
                            + u.output_tokens
                            + u.cache_read_tokens
                            + u.cache_creation_tokens
                    })
                    .unwrap_or(1);
            }
        }
        for sub in &subagents {
            for m in &sub.messages {
                if let Some(model) = &m.model {
                    *model_counts.entry(model.clone()).or_default() += m
                        .usage
                        .map(|u| {
                            u.input_tokens
                                + u.output_tokens
                                + u.cache_read_tokens
                                + u.cache_creation_tokens
                        })
                        .unwrap_or(1);
                }
            }
        }
        let mut models: Vec<_> = model_counts.into_iter().collect();
        models.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
        let started = root.started;
        let ended = root.ended;
        let started_dt = DateTime::parse_from_rfc3339(&started)
            .map(|x| x.with_timezone(&Utc))
            .unwrap_or_else(|_| Utc::now());
        let ended_dt = DateTime::parse_from_rfc3339(&ended)
            .map(|x| x.with_timezone(&Utc))
            .unwrap_or(started_dt);
        let tool_calls: Vec<&crate::model::ToolCall> = root
            .messages
            .iter()
            .chain(subagents.iter().flat_map(|s| s.messages.iter()))
            .flat_map(|m| m.blocks.iter())
            .filter_map(|b| {
                if let Block::ToolCall(t) = b {
                    Some(t)
                } else {
                    None
                }
            })
            .collect();
        let summary = SessionSummary {
            id: stem.to_string(),
            provider: Provider::Claude,
            project_path: project_path.clone(),
            project_key: format!("path:{project_path}"),
            project_name: project_path
                .trim_end_matches(['\\', '/'])
                .rsplit(['\\', '/'])
                .next()
                .unwrap_or_default()
                .to_string(),
            source_dir: None,
            title: root.title,
            first_prompt: root.first_prompt,
            started_at: started,
            ended_at: ended,
            duration_ms: ended_dt
                .signed_duration_since(started_dt)
                .num_milliseconds()
                .max(0) as u64,
            models: models.into_iter().map(|x| x.0).collect(),
            git_branch: root.git_branch,
            cli_version: root.cli_version,
            message_count: root
                .messages
                .len()
                .saturating_add(subagents.iter().map(|s| s.messages.len()).sum::<usize>())
                as u32,
            tool_call_count: tool_calls.len() as u32,
            tool_error_count: tool_calls.iter().filter(|t| t.is_error).count() as u32,
            filtered_tool_calls: None,
            filtered_tool_errors: None,
            subagent_count: subagents.len() as u32,
            usage,
            cost_usd: cost_breakdown.total(),
            cost_breakdown,
            unpriced_tokens: (unpriced_tokens > 0).then_some(unpriced_tokens),
        };
        Ok((
            SessionDetail {
                summary,
                messages: root.messages,
                subagents,
            },
            model_costs,
            message_costs,
            scan_errors,
        ))
    }
}

impl SessionSource for ClaudeSource {
    fn provider(&self) -> Provider {
        Provider::Claude
    }
    fn source_dir(&self) -> PathBuf {
        self.projects_dir.clone()
    }

    fn discover(&self) -> Result<Discovery, AppError> {
        let mut discovery = Discovery::default();
        for path in self.discover_files()? {
            let key = path
                .file_stem()
                .and_then(|stem| stem.to_str())
                .unwrap_or_default()
                .to_owned();
            let mut files = vec![path.clone()];
            let subagent_dir = path
                .parent()
                .unwrap_or(Path::new("."))
                .join(&key)
                .join("subagents");
            if let Ok(entries) = std::fs::read_dir(subagent_dir) {
                for entry in entries.flatten() {
                    let candidate = entry.path();
                    if candidate.extension().is_some_and(|ext| ext == "jsonl") {
                        files.push(candidate);
                    }
                }
            }
            files.sort();
            discovery.units.push(Unit {
                key,
                files,
                metadata: HashMap::new(),
            });
        }
        Ok(discovery)
    }

    fn parse(&self, unit: &Unit) -> Result<Parsed, AppError> {
        let path = unit
            .files
            .first()
            .ok_or_else(|| AppError::Io(format!("Claude unit {} has no files", unit.key)))?;
        let (detail, model_costs, message_costs, errors) = Self::parse_file_with_model_costs(path)?;
        let model_usage = per_model_usage(&detail);
        let (tool_aggregates, hourly_activity) = aggregates_from_detail(&detail);
        let model_aggregates = model_aggregates_from_detail(&detail);
        let message_metrics =
            message_metrics_from_detail(&detail, Provider::Claude, &message_costs);
        Ok(Parsed {
            summary: detail.summary.clone(),
            detail: Some(detail),
            model_usage,
            model_costs,
            tool_aggregates,
            hourly_activity,
            model_aggregates,
            message_metrics,
            errors,
        })
    }
}

struct ParsedFile {
    messages: Vec<Message>,
    usage: Usage,
    cost: f64,
    cost_breakdown: CostBreakdown,
    model_costs: HashMap<String, CostBreakdown>,
    message_costs: HashMap<String, CostBreakdown>,
    started: String,
    ended: String,
    title: Option<String>,
    first_prompt: Option<String>,
    project_path: Option<String>,
    git_branch: Option<String>,
    cli_version: Option<String>,
    agent_type: Option<String>,
}

fn parse_events(reader: impl BufRead) -> Result<ParsedFile, AppError> {
    let mut messages: Vec<Message> = Vec::new();
    let mut ids: HashMap<String, usize> = HashMap::new();
    let mut tool_times: HashMap<String, DateTime<Utc>> = HashMap::new();
    let mut tool_indexes: HashMap<String, (usize, usize)> = HashMap::new();
    let mut cache_write_parts: HashMap<String, (u64, u64)> = HashMap::new();
    let mut title = None;
    let mut first_prompt = None;
    let mut project_path = None;
    let mut git_branch = None;
    let mut cli_version = None;
    let mut agent_type = None;
    let mut timestamps = Vec::new();
    for line in reader.lines() {
        let line = line.map_err(|e| AppError::Io(e.to_string()))?;
        let Ok(v): Result<Value, _> = serde_json::from_str(&line) else {
            continue;
        };
        let typ = v.get("type").and_then(Value::as_str).unwrap_or("");
        if typ == "ai-title" {
            title = v
                .get("title")
                .or_else(|| v.get("content"))
                .and_then(Value::as_str)
                .map(str::to_string);
            continue;
        }
        if typ != "user" && typ != "assistant" {
            continue;
        }
        let ts = v
            .get("timestamp")
            .and_then(Value::as_str)
            .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
            .map(|d| d.with_timezone(&Utc));
        if let Some(t) = ts {
            timestamps.push(t);
        }
        project_path =
            project_path.or_else(|| v.get("cwd").and_then(Value::as_str).map(str::to_string));
        git_branch = git_branch.or_else(|| {
            v.get("gitBranch")
                .and_then(Value::as_str)
                .map(str::to_string)
        });
        cli_version =
            cli_version.or_else(|| v.get("version").and_then(Value::as_str).map(str::to_string));
        let msg = v.get("message").unwrap_or(&Value::Null);
        if typ == "assistant" {
            let model = msg.get("model").and_then(Value::as_str);
            if v.get("isMeta").and_then(Value::as_bool) == Some(true)
                || model == Some("<synthetic>")
            {
                continue;
            }
            let id = msg
                .get("id")
                .and_then(Value::as_str)
                .or_else(|| v.get("uuid").and_then(Value::as_str))
                .unwrap_or("unknown")
                .to_string();
            let idx = if let Some(i) = ids.get(&id) {
                *i
            } else {
                let i = messages.len();
                ids.insert(id.clone(), i);
                messages.push(Message {
                    id: id.clone(),
                    role: Role::Assistant,
                    timestamp: ts.map(fmt_ts).unwrap_or_default(),
                    model: model.map(str::to_string),
                    blocks: Vec::new(),
                    usage: None,
                    branch: None,
                });
                i
            };
            if let Some(m) = model {
                messages[idx].model = Some(m.to_string());
            }
            if let Some(u) = msg.get("usage") {
                messages[idx].usage = Some(read_usage(u));
                let (five, one) = read_cache_parts(u);
                cache_write_parts.insert(id.clone(), (five, one));
            }
            if let Some(content) = msg.get("content").and_then(Value::as_array) {
                for block in content {
                    match block.get("type").and_then(Value::as_str).unwrap_or("") {
                        "text" => {
                            if let Some(text) = block.get("text").and_then(Value::as_str) {
                                push_text(
                                    &mut messages[idx].blocks,
                                    Block::Text { text: text.into() },
                                );
                            }
                        }
                        "thinking" => {
                            if let Some(text) = block.get("thinking").and_then(Value::as_str) {
                                push_text(
                                    &mut messages[idx].blocks,
                                    Block::Thinking { text: text.into() },
                                );
                            }
                        }
                        "tool_use" => {
                            let tool_id = block
                                .get("id")
                                .and_then(Value::as_str)
                                .unwrap_or_default()
                                .to_string();
                            if let Some(t) = ts {
                                tool_times.insert(tool_id.clone(), t);
                            }
                            let block_idx = messages[idx].blocks.len();
                            tool_indexes.insert(tool_id.clone(), (idx, block_idx));
                            messages[idx]
                                .blocks
                                .push(Block::ToolCall(crate::model::ToolCall {
                                    id: tool_id,
                                    name: block
                                        .get("name")
                                        .and_then(Value::as_str)
                                        .unwrap_or("unknown")
                                        .into(),
                                    input: block.get("input").cloned().unwrap_or(json!({})),
                                    result: None,
                                    is_error: false,
                                    duration_ms: None,
                                    parent_call_id: None,
                                }));
                        }
                        _ => {}
                    }
                }
            }
        } else {
            let content = msg.get("content").or_else(|| v.get("content"));
            let mut texts = Vec::new();
            let mut results = Vec::new();
            match content {
                Some(Value::String(s)) => texts.push(s.as_str()),
                Some(Value::Array(a)) => {
                    for b in a {
                        match b.get("type").and_then(Value::as_str).unwrap_or("") {
                            "text" => {
                                if let Some(t) = b.get("text").and_then(Value::as_str) {
                                    texts.push(t)
                                }
                            }
                            "tool_result" => results.push(b),
                            _ => {}
                        }
                    }
                }
                _ => {}
            }
            for result in results {
                let id = result
                    .get("tool_use_id")
                    .and_then(Value::as_str)
                    .unwrap_or("");
                if let Some((message_idx, block_idx)) = tool_indexes.get(id).copied() {
                    if let Some(Block::ToolCall(tool)) = messages
                        .get_mut(message_idx)
                        .and_then(|message| message.blocks.get_mut(block_idx))
                    {
                        tool.result = Some(result_text(result.get("content")));
                        tool.is_error = result
                            .get("is_error")
                            .and_then(Value::as_bool)
                            .unwrap_or(false);
                        tool.duration_ms =
                            ts.zip(tool_times.get(id).copied()).map(|(end, start)| {
                                end.signed_duration_since(start).num_milliseconds().max(0) as u64
                            });
                    }
                }
            }
            if !texts.is_empty() && v.get("isMeta").and_then(Value::as_bool) != Some(true) {
                let text = texts.join("\n");
                if first_prompt.is_none() {
                    let prompt = clean_first_prompt(&text);
                    if !prompt.is_empty() {
                        first_prompt = Some(truncate_chars(&prompt, 200));
                    }
                }
                let id = v
                    .get("uuid")
                    .and_then(Value::as_str)
                    .unwrap_or("user")
                    .to_string();
                let mut blocks = Vec::new();
                push_text(&mut blocks, Block::Text { text });
                messages.push(Message {
                    id,
                    role: Role::User,
                    timestamp: ts.map(fmt_ts).unwrap_or_default(),
                    model: None,
                    blocks,
                    usage: None,
                    branch: None,
                });
            }
        }
        if let Some(at) = v.get("agentId").and_then(Value::as_str) {
            agent_type = v
                .get("agentType")
                .and_then(Value::as_str)
                .or_else(|| v.get("subagent_type").and_then(Value::as_str))
                .map(str::to_string);
            let _ = at;
        }
    }
    messages.sort_by(|a, b| a.timestamp.cmp(&b.timestamp));
    timestamps.sort();
    let usage = messages
        .iter()
        .filter_map(|m| m.usage)
        .fold(Usage::default(), |mut a, u| {
            add_usage(&mut a, u);
            a
        });
    let (model_costs, message_costs): (
        HashMap<String, CostBreakdown>,
        HashMap<String, CostBreakdown>,
    ) = messages
        .iter()
        .filter_map(|m| m.usage.map(|u| (m, u)))
        .fold(
            (HashMap::new(), HashMap::new()),
            |(mut costs, mut message_costs), (m, u)| {
                let (five, one) = cache_write_parts
                    .get(&m.id)
                    .copied()
                    .unwrap_or((u.cache_creation_tokens, 0));
                let model = m.model.as_deref().unwrap_or("").to_string();
                let message_cost = pricing::cost_breakdown_with_cache(&model, u, five, one);
                add_cost(costs.entry(model.clone()).or_default(), message_cost);
                message_costs.insert(m.id.clone(), message_cost);
                (costs, message_costs)
            },
        );
    let cost_breakdown =
        model_costs
            .values()
            .copied()
            .fold(CostBreakdown::default(), |mut total, part| {
                add_cost(&mut total, part);
                total
            });
    let cost = cost_breakdown.total();
    Ok(ParsedFile {
        messages,
        usage,
        cost,
        cost_breakdown,
        model_costs,
        message_costs,
        started: timestamps.first().map(|x| fmt_ts(*x)).unwrap_or_default(),
        ended: timestamps.last().map(|x| fmt_ts(*x)).unwrap_or_default(),
        title,
        first_prompt,
        project_path,
        git_branch,
        cli_version,
        agent_type,
    })
}

fn clean_first_prompt(text: &str) -> String {
    const DROPPED_TAGS: &[&str] = &[
        "command-name",
        "command-message",
        "command-args",
        "local-command-stdout",
        "system-reminder",
    ];

    let bytes = text.as_bytes();
    let mut output = String::with_capacity(text.len());
    let mut dropped = Vec::<String>::new();
    let mut copied_until = 0;
    let mut cursor = 0;

    while cursor < bytes.len() {
        if bytes[cursor] != b'<' {
            cursor += 1;
            continue;
        }
        let Some(relative_end) = bytes[cursor..].iter().position(|byte| *byte == b'>') else {
            break;
        };
        let end = cursor + relative_end + 1;
        let inside = &text[cursor + 1..end - 1];
        let inside = inside.trim_start();
        let closing = inside.starts_with('/');
        let tag = inside.strip_prefix('/').unwrap_or(inside);
        let name_end = tag
            .find(|ch: char| !(ch.is_ascii_alphanumeric() || ch == '-' || ch == '_'))
            .unwrap_or(tag.len());
        let name = &tag[..name_end];
        let recognized = name == "pasted_content" || DROPPED_TAGS.contains(&name);

        if !recognized {
            cursor += 1;
            continue;
        }

        if dropped.is_empty() {
            output.push_str(&text[copied_until..cursor]);
        }
        if DROPPED_TAGS.contains(&name) {
            if closing {
                if let Some(index) = dropped.iter().rposition(|open| open == name) {
                    dropped.truncate(index);
                }
            } else if !inside.ends_with('/') {
                dropped.push(name.to_string());
            }
        }
        cursor = end;
        copied_until = end;
    }

    if dropped.is_empty() {
        output.push_str(&text[copied_until..]);
    }
    output.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn read_usage(v: &Value) -> Usage {
    let cache = v.get("cache_creation");
    let write = cache
        .and_then(|c| c.get("ephemeral_5m_input_tokens"))
        .and_then(Value::as_u64)
        .unwrap_or(0)
        + cache
            .and_then(|c| c.get("ephemeral_1h_input_tokens"))
            .and_then(Value::as_u64)
            .unwrap_or(0);
    Usage {
        input_tokens: v.get("input_tokens").and_then(Value::as_u64).unwrap_or(0),
        output_tokens: v.get("output_tokens").and_then(Value::as_u64).unwrap_or(0),
        cache_read_tokens: v
            .get("cache_read_input_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        cache_creation_tokens: if write > 0 {
            write
        } else {
            v.get("cache_creation_input_tokens")
                .and_then(Value::as_u64)
                .unwrap_or(0)
        },
        reasoning_tokens: None,
    }
}
fn read_cache_parts(v: &Value) -> (u64, u64) {
    let Some(c) = v.get("cache_creation") else {
        return (
            v.get("cache_creation_input_tokens")
                .and_then(Value::as_u64)
                .unwrap_or(0),
            0,
        );
    };
    let five = c
        .get("ephemeral_5m_input_tokens")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let one = c
        .get("ephemeral_1h_input_tokens")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    if five + one == 0 {
        (
            v.get("cache_creation_input_tokens")
                .and_then(Value::as_u64)
                .unwrap_or(0),
            0,
        )
    } else {
        (five, one)
    }
}
fn add_usage(a: &mut Usage, b: Usage) {
    a.input_tokens += b.input_tokens;
    a.output_tokens += b.output_tokens;
    a.cache_read_tokens += b.cache_read_tokens;
    a.cache_creation_tokens += b.cache_creation_tokens;
}

fn unpriced_tokens(messages: &[Message]) -> u64 {
    messages
        .iter()
        .filter_map(|message| Some((message.model.as_deref()?, message.usage?)))
        .map(|(model, usage)| pricing::unpriced_tokens_for(Provider::Claude, model, usage))
        .fold(0u64, u64::saturating_add)
}

fn add_cost(a: &mut CostBreakdown, b: CostBreakdown) {
    a.input += b.input;
    a.output += b.output;
    a.cache_read += b.cache_read;
    a.cache_write += b.cache_write;
}
fn fmt_ts(t: DateTime<Utc>) -> String {
    t.to_rfc3339_opts(chrono::SecondsFormat::Millis, true)
}
fn push_text(blocks: &mut Vec<Block>, next: Block) {
    if let (Some(Block::Text { text: old }), Block::Text { text }) = (blocks.last_mut(), &next) {
        old.push_str(text)
    } else if let (Some(Block::Thinking { text: old }), Block::Thinking { text }) =
        (blocks.last_mut(), &next)
    {
        old.push_str(text)
    } else {
        blocks.push(next)
    }
}
fn truncate_chars(s: &str, n: usize) -> String {
    let mut out: String = s.chars().take(n).collect();
    if s.chars().count() > n {
        out.push('…')
    }
    out
}
fn result_text(v: Option<&Value>) -> String {
    match v {
        Some(Value::String(s)) => truncate_chars(s, 20_000),
        Some(Value::Array(a)) => truncate_chars(
            &a.iter()
                .filter_map(|x| x.get("text").and_then(Value::as_str))
                .collect::<Vec<_>>()
                .join("\n"),
            20_000,
        ),
        Some(x) => truncate_chars(&x.to_string(), 20_000),
        None => String::new(),
    }
}

#[cfg(test)]
mod title_tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn unwraps_pasted_content_and_collapses_whitespace() {
        assert_eq!(
            clean_first_prompt(
                "  <pasted_content id=\"b390\">\nFix   the bug\nplease</pasted_content>  "
            ),
            "Fix the bug please"
        );
    }

    #[test]
    fn drops_each_claude_command_and_system_wrapper() {
        for tag in [
            "command-name",
            "command-message",
            "command-args",
            "local-command-stdout",
            "system-reminder",
        ] {
            let wrapped = format!("<{tag}>hidden wrapper text</{tag}> Actual request");
            assert_eq!(clean_first_prompt(&wrapped), "Actual request", "tag: {tag}");
        }
    }

    #[test]
    fn falls_back_to_next_user_message_when_first_is_only_wrappers() {
        let input = concat!(
            r#"{"type":"user","message":{"content":"<command-name>/clear</command-name> <system-reminder>hidden</system-reminder>"}}"#,
            "\n",
            r#"{"type":"user","message":{"content":"Please summarize this project"}}"#,
            "\n"
        );
        let parsed = parse_events(Cursor::new(input)).unwrap();

        assert_eq!(
            parsed.first_prompt.as_deref(),
            Some("Please summarize this project")
        );
        let Block::Text { text } = &parsed.messages[0].blocks[0] else {
            panic!("expected user message text block");
        };
        assert_eq!(
            text,
            "<command-name>/clear</command-name> <system-reminder>hidden</system-reminder>"
        );
    }

    #[test]
    fn keeps_pasted_content_body_in_message_while_cleaning_title() {
        let body = "<pasted_content id=\"x\">Repair   this issue</pasted_content>";
        let input = format!(
            r#"{{"type":"user","message":{{"content":{}}}}}"#,
            json!(body)
        );
        let parsed = parse_events(Cursor::new(input)).unwrap();

        assert_eq!(parsed.first_prompt.as_deref(), Some("Repair this issue"));
        let Block::Text { text } = &parsed.messages[0].blocks[0] else {
            panic!("expected user message text block");
        };
        assert_eq!(text, body);
    }
}
