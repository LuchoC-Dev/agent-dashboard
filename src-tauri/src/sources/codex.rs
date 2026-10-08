//! Read-only discovery for Codex rollout files.

mod parser;

use std::{
    collections::{BTreeMap, HashMap, HashSet},
    fs::File,
    io::{BufRead, BufReader},
    path::{Path, PathBuf},
};

use serde::Deserialize;
use serde_json::Value;

use super::{contract_path, Discovery, Parsed, SessionSource, Unit};
use crate::model::{AppError, Provider, ScanError};

pub(super) const INDEX_TITLE_KEY: &str = "codex.index_title";
pub(super) const ROOT_ID_KEY: &str = "codex.root_id";
pub(super) const HEADER_PREFIX: &str = "codex.header:";

pub struct CodexSource {
    codex_dir: PathBuf,
}

impl CodexSource {
    pub fn new(codex_dir: PathBuf) -> Self {
        Self { codex_dir }
    }

    pub fn default_dir() -> PathBuf {
        std::env::var_os("CODEX_HOME")
            .map(PathBuf::from)
            .or_else(|| super::home_dir().map(|home| home.join(".codex")))
            .unwrap_or_else(|| PathBuf::from(".codex"))
    }

    /// Existing Codex homes used by the CLI and the Orca runtime, deduplicated by canonical path.
    pub fn default_dirs() -> Vec<PathBuf> {
        let mut candidates = Vec::new();
        if let Some(home) = std::env::var_os("CODEX_HOME") {
            candidates.push(PathBuf::from(home));
        }
        if let Some(home) = super::home_dir() {
            candidates.push(home.join(".codex"));
        }
        if let Some(appdata) = std::env::var_os("APPDATA") {
            candidates.push(
                PathBuf::from(appdata)
                    .join("orca")
                    .join("codex-runtime-home")
                    .join("home"),
            );
        }

        let mut seen = HashSet::new();
        let mut homes = Vec::new();
        for candidate in candidates.into_iter().filter(|path| path.is_dir()) {
            let canonical = std::fs::canonicalize(&candidate).unwrap_or_else(|_| candidate.clone());
            if seen.insert(canonical.clone()) {
                homes.push(canonical);
            }
        }
        if homes.is_empty() {
            homes.push(Self::default_dir());
        }
        homes
    }

    pub fn codex_dir(&self) -> &Path {
        &self.codex_dir
    }

    fn discover_files(
        &self,
        errors: &mut Vec<ScanError>,
    ) -> Result<Vec<(PathBuf, Header)>, AppError> {
        let sessions = self.codex_dir.join("sessions");
        let archived = self.codex_dir.join("archived_sessions");
        let mut paths = Vec::new();
        walk_rollouts(&sessions, &mut paths)?;
        list_archived_rollouts(&archived, &mut paths)?;
        paths.sort();

        let mut discovered = Vec::new();
        for path in paths {
            match read_header(&path) {
                Ok(header) => discovered.push((path, header)),
                Err(message) => errors.push(ScanError {
                    path: path.display().to_string(),
                    message,
                    provider: Some(Provider::Codex),
                }),
            }
        }
        Ok(discovered)
    }

    fn read_index_titles(&self) -> HashMap<String, String> {
        let path = self.codex_dir.join("session_index.jsonl");
        let Ok(file) = File::open(path) else {
            return HashMap::new();
        };
        let mut titles: HashMap<String, (String, String)> = HashMap::new();
        for line in BufReader::new(file).lines() {
            let Ok(line) = line else { continue };
            let Ok(entry) = serde_json::from_str::<IndexEntry>(&line) else {
                continue;
            };
            let Some(name) = entry.thread_name.filter(|name| !name.trim().is_empty()) else {
                continue;
            };
            let updated = entry.updated_at.unwrap_or_default();
            let should_replace = titles
                .get(&entry.id)
                .is_none_or(|(old_updated, _)| updated >= *old_updated);
            if should_replace {
                titles.insert(entry.id, (updated, name));
            }
        }
        titles
            .into_iter()
            .map(|(id, (_, title))| (id, title))
            .collect()
    }
}

impl SessionSource for CodexSource {
    fn provider(&self) -> Provider {
        Provider::Codex
    }

    fn source_dir(&self) -> PathBuf {
        self.codex_dir.clone()
    }

    fn discover(&self) -> Result<Discovery, AppError> {
        let mut discovery = Discovery::default();
        if !self.codex_dir.is_dir() {
            return Ok(discovery);
        }
        let files = dedupe_archived_conflicts(
            self.discover_files(&mut discovery.errors)?,
            &mut discovery.errors,
        );
        let titles = self.read_index_titles();

        let mut by_session: BTreeMap<String, BTreeMap<String, Vec<(PathBuf, Header)>>> =
            BTreeMap::new();
        for (path, header) in files {
            let session_id = header
                .session_id
                .clone()
                .filter(|value| !value.is_empty())
                .unwrap_or_else(|| header.id.clone());
            by_session
                .entry(session_id)
                .or_default()
                .entry(header.id.clone())
                .or_default()
                .push((path, header));
        }

        for (root_id, mut threads) in by_session {
            let mut ordered_files = Vec::new();
            let mut metadata = HashMap::new();
            metadata.insert(ROOT_ID_KEY.to_owned(), root_id.clone());
            if let Some(title) = titles.get(&root_id) {
                metadata.insert(INDEX_TITLE_KEY.to_owned(), title.clone());
            }

            // Keep the root thread first, followed by stable thread-id order. Each thread's
            // rollback segments are ordered by the `history_base` ordinal they reference.
            let mut thread_ids: Vec<_> = threads.keys().cloned().collect();
            thread_ids.sort_by(|a, b| {
                let a_is_root = a == &root_id;
                let b_is_root = b == &root_id;
                b_is_root.cmp(&a_is_root).then_with(|| a.cmp(b))
            });
            for thread_id in thread_ids {
                let mut segments = threads.remove(&thread_id).unwrap_or_default();
                segments.sort_by_key(|(_, header)| {
                    header
                        .history_base
                        .as_ref()
                        .map(|base| base.end_ordinal_exclusive)
                        .unwrap_or(0)
                });
                for (path, header) in segments {
                    metadata.insert(
                        format!("{HEADER_PREFIX}{}", path.to_string_lossy()),
                        serde_json::to_string(&header).map_err(|e| AppError::Io(e.to_string()))?,
                    );
                    ordered_files.push(path);
                }
            }
            discovery.units.push(Unit {
                key: root_id,
                files: ordered_files,
                metadata,
            });
        }
        Ok(discovery)
    }

    fn parse(&self, unit: &Unit) -> Result<Parsed, AppError> {
        parser::parse_summary(unit)
    }

    fn load_detail(&self, unit: &Unit) -> Result<crate::model::SessionDetail, AppError> {
        parser::parse(unit)?.detail.ok_or_else(|| {
            AppError::Io(format!(
                "Codex detail parser returned no detail for {}",
                unit.key
            ))
        })
    }

    fn refresh_summary(&self, summary: &mut crate::model::SessionSummary, unit: &Unit) {
        summary.title = unit.metadata.get(INDEX_TITLE_KEY).cloned();
        summary.source_dir = Some(contract_path(&self.codex_dir));
    }

    fn refresh_metadata(&self, detail: &mut crate::model::SessionDetail, unit: &Unit) {
        self.refresh_summary(&mut detail.summary, unit);
    }
}

#[derive(Debug, Clone, Deserialize, serde::Serialize)]
pub(super) struct Header {
    pub(super) id: String,
    #[serde(default)]
    pub(super) session_id: Option<String>,
    #[serde(default)]
    pub(super) parent_thread_id: Option<String>,
    #[serde(default)]
    pub(super) forked_from_id: Option<String>,
    #[serde(default)]
    pub(super) history_base: Option<HistoryBase>,
    #[serde(default)]
    pub(super) source: Option<Value>,
    #[serde(default)]
    pub(super) cwd: Option<String>,
    #[serde(default)]
    pub(super) timestamp: Option<String>,
    #[serde(default)]
    pub(super) cli_version: Option<String>,
    #[serde(default)]
    pub(super) git: Option<Value>,
    #[serde(default)]
    pub(super) agent_role: Option<String>,
    #[serde(default)]
    pub(super) agent_nickname: Option<String>,
    #[serde(default)]
    pub(super) thread_source: Option<String>,
}

#[derive(Debug, Clone, Deserialize, serde::Serialize)]
pub(super) struct HistoryBase {
    #[serde(default)]
    pub(super) thread_id: Option<String>,
    pub(super) end_ordinal_exclusive: u64,
}

#[derive(Debug, Deserialize)]
struct IndexEntry {
    id: String,
    #[serde(default)]
    thread_name: Option<String>,
    #[serde(default)]
    updated_at: Option<String>,
}

fn walk_rollouts(directory: &Path, paths: &mut Vec<PathBuf>) -> Result<(), AppError> {
    let entries = match std::fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(AppError::Io(error.to_string())),
    };
    for entry in entries {
        let entry = entry.map_err(|error| AppError::Io(error.to_string()))?;
        let file_type = entry
            .file_type()
            .map_err(|error| AppError::Io(error.to_string()))?;
        if file_type.is_dir() {
            walk_rollouts(&entry.path(), paths)?;
        } else if file_type.is_file() && is_rollout(&entry.path()) {
            paths.push(entry.path());
        }
    }
    Ok(())
}

fn list_archived_rollouts(directory: &Path, paths: &mut Vec<PathBuf>) -> Result<(), AppError> {
    let entries = match std::fs::read_dir(directory) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(error) => return Err(AppError::Io(error.to_string())),
    };
    for entry in entries {
        let entry = entry.map_err(|error| AppError::Io(error.to_string()))?;
        let file_type = entry
            .file_type()
            .map_err(|error| AppError::Io(error.to_string()))?;
        if file_type.is_file() && is_rollout(&entry.path()) {
            paths.push(entry.path());
        }
    }
    Ok(())
}

fn is_rollout(path: &Path) -> bool {
    path.file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| {
            name.starts_with("rollout-") && path.extension().is_some_and(|e| e == "jsonl")
        })
}

fn dedupe_archived_conflicts(
    files: Vec<(PathBuf, Header)>,
    errors: &mut Vec<ScanError>,
) -> Vec<(PathBuf, Header)> {
    let mut kept: Vec<Option<(PathBuf, Header)>> = Vec::new();
    let mut roots = HashMap::<(String, String), usize>::new();
    for (path, header) in files {
        let is_archived = path
            .components()
            .any(|component| component.as_os_str() == "archived_sessions");
        let session_id = header
            .session_id
            .clone()
            .filter(|id| !id.is_empty())
            .unwrap_or_else(|| header.id.clone());
        let identity = (session_id, header.id.clone());
        if header.history_base.is_none() {
            if let Some(index) = roots.get(&identity).copied() {
                if let Some((old_path, old_header)) = kept[index].as_ref() {
                    let old_id = old_header.id.clone();
                    let old_path = old_path.clone();
                    let old_archived = old_path
                        .components()
                        .any(|component| component.as_os_str() == "archived_sessions");
                    if old_archived != is_archived {
                        let new_size = std::fs::metadata(&path).map(|meta| meta.len()).unwrap_or(0);
                        let old_size = std::fs::metadata(&old_path)
                            .map(|meta| meta.len())
                            .unwrap_or(0);
                        let discarded = if new_size > old_size {
                            kept[index] = Some((path, header));
                            old_path
                        } else {
                            path
                        };
                        errors.push(ScanError {
                            path: discarded.display().to_string(),
                            message: format!(
                                "duplicate thread id {} found in sessions and archived_sessions; kept the larger file",
                                old_id
                            ),
                            provider: Some(Provider::Codex),
                        });
                        continue;
                    }
                }
            } else {
                roots.insert(identity, kept.len());
            }
        }
        kept.push(Some((path, header)));
    }
    kept.into_iter().flatten().collect()
}

fn read_header(path: &Path) -> Result<Header, String> {
    let file = File::open(path).map_err(|error| error.to_string())?;
    let mut reader = BufReader::new(file);
    let mut line = String::new();
    reader
        .read_line(&mut line)
        .map_err(|error| error.to_string())?;
    let envelope: Value =
        serde_json::from_str(&line).map_err(|error| format!("invalid session header: {error}"))?;
    if envelope.get("type").and_then(Value::as_str) != Some("session_meta") {
        return Err("first line is not a session_meta header".into());
    }
    serde_json::from_value(
        envelope
            .get("payload")
            .cloned()
            .ok_or_else(|| "session_meta header has no payload".to_owned())?,
    )
    .map_err(|error| format!("invalid session_meta payload: {error}"))
}
