use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fs::File,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
    time::SystemTime,
};

use chrono::DateTime;
use serde_json::{json, Value};

use super::super::{
    aggregates_from_detail, message_metrics_from_detail, model_aggregates_from_detail, Parsed, Unit,
};
use super::{Header, HEADER_PREFIX, INDEX_TITLE_KEY, ROOT_ID_KEY};
use crate::{
    model::{
        AppError, Block, CostBreakdown, Message, Provider, Role, ScanError, SessionDetail,
        SessionSummary, Subagent, ToolCall, Usage,
    },
    pricing::{self, PriceCtx},
};

const TOOL_RESULT_LIMIT: usize = 20_000;

#[derive(Debug, Default)]
struct ThreadData {
    id: String,
    headers: Vec<Header>,
    messages: Vec<Message>,
    models_seen: HashSet<String>,
    first_timestamp: Option<String>,
    last_timestamp: Option<String>,
    first_prompt: Option<String>,
    spawned_call_ids: HashMap<String, String>,
}

#[derive(Debug)]
struct WorkingMessage {
    id: String,
    has_real_id: bool,
    timestamp: String,
    model: Option<String>,
    branch: Option<String>,
    blocks: Vec<Block>,
}

impl WorkingMessage {
    fn new(
        thread_id: &str,
        ordinal: u64,
        timestamp: &str,
        model: Option<String>,
        branch: Option<String>,
    ) -> Self {
        Self {
            id: format!("{thread_id}:{ordinal}"),
            has_real_id: false,
            timestamp: timestamp.to_owned(),
            model,
            branch,
            blocks: Vec::new(),
        }
    }

    fn set_id(&mut self, id: Option<&str>) {
        if !self.has_real_id {
            if let Some(id) = id.filter(|id| !id.is_empty()) {
                self.id = id.to_owned();
                self.has_real_id = true;
            }
        }
    }

    fn push_tool(&mut self, tool: ToolCall) {
        self.blocks.push(Block::ToolCall(tool));
    }

    fn tool_mut(&mut self, id: &str) -> Option<&mut ToolCall> {
        self.blocks.iter_mut().find_map(|block| match block {
            Block::ToolCall(tool) if tool.id == id => Some(tool),
            _ => None,
        })
    }

    fn finish(self, usage: Option<Usage>) -> Message {
        Message {
            id: self.id,
            role: Role::Assistant,
            timestamp: self.timestamp,
            model: self.model,
            blocks: self.blocks,
            usage,
            branch: self.branch,
        }
    }
}

pub(super) fn parse(unit: &Unit) -> Result<Parsed, AppError> {
    parse_with_details(unit, true)
}

pub(super) fn parse_summary(unit: &Unit) -> Result<Parsed, AppError> {
    parse_with_details(unit, false)
}

fn parse_with_details(unit: &Unit, include_details: bool) -> Result<Parsed, AppError> {
    let root_id = unit
        .metadata
        .get(ROOT_ID_KEY)
        .cloned()
        .unwrap_or_else(|| unit.key.clone());
    let mut grouped: BTreeMap<String, Vec<(PathBuf, Header)>> = BTreeMap::new();
    for path in &unit.files {
        let key = format!("{HEADER_PREFIX}{}", path.to_string_lossy());
        let raw = unit
            .metadata
            .get(&key)
            .ok_or_else(|| AppError::Io(format!("missing Codex header for {}", path.display())))?;
        let header: Header = serde_json::from_str(raw).map_err(|error| {
            AppError::Io(format!(
                "invalid cached Codex header for {}: {error}",
                path.display()
            ))
        })?;
        grouped
            .entry(header.id.clone())
            .or_default()
            .push((path.clone(), header));
    }

    let mut threads = BTreeMap::new();
    let mut errors = Vec::new();
    for (thread_id, mut files) in grouped {
        files.sort_by_key(|(_, header)| {
            header
                .history_base
                .as_ref()
                .map(|base| base.end_ordinal_exclusive)
                .unwrap_or(0)
        });
        let branch_boundaries = branch_boundaries(&files);
        let mut thread = ThreadData {
            id: thread_id.clone(),
            headers: files.iter().map(|(_, h)| h.clone()).collect(),
            ..ThreadData::default()
        };
        for (index, (path, header)) in files.iter().enumerate() {
            let boundary = branch_boundaries.get(&index);
            parse_file(
                path,
                header,
                boundary,
                &mut thread,
                &mut errors,
                include_details,
            );
        }
        if thread.first_timestamp.is_none() {
            thread.first_timestamp = thread.headers.iter().find_map(|h| h.timestamp.clone());
        }
        if thread.last_timestamp.is_none() {
            thread.last_timestamp = thread.first_timestamp.clone();
        }
        threads.insert(thread_id, thread);
    }

    if threads.is_empty() {
        return Err(AppError::NotFound(unit.key.clone()));
    }

    let main_id = if threads.contains_key(&root_id) {
        root_id.clone()
    } else {
        eprintln!(
            "Codex session {root_id} has no root rollout; using its earliest sub-agent thread"
        );
        threads
            .values()
            .min_by(|a, b| a.first_timestamp.cmp(&b.first_timestamp))
            .map(|thread| thread.id.clone())
            .unwrap_or_else(|| root_id.clone())
    };
    let main = threads
        .remove(&main_id)
        .ok_or_else(|| AppError::NotFound(main_id.clone()))?;
    let models_seen: HashSet<_> = std::iter::once(&main)
        .chain(threads.values())
        .flat_map(|thread| thread.models_seen.iter().cloned())
        .collect();

    let (main_usage, main_costs, main_unpriced) = aggregate_messages(&main.messages);
    let mut model_usage = main_usage;
    let mut model_costs = main_costs;
    let mut total_usage = sum_usage_map(&model_usage);
    let mut total_cost = sum_cost_map(&model_costs);
    let mut unpriced_tokens = main_unpriced;
    let mut message_count = main.messages.len() as u32;
    let mut tool_call_count = count_tools(&main.messages);
    let mut tool_error_count = count_tool_errors(&main.messages);
    let mut spawn_maps: HashMap<String, HashMap<String, String>> = threads
        .iter()
        .map(|(id, thread)| (id.clone(), thread.spawned_call_ids.clone()))
        .collect();
    spawn_maps.insert(main.id.clone(), main.spawned_call_ids.clone());
    let mut subagents = Vec::new();

    let mut other_threads: Vec<_> = threads.into_values().collect();
    other_threads.sort_by(|a, b| {
        a.first_timestamp
            .cmp(&b.first_timestamp)
            .then_with(|| a.id.cmp(&b.id))
    });
    for thread in other_threads {
        let (usage_by_model, costs_by_model, unpriced) = aggregate_messages(&thread.messages);
        add_usage_maps(&mut model_usage, &usage_by_model);
        add_cost_maps(&mut model_costs, &costs_by_model);
        let usage = sum_usage_map(&usage_by_model);
        let cost_breakdown = sum_cost_map(&costs_by_model);
        total_usage = add_usage(total_usage, usage);
        total_cost = add_cost(total_cost, cost_breakdown);
        unpriced_tokens += unpriced;
        message_count += thread.messages.len() as u32;
        tool_call_count += count_tools(&thread.messages);
        tool_error_count += count_tool_errors(&thread.messages);
        let header = thread.headers.last();
        let parent_tool_call_id = thread
            .headers
            .iter()
            .find_map(|h| h.parent_thread_id.as_ref())
            .and_then(|parent_id| spawn_maps.get(parent_id))
            .and_then(|calls| calls.get(&thread.id))
            .cloned();
        subagents.push(Subagent {
            id: thread.id.clone(),
            agent_type: header.and_then(agent_type),
            parent_tool_call_id,
            started_at: thread.first_timestamp.clone().unwrap_or_else(|| "".into()),
            ended_at: thread.last_timestamp.clone().unwrap_or_else(|| "".into()),
            messages: thread.messages,
            usage,
            cost_usd: cost_breakdown.total(),
            cost_breakdown,
            unpriced_tokens: (unpriced > 0).then_some(unpriced),
        });
    }
    for model in models_seen {
        model_usage.entry(model).or_default();
    }

    let started_at = main
        .first_timestamp
        .clone()
        .or_else(|| main.headers.first().and_then(|h| h.timestamp.clone()))
        .unwrap_or_default();
    let ended_at = main
        .last_timestamp
        .clone()
        .or_else(|| main.headers.last().and_then(|h| h.timestamp.clone()))
        .unwrap_or_else(|| started_at.clone());
    let duration_ms = elapsed_ms(&started_at, &ended_at);
    let project_path = main
        .headers
        .iter()
        .rev()
        .find_map(|h| h.cwd.clone())
        .unwrap_or_default();
    let project_name = project_path
        .trim_end_matches(['\\', '/'])
        .rsplit(['\\', '/'])
        .next()
        .unwrap_or_default()
        .to_owned();
    let git_branch = main.headers.iter().rev().find_map(|header| {
        header
            .git
            .as_ref()
            .and_then(|git| git.get("branch"))
            .and_then(Value::as_str)
            .map(ToOwned::to_owned)
    });
    let cli_version = main
        .headers
        .iter()
        .rev()
        .find_map(|header| header.cli_version.clone());
    let models = ordered_models(&model_usage);
    let title = unit.metadata.get(INDEX_TITLE_KEY).cloned();
    let summary = SessionSummary {
        id: root_id.clone(),
        provider: Provider::Codex,
        project_key: format!("path:{project_path}"),
        project_path,
        project_name,
        source_dir: None,
        title,
        first_prompt: main.first_prompt.clone(),
        started_at,
        ended_at,
        duration_ms,
        models,
        git_branch,
        cli_version,
        message_count,
        tool_call_count,
        tool_error_count,
        filtered_tool_calls: None,
        filtered_tool_errors: None,
        subagent_count: subagents.len() as u32,
        usage: total_usage,
        cost_usd: total_cost.total(),
        cost_breakdown: total_cost,
        unpriced_tokens: (unpriced_tokens > 0).then_some(unpriced_tokens),
    };
    subagents.sort_by(|a, b| {
        a.started_at
            .cmp(&b.started_at)
            .then_with(|| a.id.cmp(&b.id))
    });
    let detail = SessionDetail {
        summary: summary.clone(),
        messages: main.messages,
        subagents,
    };
    let (tool_aggregates, hourly_activity) = aggregates_from_detail(&detail);
    let model_aggregates = model_aggregates_from_detail(&detail);
    let message_metrics = message_metrics_from_detail(&detail, Provider::Codex, &HashMap::new());
    // Retain only the aggregates used by metrics and the session detail. `total_usage` and
    // `total_cost` above include every agent, including guardian review threads.
    let _ = (message_count, tool_call_count, tool_error_count);
    Ok(Parsed {
        summary,
        model_usage,
        model_costs,
        detail: include_details.then_some(detail),
        tool_aggregates,
        hourly_activity,
        model_aggregates,
        message_metrics,
        errors,
    })
}

fn branch_boundaries(files: &[(PathBuf, Header)]) -> HashMap<usize, (u64, String)> {
    let mut boundaries = HashMap::new();
    for index in 1..files.len() {
        let (path, header) = &files[index];
        if let Some(base) = &header.history_base {
            boundaries.insert(
                index - 1,
                (base.end_ordinal_exclusive, branch_id(path, header)),
            );
        }
    }
    boundaries
}

fn branch_id(path: &Path, header: &Header) -> String {
    let stem = path
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or_default();
    stem.rsplit_once('_')
        .map(|(_, segment)| segment.to_owned())
        .filter(|segment| !segment.is_empty())
        .unwrap_or_else(|| header.id.clone())
}

fn parse_file(
    path: &Path,
    header: &Header,
    branch_boundary: Option<&(u64, String)>,
    thread: &mut ThreadData,
    errors: &mut Vec<ScanError>,
    include_details: bool,
) {
    let file = match File::open(path) {
        Ok(file) => file,
        Err(error) => {
            errors.push(file_error(path, error.to_string()));
            return;
        }
    };
    let modified = std::fs::metadata(path)
        .and_then(|meta| meta.modified())
        .ok();
    let mut reader = BufReader::new(file);
    let mut line = String::new();
    let mut ordinal_fallback = 0u64;
    let mut current_turn = None::<String>;
    let mut turn_models = HashMap::<String, String>::new();
    let mut current_model = None::<String>;
    let mut current_message = None::<WorkingMessage>;
    let mut last_total = None::<Value>;
    let mut first_record_ordinal = None::<u64>;
    let mut seen_response_ids = HashSet::<String>::new();
    let mut open_exec_id = None::<String>;
    let mut malformed = 0usize;

    loop {
        line.clear();
        let bytes = match reader.read_line(&mut line) {
            Ok(bytes) => bytes,
            Err(error) => {
                errors.push(file_error(path, error.to_string()));
                return;
            }
        };
        if bytes == 0 {
            break;
        }
        let terminated = line.ends_with('\n');
        let parsed = serde_json::from_str::<Value>(&line);
        let envelope = match parsed {
            Ok(value) => value,
            Err(_) if !terminated && is_recent(modified) => continue,
            Err(_) => {
                malformed += 1;
                ordinal_fallback += 1;
                continue;
            }
        };
        let ordinal = envelope
            .get("ordinal")
            .and_then(Value::as_u64)
            .unwrap_or(ordinal_fallback);
        ordinal_fallback = ordinal.saturating_add(1);
        if ordinal == 0 || envelope.get("type").and_then(Value::as_str) == Some("session_meta") {
            continue;
        }
        let timestamp = envelope
            .get("timestamp")
            .and_then(Value::as_str)
            .unwrap_or_else(|| header.timestamp.as_deref().unwrap_or(""));
        let payload = envelope.get("payload").unwrap_or(&Value::Null);
        let event_turn = payload
            .get("turn_id")
            .and_then(Value::as_str)
            .or(current_turn.as_deref());
        let own_turn = event_turn.is_none_or(|turn| !is_replayed_turn(turn, header));
        if own_turn && !timestamp.is_empty() {
            thread
                .first_timestamp
                .get_or_insert_with(|| timestamp.to_owned());
            thread.last_timestamp = Some(timestamp.to_owned());
        }
        let line_branch = branch_boundary
            .filter(|(end_ordinal, _)| ordinal >= *end_ordinal)
            .map(|(_, branch)| branch.clone());

        let envelope_kind = envelope
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let kind = payload
            .get("type")
            .and_then(Value::as_str)
            .or_else(|| Some(envelope_kind))
            .unwrap_or_default();
        if own_turn && kind == "token_usage_record" {
            first_record_ordinal.get_or_insert(ordinal);
        }
        match kind {
            "turn_context" => {
                if let Some(turn_id) = payload.get("turn_id").and_then(Value::as_str) {
                    if let Some(model) = payload.get("model").and_then(Value::as_str) {
                        turn_models.insert(turn_id.to_owned(), model.to_owned());
                        current_model = Some(model.to_owned());
                        if own_turn {
                            thread.models_seen.insert(model.to_owned());
                        }
                    }
                }
            }
            "task_started" => {
                current_turn = payload
                    .get("turn_id")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned);
                current_model = current_turn
                    .as_ref()
                    .and_then(|turn| turn_models.get(turn).cloned())
                    .or(current_model);
            }
            "message" if envelope.get("type").and_then(Value::as_str) == Some("response_item") => {
                if !own_turn {
                    continue;
                }
                let role = payload
                    .get("role")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                if role != "assistant" {
                    continue;
                }
                let message = ensure_message(
                    &mut current_message,
                    &thread.id,
                    ordinal,
                    timestamp,
                    current_model.clone(),
                    line_branch.clone(),
                );
                message.set_id(payload.get("id").and_then(Value::as_str));
                if include_details {
                    if let Some(content) = payload.get("content").and_then(Value::as_array) {
                        for block in content {
                            if block.get("type").and_then(Value::as_str) == Some("output_text") {
                                if let Some(text) = block.get("text").and_then(Value::as_str) {
                                    message.blocks.push(Block::Text {
                                        text: text.to_owned(),
                                    });
                                }
                            }
                        }
                    }
                }
            }
            "reasoning"
                if envelope.get("type").and_then(Value::as_str) == Some("response_item") =>
            {
                if !own_turn {
                    continue;
                }
                if !include_details {
                    let has_text = payload
                        .get("summary")
                        .and_then(Value::as_array)
                        .is_some_and(|summary| {
                            summary.iter().any(|entry| {
                                entry
                                    .get("text")
                                    .and_then(Value::as_str)
                                    .is_some_and(|text| !text.is_empty())
                            })
                        })
                        || payload
                            .get("content")
                            .and_then(Value::as_str)
                            .is_some_and(|text| !text.is_empty());
                    if has_text {
                        let message = ensure_message(
                            &mut current_message,
                            &thread.id,
                            ordinal,
                            timestamp,
                            current_model.clone(),
                            line_branch.clone(),
                        );
                        message.set_id(payload.get("id").and_then(Value::as_str));
                    }
                    continue;
                }
                let texts = payload
                    .get("summary")
                    .and_then(Value::as_array)
                    .map(|summary| {
                        summary
                            .iter()
                            .filter_map(|entry| entry.get("text").and_then(Value::as_str))
                            .collect::<Vec<_>>()
                            .join("\n")
                    })
                    .filter(|text| !text.is_empty())
                    .or_else(|| {
                        payload
                            .get("content")
                            .and_then(Value::as_str)
                            .map(ToOwned::to_owned)
                    });
                if let Some(text) = texts.filter(|text| !text.is_empty()) {
                    let message = ensure_message(
                        &mut current_message,
                        &thread.id,
                        ordinal,
                        timestamp,
                        current_model.clone(),
                        line_branch.clone(),
                    );
                    message.set_id(payload.get("id").and_then(Value::as_str));
                    message.blocks.push(Block::Thinking { text });
                }
            }
            "agent_message"
                if envelope.get("type").and_then(Value::as_str) == Some("response_item") =>
            {
                if !own_turn {
                    continue;
                }
                if payload
                    .get("content")
                    .and_then(Value::as_str)
                    .is_some_and(|content| !content.is_empty())
                {
                    let message = ensure_message(
                        &mut current_message,
                        &thread.id,
                        ordinal,
                        timestamp,
                        current_model.clone(),
                        line_branch.clone(),
                    );
                    if include_details {
                        let content = payload
                            .get("content")
                            .and_then(Value::as_str)
                            .unwrap_or_default();
                        let author = payload
                            .get("author")
                            .and_then(Value::as_str)
                            .unwrap_or("agent");
                        message.blocks.push(Block::Text {
                            text: format!("{author}: {content}"),
                        });
                    }
                }
            }
            "function_call" | "custom_tool_call" | "tool_search_call" | "web_search_call"
                if envelope.get("type").and_then(Value::as_str) == Some("response_item") =>
            {
                if !own_turn {
                    continue;
                }
                let call_id = payload
                    .get("call_id")
                    .and_then(Value::as_str)
                    .filter(|id| !id.is_empty())
                    .map(ToOwned::to_owned)
                    .unwrap_or_else(|| format!("{}:{ordinal}", thread.id));
                let name = tool_name(payload, kind);
                let input = if include_details {
                    match kind {
                        "function_call" => parsed_json(payload.get("arguments")),
                        "custom_tool_call" => parsed_json(payload.get("input")),
                        "tool_search_call" => json!({"query": payload.get("query")}),
                        _ => Value::Null,
                    }
                } else {
                    Value::Null
                };
                let message = ensure_message(
                    &mut current_message,
                    &thread.id,
                    ordinal,
                    timestamp,
                    current_model.clone(),
                    line_branch.clone(),
                );
                message.set_id(payload.get("id").and_then(Value::as_str));
                message.push_tool(ToolCall {
                    id: call_id.clone(),
                    name,
                    input,
                    result: None,
                    is_error: false,
                    duration_ms: None,
                    parent_call_id: None,
                });
                if kind == "custom_tool_call"
                    && payload.get("name").and_then(Value::as_str) == Some("exec")
                {
                    open_exec_id = Some(call_id);
                }
            }
            "function_call_output" | "custom_tool_call_output"
                if envelope.get("type").and_then(Value::as_str) == Some("response_item") =>
            {
                if !own_turn {
                    continue;
                }
                let call_id = payload
                    .get("call_id")
                    .and_then(Value::as_str)
                    .unwrap_or_default();
                if let Some(message) = current_message.as_mut() {
                    if let Some(tool) = message.tool_mut(call_id) {
                        if include_details {
                            tool.result = payload.get("output").map(value_text).map(truncate);
                        }
                        tool.is_error |= error_signal(payload);
                        tool.duration_ms = tool
                            .duration_ms
                            .or_else(|| duration_ms(payload.get("duration")));
                        if tool.name.ends_with("spawn_agent") {
                            if let Some(child_id) =
                                payload.get("output").and_then(extract_child_thread_id)
                            {
                                thread.spawned_call_ids.insert(child_id, call_id.to_owned());
                            }
                        }
                    }
                }
                if open_exec_id.as_deref() == Some(call_id) {
                    open_exec_id = None;
                }
            }
            "item_completed"
                if envelope.get("type").and_then(Value::as_str) == Some("event_msg") =>
            {
                if !own_turn {
                    continue;
                }
                let item = payload.get("item").unwrap_or(&Value::Null);
                let item_type = item.get("type").and_then(Value::as_str).unwrap_or_default();
                match item_type {
                    "UserMessage" => {
                        let text = user_text(item);
                        if text.trim().is_empty() {
                            continue;
                        }
                        let normalized = collapse_ws(&text);
                        if thread.first_prompt.is_none() {
                            thread.first_prompt = Some(truncate_chars(&normalized, 200));
                        }
                        let id = item
                            .get("client_id")
                            .and_then(Value::as_str)
                            .map(ToOwned::to_owned)
                            .unwrap_or_else(|| format!("{}:{ordinal}", thread.id));
                        thread.messages.push(Message {
                            id,
                            role: Role::User,
                            timestamp: timestamp.to_owned(),
                            model: None,
                            blocks: if include_details {
                                vec![Block::Text { text: normalized }]
                            } else {
                                Vec::new()
                            },
                            usage: None,
                            branch: line_branch.clone(),
                        });
                    }
                    "SubAgentActivity" => {
                        if item.get("kind").and_then(Value::as_str) == Some("started") {
                            if let (Some(call_id), Some(child_id)) = (
                                item.get("id").and_then(Value::as_str),
                                item.get("agent_thread_id").and_then(Value::as_str),
                            ) {
                                thread
                                    .spawned_call_ids
                                    .insert(child_id.to_owned(), call_id.to_owned());
                            }
                        }
                    }
                    "CommandExecution"
                    | "McpToolCall"
                    | "FileChange"
                    | "WebSearch"
                    | "ImageView"
                    | "DynamicToolCall"
                    | "CollabAgentToolCall" => {
                        let id = item.get("id").and_then(Value::as_str).unwrap_or_default();
                        let existing = current_message
                            .as_mut()
                            .and_then(|message| message.tool_mut(id));
                        if let Some(tool) = existing {
                            enrich_tool(tool, item, include_details);
                        } else {
                            let tool = tool_from_item(
                                item,
                                item_type,
                                open_exec_id.as_deref(),
                                ordinal,
                                include_details,
                            );
                            ensure_message(
                                &mut current_message,
                                &thread.id,
                                ordinal,
                                timestamp,
                                current_model.clone(),
                                line_branch.clone(),
                            )
                            .push_tool(tool);
                        }
                    }
                    // AgentMessage and Reasoning duplicate response_item data. Other types
                    // can carry large images or state snapshots and are intentionally skipped.
                    _ => {}
                }
            }
            "token_usage_record" => {
                if !own_turn {
                    continue;
                }
                let response_id = payload
                    .get("response_id")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned)
                    .unwrap_or_else(|| ordinal.to_string());
                if !seen_response_ids.insert(response_id) {
                    continue;
                }
                let turn_id = payload
                    .get("turn_id")
                    .and_then(Value::as_str)
                    .or(current_turn.as_deref());
                let usage = usage_from(payload.get("usage").unwrap_or(&Value::Null));
                finish_response(
                    &mut current_message,
                    &mut thread.messages,
                    &thread.id,
                    ordinal,
                    timestamp,
                    turn_id
                        .and_then(|turn| turn_models.get(turn))
                        .or(current_model.as_ref()),
                    usage,
                    line_branch,
                );
            }
            "token_count" => {
                if !own_turn || first_record_ordinal.is_some_and(|first| ordinal >= first) {
                    continue;
                }
                let info = payload.get("info").unwrap_or(&Value::Null);
                let total = info
                    .get("total_token_usage")
                    .cloned()
                    .unwrap_or(Value::Null);
                if last_total.as_ref() == Some(&total) {
                    continue;
                }
                last_total = Some(total);
                let usage = usage_from(info.get("last_token_usage").unwrap_or(&Value::Null));
                finish_response(
                    &mut current_message,
                    &mut thread.messages,
                    &thread.id,
                    ordinal,
                    timestamp,
                    current_turn
                        .as_ref()
                        .and_then(|turn| turn_models.get(turn))
                        .or(current_model.as_ref()),
                    usage,
                    line_branch,
                );
            }
            _ => {}
        }
    }
    if let Some(message) = current_message.take() {
        thread.messages.push(message.finish(None));
    }
    if malformed > 0 {
        errors.push(file_error(path, format!("{malformed} malformed lines")));
    }
}

fn ensure_message<'a>(
    slot: &'a mut Option<WorkingMessage>,
    thread_id: &str,
    ordinal: u64,
    timestamp: &str,
    model: Option<String>,
    branch: Option<String>,
) -> &'a mut WorkingMessage {
    slot.get_or_insert_with(|| WorkingMessage::new(thread_id, ordinal, timestamp, model, branch))
}

fn finish_response(
    current: &mut Option<WorkingMessage>,
    messages: &mut Vec<Message>,
    thread_id: &str,
    ordinal: u64,
    timestamp: &str,
    model: Option<&String>,
    usage: Usage,
    branch: Option<String>,
) {
    let mut message = current.take().unwrap_or_else(|| {
        WorkingMessage::new(
            thread_id,
            ordinal,
            timestamp,
            model.cloned(),
            branch.clone(),
        )
    });
    if message.model.is_none() {
        message.model = model.cloned();
    }
    messages.push(message.finish(Some(usage)));
}

fn tool_name(payload: &Value, kind: &str) -> String {
    match kind {
        "function_call" => {
            let name = payload
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("function");
            payload
                .get("namespace")
                .and_then(Value::as_str)
                .filter(|namespace| !namespace.is_empty())
                .map(|namespace| {
                    if namespace.starts_with("mcp__") {
                        format!("{namespace}__{name}")
                    } else {
                        format!("{namespace}.{name}")
                    }
                })
                .unwrap_or_else(|| name.to_owned())
        }
        "custom_tool_call" => payload
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("custom_tool")
            .to_owned(),
        "tool_search_call" => "tool_search".to_owned(),
        _ => "web_search".to_owned(),
    }
}

fn parsed_json(value: Option<&Value>) -> Value {
    match value {
        Some(Value::String(raw)) => {
            serde_json::from_str(raw).unwrap_or_else(|_| Value::String(truncate(raw.clone())))
        }
        Some(value) => value.clone(),
        None => Value::Null,
    }
}

fn extract_child_thread_id(value: &Value) -> Option<String> {
    let parsed;
    let value = if let Some(raw) = value.as_str() {
        parsed = serde_json::from_str::<Value>(raw).ok()?;
        &parsed
    } else {
        value
    };
    if let Some(object) = value.as_object() {
        for key in ["agent_thread_id", "thread_id"] {
            if let Some(id) = object.get(key).and_then(Value::as_str) {
                return Some(id.to_owned());
            }
        }
        return object.values().find_map(extract_child_thread_id);
    }
    value.as_array()?.iter().find_map(extract_child_thread_id)
}

fn tool_from_item(
    item: &Value,
    kind: &str,
    parent_call_id: Option<&str>,
    ordinal: u64,
    include_details: bool,
) -> ToolCall {
    let id = item
        .get("id")
        .and_then(Value::as_str)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| format!("item:{ordinal}"));
    let name = match kind {
        "CommandExecution" => "shell".to_owned(),
        "McpToolCall" => format!(
            "mcp__{}__{}",
            item.get("server")
                .and_then(Value::as_str)
                .unwrap_or("unknown"),
            item.get("tool")
                .and_then(Value::as_str)
                .unwrap_or("unknown")
        ),
        "FileChange" => "apply_patch".to_owned(),
        "WebSearch" => "web_search".to_owned(),
        "ImageView" => "view_image".to_owned(),
        "DynamicToolCall" => item
            .get("name")
            .and_then(Value::as_str)
            .unwrap_or("dynamic_tool")
            .to_owned(),
        "CollabAgentToolCall" => item
            .get("tool")
            .and_then(Value::as_str)
            .unwrap_or("collaboration")
            .to_owned(),
        _ => kind.to_owned(),
    };
    let input = if include_details {
        match kind {
            "CommandExecution" => json!({
                "command": item.get("command"),
                "cwd": item.get("cwd"),
            }),
            "McpToolCall" => parsed_json(item.get("arguments")),
            "FileChange" => file_change_summary(item.get("changes")),
            _ => item
                .get("arguments")
                .map(|value| parsed_json(Some(value)))
                .unwrap_or(Value::Null),
        }
    } else {
        Value::Null
    };
    let result = include_details
        .then(|| {
            item.get("aggregated_output")
                .or_else(|| item.get("output"))
                .or_else(|| item.get("result"))
                .map(result_text)
                .map(truncate)
        })
        .flatten();
    ToolCall {
        id,
        name,
        input,
        result,
        is_error: error_signal(item),
        duration_ms: duration_ms(item.get("duration")).or_else(|| elapsed_item_ms(item)),
        parent_call_id: parent_call_id.map(ToOwned::to_owned),
    }
}

fn enrich_tool(tool: &mut ToolCall, item: &Value, include_details: bool) {
    if include_details && tool.result.is_none() {
        tool.result = item
            .get("aggregated_output")
            .or_else(|| item.get("output"))
            .or_else(|| item.get("result"))
            .map(result_text)
            .map(truncate);
    }
    tool.is_error |= error_signal(item);
    tool.duration_ms = tool
        .duration_ms
        .or_else(|| duration_ms(item.get("duration")))
        .or_else(|| elapsed_item_ms(item));
}

fn file_change_summary(changes: Option<&Value>) -> Value {
    let Some(changes) = changes.and_then(Value::as_object) else {
        return Value::Null;
    };
    let paths: Vec<_> = changes
        .iter()
        .map(|(path, change)| {
            json!({
                "path": path,
                "type": change.get("type"),
            })
        })
        .collect();
    Value::Array(paths)
}

fn result_text(value: &Value) -> String {
    if let Some(content) = value.get("content").and_then(Value::as_array) {
        let joined = content
            .iter()
            .filter_map(|item| item.get("text").and_then(Value::as_str))
            .collect::<Vec<_>>()
            .join("\n");
        if !joined.is_empty() {
            return joined;
        }
    }
    value
        .get("output")
        .map(value_text)
        .unwrap_or_else(|| value_text(value))
}

fn value_text(value: &Value) -> String {
    match value {
        Value::String(text) => text.clone(),
        _ => serde_json::to_string(value).unwrap_or_default(),
    }
}

fn error_signal(value: &Value) -> bool {
    value
        .get("status")
        .and_then(Value::as_str)
        .is_some_and(|status| status == "failed" || status == "declined")
        || value
            .get("exit_code")
            .and_then(Value::as_i64)
            .is_some_and(|code| code != 0)
        || value
            .pointer("/result/isError")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        || value
            .get("is_error")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        || value.get("success").and_then(Value::as_bool) == Some(false)
}

fn duration_ms(duration: Option<&Value>) -> Option<u64> {
    let duration = duration?;
    if let Some(value) = duration.as_u64() {
        return Some(value);
    }
    if let Some(seconds) = duration.as_f64() {
        return Some((seconds * 1_000.0).max(0.0) as u64);
    }
    let seconds = duration.get("secs").and_then(Value::as_u64)?;
    let nanos = duration.get("nanos").and_then(Value::as_u64).unwrap_or(0);
    Some(seconds.saturating_mul(1_000) + nanos / 1_000_000)
}

fn elapsed_item_ms(item: &Value) -> Option<u64> {
    let start = item.get("started_at_ms").and_then(Value::as_i64)?;
    let end = item.get("completed_at_ms").and_then(Value::as_i64)?;
    u64::try_from(end.saturating_sub(start)).ok()
}

fn user_text(item: &Value) -> String {
    item.get("content")
        .or_else(|| item.get("text"))
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .or_else(|| {
            item.get("text_elements")
                .and_then(Value::as_array)
                .map(|items| {
                    items
                        .iter()
                        .filter_map(|entry| entry.get("text").and_then(Value::as_str))
                        .collect::<Vec<_>>()
                        .join("")
                })
        })
        .unwrap_or_default()
}

fn usage_from(value: &Value) -> Usage {
    let input = number(value.get("input_tokens"));
    let cached = number(value.get("cached_input_tokens"));
    let reasoning = value.get("reasoning_output_tokens").and_then(Value::as_u64);
    Usage {
        input_tokens: input.saturating_sub(cached),
        output_tokens: number(value.get("output_tokens")),
        cache_read_tokens: cached,
        cache_creation_tokens: number(value.get("cache_write_input_tokens")),
        reasoning_tokens: reasoning,
    }
}

fn number(value: Option<&Value>) -> u64 {
    value.and_then(Value::as_u64).unwrap_or(0)
}

fn is_replayed_turn(turn_id: &str, header: &Header) -> bool {
    let Some(thread_time) = uuidv7_timestamp(header.id.as_str()) else {
        return false;
    };
    uuidv7_timestamp(turn_id).is_some_and(|turn_time| turn_time < thread_time)
}

fn uuidv7_timestamp(value: &str) -> Option<u64> {
    let mut hex = String::with_capacity(32);
    for byte in value.bytes() {
        if byte == b'-' {
            continue;
        }
        if !byte.is_ascii_hexdigit() {
            return None;
        }
        hex.push(byte as char);
        if hex.len() == 12 {
            break;
        }
    }
    (hex.len() == 12)
        .then(|| u64::from_str_radix(&hex, 16).ok())
        .flatten()
}

fn aggregate_messages(
    messages: &[Message],
) -> (HashMap<String, Usage>, HashMap<String, CostBreakdown>, u64) {
    let mut usage_by_model = HashMap::<String, Usage>::new();
    let mut costs_by_model = HashMap::<String, CostBreakdown>::new();
    let mut unpriced = 0u64;
    for message in messages {
        let Some(usage) = message.usage else {
            continue;
        };
        let model = message
            .model
            .as_deref()
            .filter(|model| !model.is_empty())
            .unwrap_or("unknown");
        add_usage_to_map(&mut usage_by_model, model, usage);
        let cost = pricing::cost_breakdown_for(
            Provider::Codex,
            model,
            usage,
            PriceCtx {
                request_input_tokens: Some(
                    usage.input_tokens.saturating_add(usage.cache_read_tokens),
                ),
                ..PriceCtx::default()
            },
        );
        add_cost_to_map(&mut costs_by_model, model, cost);
        unpriced =
            unpriced.saturating_add(pricing::unpriced_tokens_for(Provider::Codex, model, usage));
    }
    (usage_by_model, costs_by_model, unpriced)
}

fn add_usage_to_map(map: &mut HashMap<String, Usage>, model: &str, usage: Usage) {
    let total = map.entry(model.to_owned()).or_default();
    *total = add_usage(*total, usage);
}

fn add_usage_maps(target: &mut HashMap<String, Usage>, source: &HashMap<String, Usage>) {
    for (model, usage) in source {
        add_usage_to_map(target, model, *usage);
    }
}

fn add_usage(a: Usage, b: Usage) -> Usage {
    Usage {
        input_tokens: a.input_tokens.saturating_add(b.input_tokens),
        output_tokens: a.output_tokens.saturating_add(b.output_tokens),
        cache_read_tokens: a.cache_read_tokens.saturating_add(b.cache_read_tokens),
        cache_creation_tokens: a
            .cache_creation_tokens
            .saturating_add(b.cache_creation_tokens),
        reasoning_tokens: match (a.reasoning_tokens, b.reasoning_tokens) {
            (Some(x), Some(y)) => Some(x.saturating_add(y)),
            (Some(x), None) => Some(x),
            (None, Some(y)) => Some(y),
            (None, None) => None,
        },
    }
}

fn add_cost_to_map(map: &mut HashMap<String, CostBreakdown>, model: &str, cost: CostBreakdown) {
    let total = map.entry(model.to_owned()).or_default();
    *total = add_cost(*total, cost);
}

fn add_cost_maps(
    target: &mut HashMap<String, CostBreakdown>,
    source: &HashMap<String, CostBreakdown>,
) {
    for (model, cost) in source {
        add_cost_to_map(target, model, *cost);
    }
}

fn add_cost(a: CostBreakdown, b: CostBreakdown) -> CostBreakdown {
    CostBreakdown {
        input: a.input + b.input,
        output: a.output + b.output,
        cache_read: a.cache_read + b.cache_read,
        cache_write: a.cache_write + b.cache_write,
    }
}

fn sum_usage_map(values: &HashMap<String, Usage>) -> Usage {
    values.values().copied().fold(Usage::default(), add_usage)
}

fn sum_cost_map(values: &HashMap<String, CostBreakdown>) -> CostBreakdown {
    values
        .values()
        .copied()
        .fold(CostBreakdown::default(), add_cost)
}

fn ordered_models(values: &HashMap<String, Usage>) -> Vec<String> {
    let mut models: Vec<_> = values.iter().collect();
    models.sort_by(|(a_name, a_usage), (b_name, b_usage)| {
        token_volume(**b_usage)
            .cmp(&token_volume(**a_usage))
            .then_with(|| a_name.cmp(b_name))
    });
    models.into_iter().map(|(model, _)| model.clone()).collect()
}

fn token_volume(usage: Usage) -> u64 {
    usage
        .input_tokens
        .saturating_add(usage.output_tokens)
        .saturating_add(usage.cache_read_tokens)
        .saturating_add(usage.cache_creation_tokens)
}

fn count_tools(messages: &[Message]) -> u32 {
    messages
        .iter()
        .flat_map(|message| message.blocks.iter())
        .filter(|block| matches!(block, Block::ToolCall(_)))
        .count() as u32
}

fn count_tool_errors(messages: &[Message]) -> u32 {
    messages
        .iter()
        .flat_map(|message| message.blocks.iter())
        .filter(|block| matches!(block, Block::ToolCall(tool) if tool.is_error))
        .count() as u32
}

fn agent_type(header: &Header) -> Option<String> {
    if header.thread_source.as_deref() == Some("guardian_review")
        || header
            .source
            .as_ref()
            .and_then(|source| source.pointer("/subagent/other"))
            .and_then(Value::as_str)
            == Some("guardian")
    {
        return Some("guardian".to_owned());
    }
    header
        .agent_role
        .clone()
        .or_else(|| header.agent_nickname.clone())
}

fn file_error(path: &Path, message: String) -> ScanError {
    ScanError {
        path: path.display().to_string(),
        message,
        provider: Some(Provider::Codex),
    }
}

fn is_recent(modified: Option<SystemTime>) -> bool {
    modified
        .and_then(|time| SystemTime::now().duration_since(time).ok())
        .is_some_and(|age| age.as_secs() < 60)
}

fn elapsed_ms(started_at: &str, ended_at: &str) -> u64 {
    let (Ok(start), Ok(end)) = (
        DateTime::parse_from_rfc3339(started_at),
        DateTime::parse_from_rfc3339(ended_at),
    ) else {
        return 0;
    };
    end.signed_duration_since(start)
        .to_std()
        .map(|duration| duration.as_millis().min(u64::MAX as u128) as u64)
        .unwrap_or(0)
}

fn collapse_ws(value: &str) -> String {
    value.split_whitespace().collect::<Vec<_>>().join(" ")
}

fn truncate(value: String) -> String {
    if value.len() <= TOOL_RESULT_LIMIT {
        return value;
    }
    let mut end = TOOL_RESULT_LIMIT;
    while !value.is_char_boundary(end) {
        end -= 1;
    }
    value[..end].to_owned()
}

fn truncate_chars(value: &str, max: usize) -> String {
    let mut chars = value.chars();
    let prefix: String = chars.by_ref().take(max).collect();
    if chars.next().is_some() {
        format!("{prefix}…")
    } else {
        prefix
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sources::{codex::CodexSource, SessionSource};

    fn parse_fixture(name: &str) -> Parsed {
        parse(&fixture_unit(name)).unwrap()
    }

    fn fixture_unit(name: &str) -> Unit {
        let root = Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/codex")
            .join(name);
        let source = CodexSource::new(root);
        let mut discovery = source.discover().unwrap();
        assert!(discovery.errors.is_empty(), "{:?}", discovery.errors);
        assert_eq!(discovery.units.len(), 1, "fixture {name}");
        discovery.units.remove(0)
    }

    #[test]
    fn summary_scan_keeps_dashboard_aggregates_without_session_payloads() {
        let unit = fixture_unit("exec-inner");
        let full = parse(&unit).unwrap();
        let compact = parse_summary(&unit).unwrap();
        assert_eq!(
            serde_json::to_value(&compact.summary).unwrap(),
            serde_json::to_value(&full.summary).unwrap()
        );
        assert_eq!(compact.model_usage, full.model_usage);
        assert_eq!(compact.model_costs, full.model_costs);
        assert_eq!(compact.tool_aggregates, full.tool_aggregates);
        assert_eq!(compact.hourly_activity, full.hourly_activity);
        assert!(compact.detail.is_none());
        assert!(full.detail.is_some());
    }

    #[test]
    fn parses_messages_reasoning_tools_and_token_mapping() {
        let parsed = parse_fixture("basic");
        let summary = &parsed.summary;
        assert_eq!(summary.id, "01990000-0000-7000-8000-000000000001");
        assert_eq!(summary.provider, Provider::Codex);
        assert_eq!(summary.title.as_deref(), Some("Basic Codex fixture"));
        assert_eq!(
            summary.first_prompt.as_deref(),
            Some("inspect this project")
        );
        assert_eq!(summary.git_branch.as_deref(), Some("feat/example"));
        assert_eq!(summary.cli_version.as_deref(), Some("0.160.1"));
        assert_eq!(summary.message_count, 2);
        assert_eq!(summary.tool_call_count, 1);
        assert_eq!(summary.usage.input_tokens, 40);
        assert_eq!(summary.usage.cache_read_tokens, 60);
        assert_eq!(summary.usage.output_tokens, 10);
        assert_eq!(summary.usage.reasoning_tokens, Some(2));
        let assistant = parsed
            .detail
            .as_ref()
            .unwrap()
            .messages
            .iter()
            .find(|message| message.id == "reason-basic")
            .unwrap();
        assert!(assistant.blocks.iter().any(|block| matches!(
            block,
            Block::Thinking { text } if text == "Check the source"
        )));
        let tool = assistant
            .blocks
            .iter()
            .find_map(|block| match block {
                Block::ToolCall(tool) => Some(tool),
                _ => None,
            })
            .unwrap();
        assert_eq!(tool.name, "shell_command");
        assert_eq!(tool.result.as_deref(), Some("C:/app"));
        assert_eq!(tool.input["command"], "pwd");
        assert_eq!(summary.models, vec!["gpt-5.6-sol"]);
    }

    #[test]
    fn deduplicates_cumulative_token_counts_and_handles_resets() {
        let duplicate = parse_fixture("dup-token-count").summary;
        assert_eq!(duplicate.usage.input_tokens, 30);
        assert_eq!(duplicate.usage.output_tokens, 3);

        let reset = parse_fixture("reset").summary;
        assert_eq!(reset.usage.input_tokens, 130);
        assert_eq!(reset.usage.output_tokens, 13);
    }

    #[test]
    fn context_only_token_count_does_not_use_cumulative_total() {
        let summary = parse_fixture("context-only-count").summary;
        assert_eq!(summary.usage.input_tokens, 0);
        assert_eq!(summary.usage.output_tokens, 0);
        assert_eq!(summary.usage.cache_read_tokens, 0);
        assert_eq!(summary.usage.cache_creation_tokens, 0);
    }

    #[test]
    fn usage_records_take_over_mid_file_without_double_counting() {
        let summary = parse_fixture("records-mid-file").summary;
        assert_eq!(summary.usage.input_tokens, 50);
        assert_eq!(summary.usage.cache_read_tokens, 10);
        assert_eq!(summary.usage.output_tokens, 7);
        assert_eq!(summary.usage.reasoning_tokens, Some(1));
    }

    #[test]
    fn exec_wrapper_and_nested_inner_calls_are_counted_and_enriched() {
        let parsed = parse_fixture("exec-inner");
        let summary = &parsed.summary;
        assert_eq!(summary.tool_call_count, 3);
        assert_eq!(summary.tool_error_count, 1);
        let assistant = parsed.detail.as_ref().unwrap().messages.first().unwrap();
        let tools: Vec<_> = assistant
            .blocks
            .iter()
            .filter_map(|block| match block {
                Block::ToolCall(tool) => Some(tool),
                _ => None,
            })
            .collect();
        let exec = tools.iter().find(|tool| tool.name == "exec").unwrap();
        assert_eq!(exec.result.as_deref(), Some("finished"));
        let command = tools.iter().find(|tool| tool.name == "shell").unwrap();
        assert_eq!(command.parent_call_id.as_deref(), Some("exec-call"));
        assert!(command.is_error);
        assert_eq!(command.duration_ms, Some(2_500));
        assert_eq!(command.result.as_deref(), Some("permission denied"));
        let mcp = tools
            .iter()
            .find(|tool| tool.name == "mcp__example__lookup")
            .unwrap();
        assert_eq!(mcp.parent_call_id.as_deref(), Some("exec-call"));
        assert_eq!(mcp.duration_ms, Some(500));
        assert_eq!(mcp.result.as_deref(), Some("found"));
    }

    #[test]
    fn fork_replay_is_dropped_and_only_own_child_usage_is_counted() {
        let parsed = parse_fixture("fork");
        assert_eq!(parsed.summary.usage.input_tokens, 18);
        assert_eq!(parsed.summary.message_count, 2);
        assert!(parsed
            .detail
            .as_ref()
            .unwrap()
            .messages
            .iter()
            .all(|message| message.id != "replayed-message"));
    }

    #[test]
    fn spawned_and_guardian_threads_are_flattened_and_included_in_cost_accounting() {
        let parsed = parse_fixture("spawn");
        let summary = &parsed.summary;
        assert_eq!(summary.subagent_count, 2);
        assert_eq!(summary.usage.input_tokens, 30);
        assert_eq!(summary.usage.cache_read_tokens, 10);
        assert_eq!(summary.usage.output_tokens, 4);
        assert_eq!(summary.unpriced_tokens, Some(18));
        let explorer = parsed
            .detail
            .as_ref()
            .unwrap()
            .subagents
            .iter()
            .find(|agent| agent.id == "01990700-0002-7000-8000-000000000001")
            .unwrap();
        assert_eq!(explorer.agent_type.as_deref(), Some("explorer"));
        assert_eq!(explorer.parent_tool_call_id.as_deref(), Some("spawn-call"));
        let guardian = parsed
            .detail
            .as_ref()
            .unwrap()
            .subagents
            .iter()
            .find(|agent| agent.agent_type.as_deref() == Some("guardian"))
            .unwrap();
        assert_eq!(guardian.unpriced_tokens, Some(18));
        assert_eq!(guardian.cost_usd, 0.0);
    }

    #[test]
    fn segment_tail_is_kept_as_a_discarded_branch_and_still_counted() {
        let parsed = parse_fixture("segments");
        assert_eq!(parsed.summary.usage.input_tokens, 55);
        assert_eq!(parsed.summary.usage.output_tokens, 7);
        let branch = parsed
            .detail
            .as_ref()
            .unwrap()
            .messages
            .iter()
            .find(|message| message.id == "discarded-tail")
            .unwrap();
        assert_eq!(branch.branch.as_deref(), Some("segment01"));
    }

    #[test]
    fn model_switches_are_attributed_to_the_enclosing_turn() {
        let parsed = parse_fixture("model-switch");
        assert_eq!(parsed.summary.models, vec!["gpt-5.6-sol", "gpt-5.6-terra"]);
        assert_eq!(parsed.model_usage["gpt-5.6-sol"].input_tokens, 9);
        assert_eq!(parsed.model_usage["gpt-5.6-terra"].input_tokens, 4);
        let day = DateTime::parse_from_rfc3339(&parsed.summary.started_at)
            .unwrap()
            .with_timezone(&chrono::Local)
            .date_naive()
            .to_string();
        let range = Some(crate::model::DateRange {
            from: Some(day.clone()),
            to: Some(day),
        });
        for model in ["gpt-5.6-sol", "gpt-5.6-terra"] {
            let filtered = crate::metrics::get_metrics_for_messages(
                &[(&parsed.summary, parsed.message_metrics.as_slice())],
                range.clone(),
                Some(model),
                None,
                None,
                None,
            );
            assert_eq!(filtered.totals.usage, parsed.model_usage[model]);
            assert_eq!(filtered.totals.cost_breakdown, parsed.model_costs[model]);
            assert_eq!(filtered.by_model.len(), 1);
            assert_eq!(filtered.by_model[0].key, model);
            assert_eq!(filtered.series_by_model.as_ref().unwrap().len(), 1);
            assert_eq!(filtered.series_by_model.as_ref().unwrap()[0].key, model);
        }
    }

    #[test]
    fn usage_without_model_is_kept_under_unknown_model() {
        let usage = Usage {
            input_tokens: 3,
            output_tokens: 2,
            cache_read_tokens: 1,
            cache_creation_tokens: 0,
            reasoning_tokens: Some(1),
        };
        let message = Message {
            id: "unknown-model-usage".to_owned(),
            role: Role::Assistant,
            timestamp: String::new(),
            model: None,
            blocks: Vec::new(),
            usage: Some(usage),
            branch: None,
        };

        let (by_model, costs_by_model, unpriced) = aggregate_messages(&[message]);
        assert_eq!(by_model.get("unknown"), Some(&usage));
        assert_eq!(sum_usage_map(&by_model), usage);
        assert_eq!(
            costs_by_model.get("unknown"),
            Some(&CostBreakdown::default())
        );
        assert!(unpriced > 0);
    }

    #[test]
    fn malformed_middle_lines_are_skipped_and_reported_once_per_file() {
        let parsed = parse_fixture("broken");
        assert_eq!(parsed.summary.usage.input_tokens, 2);
        assert_eq!(parsed.errors.len(), 1);
        assert_eq!(parsed.errors[0].provider, Some(Provider::Codex));
        assert!(parsed.errors[0].message.contains("1 malformed lines"));
    }
}
