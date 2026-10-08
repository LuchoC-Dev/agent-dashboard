//! Session sources, one per agent provider.
//!
//! READ-ONLY: a source may only open files for reading. Never create, write,
//! rename or delete anything under the provider's data directory.

pub mod claude;
pub mod codex;

use std::{
    collections::HashMap,
    path::{Path, PathBuf},
};

use chrono::{DateTime, Datelike, Local, NaiveDate, Timelike};

use crate::model::{
    AppError, CostBreakdown, Provider, ScanError, SessionDetail, SessionSummary, Usage,
};

pub(crate) fn home_dir() -> Option<PathBuf> {
    dirs::home_dir()
        .or_else(|| std::env::var_os("USERPROFILE").map(PathBuf::from))
        .or_else(|| std::env::var_os("HOME").map(PathBuf::from))
}

/// Render filesystem paths for the public contract without Windows' extended-length prefix.
/// Preserve device namespace paths that are not ordinary drive or UNC paths.
pub(crate) fn contract_path(path: &Path) -> String {
    normalize_contract_path(&path.to_string_lossy())
}

pub(crate) fn normalize_contract_path(path: &str) -> String {
    const EXTENDED_UNC: &str = r"\\?\UNC\";
    const EXTENDED: &str = r"\\?\";

    if path
        .get(..EXTENDED_UNC.len())
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case(EXTENDED_UNC))
    {
        return format!(r"\\{}", &path[EXTENDED_UNC.len()..]);
    }

    if let Some(normal) = path.strip_prefix(EXTENDED) {
        let bytes = normal.as_bytes();
        if bytes.len() >= 3
            && bytes[0].is_ascii_alphabetic()
            && bytes[1] == b':'
            && matches!(bytes[2], b'\\' | b'/')
        {
            return normal.to_owned();
        }
    }
    path.to_owned()
}

#[cfg(test)]
mod path_tests {
    use super::normalize_contract_path;

    #[test]
    fn strips_extended_drive_prefix() {
        assert_eq!(
            normalize_contract_path(r"\\?\C:\Users\dev\.codex"),
            r"C:\Users\dev\.codex"
        );
    }

    #[test]
    fn converts_extended_unc_prefix_to_a_valid_unc_path() {
        assert_eq!(
            normalize_contract_path(r"\\?\UNC\server\share\sessions"),
            r"\\server\share\sessions"
        );
    }

    #[test]
    fn keeps_other_device_namespace_paths_intact() {
        assert_eq!(
            normalize_contract_path(r"\\?\Volume{abc}\sessions"),
            r"\\?\Volume{abc}\sessions"
        );
    }
}

/// A provider-neutral group of files that describe one session.
#[derive(Debug, Clone)]
pub struct Unit {
    pub key: String,
    pub files: Vec<PathBuf>,
    /// Provider-specific header data needed when parsing (for example Codex thread metadata).
    pub metadata: HashMap<String, String>,
}

#[derive(Debug, Default)]
pub struct Discovery {
    pub units: Vec<Unit>,
    pub errors: Vec<ScanError>,
}

/// Per-session counts retained for the tool dashboard without keeping tool payloads.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct ToolAggregate {
    pub name: String,
    pub calls: u32,
    pub errors: u32,
    pub duration_ms: u128,
    pub duration_count: u32,
}

/// Message counts, hourly activity and tool calls attributed to one model.
#[derive(Debug, Clone)]
pub struct ModelAggregate {
    pub message_count: u32,
    pub subagent_count: u32,
    pub hourly_activity: [u32; 168],
    pub tool_aggregates: Vec<ToolAggregate>,
}

impl Default for ModelAggregate {
    fn default() -> Self {
        Self {
            message_count: 0,
            subagent_count: 0,
            hourly_activity: [0; 168],
            tool_aggregates: Vec::new(),
        }
    }
}

/// A parsed session and the compact aggregates used by dashboard screens.
#[derive(Debug)]
pub struct Parsed {
    pub summary: SessionSummary,
    /// Codex keeps details out of the first scan and reparses them on demand.
    pub detail: Option<SessionDetail>,
    pub model_usage: HashMap<String, Usage>,
    pub model_costs: HashMap<String, CostBreakdown>,
    pub tool_aggregates: Vec<ToolAggregate>,
    pub hourly_activity: [u32; 168],
    pub model_aggregates: HashMap<String, ModelAggregate>,
    /// Compact per-message records used by date, weekday and hour metrics filters.
    pub message_metrics: Vec<MessageMetric>,
    pub errors: Vec<ScanError>,
}

/// Internal, in-memory data needed to filter metrics without loading session details.
#[derive(Debug, Clone)]
pub struct MessageMetric {
    pub date: Option<NaiveDate>,
    pub weekday: Option<u8>,
    pub hour: Option<u8>,
    pub model: Option<String>,
    pub usage: Option<Usage>,
    pub cost: CostBreakdown,
    pub tool_aggregates: Vec<ToolAggregate>,
    pub subagent_id: Option<String>,
}

pub trait SessionSource: Send + Sync {
    fn provider(&self) -> Provider;
    fn source_dir(&self) -> PathBuf;
    fn discover(&self) -> Result<Discovery, AppError>;
    fn parse(&self, unit: &Unit) -> Result<Parsed, AppError>;

    fn load_detail(&self, unit: &Unit) -> Result<SessionDetail, AppError> {
        self.parse(unit)?.detail.ok_or_else(|| {
            AppError::Io(format!(
                "source {:?} did not load session details",
                self.provider()
            ))
        })
    }

    /// Reapply source metadata to compact summaries after a cache hit.
    fn refresh_summary(&self, _summary: &mut SessionSummary, _unit: &Unit) {}

    /// Reapply lightweight source metadata after a cache hit without reparsing session logs.
    fn refresh_metadata(&self, detail: &mut SessionDetail, unit: &Unit) {
        self.refresh_summary(&mut detail.summary, unit);
    }
}

pub(crate) fn aggregates_from_detail(detail: &SessionDetail) -> (Vec<ToolAggregate>, [u32; 168]) {
    use chrono::{DateTime, Datelike, Local, Timelike};

    let mut tools = HashMap::<String, ToolAggregate>::new();
    let mut activity = [0u32; 168];
    for message in detail.messages.iter().chain(
        detail
            .subagents
            .iter()
            .flat_map(|subagent| subagent.messages.iter()),
    ) {
        if let Ok(timestamp) = DateTime::parse_from_rfc3339(&message.timestamp) {
            let local = timestamp.with_timezone(&Local);
            let cell = local.weekday().num_days_from_monday() as usize * 24 + local.hour() as usize;
            activity[cell] = activity[cell].saturating_add(1);
        }
        for block in &message.blocks {
            let crate::model::Block::ToolCall(call) = block else {
                continue;
            };
            let aggregate = tools
                .entry(call.name.clone())
                .or_insert_with(|| ToolAggregate {
                    name: call.name.clone(),
                    ..ToolAggregate::default()
                });
            aggregate.calls = aggregate.calls.saturating_add(1);
            if call.is_error {
                aggregate.errors = aggregate.errors.saturating_add(1);
            }
            if let Some(duration) = call.duration_ms {
                aggregate.duration_ms = aggregate.duration_ms.saturating_add(duration as u128);
                aggregate.duration_count = aggregate.duration_count.saturating_add(1);
            }
        }
    }
    let mut tools: Vec<_> = tools.into_values().collect();
    tools.sort_by(|a, b| a.name.cmp(&b.name));
    (tools, activity)
}

pub(crate) fn model_aggregates_from_detail(
    detail: &SessionDetail,
) -> HashMap<String, ModelAggregate> {
    use chrono::{DateTime, Datelike, Local, Timelike};

    let mut models = HashMap::<String, ModelAggregate>::new();
    for message in detail.messages.iter().chain(
        detail
            .subagents
            .iter()
            .flat_map(|subagent| subagent.messages.iter()),
    ) {
        let Some(model) = message.model.as_ref() else {
            continue;
        };
        let aggregate = models.entry(model.clone()).or_default();
        aggregate.message_count = aggregate.message_count.saturating_add(1);
        if let Ok(timestamp) = DateTime::parse_from_rfc3339(&message.timestamp) {
            let local = timestamp.with_timezone(&Local);
            let cell = local.weekday().num_days_from_monday() as usize * 24 + local.hour() as usize;
            aggregate.hourly_activity[cell] = aggregate.hourly_activity[cell].saturating_add(1);
        }
        for block in &message.blocks {
            let crate::model::Block::ToolCall(call) = block else {
                continue;
            };
            let index = aggregate
                .tool_aggregates
                .iter()
                .position(|tool| tool.name == call.name);
            let tool = if let Some(index) = index {
                &mut aggregate.tool_aggregates[index]
            } else {
                aggregate.tool_aggregates.push(ToolAggregate {
                    name: call.name.clone(),
                    ..ToolAggregate::default()
                });
                aggregate.tool_aggregates.last_mut().expect("just inserted")
            };
            tool.calls = tool.calls.saturating_add(1);
            if call.is_error {
                tool.errors = tool.errors.saturating_add(1);
            }
            if let Some(duration) = call.duration_ms {
                tool.duration_ms = tool.duration_ms.saturating_add(duration as u128);
                tool.duration_count = tool.duration_count.saturating_add(1);
            }
        }
    }
    for subagent in &detail.subagents {
        let models_used: std::collections::HashSet<_> = subagent
            .messages
            .iter()
            .filter_map(|message| message.model.as_ref())
            .collect();
        for model in models_used {
            if let Some(aggregate) = models.get_mut(model) {
                aggregate.subagent_count = aggregate.subagent_count.saturating_add(1);
            }
        }
    }
    for aggregate in models.values_mut() {
        aggregate
            .tool_aggregates
            .sort_by(|a, b| a.name.cmp(&b.name));
    }
    models
}

pub(crate) fn per_model_usage(detail: &SessionDetail) -> HashMap<String, Usage> {
    let mut usage: HashMap<String, Usage> = HashMap::new();
    for message in detail
        .messages
        .iter()
        .chain(detail.subagents.iter().flat_map(|s| s.messages.iter()))
    {
        if let (Some(model), Some(message_usage)) = (&message.model, message.usage) {
            let total = usage.entry(model.clone()).or_default();
            total.input_tokens += message_usage.input_tokens;
            total.output_tokens += message_usage.output_tokens;
            total.cache_read_tokens += message_usage.cache_read_tokens;
            total.cache_creation_tokens += message_usage.cache_creation_tokens;
            total.reasoning_tokens = match (total.reasoning_tokens, message_usage.reasoning_tokens)
            {
                (Some(a), Some(b)) => Some(a + b),
                (Some(a), None) => Some(a),
                (None, Some(b)) => Some(b),
                (None, None) => None,
            };
        }
    }
    usage
}

/// Builds lightweight message records once, during the read-only scan.
/// `exact_costs` contains parser-produced per-message costs when a provider has
/// usage context that cannot be reconstructed from the public message contract.
pub(crate) fn message_metrics_from_detail(
    detail: &SessionDetail,
    provider: Provider,
    exact_costs: &HashMap<String, CostBreakdown>,
) -> Vec<MessageMetric> {
    let mut records = Vec::with_capacity(
        detail.messages.len()
            + detail
                .subagents
                .iter()
                .map(|subagent| subagent.messages.len())
                .sum::<usize>(),
    );
    append_message_metrics(&mut records, &detail.messages, None, provider, exact_costs);
    for subagent in &detail.subagents {
        append_message_metrics(
            &mut records,
            &subagent.messages,
            Some(&subagent.id),
            provider,
            exact_costs,
        );
    }
    records
}

fn append_message_metrics(
    records: &mut Vec<MessageMetric>,
    messages: &[crate::model::Message],
    subagent_id: Option<&str>,
    provider: Provider,
    exact_costs: &HashMap<String, CostBreakdown>,
) {
    for message in messages {
        let model = message
            .model
            .as_deref()
            .filter(|model| !model.is_empty())
            .map(str::to_owned)
            .or_else(|| message.usage.map(|_| "unknown".to_owned()));
        let cost = exact_costs
            .get(&message.id)
            .copied()
            .or_else(|| {
                message.usage.zip(model.as_deref()).map(|(usage, model)| {
                    let request_input_tokens =
                        usage.input_tokens.saturating_add(usage.cache_read_tokens);
                    crate::pricing::cost_breakdown_for(
                        provider,
                        model,
                        usage,
                        crate::pricing::PriceCtx {
                            request_input_tokens: Some(request_input_tokens),
                            ..crate::pricing::PriceCtx::default()
                        },
                    )
                })
            })
            .unwrap_or_default();
        let (date, weekday, hour) = DateTime::parse_from_rfc3339(&message.timestamp)
            .ok()
            .map(|timestamp| {
                let local = timestamp.with_timezone(&Local);
                (
                    Some(local.date_naive()),
                    Some(local.weekday().num_days_from_monday() as u8),
                    Some(local.hour() as u8),
                )
            })
            .unwrap_or((None, None, None));
        let mut tools = HashMap::<String, ToolAggregate>::new();
        for block in &message.blocks {
            let crate::model::Block::ToolCall(call) = block else {
                continue;
            };
            let aggregate = tools
                .entry(call.name.clone())
                .or_insert_with(|| ToolAggregate {
                    name: call.name.clone(),
                    ..ToolAggregate::default()
                });
            aggregate.calls = aggregate.calls.saturating_add(1);
            if call.is_error {
                aggregate.errors = aggregate.errors.saturating_add(1);
            }
            if let Some(duration) = call.duration_ms {
                aggregate.duration_ms = aggregate.duration_ms.saturating_add(duration as u128);
                aggregate.duration_count = aggregate.duration_count.saturating_add(1);
            }
        }
        let mut tool_aggregates: Vec<_> = tools.into_values().collect();
        tool_aggregates.sort_by(|a, b| a.name.cmp(&b.name));
        records.push(MessageMetric {
            date,
            weekday,
            hour,
            model,
            usage: message.usage,
            cost,
            tool_aggregates,
            subagent_id: subagent_id.map(str::to_owned),
        });
    }
}
