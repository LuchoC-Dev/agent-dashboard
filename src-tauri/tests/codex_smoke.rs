use agent_dashboard_lib::{
    cache::AppState,
    model::{DateRange, Usage},
    sources::{codex::CodexSource, SessionSource, Unit},
};
use serde_json::Value;
use std::{
    collections::HashSet,
    fs::File,
    io::{BufRead, BufReader},
    path::Path,
    time::{Instant, SystemTime},
};

#[test]
#[ignore = "requires the real local ~/.codex session logs"]
fn real_codex_smoke_parses_all_sessions_reports_usage_and_memory() {
    let homes = CodexSource::default_dirs();
    let sources: Vec<_> = homes.iter().cloned().map(CodexSource::new).collect();
    let discoveries: Vec<_> = sources
        .iter()
        .map(|source| {
            let directory = contract_path(source.codex_dir());
            println!("Codex data directory: {directory}");
            let discovery = source.discover().unwrap();
            assert!(
                discovery.errors.is_empty(),
                "Codex scan errors under {directory}: {:?}",
                discovery.errors
            );
            (directory, discovery)
        })
        .collect();
    let total_discovered: usize = discoveries
        .iter()
        .map(|(_, discovery)| discovery.units.len())
        .sum();
    assert!(
        total_discovered > 0,
        "no Codex rollout sessions found under any configured home: {:?}",
        discoveries
            .iter()
            .map(|(directory, discovery)| (directory, discovery.units.len()))
            .collect::<Vec<_>>()
    );
    let file_count: usize = discoveries
        .iter()
        .flat_map(|(_, discovery)| &discovery.units)
        .map(|unit| unit.files.len())
        .sum();
    let source_sessions: Vec<_> = sources
        .into_iter()
        .map(|source| Box::new(source) as Box<dyn SessionSource>)
        .collect();
    let state = AppState::with_sources(source_sessions);

    let started = Instant::now();
    let report = state.refresh().unwrap();
    let elapsed = started.elapsed();
    assert!(
        report.errors.is_empty(),
        "Codex scan errors: {:?}",
        report.errors
    );
    let summaries = state.summaries().unwrap();
    assert_eq!(report.sessions as usize, summaries.len());
    let reported_sources = report.sources.as_ref().unwrap();
    assert_eq!(reported_sources.len(), homes.len());
    for (directory, discovery) in &discoveries {
        let source = reported_sources
            .iter()
            .find(|source| source.source_dir == *directory)
            .expect("every configured Codex home must appear in the scan report");
        assert_eq!(source.sessions as usize, discovery.units.len());
    }

    let mut message_count = 0u64;
    let mut tool_count = 0u64;
    let mut subagent_count = 0u64;
    let mut usage_verified_sessions = 0usize;
    let mut active_sessions_skipped = 0usize;
    for summary in &summaries {
        let source_dir = summary.source_dir.as_deref().unwrap();
        let (_, discovery) = discoveries
            .iter()
            .find(|(directory, _)| directory == source_dir)
            .expect("summary source directory must identify its Codex home");
        let unit = discovery
            .units
            .iter()
            .find(|unit| unit.key == summary.id)
            .expect("summary must have a discovered session unit");
        let has_recent_file = unit.files.iter().any(|path| {
            is_recent(
                std::fs::metadata(path)
                    .and_then(|metadata| metadata.modified())
                    .ok(),
            )
        });
        if has_recent_file {
            active_sessions_skipped += 1;
        } else {
            let raw_usage = raw_usage_for_unit(unit);
            assert_eq!(
                summary.usage, raw_usage,
                "usage mismatch for session {}",
                summary.id
            );
            usage_verified_sessions += 1;
        }
        message_count += summary.message_count as u64;
        tool_count += summary.tool_call_count as u64;
        subagent_count += summary.subagent_count as u64;
    }

    let all_sessions_json_bytes = serde_json::to_vec(&summaries).unwrap().len();
    let mut session_days: Vec<_> = summaries
        .iter()
        .filter_map(|summary| local_day(summary.started_at.as_str()))
        .collect();
    session_days.sort();
    let range = DateRange {
        from: session_days.first().cloned(),
        to: session_days.last().cloned(),
    };
    let metrics = state.metrics(Some(range.clone()), None).unwrap();
    let metrics_json_bytes = serde_json::to_vec(&metrics).unwrap().len();
    let tool_stats = state.tool_stats(Some(range), None).unwrap();
    let tool_stats_json_bytes = serde_json::to_vec(&tool_stats).unwrap().len();
    let report_json_bytes = serde_json::to_vec(&report).unwrap().len();
    let startup_payload_bytes =
        all_sessions_json_bytes + metrics_json_bytes + tool_stats_json_bytes + report_json_bytes;
    let estimated_cache_bytes = state.estimated_cache_bytes().unwrap();
    let sample = summaries.first().unwrap();
    let sample_detail = state.session(&sample.id).unwrap();
    assert_eq!(
        serde_json::to_value(&sample_detail.summary).unwrap(),
        serde_json::to_value(sample).unwrap()
    );
    let sample_detail_json_bytes = serde_json::to_vec(&sample_detail).unwrap().len();

    let sessions_per_home = reported_sources
        .iter()
        .map(|source| format!("{}:{}", source.source_dir, source.sessions))
        .collect::<Vec<_>>()
        .join(";");
    println!(
        "Codex smoke: sessions={} duplicates_merged={} sessions_per_home=[{}] files={} messages={} tools={} subagents={} usage_verified={} active_skipped={} first_scan_ms={} estimated_cache_mib={:.2} startup_commands=4 startup_get_session_calls=0 list_sessions_json_bytes={} metrics_json_bytes={} tool_stats_json_bytes={} scan_report_json_bytes={} startup_payload_bytes={} one_lazy_detail_json_bytes={}",
        summaries.len(),
        report.duplicates_merged.unwrap_or_default(),
        sessions_per_home,
        file_count,
        message_count,
        tool_count,
        subagent_count,
        usage_verified_sessions,
        active_sessions_skipped,
        elapsed.as_millis(),
        estimated_cache_bytes as f64 / (1024.0 * 1024.0),
        all_sessions_json_bytes,
        metrics_json_bytes,
        tool_stats_json_bytes,
        report_json_bytes,
        startup_payload_bytes,
        sample_detail_json_bytes,
    );
}

fn contract_path(path: &Path) -> String {
    let path = path.to_string_lossy();
    let extended_unc = r"\\?\UNC\";
    let extended = r"\\?\";
    if path
        .get(..extended_unc.len())
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case(extended_unc))
    {
        format!(r"\\{}", &path[extended_unc.len()..])
    } else if let Some(normal) = path.strip_prefix(extended) {
        let bytes = normal.as_bytes();
        if bytes.len() >= 3
            && bytes[0].is_ascii_alphabetic()
            && bytes[1] == b':'
            && matches!(bytes[2], b'\\' | b'/')
        {
            normal.to_owned()
        } else {
            path.into_owned()
        }
    } else {
        path.into_owned()
    }
}

fn local_day(timestamp: &str) -> Option<String> {
    chrono::DateTime::parse_from_rfc3339(timestamp)
        .ok()
        .map(|value| value.with_timezone(&chrono::Local).date_naive().to_string())
}

fn raw_usage_for_unit(unit: &Unit) -> Usage {
    let mut total = Usage::default();
    for path in &unit.files {
        let header_key = format!("codex.header:{}", path.to_string_lossy());
        let header: Value = serde_json::from_str(unit.metadata.get(&header_key).unwrap()).unwrap();
        let thread_id = header.get("id").and_then(Value::as_str).unwrap_or_default();
        total = add_usage(total, raw_usage_for_file(path, thread_id));
    }
    total
}

fn raw_usage_for_file(path: &Path, thread_id: &str) -> Usage {
    let file = File::open(path).unwrap();
    let modified = std::fs::metadata(path)
        .and_then(|metadata| metadata.modified())
        .ok();
    let mut ordinal_fallback = 0u64;
    let mut current_turn = None::<String>;
    let mut first_record_ordinal = None::<u64>;
    let mut seen_records = HashSet::new();
    let mut previous_cumulative = None::<Value>;
    let mut usage = Usage::default();
    for line in BufReader::new(file).lines() {
        let Ok(line) = line else { continue };
        let envelope = match serde_json::from_str::<Value>(&line) {
            Ok(envelope) => envelope,
            Err(_) if !line.ends_with('\n') && is_recent(modified) => continue,
            Err(_) => {
                ordinal_fallback = ordinal_fallback.saturating_add(1);
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
        let payload = envelope.get("payload").unwrap_or(&Value::Null);
        let envelope_kind = envelope
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or_default();
        let kind = payload
            .get("type")
            .and_then(Value::as_str)
            .unwrap_or(envelope_kind);
        let event_turn = payload
            .get("turn_id")
            .and_then(Value::as_str)
            .or(current_turn.as_deref());
        let own_turn = event_turn.is_none_or(|turn| !is_replayed_turn(turn, thread_id));
        if kind == "task_started" {
            current_turn = payload
                .get("turn_id")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned);
        }
        if !own_turn {
            continue;
        }
        if kind == "token_usage_record" {
            first_record_ordinal.get_or_insert(ordinal);
            let response_id = payload
                .get("response_id")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .unwrap_or_else(|| ordinal.to_string());
            if seen_records.insert(response_id) {
                usage = add_usage(
                    usage,
                    usage_from(payload.get("usage").unwrap_or(&Value::Null)),
                );
            }
        } else if kind == "token_count"
            && !first_record_ordinal.is_some_and(|first| ordinal >= first)
        {
            let info = payload.get("info").unwrap_or(&Value::Null);
            let cumulative = info
                .get("total_token_usage")
                .cloned()
                .unwrap_or(Value::Null);
            if previous_cumulative.as_ref() != Some(&cumulative) {
                previous_cumulative = Some(cumulative);
                usage = add_usage(
                    usage,
                    usage_from(info.get("last_token_usage").unwrap_or(&Value::Null)),
                );
            }
        }
    }
    usage
}

fn usage_from(value: &Value) -> Usage {
    let input = value
        .get("input_tokens")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    let cached = value
        .get("cached_input_tokens")
        .and_then(Value::as_u64)
        .unwrap_or(0);
    Usage {
        input_tokens: input.saturating_sub(cached),
        output_tokens: value
            .get("output_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        cache_read_tokens: cached,
        cache_creation_tokens: value
            .get("cache_write_input_tokens")
            .and_then(Value::as_u64)
            .unwrap_or(0),
        reasoning_tokens: value.get("reasoning_output_tokens").and_then(Value::as_u64),
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

fn is_replayed_turn(turn_id: &str, thread_id: &str) -> bool {
    match (uuidv7_timestamp(turn_id), uuidv7_timestamp(thread_id)) {
        (Some(turn), Some(thread)) => turn < thread,
        _ => false,
    }
}

fn uuidv7_timestamp(value: &str) -> Option<u64> {
    let mut hex = String::with_capacity(12);
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

fn is_recent(modified: Option<SystemTime>) -> bool {
    modified
        .and_then(|time| SystemTime::now().duration_since(time).ok())
        .is_some_and(|age| age.as_secs() < 60)
}
