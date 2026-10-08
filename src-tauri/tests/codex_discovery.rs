use agent_dashboard_lib::{
    model::Provider,
    sources::{codex::CodexSource, SessionSource},
};
use std::{fs, path::Path};

fn write_rollout(path: &Path, payload: &str) {
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(
        path,
        format!("{{\"type\":\"session_meta\",\"payload\":{payload}}}\n"),
    )
    .unwrap();
}

#[test]
fn discovers_root_segments_subagents_archived_and_latest_index_title() {
    let dir = tempfile::tempdir().unwrap();
    let root = dir.path();
    write_rollout(
        &root.join("sessions/2026/10/06/rollout-root.jsonl"),
        r#"{"id":"root","session_id":"root","cwd":"C:\\Users\\me\\dev\\app","timestamp":"2026-10-06T00:00:00Z"}"#,
    );
    write_rollout(
        &root.join("sessions/2026/10/06/rollout-segment-1.jsonl"),
        r#"{"id":"root","session_id":"root","history_base":{"thread_id":"root","end_ordinal_exclusive":40}}"#,
    );
    write_rollout(
        &root.join("sessions/2026/10/06/rollout-segment-2.jsonl"),
        r#"{"id":"root","session_id":"root","history_base":{"thread_id":"root","end_ordinal_exclusive":80}}"#,
    );
    write_rollout(
        &root.join("sessions/2026/10/06/rollout-child.jsonl"),
        r#"{"id":"child","session_id":"root","parent_thread_id":"root"}"#,
    );
    write_rollout(
        &root.join("archived_sessions/rollout-archived.jsonl"),
        r#"{"id":"archived","session_id":"archived"}"#,
    );
    fs::write(
        root.join("session_index.jsonl"),
        "{\"id\":\"root\",\"thread_name\":\"Old title\",\"updated_at\":\"2026-10-01T00:00:00Z\"}\n{\"id\":\"root\",\"thread_name\":\"Latest title\",\"updated_at\":\"2026-10-06T00:00:00Z\"}\n",
    )
    .unwrap();
    // Discovery deliberately ignores unrelated files.
    fs::write(root.join("auth.json"), "not read").unwrap();
    fs::write(root.join("sessions/other.jsonl"), "not a rollout").unwrap();

    let discovery = CodexSource::new(root.to_path_buf()).discover().unwrap();
    assert_eq!(discovery.errors.len(), 0);
    assert_eq!(discovery.units.len(), 2);
    let unit = discovery
        .units
        .iter()
        .find(|unit| unit.key == "root")
        .unwrap();
    assert_eq!(unit.files.len(), 4);
    assert!(unit.files[0].ends_with("rollout-root.jsonl"));
    assert!(unit.files[1].ends_with("rollout-segment-1.jsonl"));
    assert!(unit.files[2].ends_with("rollout-segment-2.jsonl"));
    assert!(unit.files[3].ends_with("rollout-child.jsonl"));
    assert_eq!(
        unit.metadata.get("codex.index_title").map(String::as_str),
        Some("Latest title")
    );
}

#[test]
fn malformed_or_non_meta_headers_are_scan_errors() {
    let dir = tempfile::tempdir().unwrap();
    let path = dir.path().join("sessions/2026/10/06/rollout-invalid.jsonl");
    fs::create_dir_all(path.parent().unwrap()).unwrap();
    fs::write(&path, "{\"type\":\"response_item\"}\n").unwrap();
    let discovery = CodexSource::new(dir.path().to_path_buf())
        .discover()
        .unwrap();
    assert!(discovery.units.is_empty());
    assert_eq!(discovery.errors.len(), 1);
    assert!(discovery.errors[0].message.contains("not a session_meta"));
    assert_eq!(discovery.errors[0].provider, Some(Provider::Codex));
}

#[test]
fn missing_codex_directory_is_an_empty_discovery() {
    let temp = tempfile::tempdir().unwrap();
    let dir = temp.path().join("missing");
    let discovery = CodexSource::new(dir).discover().unwrap();
    assert!(discovery.units.is_empty());
    assert!(discovery.errors.is_empty());
}

#[test]
fn duplicate_root_between_sessions_and_archive_keeps_larger_file_and_reports_warning() {
    let dir = tempfile::tempdir().unwrap();
    let id = "same-thread";
    let session = dir.path().join("sessions/2026/10/06/rollout-session.jsonl");
    let archived = dir.path().join("archived_sessions/rollout-archive.jsonl");
    write_rollout(&session, &format!(r#"{{"id":"{id}","session_id":"{id}"}}"#));
    write_rollout(
        &archived,
        &format!(
            r#"{{"id":"{id}","session_id":"{id}","note":"{}"}}"#,
            "larger archived duplicate".repeat(12)
        ),
    );

    let discovery = CodexSource::new(dir.path().to_path_buf())
        .discover()
        .unwrap();
    assert_eq!(discovery.units.len(), 1);
    assert_eq!(discovery.units[0].files, vec![archived]);
    assert_eq!(discovery.errors.len(), 1);
    assert!(discovery.errors[0].message.contains("kept the larger file"));
}
