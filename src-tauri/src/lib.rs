pub mod cache;
mod commands;
pub mod metrics;
pub mod model;
pub mod pricing;
pub mod projects;
pub mod sources;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(cache::AppState::default())
        .setup(|app| {
            if let Err(error) = app.state::<cache::AppState>().start_background_scan() {
                eprintln!("Could not start background session scan: {error}");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::list_sessions,
            commands::get_session,
            commands::get_metrics,
            commands::get_tool_stats,
            commands::refresh,
            commands::get_scan_report,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
