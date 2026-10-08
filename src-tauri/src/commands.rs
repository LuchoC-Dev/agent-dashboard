//! Tauri command adapters for the read-only session cache.
use crate::{
    cache::AppState,
    model::{
        AppError, DateRange, Metrics, Provider, ScanReport, SessionDetail, SessionFilter,
        SessionSummary, TokenKind, ToolStat,
    },
};
use std::time::Instant;
use tauri::State;

fn profile_result<T: serde::Serialize>(
    command: &str,
    started: Instant,
    result: &Result<T, AppError>,
) {
    if !cfg!(debug_assertions) {
        return;
    }
    let elapsed_ms = started.elapsed().as_millis();
    match result {
        Ok(value) => {
            let response_bytes = serde_json::to_vec(value).map_or(0, |payload| payload.len());
            eprintln!(
                "[perf] ipc command={command} elapsed_ms={elapsed_ms} response_bytes={response_bytes}"
            );
        }
        Err(error) => {
            eprintln!("[perf] ipc command={command} elapsed_ms={elapsed_ms} error={error}")
        }
    }
}

#[tauri::command]
pub fn list_sessions(
    filter: Option<SessionFilter>,
    state: State<'_, AppState>,
) -> Result<Vec<SessionSummary>, AppError> {
    let started = Instant::now();
    let result = state.summaries_filtered(filter.as_ref());
    profile_result("list_sessions", started, &result);
    result
}
#[tauri::command]
pub fn get_session(id: String, state: State<'_, AppState>) -> Result<SessionDetail, AppError> {
    let started = Instant::now();
    let result = state.session(&id);
    profile_result("get_session", started, &result);
    result
}
#[tauri::command]
pub fn get_metrics(
    range: Option<DateRange>,
    provider: Option<Provider>,
    project_path: Option<String>,
    project_key: Option<String>,
    model: Option<String>,
    models: Option<Vec<String>>,
    weekday: Option<u8>,
    hour: Option<u8>,
    token_kind: Option<TokenKind>,
    tool: Option<String>,
    state: State<'_, AppState>,
) -> Result<Metrics, AppError> {
    let started = Instant::now();
    let result = state.metrics_filtered_scope_time_tool(
        range,
        provider,
        project_path,
        project_key,
        model,
        models,
        weekday,
        hour,
        token_kind,
        tool,
    );
    profile_result("get_metrics", started, &result);
    result
}
#[tauri::command]
pub fn get_tool_stats(
    range: Option<DateRange>,
    provider: Option<Provider>,
    project_path: Option<String>,
    project_key: Option<String>,
    model: Option<String>,
    models: Option<Vec<String>>,
    weekday: Option<u8>,
    hour: Option<u8>,
    tool: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<ToolStat>, AppError> {
    let started = Instant::now();
    let result = state.tool_stats_filtered_scope_time_tool(
        range,
        provider,
        project_path,
        project_key,
        model,
        models,
        weekday,
        hour,
        tool,
    );
    profile_result("get_tool_stats", started, &result);
    result
}
#[tauri::command]
pub fn refresh(state: State<'_, AppState>) -> Result<ScanReport, AppError> {
    let started = Instant::now();
    let result = state.refresh();
    profile_result("refresh", started, &result);
    result
}

#[tauri::command]
pub fn get_scan_report(state: State<'_, AppState>) -> Result<ScanReport, AppError> {
    let started = Instant::now();
    let result = state.scan_report();
    profile_result("get_scan_report", started, &result);
    result
}
