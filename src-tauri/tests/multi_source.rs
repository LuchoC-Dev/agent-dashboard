use agent_dashboard_lib::{
    cache::AppState,
    model::{DateRange, Message, Provider, SessionDetail, SessionFilter, TokenKind},
    sources::{claude::ClaudeSource, codex::CodexSource, SessionSource},
};
use chrono::{Datelike, Timelike};
use std::{fs, path::Path};

fn fixture_root() -> std::path::PathBuf {
    std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("tests/fixtures")
}

fn copy_tree(from: &Path, to: &Path) {
    fs::create_dir_all(to).unwrap();
    for entry in fs::read_dir(from).unwrap() {
        let entry = entry.unwrap();
        let target = to.join(entry.file_name());
        if entry.file_type().unwrap().is_dir() {
            copy_tree(&entry.path(), &target);
        } else {
            fs::copy(entry.path(), target).unwrap();
        }
    }
}

fn messages(detail: &SessionDetail) -> Vec<&Message> {
    detail
        .messages
        .iter()
        .chain(
            detail
                .subagents
                .iter()
                .flat_map(|agent| agent.messages.iter()),
        )
        .collect()
}

#[test]
fn scans_both_providers_filters_metrics_and_reports_provider_totals() {
    let temp = tempfile::tempdir().unwrap();
    let codex_root = temp.path().join("codex");
    copy_tree(
        &fixture_root().join("codex/exec-inner/sessions"),
        &codex_root.join("sessions"),
    );
    copy_tree(
        &fixture_root().join("codex/spawn/sessions"),
        &codex_root.join("sessions"),
    );

    let state = AppState::with_sources(vec![
        Box::new(ClaudeSource::new(fixture_root())),
        Box::new(CodexSource::new(codex_root)),
    ]);
    let report = state.refresh().unwrap();
    assert_eq!(report.sessions, 4);
    let claude = report
        .sources
        .as_ref()
        .unwrap()
        .iter()
        .find(|source| source.provider == Provider::Claude)
        .unwrap();
    let codex = report
        .sources
        .as_ref()
        .unwrap()
        .iter()
        .find(|source| source.provider == Provider::Codex)
        .unwrap();
    assert!(claude.available);
    assert_eq!(claude.sessions, 2);
    assert_eq!(claude.scanning, Some(false));
    assert!(codex.available);
    assert_eq!(codex.sessions, 2);
    assert_eq!(codex.scanning, Some(false));

    let metrics = state.metrics(None, None).unwrap();
    assert_eq!(metrics.totals.sessions, 4);
    let activity = metrics.hourly_activity.as_ref().unwrap();
    assert_eq!(activity.len(), 168);
    assert_eq!(
        activity.iter().map(|cell| cell.messages).sum::<u32>(),
        metrics.totals.messages
    );
    let by_provider = metrics.by_provider.unwrap();
    assert_eq!(by_provider.len(), 2);
    let codex_totals = by_provider
        .iter()
        .find(|bucket| bucket.key == "codex")
        .unwrap();
    assert_eq!(codex_totals.sessions, 2);
    assert_eq!(codex_totals.unpriced_tokens, Some(18));

    let codex_metrics = state.metrics(None, Some(Provider::Codex)).unwrap();
    assert_eq!(codex_metrics.totals.sessions, 2);
    assert_eq!(codex_metrics.totals.unpriced_tokens, Some(18));
    assert!(codex_metrics.by_provider.is_none());
    assert_eq!(
        codex_metrics
            .hourly_activity
            .as_ref()
            .unwrap()
            .iter()
            .map(|cell| cell.messages)
            .sum::<u32>(),
        codex_metrics.totals.messages
    );
    let tool_stats_before = state.tool_stats(None, Some(Provider::Codex)).unwrap();
    assert_eq!(
        tool_stats_before.iter().map(|tool| tool.calls).sum::<u32>(),
        3
    );
    let codex_summary = state
        .summaries()
        .unwrap()
        .into_iter()
        .find(|summary| summary.provider == Provider::Codex)
        .unwrap();
    let detail = state.session(&codex_summary.id).unwrap();
    assert_eq!(
        serde_json::to_value(&detail.summary).unwrap(),
        serde_json::to_value(&codex_summary).unwrap()
    );
    assert_eq!(
        detail.messages.len()
            + detail
                .subagents
                .iter()
                .map(|subagent| subagent.messages.len())
                .sum::<usize>(),
        codex_summary.message_count as usize
    );
    assert_eq!(
        serde_json::to_value(tool_stats_before).unwrap(),
        serde_json::to_value(state.tool_stats(None, Some(Provider::Codex)).unwrap()).unwrap()
    );
}

#[test]
fn cross_filters_scope_metrics_hourly_activity_and_tool_stats() {
    let temp = tempfile::tempdir().unwrap();
    let codex_root = temp.path().join("codex");
    copy_tree(
        &fixture_root().join("codex/exec-inner/sessions"),
        &codex_root.join("sessions"),
    );
    copy_tree(
        &fixture_root().join("codex/spawn/sessions"),
        &codex_root.join("sessions"),
    );
    let state = AppState::with_sources(vec![
        Box::new(ClaudeSource::new(fixture_root())),
        Box::new(CodexSource::new(codex_root)),
    ]);
    state.refresh().unwrap();

    let summaries = state.summaries().unwrap();
    let details: Vec<_> = summaries
        .iter()
        .map(|summary| state.session(&summary.id).unwrap())
        .collect();
    let target = summaries
        .iter()
        .find(|summary| summary.provider == Provider::Codex)
        .unwrap();
    let model = "gpt-5.6-sol".to_owned();
    assert!(details.iter().any(|detail| {
        detail.summary.id == target.id
            && messages(detail)
                .iter()
                .any(|message| message.model.as_deref() == Some(model.as_str()))
    }));
    let target_day = chrono::DateTime::parse_from_rfc3339(&target.started_at)
        .unwrap()
        .with_timezone(&chrono::Local)
        .date_naive();
    let day_range = DateRange {
        from: Some(target_day.to_string()),
        to: Some(target_day.to_string()),
    };
    let today = chrono::Local::now().date_naive();
    let default_start = today - chrono::Duration::days(29);

    // Exercise all 16 combinations of optional range, provider, project and model filters.
    for mask in 0..16 {
        let range = (mask & 1 != 0).then(|| day_range.clone());
        let provider = (mask & 2 != 0).then_some(target.provider);
        let project = (mask & 4 != 0).then(|| target.project_path.clone());
        let selected_model = (mask & 8 != 0).then(|| model.clone());
        let expected: Vec<_> = details
            .iter()
            .filter(|detail| {
                let day = chrono::DateTime::parse_from_rfc3339(&detail.summary.started_at)
                    .unwrap()
                    .with_timezone(&chrono::Local)
                    .date_naive();
                let (from, to) = if range.is_some() {
                    (target_day, target_day)
                } else {
                    (default_start, today)
                };
                day >= from
                    && day <= to
                    && provider.is_none_or(|wanted| detail.summary.provider == wanted)
                    && project
                        .as_ref()
                        .is_none_or(|wanted| detail.summary.project_path == *wanted)
                    && selected_model.as_ref().is_none_or(|wanted| {
                        messages(detail)
                            .iter()
                            .any(|message| message.model.as_ref() == Some(wanted))
                    })
            })
            .collect();
        let metric = state
            .metrics_filtered(
                range.clone(),
                provider,
                project.clone(),
                selected_model.clone(),
            )
            .unwrap();
        let expected_messages: usize = expected
            .iter()
            .map(|detail| {
                messages(detail)
                    .iter()
                    .filter(|message| {
                        selected_model
                            .as_ref()
                            .is_none_or(|model| message.model.as_ref() == Some(model))
                    })
                    .count()
            })
            .sum();
        let expected_input_tokens: u64 = expected
            .iter()
            .flat_map(|detail| messages(detail))
            .filter(|message| {
                selected_model
                    .as_ref()
                    .is_none_or(|model| message.model.as_ref() == Some(model))
            })
            .filter_map(|message| message.usage)
            .map(|usage| usage.input_tokens)
            .sum();
        assert_eq!(
            metric.totals.sessions as usize,
            expected.len(),
            "mask={mask}"
        );
        assert_eq!(
            metric.totals.messages as usize, expected_messages,
            "mask={mask}"
        );
        assert_eq!(
            metric.totals.usage.input_tokens, expected_input_tokens,
            "mask={mask}"
        );
        assert_eq!(
            metric
                .hourly_activity
                .unwrap()
                .iter()
                .map(|cell| cell.messages as usize)
                .sum::<usize>(),
            expected_messages,
            "mask={mask}"
        );

        let tools = state
            .tool_stats_filtered(range, provider, project, selected_model.clone())
            .unwrap();
        let expected_tool_calls: usize = expected
            .iter()
            .flat_map(|detail| messages(detail))
            .filter(|message| {
                selected_model
                    .as_ref()
                    .is_none_or(|model| message.model.as_ref() == Some(model))
            })
            .map(|message| {
                message
                    .blocks
                    .iter()
                    .filter(|block| matches!(block, agent_dashboard_lib::model::Block::ToolCall(_)))
                    .count()
            })
            .sum();
        assert_eq!(
            tools.iter().map(|tool| tool.calls as usize).sum::<usize>(),
            expected_tool_calls,
            "mask={mask}"
        );
    }

    // Guardian review is filterable by its internal model name, while its message data remains
    // attributed to the same Codex session and is available to both filtered metric commands.
    let auto_review = state
        .metrics_filtered(
            Some(day_range.clone()),
            Some(Provider::Codex),
            None,
            Some("codex-auto-review".into()),
        )
        .unwrap();
    assert_eq!(auto_review.totals.sessions, 1);
    assert!(auto_review.totals.messages > 0);
    assert!(auto_review.totals.unpriced_tokens.unwrap_or(0) > 0);
    assert_eq!(
        auto_review
            .hourly_activity
            .unwrap()
            .iter()
            .map(|cell| cell.messages)
            .sum::<u32>(),
        auto_review.totals.messages
    );

    let unchanged = state.metrics(None, None).unwrap();
    let no_new_filters = state.metrics_filtered(None, None, None, None).unwrap();
    assert_eq!(
        serde_json::to_value(unchanged).unwrap(),
        serde_json::to_value(no_new_filters).unwrap()
    );

    let key_filtered = state
        .metrics_filtered_scope_time(
            Some(day_range.clone()),
            Some(target.provider),
            None,
            Some(target.project_key.clone()),
            None,
            None,
            None,
            None,
            None,
        )
        .unwrap();
    assert!(key_filtered
        .by_project
        .iter()
        .all(|bucket| bucket.key == target.project_key));
    assert!(state
        .summaries_filtered(Some(&SessionFilter {
            project_key: Some(target.project_key.clone()),
            ..SessionFilter::default()
        }))
        .unwrap()
        .iter()
        .all(|summary| summary.project_key == target.project_key));
    let key_tools = state
        .tool_stats_filtered_scope_time(
            Some(day_range),
            Some(target.provider),
            None,
            Some(target.project_key.clone()),
            None,
            None,
            None,
            None,
        )
        .unwrap();
    assert!(key_tools
        .iter()
        .flat_map(|tool| tool.by_project.iter())
        .all(|bucket| bucket.key == target.project_key));
}

#[test]
fn missing_codex_directory_is_reported_unavailable_without_an_error() {
    let temp = tempfile::tempdir().unwrap();
    let codex_root = temp.path().join("missing-codex");
    let state = AppState::with_sources(vec![
        Box::new(ClaudeSource::new(fixture_root())),
        Box::new(CodexSource::new(codex_root)),
    ]);
    let report = state.refresh().unwrap();
    let codex = report
        .sources
        .unwrap()
        .into_iter()
        .find(|source| source.provider == Provider::Codex)
        .unwrap();
    assert!(!codex.available);
    assert_eq!(codex.sessions, 0);
    assert!(codex.errors.is_empty());
    assert_eq!(state.summaries().unwrap().len(), 2);
}

#[test]
fn background_scan_publishes_progress_and_finishes_with_all_sources() {
    let state = AppState::with_sources(vec![
        Box::new(ClaudeSource::new(fixture_root())),
        Box::new(CodexSource::new(fixture_root().join("codex/basic"))),
    ]);
    state.start_background_scan().unwrap();
    let initial = state.scan_report().unwrap();
    assert_eq!(initial.scanning, Some(true));
    assert!(initial
        .sources
        .as_ref()
        .unwrap()
        .iter()
        .all(|source| source.scanning == Some(true)));

    let deadline = std::time::Instant::now() + std::time::Duration::from_secs(5);
    loop {
        let report = state.scan_report().unwrap();
        if report.scanning == Some(false) {
            assert_eq!(report.sessions, 3);
            assert!(report
                .sources
                .as_ref()
                .unwrap()
                .iter()
                .all(|source| source.scanning == Some(false)));
            assert_eq!(state.summaries().unwrap().len(), 3);
            break;
        }
        assert!(
            std::time::Instant::now() < deadline,
            "background scan timed out"
        );
        std::thread::sleep(std::time::Duration::from_millis(10));
    }
}

#[test]
fn changed_session_index_title_updates_cached_detail_without_reparsing_logs() {
    let temp = tempfile::tempdir().unwrap();
    let fixture = fixture_root().join("codex/basic");
    let root = temp.path().join("codex");
    copy_tree(&fixture.join("sessions"), &root.join("sessions"));
    fs::copy(
        fixture.join("session_index.jsonl"),
        root.join("session_index.jsonl"),
    )
    .unwrap();
    let source = CodexSource::new(root.clone());
    let unit = source.discover().unwrap().units.remove(0);
    let session_id = unit.key.clone();
    let state = AppState::with_sources(vec![Box::new(source)]);
    state.refresh().unwrap();
    assert_eq!(
        state.session(&session_id).unwrap().summary.title.as_deref(),
        Some("Basic Codex fixture")
    );

    fs::write(
        root.join("session_index.jsonl"),
        format!(
            "{{\"id\":\"{session_id}\",\"thread_name\":\"Updated title\",\"updated_at\":\"2026-10-07T00:00:00Z\"}}\n"
        ),
    )
    .unwrap();
    state.refresh().unwrap();
    assert_eq!(
        state.session(&session_id).unwrap().summary.title.as_deref(),
        Some("Updated title")
    );
}

#[test]
fn duplicate_codex_threads_across_homes_keep_the_more_complete_copy() {
    let temp = tempfile::tempdir().unwrap();
    let fixture = fixture_root().join("codex/basic");
    let first_home = temp.path().join("codex-one");
    let second_home = temp.path().join("codex-two");
    copy_tree(&fixture, &first_home);
    copy_tree(&fixture, &second_home);

    let second_rollout = second_home.join("sessions/2026/10/06/rollout-basic.jsonl");
    let original = fs::read_to_string(&second_rollout).unwrap();
    fs::write(
        &second_rollout,
        format!("{original}{{\"type\":\"event_msg\",\"payload\":{{\"type\":\"ignored_fixture_event\"}}}}\n"),
    )
    .unwrap();

    let state = AppState::with_sources(vec![
        Box::new(CodexSource::new(first_home.clone())),
        Box::new(CodexSource::new(second_home.clone())),
    ]);
    let report = state.refresh().unwrap();
    assert_eq!(report.sessions, 1);
    assert_eq!(report.duplicates_merged, Some(1));
    let source_scans = report.sources.unwrap();
    assert_eq!(source_scans.len(), 2);
    assert_eq!(source_scans[0].sessions, 1);
    assert_eq!(source_scans[1].sessions, 1);

    let summary = state.summaries().unwrap().pop().unwrap();
    assert_eq!(
        summary.source_dir.as_deref(),
        Some(second_home.to_str().unwrap())
    );
    assert_eq!(
        state.session(&summary.id).unwrap().summary.source_dir,
        summary.source_dir
    );
}

#[test]
fn multiple_model_filter_uses_message_attribution_for_sessions_metrics_and_tools() {
    let temp = tempfile::tempdir().unwrap();
    let codex_root = temp.path().join("codex");
    copy_tree(
        &fixture_root().join("codex/exec-inner/sessions"),
        &codex_root.join("sessions"),
    );
    copy_tree(
        &fixture_root().join("codex/spawn/sessions"),
        &codex_root.join("sessions"),
    );
    let state = AppState::with_sources(vec![Box::new(CodexSource::new(codex_root))]);
    state.refresh().unwrap();
    let summaries = state.summaries().unwrap();
    let details: Vec<_> = summaries
        .iter()
        .map(|summary| state.session(&summary.id).unwrap())
        .collect();
    let models = vec!["gpt-5.6-sol".to_owned(), "codex-auto-review".to_owned()];
    let range = DateRange {
        from: Some("2026-10-06".into()),
        to: Some("2026-10-06".into()),
    };
    let selected_message_count: usize = details
        .iter()
        .flat_map(messages)
        .filter(|message| {
            message
                .model
                .as_ref()
                .is_some_and(|model| models.contains(model))
        })
        .count();
    let expected_ids: Vec<_> = details
        .iter()
        .filter(|detail| {
            messages(detail).iter().any(|message| {
                message
                    .model
                    .as_ref()
                    .is_some_and(|model| models.contains(model))
            })
        })
        .map(|detail| detail.summary.id.clone())
        .collect();
    let listed = state
        .summaries_filtered(Some(&SessionFilter {
            models: Some(models.clone()),
            ..SessionFilter::default()
        }))
        .unwrap();
    assert_eq!(
        listed
            .iter()
            .map(|summary| summary.id.clone())
            .collect::<std::collections::HashSet<_>>(),
        expected_ids.into_iter().collect()
    );

    let metrics = state
        .metrics_filtered_scope_time(
            Some(range.clone()),
            Some(Provider::Codex),
            None,
            None,
            None,
            Some(models.clone()),
            None,
            None,
            None,
        )
        .unwrap();
    assert_eq!(metrics.totals.messages as usize, selected_message_count);
    assert!(metrics.by_project.iter().all(|bucket| summaries
        .iter()
        .any(|summary| summary.project_key == bucket.key)));

    let expected_tool_calls: usize = details
        .iter()
        .flat_map(messages)
        .filter(|message| {
            message
                .model
                .as_ref()
                .is_some_and(|model| models.contains(model))
        })
        .map(|message| {
            message
                .blocks
                .iter()
                .filter(|block| matches!(block, agent_dashboard_lib::model::Block::ToolCall(_)))
                .count()
        })
        .sum();
    let tools = state
        .tool_stats_filtered_scope_time(
            Some(range.clone()),
            Some(Provider::Codex),
            None,
            None,
            None,
            Some(models.clone()),
            None,
            None,
        )
        .unwrap();
    assert_eq!(
        tools.iter().map(|tool| tool.calls as usize).sum::<usize>(),
        expected_tool_calls
    );

    let (target_detail, target_message, tool_name) = details
        .iter()
        .find_map(|detail| {
            messages(detail).into_iter().find_map(|message| {
                if !message
                    .model
                    .as_ref()
                    .is_some_and(|model| models.contains(model))
                {
                    return None;
                }
                message.blocks.iter().find_map(|block| match block {
                    agent_dashboard_lib::model::Block::ToolCall(call) => {
                        Some((detail, message, call.name.clone()))
                    }
                    _ => None,
                })
            })
        })
        .expect("selected models include tool calls");
    let timestamp = chrono::DateTime::parse_from_rfc3339(&target_message.timestamp)
        .unwrap()
        .with_timezone(&chrono::Local);
    let weekday = timestamp.weekday().num_days_from_monday() as u8;
    let hour = timestamp.hour() as u8;
    let project_key = target_detail.summary.project_key.clone();
    let selected: Vec<_> = details
        .iter()
        .filter(|detail| detail.summary.project_key == project_key)
        .flat_map(messages)
        .filter(|message| {
            message
                .model
                .as_ref()
                .is_some_and(|model| models.contains(model))
                && chrono::DateTime::parse_from_rfc3339(&message.timestamp)
                    .ok()
                    .is_some_and(|timestamp| {
                        let local = timestamp.with_timezone(&chrono::Local);
                        local.weekday().num_days_from_monday() as u8 == weekday
                            && local.hour() as u8 == hour
                    })
        })
        .collect();
    let calls: Vec<_> = selected
        .iter()
        .flat_map(|message| message.blocks.iter())
        .filter_map(|block| match block {
            agent_dashboard_lib::model::Block::ToolCall(call) if call.name == tool_name => {
                Some(call)
            }
            _ => None,
        })
        .collect();
    let tool_filter = SessionFilter {
        provider: Some(Provider::Codex),
        project_key: Some(project_key.clone()),
        models: Some(models.clone()),
        weekday: Some(weekday),
        hour: Some(hour),
        tool: Some(tool_name.clone()),
        from: range.from.clone(),
        to: range.to.clone(),
        ..SessionFilter::default()
    };
    let listed = state.summaries_filtered(Some(&tool_filter)).unwrap();
    assert!(listed
        .iter()
        .any(|summary| summary.id == target_detail.summary.id));
    let scoped = state
        .metrics_filtered_scope_time_tool(
            Some(range.clone()),
            Some(Provider::Codex),
            None,
            Some(project_key.clone()),
            None,
            Some(models.clone()),
            Some(weekday),
            Some(hour),
            Some(TokenKind::Output),
            Some(tool_name.clone()),
        )
        .unwrap();
    assert_eq!(scoped.totals.tool_calls, calls.len() as u32);
    assert_eq!(
        scoped.totals.tool_errors,
        calls.iter().filter(|call| call.is_error).count() as u32
    );
    assert_eq!(
        listed
            .iter()
            .map(|summary| summary.filtered_tool_calls.unwrap_or(0))
            .sum::<u32>(),
        scoped.totals.tool_calls
    );
    assert_eq!(
        listed
            .iter()
            .map(|summary| summary.filtered_tool_errors.unwrap_or(0))
            .sum::<u32>(),
        scoped.totals.tool_errors
    );
    assert!(listed
        .iter()
        .all(|summary| summary.filtered_tool_calls.is_some()
            && summary.filtered_tool_errors.is_some()));
    let unfiltered = state
        .summaries_filtered(Some(&SessionFilter {
            provider: Some(Provider::Codex),
            project_key: Some(project_key.clone()),
            models: Some(models.clone()),
            weekday: Some(weekday),
            hour: Some(hour),
            from: tool_filter.from.clone(),
            to: tool_filter.to.clone(),
            ..SessionFilter::default()
        }))
        .unwrap();
    assert!(unfiltered
        .iter()
        .all(|summary| summary.filtered_tool_calls.is_none()
            && summary.filtered_tool_errors.is_none()));
    assert_eq!(scoped.totals.usage.input_tokens, 0);
    assert_eq!(
        scoped
            .by_day
            .iter()
            .map(|bucket| bucket.tool_errors.unwrap_or(0))
            .sum::<u32>(),
        scoped.totals.tool_errors
    );
    let scoped_tools = state
        .tool_stats_filtered_scope_time_tool(
            Some(range),
            Some(Provider::Codex),
            None,
            Some(project_key.clone()),
            None,
            Some(models),
            Some(weekday),
            Some(hour),
            Some(tool_name.clone()),
        )
        .unwrap();
    assert_eq!(scoped_tools.len(), 1);
    assert_eq!(scoped_tools[0].name, tool_name);
    assert_eq!(scoped_tools[0].by_project[0].key, project_key);
    assert_eq!(scoped_tools[0].calls, calls.len() as u32);
}
