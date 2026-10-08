use agent_dashboard_lib::{
    cache::AppState,
    metrics,
    model::{DateRange, Provider, SessionFilter, TokenKind},
    sources::claude::ClaudeSource,
};
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    path::{Path, PathBuf},
    time::SystemTime,
};

fn fixture_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}
fn walk(p: &Path, out: &mut Vec<PathBuf>) {
    for e in fs::read_dir(p).unwrap() {
        let p = e.unwrap().path();
        if p.is_dir() {
            walk(&p, out)
        } else {
            out.push(p)
        }
    }
}
fn snapshot(root: &Path) -> HashMap<PathBuf, (u64, SystemTime, [u8; 32])> {
    let mut files = Vec::new();
    walk(root, &mut files);
    files
        .into_iter()
        .map(|p| {
            let m = fs::metadata(&p).unwrap();
            let hash = Sha256::digest(fs::read(&p).unwrap()).into();
            (p, (m.len(), m.modified().unwrap(), hash))
        })
        .collect()
}
fn copy_fixtures(to: &Path) {
    fn cp(src: &Path, dst: &Path) {
        fs::create_dir_all(dst).unwrap();
        for e in fs::read_dir(src).unwrap() {
            let e = e.unwrap();
            let out = dst.join(e.file_name());
            if e.path().is_dir() {
                cp(&e.path(), &out)
            } else {
                fs::copy(e.path(), out).unwrap();
            }
        }
    }
    cp(&fixture_root(), to);
}

#[test]
fn parses_streaming_tool_results_titles_unknowns_and_subagents() {
    let p = fixture_root().join("project-a/session-1.jsonl");
    let d = ClaudeSource::parse_file(&p).unwrap();
    assert_eq!(d.summary.title.as_deref(), Some("Fixture session title"));
    assert_eq!(
        d.summary.first_prompt.as_deref(),
        Some("Please inspect this project")
    );
    assert_eq!(d.summary.message_count, 5);
    assert_eq!(d.summary.usage.input_tokens, 170);
    assert_eq!(d.summary.usage.output_tokens, 40);
    assert_eq!(d.summary.subagent_count, 1);
    let assistant = d.messages.iter().find(|m| m.id == "msg-stream").unwrap();
    assert_eq!(assistant.usage.unwrap().input_tokens, 120);
    assert_eq!(assistant.blocks.len(), 3);
    let tool = assistant
        .blocks
        .iter()
        .find_map(|b| {
            if let agent_dashboard_lib::model::Block::ToolCall(t) = b {
                Some(t)
            } else {
                None
            }
        })
        .unwrap();
    assert_eq!(tool.result.as_deref(), Some("denied by fixture"));
    assert!(tool.is_error);
    assert_eq!(tool.duration_ms, Some(3000));
    assert_eq!(d.subagents[0].id, "abc");
    let breakdown_total = |b: agent_dashboard_lib::model::CostBreakdown| {
        b.input + b.output + b.cache_read + b.cache_write
    };
    assert!((breakdown_total(d.summary.cost_breakdown) - d.summary.cost_usd).abs() < 1e-12);
    assert!(
        (breakdown_total(d.subagents[0].cost_breakdown) - d.subagents[0].cost_usd).abs() < 1e-12
    );
}

#[test]
fn handles_string_and_array_user_content() {
    let d = ClaudeSource::parse_file(&fixture_root().join("project-b/session-2.jsonl")).unwrap();
    assert_eq!(d.summary.first_prompt.as_deref(), Some("A string prompt"));
    assert_eq!(d.summary.message_count, 2);
}

#[test]
fn metrics_fill_empty_days_and_filter_by_started_day() {
    let a = ClaudeSource::parse_file(&fixture_root().join("project-a/session-1.jsonl")).unwrap();
    let mut b =
        ClaudeSource::parse_file(&fixture_root().join("project-b/session-2.jsonl")).unwrap();
    b.summary.started_at = a.summary.started_at.clone();
    let m = metrics::get_metrics(
        &[a.summary.clone(), b.summary.clone()],
        &HashMap::new(),
        &HashMap::new(),
        Some(DateRange {
            from: Some("2026-10-01".into()),
            to: Some("2026-10-03".into()),
        }),
    );
    assert_eq!(m.by_day.len(), 3);
    assert_eq!(m.by_day[0].sessions, 2);
    assert_eq!(
        m.by_day[0].usage.input_tokens,
        a.summary.usage.input_tokens + b.summary.usage.input_tokens
    );
    assert_eq!(
        m.by_day[0].usage.output_tokens,
        a.summary.usage.output_tokens + b.summary.usage.output_tokens
    );
    assert_eq!(m.by_day[1].sessions, 0);
    assert_eq!(m.by_day[2].sessions, 0);
    assert_eq!(m.totals.sessions, 2);
}

#[test]
fn weekday_hour_filters_apply_to_lists_metrics_and_tools() {
    use chrono::{Datelike, Timelike};

    let dir = tempfile::tempdir().unwrap();
    copy_fixtures(dir.path());
    let state = AppState::new(ClaudeSource::new(dir.path().to_path_buf()));
    state.refresh().unwrap();
    let summary = state
        .summaries()
        .unwrap()
        .into_iter()
        .find(|summary| !summary.models.is_empty())
        .unwrap();
    let detail = state.session(&summary.id).unwrap();
    let message = detail
        .messages
        .iter()
        .find(|message| message.model.is_some())
        .unwrap();
    let local = chrono::DateTime::parse_from_rfc3339(&message.timestamp)
        .unwrap()
        .with_timezone(&chrono::Local);
    let weekday = local.weekday().num_days_from_monday() as u8;
    let hour = local.hour() as u8;
    let day = chrono::DateTime::parse_from_rfc3339(&detail.summary.started_at)
        .unwrap()
        .with_timezone(&chrono::Local)
        .date_naive()
        .to_string();

    let weekday_only = SessionFilter {
        weekday: Some(weekday),
        ..SessionFilter::default()
    };
    assert!(state
        .summaries_filtered(Some(&weekday_only))
        .unwrap()
        .iter()
        .any(|candidate| candidate.id == summary.id));
    let hour_only = SessionFilter {
        hour: Some(hour),
        ..SessionFilter::default()
    };
    assert!(state
        .summaries_filtered(Some(&hour_only))
        .unwrap()
        .iter()
        .any(|candidate| candidate.id == summary.id));

    let model = message.model.clone().unwrap();
    let project = detail.summary.project_path.clone();
    let range = Some(DateRange {
        from: Some(day.clone()),
        to: Some(day),
    });
    let combined = SessionFilter {
        provider: Some(Provider::Claude),
        project_path: Some(project.clone()),
        model: Some(model.clone()),
        weekday: Some(weekday),
        hour: Some(hour),
        from: range.as_ref().unwrap().from.clone(),
        to: range.as_ref().unwrap().to.clone(),
        ..SessionFilter::default()
    };
    let summaries = state.summaries_filtered(Some(&combined)).unwrap();
    assert_eq!(summaries.len(), 1);
    assert_eq!(summaries[0].id, summary.id);

    let selected_messages: Vec<_> = detail
        .messages
        .iter()
        .chain(
            detail
                .subagents
                .iter()
                .flat_map(|agent| agent.messages.iter()),
        )
        .filter(|candidate| {
            candidate.model.as_deref() == Some(model.as_str())
                && chrono::DateTime::parse_from_rfc3339(&candidate.timestamp)
                    .ok()
                    .is_some_and(|timestamp| {
                        let local = timestamp.with_timezone(&chrono::Local);
                        local.weekday().num_days_from_monday() as u8 == weekday
                            && local.hour() as u8 == hour
                    })
        })
        .collect();
    let metrics = state
        .metrics_filtered_time(
            range.clone(),
            Some(Provider::Claude),
            Some(project.clone()),
            Some(model.clone()),
            Some(weekday),
            Some(hour),
            None,
        )
        .unwrap();
    assert_eq!(metrics.totals.sessions, 1);
    assert_eq!(metrics.totals.messages as usize, selected_messages.len());
    assert_eq!(
        metrics
            .by_model
            .iter()
            .map(|group| group.key.as_str())
            .collect::<Vec<_>>(),
        vec![model.as_str()]
    );
    assert_eq!(
        metrics.series_by_model.as_ref().unwrap()[0].points[0].date,
        local.date_naive().to_string()
    );
    let output_metrics = state
        .metrics_filtered_time(
            range.clone(),
            Some(Provider::Claude),
            Some(project.clone()),
            Some(model.clone()),
            Some(weekday),
            Some(hour),
            Some(TokenKind::Output),
        )
        .unwrap();
    let expected_output = selected_messages
        .iter()
        .filter_map(|message| message.usage)
        .map(|usage| usage.output_tokens)
        .sum::<u64>();
    assert_eq!(output_metrics.totals.usage.output_tokens, expected_output);
    assert_eq!(output_metrics.totals.usage.input_tokens, 0);
    assert_eq!(output_metrics.totals.messages, metrics.totals.messages);
    assert_eq!(output_metrics.hourly_activity, metrics.hourly_activity);
    let tools = state
        .tool_stats_filtered_time(
            range,
            Some(Provider::Claude),
            Some(project),
            Some(model),
            Some(weekday),
            Some(hour),
        )
        .unwrap();
    assert_eq!(
        tools.iter().map(|tool| tool.calls).sum::<u32>(),
        metrics.totals.tool_calls
    );
}

#[test]
fn scan_load_and_refresh_never_change_files() {
    let dir = tempfile::tempdir().unwrap();
    copy_fixtures(dir.path());
    let before = snapshot(dir.path());
    let source = ClaudeSource::new(dir.path().to_path_buf());
    let state = AppState::new(source);
    assert_eq!(state.refresh().unwrap().sessions, 2);
    let summaries = state.summaries().unwrap();
    assert_eq!(summaries.len(), 2);
    for summary in summaries {
        let d = state.session(&summary.id).unwrap();
        assert!(!d.messages.is_empty());
        assert_eq!(state.session(&summary.id).unwrap().summary.id, summary.id);
    }
    state.metrics(None, None).unwrap();
    state.tool_stats(None, None).unwrap();
    assert_eq!(state.refresh().unwrap().sessions, 2);
    assert_eq!(snapshot(dir.path()), before);
}

#[test]
fn refresh_skips_jsonl_directory_and_keeps_readable_sessions() {
    let dir = tempfile::tempdir().unwrap();
    copy_fixtures(dir.path());
    fs::create_dir(dir.path().join("project-a/unreadable.jsonl")).unwrap();
    let state = AppState::new(ClaudeSource::new(dir.path().to_path_buf()));
    let report = state.refresh().unwrap();
    assert_eq!(report.sessions, 2);
    assert_eq!(report.errors.len(), 1);
    assert!(report.errors[0].path.ends_with("unreadable.jsonl"));
    assert!(!report.errors[0].message.is_empty());
    assert_eq!(state.scan_report().unwrap(), report);
    assert_eq!(state.summaries().unwrap().len(), 2);
}

#[test]
#[ignore = "requires real Claude Code session data in ~/.claude/projects"]
fn real_claude_smoke_parses_all_sessions() {
    let state = AppState::new(ClaudeSource::new(ClaudeSource::default_projects_dir()));
    let report = state.refresh().unwrap();
    assert!(report.errors.is_empty());
    let summaries = state.summaries().unwrap();
    assert_eq!(report.sessions as usize, summaries.len());
    for summary in &summaries {
        state.session(&summary.id).unwrap();
    }
    println!(
        "sessions={} messages={} tools={}",
        summaries.len(),
        summaries.iter().map(|s| s.message_count).sum::<u32>(),
        summaries.iter().map(|s| s.tool_call_count).sum::<u32>()
    );
}
