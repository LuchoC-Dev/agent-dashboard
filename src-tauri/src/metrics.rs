use crate::{model::*, pricing, sources::ToolAggregate};
use chrono::{DateTime, Duration, Local, NaiveDate, TimeZone};
use std::collections::{HashMap, HashSet};

use crate::sources::MessageMetric;

fn resolved(range: Option<DateRange>) -> (DateRange, NaiveDate, NaiveDate) {
    let today = Local::now().date_naive();
    let r = range.unwrap_or_default();
    let from = r
        .from
        .as_deref()
        .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok());
    let to =
        r.to.as_deref()
            .and_then(|s| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok());
    let start = from.unwrap_or_else(|| to.unwrap_or(today) - Duration::days(29));
    let end = to.unwrap_or_else(|| from.unwrap_or(today));
    (
        DateRange {
            from: Some(start.to_string()),
            to: Some(end.to_string()),
        },
        start,
        end,
    )
}
pub(crate) fn started_day<T: TimeZone>(s: &str, timezone: &T) -> Option<NaiveDate> {
    DateTime::parse_from_rfc3339(s)
        .ok()
        .map(|date| date.with_timezone(timezone).date_naive())
}

pub(crate) fn filtered_tool_counts(
    messages: &[MessageMetric],
    model: Option<&str>,
    selected_models: Option<&[String]>,
    weekday: Option<u8>,
    hour: Option<u8>,
    tool: &str,
) -> (u32, u32) {
    messages
        .iter()
        .filter(|message| {
            model_matches(message.model.as_deref(), model, selected_models)
                && weekday.is_none_or(|wanted| message.weekday == Some(wanted))
                && hour.is_none_or(|wanted| message.hour == Some(wanted))
        })
        .flat_map(|message| message.tool_aggregates.iter())
        .filter(|aggregate| aggregate.name == tool)
        .fold((0u32, 0u32), |(calls, errors), aggregate| {
            (
                calls.saturating_add(aggregate.calls),
                errors.saturating_add(aggregate.errors),
            )
        })
}

pub(crate) fn matches_days<T: TimeZone>(
    s: &str,
    from: Option<&str>,
    to: Option<&str>,
    timezone: &T,
) -> bool {
    let day = started_day(s, timezone).map(|day| day.to_string());
    from.is_none_or(|from| day.as_deref().is_some_and(|day| day >= from))
        && to.is_none_or(|to| day.as_deref().is_some_and(|day| day <= to))
}
fn add(a: &mut Usage, b: Usage) {
    a.input_tokens += b.input_tokens;
    a.output_tokens += b.output_tokens;
    a.cache_read_tokens += b.cache_read_tokens;
    a.cache_creation_tokens += b.cache_creation_tokens;
    a.reasoning_tokens = match (a.reasoning_tokens, b.reasoning_tokens) {
        (Some(x), Some(y)) => Some(x + y),
        (Some(x), None) => Some(x),
        (None, Some(y)) => Some(y),
        (None, None) => None,
    };
}
fn add_cost(a: &mut CostBreakdown, b: CostBreakdown) {
    a.input += b.input;
    a.output += b.output;
    a.cache_read += b.cache_read;
    a.cache_write += b.cache_write;
}
pub fn get_metrics(
    sessions: &[SessionSummary],
    model_usage: &HashMap<String, HashMap<String, Usage>>,
    model_costs: &HashMap<String, HashMap<String, CostBreakdown>>,
    range: Option<DateRange>,
) -> Metrics {
    let mut metrics = get_metrics_in(sessions, model_usage, model_costs, range.clone(), &Local);
    let (_, start, end) = resolved(range.clone());
    let mut providers = Vec::new();
    for session in sessions.iter().filter(|session| {
        started_day(&session.started_at, &Local).is_some_and(|day| day >= start && day <= end)
    }) {
        if !providers.contains(&session.provider) {
            providers.push(session.provider);
        }
    }
    if providers.len() >= 2 {
        let mut by_provider: Vec<_> = providers
            .into_iter()
            .map(|provider| {
                let selected: Vec<_> = sessions
                    .iter()
                    .filter(|session| {
                        session.provider == provider
                            && started_day(&session.started_at, &Local)
                                .is_some_and(|day| day >= start && day <= end)
                    })
                    .cloned()
                    .collect();
                let aggregate =
                    get_metrics_in(&selected, model_usage, model_costs, range.clone(), &Local);
                let (key, label) = match provider {
                    Provider::Claude => ("claude", "Claude"),
                    Provider::Codex => ("codex", "Codex"),
                };
                GroupBucket {
                    key: key.to_owned(),
                    label: label.to_owned(),
                    sessions: aggregate.totals.sessions,
                    usage: aggregate.totals.usage,
                    cost_usd: aggregate.totals.cost_usd,
                    cost_breakdown: aggregate.totals.cost_breakdown,
                    unpriced_tokens: aggregate.totals.unpriced_tokens,
                }
            })
            .collect();
        by_provider.sort_by(|a, b| {
            b.cost_usd
                .total_cmp(&a.cost_usd)
                .then_with(|| a.key.cmp(&b.key))
        });
        metrics.by_provider = Some(by_provider);
    }
    metrics
}

fn get_metrics_in<T: TimeZone>(
    sessions: &[SessionSummary],
    model_usage: &HashMap<String, HashMap<String, Usage>>,
    model_costs: &HashMap<String, HashMap<String, CostBreakdown>>,
    range: Option<DateRange>,
    timezone: &T,
) -> Metrics {
    let (range, start, end) = resolved(range);
    let selected: Vec<_> = sessions
        .iter()
        .filter(|d| {
            started_day(&d.started_at, timezone).is_some_and(|day| day >= start && day <= end)
        })
        .collect();
    let mut totals = Totals::default();
    let mut days: HashMap<NaiveDate, DayBucket> = HashMap::new();
    let mut projects: HashMap<String, GroupBucket> = HashMap::new();
    let mut models: HashMap<String, GroupBucket> = HashMap::new();
    let mut day = start;
    while day <= end {
        days.insert(
            day,
            DayBucket {
                date: day.to_string(),
                sessions: 0,
                tool_calls: 0,
                tool_errors: Some(0),
                usage: Usage::default(),
                cost_usd: 0.0,
                cost_breakdown: CostBreakdown::default(),
                unpriced_tokens: None,
            },
        );
        day += Duration::days(1);
    }
    for d in selected {
        totals.sessions += 1;
        totals.messages += d.message_count;
        totals.tool_calls += d.tool_call_count;
        totals.tool_errors += d.tool_error_count;
        totals.subagents += d.subagent_count;
        add(&mut totals.usage, d.usage);
        add_cost(&mut totals.cost_breakdown, d.cost_breakdown);
        totals.cost_usd = totals.cost_breakdown.total();
        add_unpriced(&mut totals.unpriced_tokens, d.unpriced_tokens.unwrap_or(0));
        totals.active_ms += d.duration_ms;
        if let Some(day) = started_day(&d.started_at, timezone) {
            if let Some(b) = days.get_mut(&day) {
                b.sessions += 1;
                b.tool_calls += d.tool_call_count;
                b.tool_errors = Some(
                    b.tool_errors
                        .unwrap_or(0)
                        .saturating_add(d.tool_error_count),
                );
                add(&mut b.usage, d.usage);
                add_cost(&mut b.cost_breakdown, d.cost_breakdown);
                b.cost_usd = b.cost_breakdown.total();
                add_unpriced(&mut b.unpriced_tokens, d.unpriced_tokens.unwrap_or(0));
            }
        }
        let p = projects
            .entry(d.project_key.clone())
            .or_insert(GroupBucket {
                key: d.project_key.clone(),
                label: d.project_name.clone(),
                sessions: 0,
                usage: Usage::default(),
                cost_usd: 0.0,
                cost_breakdown: CostBreakdown::default(),
                unpriced_tokens: None,
            });
        p.sessions += 1;
        add(&mut p.usage, d.usage);
        add_cost(&mut p.cost_breakdown, d.cost_breakdown);
        p.cost_usd = p.cost_breakdown.total();
        add_unpriced(&mut p.unpriced_tokens, d.unpriced_tokens.unwrap_or(0));
        if let Some(per_model) = model_usage.get(&d.id) {
            for (model, usage) in per_model {
                let b = models.entry(model.clone()).or_insert(GroupBucket {
                    key: model.clone(),
                    label: model.clone(),
                    sessions: 0,
                    usage: Usage::default(),
                    cost_usd: 0.0,
                    cost_breakdown: CostBreakdown::default(),
                    unpriced_tokens: None,
                });
                b.sessions += 1;
                add(&mut b.usage, *usage);
                let cost = model_costs
                    .get(&d.id)
                    .and_then(|costs| costs.get(model))
                    .copied()
                    .unwrap_or_else(|| {
                        pricing::cost_breakdown_for(
                            d.provider,
                            model,
                            *usage,
                            pricing::PriceCtx {
                                request_input_tokens: Some(
                                    usage.input_tokens.saturating_add(usage.cache_read_tokens),
                                ),
                                ..pricing::PriceCtx::default()
                            },
                        )
                    });
                add_cost(&mut b.cost_breakdown, cost);
                b.cost_usd = b.cost_breakdown.total();
                add_unpriced(
                    &mut b.unpriced_tokens,
                    pricing::unpriced_tokens_for(d.provider, model, *usage),
                );
            }
        }
    }
    let sort = |a: &mut Vec<GroupBucket>| {
        a.sort_by(|x, y| {
            y.cost_usd
                .total_cmp(&x.cost_usd)
                .then_with(|| x.key.cmp(&y.key))
        })
    };
    let mut by_project: Vec<_> = projects.into_values().collect();
    let mut by_model: Vec<_> = models.into_values().collect();
    sort(&mut by_project);
    sort(&mut by_model);
    Metrics {
        range,
        totals,
        by_day: days.into_values().collect::<Vec<_>>().tap_sort(),
        by_project,
        by_model,
        by_provider: None,
        hourly_activity: None,
        series_by_provider: None,
        series_by_model: None,
        series_by_project: None,
    }
}

#[derive(Default)]
struct MessageTotals {
    usage: Usage,
    cost: CostBreakdown,
    unpriced: u64,
    messages: u32,
    tool_calls: u32,
    tool_errors: u32,
}

#[derive(Default)]
struct PointTotals {
    cost: CostBreakdown,
    tokens: u64,
    active_ms: u64,
    sessions: HashSet<String>,
    tool_calls: u32,
    tool_errors: u32,
    messages: u32,
}

#[derive(Default)]
struct SeriesTotals {
    label: String,
    points: HashMap<NaiveDate, PointTotals>,
}

/// Builds filtered metrics and all three precomputed daily series from the compact
/// per-message cache. Session range semantics remain based on `started_at`; series
/// points use each message's local day and are bounded by the resolved range.
pub fn get_metrics_for_messages(
    sessions: &[(&SessionSummary, &[MessageMetric])],
    range: Option<DateRange>,
    model: Option<&str>,
    weekday: Option<u8>,
    hour: Option<u8>,
    token_kind: Option<TokenKind>,
) -> Metrics {
    get_metrics_for_messages_with_models(sessions, range, model, None, weekday, hour, token_kind)
}

pub fn get_metrics_for_messages_with_models(
    sessions: &[(&SessionSummary, &[MessageMetric])],
    range: Option<DateRange>,
    model: Option<&str>,
    selected_models: Option<&[String]>,
    weekday: Option<u8>,
    hour: Option<u8>,
    token_kind: Option<TokenKind>,
) -> Metrics {
    get_metrics_for_messages_with_models_and_tool(
        sessions,
        range,
        model,
        selected_models,
        weekday,
        hour,
        token_kind,
        None,
    )
}

pub fn get_metrics_for_messages_with_models_and_tool(
    sessions: &[(&SessionSummary, &[MessageMetric])],
    range: Option<DateRange>,
    model: Option<&str>,
    selected_models: Option<&[String]>,
    weekday: Option<u8>,
    hour: Option<u8>,
    token_kind: Option<TokenKind>,
    selected_tool: Option<&str>,
) -> Metrics {
    let (range, start, end) = resolved(range);
    let mut by_day = HashMap::<NaiveDate, DayBucket>::new();
    let mut day = start;
    while day <= end {
        by_day.insert(
            day,
            DayBucket {
                date: day.to_string(),
                sessions: 0,
                tool_calls: 0,
                tool_errors: Some(0),
                usage: Usage::default(),
                cost_usd: 0.0,
                cost_breakdown: CostBreakdown::default(),
                unpriced_tokens: None,
            },
        );
        day += Duration::days(1);
    }
    let mut totals = Totals::default();
    let mut projects = HashMap::<String, GroupBucket>::new();
    let mut models = HashMap::<String, GroupBucket>::new();
    let mut providers = HashMap::<String, GroupBucket>::new();
    let mut selected = Vec::with_capacity(sessions.len());
    let mut activity_messages = [0u32; 168];
    let mut activity_sessions = [0u32; 168];

    for (summary, messages) in sessions.iter().copied().filter(|(summary, _)| {
        started_day(&summary.started_at, &Local).is_some_and(|day| day >= start && day <= end)
    }) {
        let matching: Vec<_> = messages
            .iter()
            .filter(|message| {
                model_matches(message.model.as_deref(), model, selected_models)
                    && weekday.is_none_or(|wanted| message.weekday == Some(wanted))
                    && hour.is_none_or(|wanted| message.hour == Some(wanted))
            })
            .collect();
        if matching.is_empty() {
            continue;
        }
        if selected_tool.is_some_and(|tool| {
            !matching.iter().any(|message| {
                message
                    .tool_aggregates
                    .iter()
                    .any(|aggregate| aggregate.name == tool && aggregate.calls > 0)
            })
        }) {
            continue;
        }
        selected.push((summary, messages));

        let mut selected_total = MessageTotals::default();
        let mut per_model = HashMap::<String, MessageTotals>::new();
        let mut subagents = HashSet::new();
        let mut seen_activity_cells = HashSet::new();
        for message in &matching {
            selected_total.messages = selected_total.messages.saturating_add(1);
            let cost = selected_cost(message.cost, token_kind);
            add_cost(&mut selected_total.cost, cost);
            if let Some(usage) = message.usage {
                let usage = selected_usage(usage, token_kind);
                add(&mut selected_total.usage, usage);
                if let Some(model) = message.model.as_deref() {
                    selected_total.unpriced =
                        selected_total
                            .unpriced
                            .saturating_add(pricing::unpriced_tokens_for(
                                summary.provider,
                                model,
                                usage,
                            ));
                    let aggregate = per_model.entry(model.to_owned()).or_default();
                    add(&mut aggregate.usage, usage);
                    add_cost(&mut aggregate.cost, cost);
                    aggregate.unpriced =
                        aggregate
                            .unpriced
                            .saturating_add(pricing::unpriced_tokens_for(
                                summary.provider,
                                model,
                                usage,
                            ));
                }
            }
            for tool in &message.tool_aggregates {
                if selected_tool.is_none_or(|wanted| tool.name == wanted) {
                    selected_total.tool_calls =
                        selected_total.tool_calls.saturating_add(tool.calls);
                    selected_total.tool_errors =
                        selected_total.tool_errors.saturating_add(tool.errors);
                }
                if let Some(model) = message.model.as_deref() {
                    let aggregate = per_model.entry(model.to_owned()).or_default();
                    aggregate.tool_calls = aggregate.tool_calls.saturating_add(tool.calls);
                    aggregate.tool_errors = aggregate.tool_errors.saturating_add(tool.errors);
                }
            }
            if let Some(subagent_id) = &message.subagent_id {
                subagents.insert(subagent_id.as_str());
            }
            if let (Some(weekday), Some(hour)) = (message.weekday, message.hour) {
                let cell = weekday as usize * 24 + hour as usize;
                activity_messages[cell] = activity_messages[cell].saturating_add(1);
                seen_activity_cells.insert(cell);
            }
        }
        for cell in seen_activity_cells {
            activity_sessions[cell] = activity_sessions[cell].saturating_add(1);
        }

        totals.sessions = totals.sessions.saturating_add(1);
        totals.messages = totals.messages.saturating_add(selected_total.messages);
        totals.tool_calls = totals.tool_calls.saturating_add(selected_total.tool_calls);
        totals.tool_errors = totals
            .tool_errors
            .saturating_add(selected_total.tool_errors);
        totals.subagents = totals.subagents.saturating_add(subagents.len() as u32);
        add(&mut totals.usage, selected_total.usage);
        add_cost(&mut totals.cost_breakdown, selected_total.cost);
        totals.cost_usd = totals.cost_breakdown.total();
        add_unpriced(&mut totals.unpriced_tokens, selected_total.unpriced);
        if model_matches(
            summary.models.first().map(String::as_str),
            model,
            selected_models,
        ) {
            totals.active_ms = totals.active_ms.saturating_add(summary.duration_ms);
        }

        if let Some(day) = started_day(&summary.started_at, &Local) {
            if let Some(bucket) = by_day.get_mut(&day) {
                bucket.sessions = bucket.sessions.saturating_add(1);
                bucket.tool_calls = bucket.tool_calls.saturating_add(selected_total.tool_calls);
                bucket.tool_errors = Some(
                    bucket
                        .tool_errors
                        .unwrap_or(0)
                        .saturating_add(selected_total.tool_errors),
                );
                add(&mut bucket.usage, selected_total.usage);
                add_cost(&mut bucket.cost_breakdown, selected_total.cost);
                bucket.cost_usd = bucket.cost_breakdown.total();
                add_unpriced(&mut bucket.unpriced_tokens, selected_total.unpriced);
            }
        }

        add_group(
            &mut projects,
            summary.project_key.clone(),
            summary.project_name.clone(),
            &selected_total,
        );
        let (provider_key, provider_label) = provider_key_label(summary.provider);
        add_group(
            &mut providers,
            provider_key.to_owned(),
            provider_label.to_owned(),
            &selected_total,
        );
        for (model_key, aggregate) in &per_model {
            add_group(&mut models, model_key.clone(), model_key.clone(), aggregate);
        }
    }

    let mut by_project: Vec<_> = projects.into_values().collect();
    let mut by_model: Vec<_> = models.into_values().collect();
    sort_groups(&mut by_project);
    sort_groups(&mut by_model);
    let mut by_provider: Vec<_> = providers.into_values().collect();
    sort_groups(&mut by_provider);
    let activity = Some(
        (0..168)
            .map(|index| HourlyActivity {
                weekday: (index / 24) as u8,
                hour: (index % 24) as u8,
                messages: activity_messages[index],
                sessions: activity_sessions[index],
            })
            .collect(),
    );
    let (series_by_provider, series_by_model, series_by_project) = build_daily_series(
        &selected,
        start,
        end,
        model,
        selected_models,
        weekday,
        hour,
        token_kind,
        selected_tool,
    );
    Metrics {
        range,
        totals,
        by_day: by_day.into_values().collect::<Vec<_>>().tap_sort(),
        by_project,
        by_model,
        by_provider: (by_provider.len() >= 2).then_some(by_provider),
        hourly_activity: activity,
        series_by_provider: Some(series_by_provider),
        series_by_model: Some(series_by_model),
        series_by_project: Some(series_by_project),
    }
}

pub(crate) fn model_matches(
    actual: Option<&str>,
    model: Option<&str>,
    models: Option<&[String]>,
) -> bool {
    model.is_none_or(|wanted| actual == Some(wanted))
        && models.is_none_or(|wanted| {
            wanted
                .iter()
                .any(|candidate| Some(candidate.as_str()) == actual)
        })
}

fn selected_usage(usage: Usage, kind: Option<TokenKind>) -> Usage {
    match kind {
        None => usage,
        Some(TokenKind::Input) => Usage {
            input_tokens: usage.input_tokens,
            ..Usage::default()
        },
        Some(TokenKind::Output) => Usage {
            output_tokens: usage.output_tokens,
            reasoning_tokens: usage.reasoning_tokens,
            ..Usage::default()
        },
        Some(TokenKind::CacheRead) => Usage {
            cache_read_tokens: usage.cache_read_tokens,
            ..Usage::default()
        },
        Some(TokenKind::CacheWrite) => Usage {
            cache_creation_tokens: usage.cache_creation_tokens,
            ..Usage::default()
        },
    }
}

fn selected_cost(cost: CostBreakdown, kind: Option<TokenKind>) -> CostBreakdown {
    match kind {
        None => cost,
        Some(TokenKind::Input) => CostBreakdown {
            input: cost.input,
            ..CostBreakdown::default()
        },
        Some(TokenKind::Output) => CostBreakdown {
            output: cost.output,
            ..CostBreakdown::default()
        },
        Some(TokenKind::CacheRead) => CostBreakdown {
            cache_read: cost.cache_read,
            ..CostBreakdown::default()
        },
        Some(TokenKind::CacheWrite) => CostBreakdown {
            cache_write: cost.cache_write,
            ..CostBreakdown::default()
        },
    }
}

fn add_group(
    groups: &mut HashMap<String, GroupBucket>,
    key: String,
    label: String,
    values: &MessageTotals,
) {
    let bucket = groups.entry(key.clone()).or_insert_with(|| GroupBucket {
        key,
        label,
        sessions: 0,
        usage: Usage::default(),
        cost_usd: 0.0,
        cost_breakdown: CostBreakdown::default(),
        unpriced_tokens: None,
    });
    bucket.sessions = bucket.sessions.saturating_add(1);
    add(&mut bucket.usage, values.usage);
    add_cost(&mut bucket.cost_breakdown, values.cost);
    bucket.cost_usd = bucket.cost_breakdown.total();
    add_unpriced(&mut bucket.unpriced_tokens, values.unpriced);
}

fn provider_key_label(provider: Provider) -> (&'static str, &'static str) {
    match provider {
        Provider::Claude => ("claude", "Claude"),
        Provider::Codex => ("codex", "Codex"),
    }
}

fn sort_groups(groups: &mut [GroupBucket]) {
    groups.sort_by(|a, b| {
        b.cost_usd
            .total_cmp(&a.cost_usd)
            .then_with(|| a.key.cmp(&b.key))
    });
}

fn bump_series(
    series: &mut HashMap<String, SeriesTotals>,
    key: &str,
    label: &str,
    date: NaiveDate,
    session_id: &str,
    message: &MessageMetric,
    token_kind: Option<TokenKind>,
    selected_tool: Option<&str>,
) {
    let group = series
        .entry(key.to_owned())
        .or_insert_with(|| SeriesTotals {
            label: label.to_owned(),
            points: HashMap::new(),
        });
    let point = group.points.entry(date).or_default();
    point.sessions.insert(session_id.to_owned());
    point.messages = point.messages.saturating_add(1);
    for tool in message
        .tool_aggregates
        .iter()
        .filter(|tool| selected_tool.is_none_or(|wanted| tool.name == wanted))
    {
        point.tool_calls = point.tool_calls.saturating_add(tool.calls);
        point.tool_errors = point.tool_errors.saturating_add(tool.errors);
    }
    add_cost(&mut point.cost, selected_cost(message.cost, token_kind));
    if let Some(usage) = message.usage {
        let usage = selected_usage(usage, token_kind);
        point.tokens = point.tokens.saturating_add(
            usage
                .input_tokens
                .saturating_add(usage.output_tokens)
                .saturating_add(usage.cache_read_tokens)
                .saturating_add(usage.cache_creation_tokens),
        );
    }
}

fn bump_active(
    series: &mut HashMap<String, SeriesTotals>,
    key: &str,
    label: &str,
    date: NaiveDate,
    duration_ms: u64,
) {
    let group = series
        .entry(key.to_owned())
        .or_insert_with(|| SeriesTotals {
            label: label.to_owned(),
            points: HashMap::new(),
        });
    let point = group.points.entry(date).or_default();
    point.active_ms = point.active_ms.saturating_add(duration_ms);
}

fn finish_series(series: HashMap<String, SeriesTotals>) -> Vec<DailySeries> {
    let mut result: Vec<_> = series
        .into_iter()
        .map(|(key, group)| {
            let mut points: Vec<_> = group
                .points
                .into_iter()
                .map(|(date, point)| DayPoint {
                    date: date.to_string(),
                    cost_usd: point.cost.total(),
                    tokens: point.tokens,
                    active_ms: point.active_ms,
                    sessions: point.sessions.len() as u32,
                    tool_calls: point.tool_calls,
                    tool_errors: Some(point.tool_errors),
                    messages: point.messages,
                })
                .collect();
            points.sort_by(|a, b| a.date.cmp(&b.date));
            DailySeries {
                key,
                label: group.label,
                points,
            }
        })
        .collect();
    result.sort_by(|a, b| {
        let cost_a = a.points.iter().map(|point| point.cost_usd).sum::<f64>();
        let cost_b = b.points.iter().map(|point| point.cost_usd).sum::<f64>();
        cost_b.total_cmp(&cost_a).then_with(|| a.key.cmp(&b.key))
    });
    result
}

fn build_daily_series(
    sessions: &[(&SessionSummary, &[MessageMetric])],
    start: NaiveDate,
    end: NaiveDate,
    model: Option<&str>,
    selected_models: Option<&[String]>,
    weekday: Option<u8>,
    hour: Option<u8>,
    token_kind: Option<TokenKind>,
    selected_tool: Option<&str>,
) -> (Vec<DailySeries>, Vec<DailySeries>, Vec<DailySeries>) {
    let mut providers = HashMap::new();
    let mut models = HashMap::new();
    let mut projects = HashMap::new();
    for (summary, messages) in sessions {
        let mut selected_message = false;
        for message in *messages {
            if !model_matches(message.model.as_deref(), model, selected_models)
                || !weekday.is_none_or(|wanted| message.weekday == Some(wanted))
                || !hour.is_none_or(|wanted| message.hour == Some(wanted))
            {
                continue;
            }
            let Some(date) = message.date.filter(|date| *date >= start && *date <= end) else {
                continue;
            };
            selected_message = true;
            let (provider_key, provider_label) = provider_key_label(summary.provider);
            bump_series(
                &mut providers,
                provider_key,
                provider_label,
                date,
                &summary.id,
                message,
                token_kind,
                selected_tool,
            );
            bump_series(
                &mut projects,
                &summary.project_key,
                &summary.project_name,
                date,
                &summary.id,
                message,
                token_kind,
                selected_tool,
            );
            if let Some(model) = message.model.as_deref() {
                let (key, label) = if model == "codex-auto-review" {
                    ("auto-review", "Revisiones automáticas")
                } else {
                    (model, model)
                };
                bump_series(
                    &mut models,
                    key,
                    label,
                    date,
                    &summary.id,
                    message,
                    token_kind,
                    selected_tool,
                );
            }
        }
        if !selected_message {
            continue;
        }
        let Some(started_day) =
            started_day(&summary.started_at, &Local).filter(|date| *date >= start && *date <= end)
        else {
            continue;
        };
        let (provider_key, provider_label) = provider_key_label(summary.provider);
        bump_active(
            &mut providers,
            provider_key,
            provider_label,
            started_day,
            summary.duration_ms,
        );
        bump_active(
            &mut projects,
            &summary.project_key,
            &summary.project_name,
            started_day,
            summary.duration_ms,
        );
        if let Some(main_model) = summary.models.first() {
            if model_matches(Some(main_model), model, selected_models)
                && main_model != "codex-auto-review"
            {
                bump_active(
                    &mut models,
                    main_model,
                    main_model,
                    started_day,
                    summary.duration_ms,
                );
            }
        }
    }
    (
        finish_series(providers),
        finish_series(models),
        finish_series(projects),
    )
}

pub fn get_hourly_activity(
    sessions: &[SessionSummary],
    activity_by_session: &HashMap<String, [u32; 168]>,
    range: Option<DateRange>,
) -> Vec<HourlyActivity> {
    let (_, start, end) = resolved(range);
    let mut messages = [0u32; 168];
    let mut active_sessions = [0u32; 168];
    for session in sessions.iter().filter(|session| {
        started_day(&session.started_at, &Local).is_some_and(|day| day >= start && day <= end)
    }) {
        let Some(counts) = activity_by_session.get(&session.id) else {
            continue;
        };
        for (index, count) in counts.iter().copied().enumerate() {
            messages[index] = messages[index].saturating_add(count);
            if count > 0 {
                active_sessions[index] = active_sessions[index].saturating_add(1);
            }
        }
    }
    (0..168)
        .map(|index| HourlyActivity {
            weekday: (index / 24) as u8,
            hour: (index % 24) as u8,
            messages: messages[index],
            sessions: active_sessions[index],
        })
        .collect()
}

fn add_unpriced(total: &mut Option<u64>, amount: u64) {
    if amount > 0 {
        *total = Some(total.unwrap_or(0).saturating_add(amount));
    }
}
trait SortedDays {
    fn tap_sort(self) -> Self;
}
impl SortedDays for Vec<DayBucket> {
    fn tap_sort(mut self) -> Self {
        self.sort_by(|a, b| a.date.cmp(&b.date));
        self
    }
}

pub fn get_tool_stats(sessions: &[&SessionDetail], range: Option<DateRange>) -> Vec<ToolStat> {
    let aggregates: Vec<_> = sessions
        .iter()
        .map(|detail| {
            let (tools, _) = crate::sources::aggregates_from_detail(detail);
            (detail.summary.clone(), tools)
        })
        .collect();
    get_tool_stats_from_aggregates(
        &aggregates
            .iter()
            .map(|(summary, tools)| (summary, tools.as_slice()))
            .collect::<Vec<_>>(),
        range,
    )
}

pub fn get_tool_stats_from_aggregates(
    sessions: &[(&SessionSummary, &[ToolAggregate])],
    range: Option<DateRange>,
) -> Vec<ToolStat> {
    get_tool_stats_from_aggregates_in(sessions, range, &Local)
}

pub fn get_tool_stats_for_messages(
    sessions: &[(&SessionSummary, &[MessageMetric])],
    range: Option<DateRange>,
    model: Option<&str>,
    weekday: Option<u8>,
    hour: Option<u8>,
) -> Vec<ToolStat> {
    get_tool_stats_for_messages_with_models(sessions, range, model, None, weekday, hour)
}

pub fn get_tool_stats_for_messages_with_models(
    sessions: &[(&SessionSummary, &[MessageMetric])],
    range: Option<DateRange>,
    model: Option<&str>,
    models: Option<&[String]>,
    weekday: Option<u8>,
    hour: Option<u8>,
) -> Vec<ToolStat> {
    get_tool_stats_for_messages_with_models_and_tool(
        sessions, range, model, models, weekday, hour, None,
    )
}

pub fn get_tool_stats_for_messages_with_models_and_tool(
    sessions: &[(&SessionSummary, &[MessageMetric])],
    range: Option<DateRange>,
    model: Option<&str>,
    models: Option<&[String]>,
    weekday: Option<u8>,
    hour: Option<u8>,
    selected_tool: Option<&str>,
) -> Vec<ToolStat> {
    let (_, start, end) = resolved(range.clone());
    let mut selected = Vec::new();
    for (summary, messages) in sessions {
        if !started_day(&summary.started_at, &Local).is_some_and(|day| day >= start && day <= end) {
            continue;
        }
        let mut tools = HashMap::<String, ToolAggregate>::new();
        for message in *messages {
            if !model_matches(message.model.as_deref(), model, models)
                || !weekday.is_none_or(|wanted| message.weekday == Some(wanted))
                || !hour.is_none_or(|wanted| message.hour == Some(wanted))
            {
                continue;
            }
            for aggregate in message
                .tool_aggregates
                .iter()
                .filter(|aggregate| selected_tool.is_none_or(|wanted| aggregate.name == wanted))
            {
                let target = tools
                    .entry(aggregate.name.clone())
                    .or_insert_with(|| ToolAggregate {
                        name: aggregate.name.clone(),
                        ..ToolAggregate::default()
                    });
                target.calls = target.calls.saturating_add(aggregate.calls);
                target.errors = target.errors.saturating_add(aggregate.errors);
                target.duration_ms = target.duration_ms.saturating_add(aggregate.duration_ms);
                target.duration_count = target
                    .duration_count
                    .saturating_add(aggregate.duration_count);
            }
        }
        if !tools.is_empty() {
            let mut tools: Vec<_> = tools.into_values().collect();
            tools.sort_by(|a, b| a.name.cmp(&b.name));
            selected.push(((*summary).clone(), tools));
        }
    }
    get_tool_stats_from_aggregates(
        &selected
            .iter()
            .map(|(summary, tools)| (summary, tools.as_slice()))
            .collect::<Vec<_>>(),
        range,
    )
}

fn get_tool_stats_from_aggregates_in<T: TimeZone>(
    sessions: &[(&SessionSummary, &[ToolAggregate])],
    range: Option<DateRange>,
    timezone: &T,
) -> Vec<ToolStat> {
    let (_, start, end) = resolved(range);
    let mut stats: HashMap<String, (u32, u32, u128, u32, HashMap<String, (String, u32)>)> =
        HashMap::new();
    for (summary, tools) in sessions.iter().filter(|(summary, _)| {
        started_day(&summary.started_at, timezone).is_some_and(|x| x >= start && x <= end)
    }) {
        for tool in *tools {
            let e = stats.entry(tool.name.clone()).or_default();
            e.0 = e.0.saturating_add(tool.calls);
            e.1 = e.1.saturating_add(tool.errors);
            e.2 = e.2.saturating_add(tool.duration_ms);
            e.3 = e.3.saturating_add(tool.duration_count);
            let project =
                e.4.entry(summary.project_key.clone())
                    .or_insert((summary.project_name.clone(), 0));
            project.1 = project.1.saturating_add(tool.calls);
        }
    }
    let mut out: Vec<_> = stats
        .into_iter()
        .map(
            |(name, (calls, errors, duration, duration_count, projects))| {
                let mut by_project: Vec<_> = projects
                    .into_iter()
                    .map(|(key, (label, count))| CountBucket { key, label, count })
                    .collect();
                by_project.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.key.cmp(&b.key)));
                ToolStat {
                    name,
                    calls,
                    errors,
                    error_rate: errors as f64 / calls as f64,
                    avg_duration_ms: (duration_count > 0)
                        .then(|| (duration / duration_count as u128) as u64),
                    by_project,
                }
            },
        )
        .collect();
    out.sort_by(|a, b| b.calls.cmp(&a.calls).then_with(|| a.name.cmp(&b.name)));
    out
}

#[cfg(test)]
fn get_tool_stats_in<T: TimeZone>(
    sessions: &[&SessionDetail],
    range: Option<DateRange>,
    timezone: &T,
) -> Vec<ToolStat> {
    let (_, start, end) = resolved(range.clone());
    let details: Vec<_> = sessions
        .iter()
        .copied()
        .filter(|detail| {
            started_day(&detail.summary.started_at, timezone)
                .is_some_and(|day| day >= start && day <= end)
        })
        .collect();
    let aggregates: Vec<_> = details
        .iter()
        .map(|detail| {
            let (tools, _) = crate::sources::aggregates_from_detail(detail);
            (detail.summary.clone(), tools)
        })
        .collect();
    get_tool_stats_from_aggregates_in(
        &aggregates
            .iter()
            .map(|(summary, tools)| (summary, tools.as_slice()))
            .collect::<Vec<_>>(),
        range,
        timezone,
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sources::ToolAggregate;
    #[test]
    fn local_days_match_filters_metrics_and_tools_at_midnight() {
        let timezone = chrono::FixedOffset::west_opt(3 * 3600).unwrap();
        let timestamp = "2026-10-06T01:30:00Z";
        assert_eq!(
            started_day(timestamp, &timezone),
            NaiveDate::from_ymd_opt(2026, 10, 5)
        );
        assert_eq!(
            started_day("2026-10-05T22:00:00-03:00", &timezone),
            NaiveDate::from_ymd_opt(2026, 10, 5)
        );
        assert_eq!(started_day("", &timezone), None);
        assert!(matches_days(
            timestamp,
            Some("2026-10-05"),
            Some("2026-10-05"),
            &timezone
        ));
        assert!(!matches_days(
            timestamp,
            Some("2026-10-06"),
            None,
            &timezone
        ));
        assert!(!matches_days("", None, Some("2026-10-05"), &timezone));
        let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/project-a/session-1.jsonl");
        let mut detail = crate::sources::claude::ClaudeSource::parse_file(&fixture).unwrap();
        detail.summary.started_at = timestamp.into();
        let range = Some(DateRange {
            from: Some("2026-10-05".into()),
            to: Some("2026-10-06".into()),
        });
        let metrics = get_metrics_in(
            &[detail.summary.clone()],
            &HashMap::new(),
            &HashMap::new(),
            range.clone(),
            &timezone,
        );
        assert_eq!(metrics.totals.sessions, 1);
        assert_eq!(metrics.by_day[0].sessions, 1);
        assert_eq!(metrics.by_day[1].sessions, 0);
        let local_only = Some(DateRange {
            from: Some("2026-10-05".into()),
            to: Some("2026-10-05".into()),
        });
        let tools = get_tool_stats_in(&[&detail], local_only, &timezone);
        assert_eq!(
            tools.iter().map(|tool| tool.calls).sum::<u32>(),
            detail.summary.tool_call_count
        );
        let utc_only = Some(DateRange {
            from: Some("2026-10-06".into()),
            to: Some("2026-10-06".into()),
        });
        assert_eq!(
            get_metrics_in(
                &[detail.summary.clone()],
                &HashMap::new(),
                &HashMap::new(),
                utc_only.clone(),
                &timezone
            )
            .totals
            .sessions,
            0
        );
        assert!(get_tool_stats_in(&[&detail], utc_only, &timezone).is_empty());
    }
    #[test]
    fn range_has_empty_days_and_filters() {
        let m = get_metrics(
            &[],
            &HashMap::new(),
            &HashMap::new(),
            Some(DateRange {
                from: Some("2026-01-01".into()),
                to: Some("2026-01-03".into()),
            }),
        );
        assert_eq!(m.by_day.len(), 3);
        assert_eq!(m.by_day[1].sessions, 0);
        assert_eq!(m.totals.sessions, 0);
    }

    #[test]
    fn model_costs_and_daily_series_follow_each_messages_model() {
        let fixture = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/project-a/session-1.jsonl");
        let mut summary = crate::sources::claude::ClaudeSource::parse_file(&fixture)
            .unwrap()
            .summary;
        summary.id = "two-model-session".into();
        summary.provider = Provider::Codex;
        summary.project_path = "C:/project/series".into();
        summary.project_name = "series".into();
        summary.started_at = "2026-10-05T12:00:00Z".into();
        summary.duration_ms = 1_200;
        summary.models = vec!["gpt-5.6-sol".into(), "gpt-5.6-terra".into()];
        let date = started_day(&summary.started_at, &Local).unwrap();
        let sol_usage = Usage {
            input_tokens: 100,
            ..Usage::default()
        };
        let terra_usage = Usage {
            output_tokens: 200,
            ..Usage::default()
        };
        let sol_cost = CostBreakdown {
            input: 0.01,
            ..CostBreakdown::default()
        };
        let terra_cost = CostBreakdown {
            output: 0.02,
            ..CostBreakdown::default()
        };
        let records = vec![
            MessageMetric {
                date: Some(date),
                weekday: Some(0),
                hour: Some(9),
                model: Some("gpt-5.6-sol".into()),
                usage: Some(sol_usage),
                cost: sol_cost,
                tool_aggregates: vec![ToolAggregate {
                    name: "Read".into(),
                    calls: 1,
                    errors: 0,
                    duration_ms: 20,
                    duration_count: 1,
                }],
                subagent_id: None,
            },
            MessageMetric {
                date: Some(date),
                weekday: Some(1),
                hour: Some(10),
                model: Some("gpt-5.6-terra".into()),
                usage: Some(terra_usage),
                cost: terra_cost,
                tool_aggregates: vec![ToolAggregate {
                    name: "Bash".into(),
                    calls: 2,
                    errors: 1,
                    duration_ms: 60,
                    duration_count: 2,
                }],
                subagent_id: Some("agent-1".into()),
            },
            MessageMetric {
                date: Some(date),
                weekday: Some(0),
                hour: Some(9),
                model: None,
                usage: None,
                cost: CostBreakdown::default(),
                tool_aggregates: Vec::new(),
                subagent_id: None,
            },
            MessageMetric {
                date: Some(date),
                weekday: Some(2),
                hour: Some(12),
                model: Some("codex-auto-review".into()),
                usage: Some(Usage {
                    output_tokens: 5,
                    ..Usage::default()
                }),
                cost: CostBreakdown::default(),
                tool_aggregates: Vec::new(),
                subagent_id: Some("review-1".into()),
            },
        ];
        let range = Some(DateRange {
            from: Some(date.to_string()),
            to: Some(date.to_string()),
        });
        let all = get_metrics_for_messages(
            &[(&summary, records.as_slice())],
            range.clone(),
            None,
            None,
            None,
            None,
        );
        assert_eq!(all.totals.messages, 4);
        assert_eq!(all.totals.usage.input_tokens, 100);
        assert_eq!(all.totals.usage.output_tokens, 205);
        assert!((all.totals.cost_usd - 0.03).abs() < 1e-12);
        let point = &all.series_by_project.as_ref().unwrap()[0].points[0];
        assert_eq!(point.messages, 4);
        assert_eq!(point.sessions, 1);
        assert_eq!(point.active_ms, 1_200);
        let model_series = all.series_by_model.as_ref().unwrap();
        assert!(model_series
            .iter()
            .all(|series| series.key != "codex-auto-review"));
        assert!(model_series.iter().any(|series| {
            series.key == "auto-review" && series.label == "Revisiones automáticas"
        }));
        let sol = model_series
            .iter()
            .find(|series| series.key == "gpt-5.6-sol")
            .unwrap();
        assert_eq!(sol.points[0].messages, 1);
        assert_eq!(sol.points[0].tokens, 100);
        assert_eq!(sol.points[0].active_ms, 1_200);
        let terra = model_series
            .iter()
            .find(|series| series.key == "gpt-5.6-terra")
            .unwrap();
        assert_eq!(terra.points[0].messages, 1);
        assert_eq!(terra.points[0].tokens, 200);
        assert_eq!(terra.points[0].active_ms, 0);

        let sol_only = get_metrics_for_messages(
            &[(&summary, records.as_slice())],
            range.clone(),
            Some("gpt-5.6-sol"),
            None,
            None,
            None,
        );
        assert_eq!(sol_only.totals.messages, 1);
        assert_eq!(sol_only.totals.usage.input_tokens, 100);
        assert!((sol_only.totals.cost_usd - 0.01).abs() < 1e-12);
        assert_eq!(sol_only.by_model.len(), 1);
        assert_eq!(sol_only.series_by_model.as_ref().unwrap().len(), 1);
        assert_eq!(
            sol_only.series_by_model.as_ref().unwrap()[0].key,
            "gpt-5.6-sol"
        );
        assert_eq!(
            sol_only.series_by_project.as_ref().unwrap()[0].points[0].messages,
            1
        );

        let weekday = get_metrics_for_messages(
            &[(&summary, records.as_slice())],
            range.clone(),
            None,
            Some(0),
            None,
            None,
        );
        assert_eq!(weekday.totals.messages, 2);
        let hour = get_metrics_for_messages(
            &[(&summary, records.as_slice())],
            range.clone(),
            None,
            None,
            Some(10),
            None,
        );
        assert_eq!(hour.totals.messages, 1);
        let combined = get_metrics_for_messages(
            &[(&summary, records.as_slice())],
            range.clone(),
            Some("gpt-5.6-terra"),
            Some(1),
            Some(10),
            None,
        );
        assert_eq!(combined.totals.messages, 1);
        assert_eq!(combined.totals.tool_calls, 2);
        assert_eq!(combined.totals.tool_errors, 1);
        assert_eq!(
            combined
                .by_day
                .iter()
                .map(|day| day.tool_errors.unwrap_or(0))
                .sum::<u32>(),
            combined.totals.tool_errors
        );
        let scoped = get_metrics_for_messages_with_models_and_tool(
            &[(&summary, records.as_slice())],
            range.clone(),
            Some("gpt-5.6-terra"),
            None,
            Some(1),
            Some(10),
            Some(TokenKind::Output),
            Some("Bash"),
        );
        assert_eq!(scoped.totals.sessions, 1);
        assert_eq!(scoped.totals.tool_calls, 2);
        assert_eq!(scoped.totals.tool_errors, 1);
        assert_eq!(scoped.totals.usage.output_tokens, 200);
        assert_eq!(scoped.totals.usage.input_tokens, 0);
        assert_eq!(scoped.by_day[0].tool_errors, Some(1));
        for series in [
            scoped.series_by_provider.as_ref().unwrap(),
            scoped.series_by_model.as_ref().unwrap(),
            scoped.series_by_project.as_ref().unwrap(),
        ] {
            assert_eq!(series[0].points[0].tool_errors, Some(1));
        }
        let unknown = get_metrics_for_messages_with_models_and_tool(
            &[(&summary, records.as_slice())],
            range.clone(),
            None,
            None,
            None,
            None,
            None,
            Some("missing-tool"),
        );
        assert_eq!(unknown.totals.sessions, 0);
        assert_eq!(unknown.totals.tool_calls, 0);
        let tools = get_tool_stats_for_messages(
            &[(&summary, records.as_slice())],
            range.clone(),
            Some("gpt-5.6-terra"),
            Some(1),
            Some(10),
        );
        assert_eq!(tools.len(), 1);
        assert_eq!(tools[0].name, "Bash");
        assert_eq!(tools[0].calls, 2);
        assert_eq!(tools[0].errors, 1);
        let scoped_tools = get_tool_stats_for_messages_with_models_and_tool(
            &[(&summary, records.as_slice())],
            range,
            Some("gpt-5.6-terra"),
            None,
            Some(1),
            Some(10),
            Some("Bash"),
        );
        assert_eq!(scoped_tools.len(), 1);
        assert_eq!(scoped_tools[0].name, "Bash");
        assert_eq!(scoped_tools[0].by_project[0].key, summary.project_key);
    }

    #[test]
    fn token_kind_scopes_cost_usage_and_series_but_preserves_activity() {
        let mut summary = crate::sources::claude::ClaudeSource::parse_file(
            &std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
                .join("tests/fixtures/project-a/session-1.jsonl"),
        )
        .unwrap()
        .summary;
        summary.id = "token-kind".into();
        summary.provider = Provider::Codex;
        summary.project_path = "C:/token-kind".into();
        summary.project_name = "token-kind".into();
        summary.started_at = "2026-10-05T12:00:00Z".into();
        summary.duration_ms = 1_000;
        summary.models = vec!["gpt-5.6-sol".into()];
        let date = started_day(&summary.started_at, &Local).unwrap();
        let usages = [
            Usage {
                input_tokens: 11,
                ..Usage::default()
            },
            Usage {
                output_tokens: 22,
                ..Usage::default()
            },
            Usage {
                cache_read_tokens: 33,
                ..Usage::default()
            },
            Usage {
                cache_creation_tokens: 44,
                ..Usage::default()
            },
        ];
        let costs = [
            CostBreakdown {
                input: 0.11,
                ..CostBreakdown::default()
            },
            CostBreakdown {
                output: 0.22,
                ..CostBreakdown::default()
            },
            CostBreakdown {
                cache_read: 0.33,
                ..CostBreakdown::default()
            },
            CostBreakdown {
                cache_write: 0.44,
                ..CostBreakdown::default()
            },
        ];
        let records: Vec<_> = usages
            .into_iter()
            .zip(costs)
            .enumerate()
            .map(|(i, (usage, cost))| MessageMetric {
                date: Some(date),
                weekday: Some(0),
                hour: Some(9),
                model: Some("gpt-5.6-sol".into()),
                usage: Some(usage),
                cost,
                tool_aggregates: if i == 0 {
                    vec![ToolAggregate {
                        name: "Read".into(),
                        calls: 2,
                        errors: 1,
                        duration_ms: 30,
                        duration_count: 1,
                    }]
                } else {
                    Vec::new()
                },
                subagent_id: None,
            })
            .collect();
        let mut other_provider = summary.clone();
        other_provider.id = "token-kind-claude".into();
        other_provider.provider = Provider::Claude;
        let inputs = [
            (&summary, records.as_slice()),
            (&other_provider, records.as_slice()),
        ];
        let range = Some(DateRange {
            from: Some(date.to_string()),
            to: Some(date.to_string()),
        });
        let all = get_metrics_for_messages(&inputs, range.clone(), None, None, None, None);
        let cases = [
            (TokenKind::Input, 22, 0.22, 0usize),
            (TokenKind::Output, 44, 0.44, 1usize),
            (TokenKind::CacheRead, 66, 0.66, 2usize),
            (TokenKind::CacheWrite, 88, 0.88, 3usize),
        ];
        let mut summed_tokens = 0;
        let mut summed_cost = 0.0;
        for (kind, tokens, cost, usage_index) in cases {
            let filtered =
                get_metrics_for_messages(&inputs, range.clone(), None, None, None, Some(kind));
            summed_tokens += tokens;
            summed_cost += cost;
            assert_eq!(
                filtered.totals.usage.input_tokens,
                if usage_index == 0 { tokens } else { 0 }
            );
            assert_eq!(
                filtered.totals.usage.output_tokens,
                if usage_index == 1 { tokens } else { 0 }
            );
            assert_eq!(
                filtered.totals.usage.cache_read_tokens,
                if usage_index == 2 { tokens } else { 0 }
            );
            assert_eq!(
                filtered.totals.usage.cache_creation_tokens,
                if usage_index == 3 { tokens } else { 0 }
            );
            assert!((filtered.totals.cost_usd - cost).abs() < 1e-12);
            assert_eq!(filtered.totals.messages, all.totals.messages);
            assert_eq!(filtered.totals.tool_calls, all.totals.tool_calls);
            assert_eq!(filtered.totals.active_ms, all.totals.active_ms);
            assert_eq!(filtered.hourly_activity, all.hourly_activity);
            let point = &filtered.series_by_project.as_ref().unwrap()[0].points[0];
            assert_eq!(point.tokens, tokens);
            assert!((point.cost_usd - cost).abs() < 1e-12);
            assert_eq!(filtered.by_project[0].usage, filtered.totals.usage);
            assert_eq!(filtered.by_model[0].usage, filtered.totals.usage);
            assert!(filtered.by_provider.as_ref().unwrap().iter().all(|group| {
                group.usage.input_tokens == filtered.totals.usage.input_tokens / 2
                    && group.usage.output_tokens == filtered.totals.usage.output_tokens / 2
                    && group.usage.cache_read_tokens == filtered.totals.usage.cache_read_tokens / 2
                    && group.usage.cache_creation_tokens
                        == filtered.totals.usage.cache_creation_tokens / 2
                    && (group.cost_usd - cost / 2.0).abs() < 1e-12
            }));
            assert_eq!(filtered.by_day[0].usage, filtered.totals.usage);
            assert_eq!(
                filtered.by_day[0].cost_breakdown,
                filtered.totals.cost_breakdown
            );
            assert_eq!(
                filtered.by_day[0].unpriced_tokens,
                filtered.totals.unpriced_tokens
            );
        }
        assert_eq!(
            summed_tokens,
            all.totals.usage.input_tokens
                + all.totals.usage.output_tokens
                + all.totals.usage.cache_read_tokens
                + all.totals.usage.cache_creation_tokens
        );
        assert!((summed_cost - all.totals.cost_usd).abs() < 1e-12);
        let combined = get_metrics_for_messages(
            &inputs,
            range,
            Some("gpt-5.6-sol"),
            Some(0),
            Some(9),
            Some(TokenKind::CacheWrite),
        );
        assert_eq!(combined.totals.usage.cache_creation_tokens, 88);
        assert_eq!(combined.totals.messages, 8);
    }
}
