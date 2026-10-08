use agent_dashboard_lib::{
    cache::AppState,
    model::{DateRange, Provider, SessionFilter, TokenKind},
};
use chrono::{Datelike, Timelike};
use std::{
    collections::{HashMap, HashSet},
    time::Instant,
};

#[test]
#[ignore = "requires the real local Claude and Codex session corpora; run in release mode"]
fn real_cross_filter_calls_stay_under_budget_and_report_payload_sizes() {
    let state = AppState::default();
    let scan_started = Instant::now();
    let report = state.refresh().unwrap();
    let scan_ms = scan_started.elapsed().as_millis();
    println!(
        "Initial real scan: sessions={} errors={} sources={:?}",
        report.sessions,
        report.errors.len(),
        report
            .sources
            .as_ref()
            .unwrap()
            .iter()
            .map(|source| (
                source.source_dir.as_str(),
                source.sessions,
                source.errors.len(),
                source.available
            ))
            .collect::<Vec<_>>()
    );
    let sessions = state.summaries().unwrap();
    assert!(
        !sessions.is_empty(),
        "no local session corpus was discovered"
    );
    let tool_range = chrono::Local::now().date_naive() - chrono::Duration::days(29);
    let tool_from = tool_range.to_string();
    let tool_to = chrono::Local::now().date_naive().to_string();
    let sessions_in_tool_range = sessions
        .iter()
        .filter(|session| {
            chrono::DateTime::parse_from_rfc3339(&session.started_at)
                .ok()
                .map(|date| date.with_timezone(&chrono::Local).date_naive().to_string())
                .is_some_and(|date| date >= tool_from && date <= tool_to)
        })
        .count();
    for tool in ["Bash", "Read", "shell"] {
        let started = Instant::now();
        let in_scope = state
            .summaries_filtered(Some(&SessionFilter {
                from: Some(tool_from.clone()),
                to: Some(tool_to.clone()),
                tool: Some(tool.into()),
                ..SessionFilter::default()
            }))
            .unwrap();
        let list_ms = started.elapsed().as_secs_f64() * 1000.0;
        let started = Instant::now();
        let metrics = state
            .metrics_filtered_scope_time_tool(
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                Some(tool.into()),
            )
            .unwrap();
        let metrics_ms = started.elapsed().as_secs_f64() * 1000.0;
        let started = Instant::now();
        let stats = state
            .tool_stats_filtered_scope_time_tool(
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                None,
                Some(tool.into()),
            )
            .unwrap();
        let stats_ms = started.elapsed().as_secs_f64() * 1000.0;
        assert!(list_ms < 50.0, "list_sessions tool={tool}: {list_ms:.3} ms");
        assert!(
            metrics_ms < 50.0,
            "get_metrics tool={tool}: {metrics_ms:.3} ms"
        );
        assert!(
            stats_ms < 50.0,
            "get_tool_stats tool={tool}: {stats_ms:.3} ms"
        );
        assert_eq!(
            metrics
                .by_day
                .iter()
                .map(|bucket| bucket.tool_errors.unwrap_or(0))
                .sum::<u32>(),
            metrics.totals.tool_errors,
            "per-day errors must sum to totals for {tool}"
        );
        assert_eq!(
            in_scope
                .iter()
                .map(|session| session.filtered_tool_calls.unwrap_or(0))
                .sum::<u32>(),
            metrics.totals.tool_calls,
            "filtered session calls must sum to metrics for {tool}"
        );
        assert_eq!(
            in_scope
                .iter()
                .map(|session| session.filtered_tool_errors.unwrap_or(0))
                .sum::<u32>(),
            metrics.totals.tool_errors,
            "filtered session errors must sum to metrics for {tool}"
        );
        println!(
            "tool={tool} sessions_in_scope={}/{} list_ms={list_ms:.3} metrics_ms={metrics_ms:.3} tool_stats_ms={stats_ms:.3} errors={}",
            in_scope.len(), sessions_in_tool_range, metrics.totals.tool_errors
        );
        assert!(stats.iter().all(|row| row.name == tool));
    }
    let paths_by_project = sessions.iter().fold(
        HashMap::<String, HashSet<String>>::new(),
        |mut groups, session| {
            groups
                .entry(session.project_key.clone())
                .or_default()
                .insert(session.project_path.clone());
            groups
        },
    );
    let merged_projects: Vec<_> = paths_by_project
        .iter()
        .filter(|(_, paths)| paths.len() > 1)
        .map(|(key, paths)| {
            format!(
                "{key} <- {}",
                paths.iter().cloned().collect::<Vec<_>>().join(" | ")
            )
        })
        .collect();
    let prompt_like: Vec<_> = sessions
        .iter()
        .filter(|session| {
            session.provider == Provider::Codex && {
                let name = session
                    .project_path
                    .rsplit(['/', '\\'])
                    .next()
                    .unwrap_or_default()
                    .to_lowercase();
                ["necesito", "hagas", "auditoria", "ayuda"]
                    .iter()
                    .any(|word| name.contains(word))
            }
        })
        .map(|session| {
            format!(
                "legacy_name={} resolved_name={} key={} cwd={}",
                session
                    .project_path
                    .rsplit(['/', '\\'])
                    .next()
                    .unwrap_or_default(),
                session.project_name,
                session.project_key,
                session.project_path
            )
        })
        .collect();
    println!(
        "Projects before={} after={} merged={:?}",
        sessions
            .iter()
            .map(|session| session.project_path.as_str())
            .collect::<HashSet<_>>()
            .len(),
        paths_by_project.len(),
        merged_projects
    );
    println!(
        "Codex source sessions: {:?}",
        report
            .sources
            .as_ref()
            .unwrap()
            .iter()
            .filter(|source| source.provider == Provider::Codex)
            .map(|source| (source.source_dir.as_str(), source.sessions))
            .collect::<Vec<_>>()
    );
    println!(
        "Codex duplicate threads merged: {}",
        report.duplicates_merged.unwrap_or(0)
    );
    println!(
        "Prompt-like Codex project names and cwds: {:?}",
        prompt_like
    );
    let target = sessions
        .iter()
        .find(|session| !session.models.is_empty())
        .expect("real sessions should include model metadata");
    let day = chrono::DateTime::parse_from_rfc3339(&target.started_at)
        .unwrap()
        .with_timezone(&chrono::Local)
        .date_naive()
        .to_string();
    let local_start = chrono::DateTime::parse_from_rfc3339(&target.started_at)
        .unwrap()
        .with_timezone(&chrono::Local);
    let weekday = local_start.weekday().num_days_from_monday() as u8;
    let hour = local_start.hour() as u8;
    let day_range = DateRange {
        from: Some(day.clone()),
        to: Some(day),
    };
    let model = target.models[0].clone();

    // Warm both command paths after the full scan before timing filtered combinations.
    state.metrics(None, None).unwrap();
    state.tool_stats(None, None).unwrap();

    let mut cases: Vec<(
        String,
        Option<DateRange>,
        Option<Provider>,
        Option<String>,
        Option<String>,
        Option<Vec<String>>,
        Option<String>,
        Option<u8>,
        Option<u8>,
    )> = (0..64)
        .map(|mask| {
            (
                format!("combination-{mask:02}"),
                (mask & 1 != 0).then(|| day_range.clone()),
                (mask & 2 != 0).then_some(target.provider),
                (mask & 4 != 0).then(|| target.project_path.clone()),
                None,
                None,
                (mask & 8 != 0).then(|| model.clone()),
                (mask & 16 != 0).then_some(weekday),
                (mask & 32 != 0).then_some(hour),
            )
        })
        .collect();
    cases.push((
        "codex-auto-review".into(),
        None,
        Some(Provider::Codex),
        None,
        None,
        None,
        Some("codex-auto-review".into()),
        None,
        None,
    ));
    cases.push((
        "project-key".into(),
        None,
        Some(target.provider),
        None,
        Some(target.project_key.clone()),
        None,
        None,
        None,
        None,
    ));
    cases.push((
        "models-family".into(),
        Some(day_range.clone()),
        Some(target.provider),
        None,
        None,
        Some(target.models.clone()),
        None,
        None,
        None,
    ));

    println!(
        "Real filter benchmark: sessions={} scan_ms={} report_payload_bytes={}",
        report.sessions,
        scan_ms,
        serde_json::to_vec(&report).unwrap().len()
    );
    for (name, range, provider, project, project_key, models, model, weekday, hour) in cases {
        let started = Instant::now();
        let list = state
            .summaries_filtered(Some(&SessionFilter {
                from: range.as_ref().and_then(|range| range.from.clone()),
                to: range.as_ref().and_then(|range| range.to.clone()),
                provider,
                project_path: project.clone(),
                project_key: project_key.clone(),
                model: model.clone(),
                models: models.clone(),
                weekday,
                hour,
                ..SessionFilter::default()
            }))
            .unwrap();
        let list_ms = started.elapsed().as_secs_f64() * 1000.0;
        let list_bytes = serde_json::to_vec(&list).unwrap().len();
        assert!(list_ms < 50.0, "list_sessions {name}: {list_ms:.3} ms");

        let started = Instant::now();
        let metrics = state
            .metrics_filtered_scope_time(
                range.clone(),
                provider,
                project.clone(),
                project_key.clone(),
                model.clone(),
                models.clone(),
                weekday,
                hour,
                None,
            )
            .unwrap();
        let metrics_ms = started.elapsed().as_secs_f64() * 1000.0;
        let metrics_bytes = serde_json::to_vec(&metrics).unwrap().len();
        assert!(metrics_ms < 50.0, "get_metrics {name}: {metrics_ms:.3} ms");

        for token_kind in [
            TokenKind::Input,
            TokenKind::Output,
            TokenKind::CacheRead,
            TokenKind::CacheWrite,
        ] {
            let started = Instant::now();
            let filtered = state
                .metrics_filtered_scope_time(
                    range.clone(),
                    provider,
                    project.clone(),
                    project_key.clone(),
                    model.clone(),
                    models.clone(),
                    weekday,
                    hour,
                    Some(token_kind),
                )
                .unwrap();
            let elapsed_ms = started.elapsed().as_secs_f64() * 1000.0;
            let _payload_bytes = serde_json::to_vec(&filtered).unwrap().len();
            assert!(
                elapsed_ms < 50.0,
                "get_metrics {name} {token_kind:?}: {elapsed_ms:.3} ms"
            );
        }

        let started = Instant::now();
        let tools = state
            .tool_stats_filtered_scope_time(
                range,
                provider,
                project,
                project_key,
                model,
                models,
                weekday,
                hour,
            )
            .unwrap();
        let tools_ms = started.elapsed().as_secs_f64() * 1000.0;
        let tools_bytes = serde_json::to_vec(&tools).unwrap().len();
        assert!(tools_ms < 50.0, "get_tool_stats {name}: {tools_ms:.3} ms");
        println!(
            "case={name} list_sessions_ms={list_ms:.3} list_sessions_bytes={list_bytes} get_metrics_ms={metrics_ms:.3} get_metrics_bytes={metrics_bytes} get_tool_stats_ms={tools_ms:.3} get_tool_stats_bytes={tools_bytes}"
        );
    }
}
