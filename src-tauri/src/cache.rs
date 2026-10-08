use crate::{
    metrics,
    model::{
        AppError, CostBreakdown, DateRange, Metrics, Provider, ScanError, ScanReport,
        SessionDetail, SessionFilter, SessionSummary, SourceScan, TokenKind, ToolStat,
    },
    sources::{
        claude::ClaudeSource, codex::CodexSource, contract_path, normalize_contract_path,
        MessageMetric, ModelAggregate, SessionSource, ToolAggregate, Unit,
    },
};
use rayon::prelude::*;
use std::{
    collections::{HashMap, HashSet},
    mem::{size_of, size_of_val},
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Instant, SystemTime},
};

type CacheKey = (Provider, String);
type Signature = Vec<(PathBuf, Option<SystemTime>, u64)>;

struct Candidate {
    key: CacheKey,
    source_index: usize,
    source_dir: PathBuf,
    unit: Unit,
    signature: Signature,
    line_count: u64,
}

struct Cached {
    signature: Signature,
    source_dir: PathBuf,
    unit: Unit,
    summary: SessionSummary,
    detail: Option<SessionDetail>,
    model_costs: HashMap<String, CostBreakdown>,
    model_usage: HashMap<String, crate::model::Usage>,
    tool_aggregates: Vec<ToolAggregate>,
    hourly_activity: [u32; 168],
    model_aggregates: HashMap<String, ModelAggregate>,
    message_metrics: Vec<MessageMetric>,
}

#[derive(Default)]
struct Inner {
    entries: HashMap<CacheKey, Cached>,
    keys_by_id: HashMap<String, CacheKey>,
    scan_report: Option<ScanReport>,
    source_scanning: HashMap<Provider, bool>,
    source_sessions: HashMap<PathBuf, u32>,
    duplicates_merged: u32,
    scanned: bool,
    scanning: bool,
}

#[derive(Clone)]
pub struct AppState {
    sources: Arc<Vec<Box<dyn SessionSource>>>,
    cache: Arc<Mutex<Inner>>,
    scan_gate: Arc<Mutex<()>>,
    parse_pool: Arc<rayon::ThreadPool>,
}

impl Default for AppState {
    fn default() -> Self {
        let mut sources: Vec<Box<dyn SessionSource>> = vec![Box::new(ClaudeSource::new(
            ClaudeSource::default_projects_dir(),
        ))];
        sources.extend(
            CodexSource::default_dirs()
                .into_iter()
                .map(|directory| Box::new(CodexSource::new(directory)) as Box<dyn SessionSource>),
        );
        Self::with_sources(sources)
    }
}

impl AppState {
    /// Keep the v1 constructor convenient while the default app has one source.
    pub fn new(source: ClaudeSource) -> Self {
        Self::with_sources(vec![Box::new(source)])
    }

    pub fn with_sources(sources: Vec<Box<dyn SessionSource>>) -> Self {
        Self {
            sources: Arc::new(sources),
            cache: Arc::new(Mutex::new(Inner::default())),
            scan_gate: Arc::new(Mutex::new(())),
            parse_pool: Arc::new(
                rayon::ThreadPoolBuilder::new()
                    .num_threads(4)
                    .build()
                    .expect("create bounded session parse pool"),
            ),
        }
    }

    /// Begin the app's first scan on a worker thread. Read queries may return completed provider data
    /// while later providers are still being scanned.
    pub fn start_background_scan(&self) -> Result<(), AppError> {
        let source_dirs = self.source_dirs();
        {
            let _scan = self
                .scan_gate
                .lock()
                .map_err(|e| AppError::Io(e.to_string()))?;
            let mut guard = self.cache.lock().map_err(|e| AppError::Io(e.to_string()))?;
            if guard.scanned || guard.scanning {
                return Ok(());
            }
            guard.scanning = true;
            guard.source_scanning = source_dirs
                .iter()
                .map(|(provider, _)| (*provider, true))
                .collect();
            guard.scan_report = Some(build_report(&guard, &source_dirs, &[], true));
        }
        let state = self.clone();
        std::thread::spawn(move || {
            if let Err(error) = state.refresh() {
                eprintln!("Background session scan failed: {error}");
                state.mark_scan_failed(&error);
            }
        });
        Ok(())
    }

    fn source_dirs(&self) -> Vec<(Provider, PathBuf)> {
        self.sources
            .iter()
            .map(|source| (source.provider(), source.source_dir()))
            .collect()
    }

    fn mark_scan_failed(&self, error: &AppError) {
        let Ok(mut guard) = self.cache.lock() else {
            return;
        };
        guard.scanning = false;
        guard.scanned = false;
        let dirs = self.source_dirs();
        guard.source_scanning = dirs
            .iter()
            .map(|(provider, _)| (*provider, false))
            .collect();
        let mut report = build_report(&guard, &dirs, &[], false);
        report.errors.push(ScanError {
            path: report.source_dir.clone(),
            message: error.to_string(),
            provider: None,
        });
        guard.scan_report = Some(report);
    }

    pub fn refresh(&self) -> Result<ScanReport, AppError> {
        let _scan = self
            .scan_gate
            .lock()
            .map_err(|e| AppError::Io(e.to_string()))?;
        let dirs = self.source_dirs();
        {
            let mut guard = self.cache.lock().map_err(|e| AppError::Io(e.to_string()))?;
            guard.scanning = true;
            guard.scanned = false;
            guard.source_scanning = dirs.iter().map(|(provider, _)| (*provider, true)).collect();
            guard.scan_report = Some(build_report(&guard, &dirs, &[], true));
        }
        match self.scan() {
            Ok(report) => Ok(report),
            Err(error) => {
                self.mark_scan_failed(&error);
                Err(error)
            }
        }
    }

    fn scan(&self) -> Result<ScanReport, AppError> {
        let mut live = HashSet::new();
        let mut failed_units = HashSet::new();
        let mut errors = Vec::new();
        let source_dirs = self.source_dirs();

        {
            let mut guard = self.cache.lock().map_err(|e| AppError::Io(e.to_string()))?;
            guard.source_sessions.clear();
            guard.duplicates_merged = 0;
        }
        let mut candidates = Vec::new();
        for (source_index, (source, (_, source_dir))) in
            self.sources.iter().zip(&source_dirs).enumerate()
        {
            let source_started = Instant::now();
            let provider = source.provider();
            let discovery_started = Instant::now();
            let discovery = source.discover()?;
            let discovery_ms = discovery_started.elapsed().as_millis();
            let discovered_units = discovery.units.len();
            let discovered_files = discovery
                .units
                .iter()
                .map(|unit| unit.files.len())
                .sum::<usize>();
            {
                let mut guard = self.cache.lock().map_err(|e| AppError::Io(e.to_string()))?;
                guard
                    .source_sessions
                    .insert(source_dir.clone(), discovered_units as u32);
                guard.scan_report = Some(build_report(&guard, &source_dirs, &errors, true));
            }
            errors.extend(discovery.errors.into_iter().map(|mut error| {
                error.provider.get_or_insert(provider);
                error
            }));

            let signatures_started = Instant::now();
            for unit in discovery.units {
                let key = (provider, unit.key.clone());
                live.insert(key.clone());
                match signature(&unit.files) {
                    Ok(signature) => candidates.push(Candidate {
                        key,
                        source_index,
                        source_dir: source_dir.clone(),
                        unit,
                        signature,
                        line_count: 0,
                    }),
                    Err(error) => errors.push(ScanError {
                        path: unit
                            .files
                            .first()
                            .map(|path| path.display().to_string())
                            .unwrap_or_else(|| source_dir.display().to_string()),
                        message: error.to_string(),
                        provider: Some(provider),
                    }),
                }
            }
            let signatures_ms = signatures_started.elapsed().as_millis();
            if cfg!(debug_assertions) {
                eprintln!(
                    "[perf] discovery provider={provider:?} files={discovered_files} units={discovered_units} discovery_ms={discovery_ms} signatures_ms={signatures_ms} total_ms={}",
                    source_started.elapsed().as_millis()
                );
            }
        }

        let mut grouped: HashMap<CacheKey, Vec<Candidate>> = HashMap::new();
        for candidate in candidates {
            grouped
                .entry(candidate.key.clone())
                .or_default()
                .push(candidate);
        }
        let mut duplicates_merged = 0u32;
        let mut winners = Vec::with_capacity(grouped.len());
        for (key, mut copies) in grouped {
            if copies.len() > 1 {
                if key.0 == Provider::Codex {
                    duplicates_merged =
                        duplicates_merged.saturating_add(copies.len().saturating_sub(1) as u32);
                }
                for candidate in &mut copies {
                    match count_lines(&candidate.unit.files) {
                        Ok(lines) => candidate.line_count = lines,
                        Err(error) => errors.push(ScanError {
                            path: candidate
                                .unit
                                .files
                                .first()
                                .map(|path| path.display().to_string())
                                .unwrap_or_else(|| candidate.source_dir.display().to_string()),
                            message: error.to_string(),
                            provider: Some(key.0),
                        }),
                    }
                }
                copies.sort_by(|a, b| {
                    b.line_count
                        .cmp(&a.line_count)
                        .then_with(|| newest_mtime(&b.signature).cmp(&newest_mtime(&a.signature)))
                        .then_with(|| a.source_dir.cmp(&b.source_dir))
                });
            }
            winners.push(copies.remove(0));
        }
        {
            let mut guard = self.cache.lock().map_err(|e| AppError::Io(e.to_string()))?;
            guard.duplicates_merged = duplicates_merged;
        }

        let mut resolver = crate::projects::ProjectResolver::default();
        let mut changed = Vec::new();
        {
            let mut guard = self.cache.lock().map_err(|e| AppError::Io(e.to_string()))?;
            for candidate in winners {
                let source = &self.sources[candidate.source_index];
                let is_changed = guard.entries.get(&candidate.key).is_none_or(|old| {
                    old.signature != candidate.signature || old.source_dir != candidate.source_dir
                });
                if is_changed {
                    changed.push(candidate);
                } else if let Some(cached) = guard.entries.get_mut(&candidate.key) {
                    cached.unit = candidate.unit.clone();
                    source.refresh_summary(&mut cached.summary, &candidate.unit);
                    apply_project_identity(&mut cached.summary, &mut resolver);
                    if let Some(detail) = cached.detail.as_mut() {
                        source.refresh_metadata(detail, &candidate.unit);
                        detail.summary = cached.summary.clone();
                    }
                }
            }
        }

        let parse_started = Instant::now();
        let parsed: Vec<_> = self.parse_pool.install(|| {
            changed
                .par_iter()
                .map(|candidate| {
                    (
                        candidate.key.clone(),
                        candidate.signature.clone(),
                        candidate.source_dir.clone(),
                        candidate.unit.clone(),
                        candidate.source_index,
                        self.sources[candidate.source_index].parse(&candidate.unit),
                    )
                })
                .collect()
        });
        if cfg!(debug_assertions) {
            eprintln!(
                "[perf] scan parse_aggregate_ms={}",
                parse_started.elapsed().as_millis()
            );
        }
        failed_units.extend(
            parsed
                .iter()
                .filter_map(|(key, _, _, _, _, result)| result.is_err().then_some(key.clone())),
        );

        let mut guard = self.cache.lock().map_err(|e| AppError::Io(e.to_string()))?;
        for (key, _, _, unit, _, result) in &parsed {
            if let Err(error) = result {
                let path = unit
                    .files
                    .first()
                    .map(|path| path.display().to_string())
                    .unwrap_or_else(|| key.1.clone());
                eprintln!(
                    "Skipping unreadable {:?} session {}: {error:?}",
                    key.0, path
                );
                errors.push(ScanError {
                    path,
                    message: error.to_string(),
                    provider: Some(key.0),
                });
            }
        }
        for (key, signature, source_dir, unit, source_index, result) in parsed {
            if let Ok(mut parsed) = result {
                let source = &self.sources[source_index];
                source.refresh_summary(&mut parsed.summary, &unit);
                apply_project_identity(&mut parsed.summary, &mut resolver);
                if let Some(detail) = parsed.detail.as_mut() {
                    source.refresh_metadata(detail, &unit);
                    detail.summary = parsed.summary.clone();
                }
                errors.extend(parsed.errors.into_iter().map(|mut error| {
                    error.provider.get_or_insert(key.0);
                    error
                }));
                guard.entries.insert(
                    key,
                    Cached {
                        signature,
                        source_dir,
                        unit,
                        summary: parsed.summary,
                        detail: parsed.detail,
                        model_costs: parsed.model_costs,
                        model_usage: parsed.model_usage,
                        tool_aggregates: parsed.tool_aggregates,
                        hourly_activity: parsed.hourly_activity,
                        model_aggregates: parsed.model_aggregates,
                        message_metrics: parsed.message_metrics,
                    },
                );
            }
        }

        // A provider may have disappeared entirely, so prune only after every source was scanned.
        guard
            .entries
            .retain(|key, _| live.contains(key) && !failed_units.contains(key));
        rebuild_keys_by_id(&mut guard);
        guard.scanned = true;
        guard.scanning = false;
        guard.source_scanning = source_dirs
            .iter()
            .map(|(provider, _)| (*provider, false))
            .collect();
        let report = build_report(&guard, &source_dirs, &errors, false);
        guard.scan_report = Some(report.clone());
        Ok(report)
    }

    fn ensure(&self) -> Result<(), AppError> {
        {
            let guard = self.cache.lock().map_err(|e| AppError::Io(e.to_string()))?;
            if guard.scanned || guard.scanning {
                return Ok(());
            }
        }
        let _scan = self
            .scan_gate
            .lock()
            .map_err(|e| AppError::Io(e.to_string()))?;
        let mut guard = self.cache.lock().map_err(|e| AppError::Io(e.to_string()))?;
        if guard.scanned || guard.scanning {
            return Ok(());
        }
        guard.scanning = true;
        let source_dirs = self.source_dirs();
        guard.source_scanning = source_dirs
            .iter()
            .map(|(provider, _)| (*provider, true))
            .collect();
        drop(guard);
        match self.scan() {
            Ok(_) => Ok(()),
            Err(error) => {
                self.mark_scan_failed(&error);
                Err(error)
            }
        }
    }

    pub fn summaries(&self) -> Result<Vec<SessionSummary>, AppError> {
        self.ensure()?;
        let guard = self.cache.lock().map_err(|e| AppError::Io(e.to_string()))?;
        Ok(guard
            .entries
            .values()
            .map(|cached| cached.summary.clone())
            .collect())
    }

    pub fn summaries_filtered(
        &self,
        filter: Option<&SessionFilter>,
    ) -> Result<Vec<SessionSummary>, AppError> {
        self.ensure()?;
        let guard = self.cache.lock().map_err(|e| AppError::Io(e.to_string()))?;
        let mut summaries: Vec<_> = guard
            .entries
            .values()
            .filter(|cached| {
                let Some(filter) = filter else {
                    return true;
                };
                if filter
                    .provider
                    .is_some_and(|provider| provider != cached.summary.provider)
                    || filter
                        .project_path
                        .as_ref()
                        .is_some_and(|path| path != &cached.summary.project_path)
                    || filter
                        .project_key
                        .as_ref()
                        .is_some_and(|key| key != &cached.summary.project_key)
                    || !metrics::matches_days(
                        &cached.summary.started_at,
                        filter.from.as_deref(),
                        filter.to.as_deref(),
                        &chrono::Local,
                    )
                    || filter.search.as_ref().is_some_and(|query| {
                        let query = query.to_lowercase();
                        !cached
                            .summary
                            .title
                            .as_deref()
                            .unwrap_or("")
                            .to_lowercase()
                            .contains(&query)
                            && !cached
                                .summary
                                .first_prompt
                                .as_deref()
                                .unwrap_or("")
                                .to_lowercase()
                                .contains(&query)
                            && !cached.summary.project_name.to_lowercase().contains(&query)
                    })
                {
                    return false;
                }
                if filter.model.is_none()
                    && filter.models.is_none()
                    && filter.weekday.is_none()
                    && filter.hour.is_none()
                    && filter.tool.is_none()
                {
                    return true;
                }
                cached.message_metrics.iter().any(|message| {
                    metrics::model_matches(
                        message.model.as_deref(),
                        filter.model.as_deref(),
                        filter.models.as_deref(),
                    ) && filter
                        .weekday
                        .is_none_or(|weekday| message.weekday == Some(weekday))
                        && filter.hour.is_none_or(|hour| message.hour == Some(hour))
                        && filter.tool.as_ref().is_none_or(|tool| {
                            message
                                .tool_aggregates
                                .iter()
                                .any(|aggregate| aggregate.name == *tool && aggregate.calls > 0)
                        })
                })
            })
            .map(|cached| {
                let mut summary = cached.summary.clone();
                if let Some(filter) = filter {
                    if let Some(tool) = filter.tool.as_deref() {
                        let (calls, errors) = metrics::filtered_tool_counts(
                            &cached.message_metrics,
                            filter.model.as_deref(),
                            filter.models.as_deref(),
                            filter.weekday,
                            filter.hour,
                            tool,
                        );
                        summary.filtered_tool_calls = Some(calls);
                        summary.filtered_tool_errors = Some(errors);
                    }
                }
                summary
            })
            .collect();
        summaries.sort_by(|a, b| {
            b.started_at
                .cmp(&a.started_at)
                .then_with(|| a.id.cmp(&b.id))
        });
        Ok(summaries)
    }

    pub fn metrics(
        &self,
        range: Option<DateRange>,
        provider: Option<Provider>,
    ) -> Result<Metrics, AppError> {
        self.metrics_filtered(range, provider, None, None)
    }

    pub fn metrics_filtered(
        &self,
        range: Option<DateRange>,
        provider: Option<Provider>,
        project_path: Option<String>,
        model: Option<String>,
    ) -> Result<Metrics, AppError> {
        self.metrics_filtered_time(range, provider, project_path, model, None, None, None)
    }

    pub fn metrics_filtered_time(
        &self,
        range: Option<DateRange>,
        provider: Option<Provider>,
        project_path: Option<String>,
        model: Option<String>,
        weekday: Option<u8>,
        hour: Option<u8>,
        token_kind: Option<TokenKind>,
    ) -> Result<Metrics, AppError> {
        self.metrics_filtered_scope_time(
            range,
            provider,
            project_path,
            None,
            model,
            None,
            weekday,
            hour,
            token_kind,
        )
    }

    pub fn metrics_filtered_scope_time(
        &self,
        range: Option<DateRange>,
        provider: Option<Provider>,
        project_path: Option<String>,
        project_key: Option<String>,
        model: Option<String>,
        models: Option<Vec<String>>,
        weekday: Option<u8>,
        hour: Option<u8>,
        token_kind: Option<TokenKind>,
    ) -> Result<Metrics, AppError> {
        self.metrics_filtered_scope_time_tool(
            range,
            provider,
            project_path,
            project_key,
            model,
            models,
            weekday,
            hour,
            token_kind,
            None,
        )
    }

    pub fn metrics_filtered_scope_time_tool(
        &self,
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
    ) -> Result<Metrics, AppError> {
        self.ensure()?;
        let guard = self.cache.lock().map_err(|e| AppError::Io(e.to_string()))?;
        let selected: Vec<_> = guard
            .entries
            .values()
            .filter(|cached| {
                provider.is_none_or(|wanted| wanted == cached.summary.provider)
                    && project_path
                        .as_ref()
                        .is_none_or(|wanted| wanted == &cached.summary.project_path)
                    && project_key
                        .as_ref()
                        .is_none_or(|wanted| wanted == &cached.summary.project_key)
            })
            .collect();
        let inputs: Vec<_> = selected
            .iter()
            .map(|cached| (&cached.summary, cached.message_metrics.as_slice()))
            .collect();
        Ok(metrics::get_metrics_for_messages_with_models_and_tool(
            &inputs,
            range,
            model.as_deref(),
            models.as_deref(),
            weekday,
            hour,
            token_kind,
            tool.as_deref(),
        ))
    }

    pub fn scan_report(&self) -> Result<ScanReport, AppError> {
        let has_report = self
            .cache
            .lock()
            .map_err(|e| AppError::Io(e.to_string()))?
            .scan_report
            .is_some();
        if !has_report {
            self.ensure()?;
        }
        let guard = self.cache.lock().map_err(|e| AppError::Io(e.to_string()))?;
        guard
            .scan_report
            .clone()
            .ok_or_else(|| AppError::Io("scan completed without a report".into()))
    }

    /// Approximate heap bytes retained by cached session records, excluding allocator overhead.
    pub fn estimated_cache_bytes(&self) -> Result<usize, AppError> {
        self.ensure()?;
        let guard = self.cache.lock().map_err(|e| AppError::Io(e.to_string()))?;
        Ok(guard
            .entries
            .iter()
            .map(|((_, id), cached)| {
                size_of::<Cached>()
                    + id.capacity()
                    + cached.signature.capacity() * size_of::<(PathBuf, Option<SystemTime>, u64)>()
                    + cached
                        .signature
                        .iter()
                        .map(|(path, _, _)| path.to_string_lossy().len())
                        .sum::<usize>()
                    + cached.unit.files.capacity() * size_of::<PathBuf>()
                    + cached
                        .unit
                        .files
                        .iter()
                        .map(|path| path.to_string_lossy().len())
                        .sum::<usize>()
                    + cached.unit.metadata.capacity() * size_of::<(String, String)>()
                    + cached
                        .unit
                        .metadata
                        .iter()
                        .map(|(key, value)| key.capacity() + value.capacity())
                        .sum::<usize>()
                    + estimate_summary_bytes(&cached.summary)
                    + cached.detail.as_ref().map_or(0, estimate_detail_bytes)
                    + cached.model_usage.capacity() * size_of::<(String, crate::model::Usage)>()
                    + cached
                        .model_usage
                        .iter()
                        .map(|(model, _)| model.capacity())
                        .sum::<usize>()
                    + cached.model_costs.capacity() * size_of::<(String, CostBreakdown)>()
                    + cached
                        .model_costs
                        .iter()
                        .map(|(model, _)| model.capacity())
                        .sum::<usize>()
                    + cached.tool_aggregates.capacity() * size_of::<ToolAggregate>()
                    + cached
                        .tool_aggregates
                        .iter()
                        .map(|tool| tool.name.capacity())
                        .sum::<usize>()
                    + cached.model_aggregates.capacity() * size_of::<(String, ModelAggregate)>()
                    + cached
                        .model_aggregates
                        .iter()
                        .map(|(model, aggregate)| {
                            model.capacity()
                                + aggregate.tool_aggregates.capacity() * size_of::<ToolAggregate>()
                                + aggregate
                                    .tool_aggregates
                                    .iter()
                                    .map(|tool| tool.name.capacity())
                                    .sum::<usize>()
                        })
                        .sum::<usize>()
                    + size_of_val(&cached.hourly_activity)
                    + cached.message_metrics.capacity() * size_of::<MessageMetric>()
                    + cached
                        .message_metrics
                        .iter()
                        .map(|message| {
                            message.model.as_ref().map_or(0, String::capacity)
                                + message.subagent_id.as_ref().map_or(0, String::capacity)
                                + message.tool_aggregates.capacity() * size_of::<ToolAggregate>()
                                + message
                                    .tool_aggregates
                                    .iter()
                                    .map(|tool| tool.name.capacity())
                                    .sum::<usize>()
                        })
                        .sum::<usize>()
            })
            .sum())
    }

    pub fn tool_stats(
        &self,
        range: Option<DateRange>,
        provider: Option<Provider>,
    ) -> Result<Vec<ToolStat>, AppError> {
        self.tool_stats_filtered(range, provider, None, None)
    }

    pub fn tool_stats_filtered(
        &self,
        range: Option<DateRange>,
        provider: Option<Provider>,
        project_path: Option<String>,
        model: Option<String>,
    ) -> Result<Vec<ToolStat>, AppError> {
        self.tool_stats_filtered_time(range, provider, project_path, model, None, None)
    }

    pub fn tool_stats_filtered_time(
        &self,
        range: Option<DateRange>,
        provider: Option<Provider>,
        project_path: Option<String>,
        model: Option<String>,
        weekday: Option<u8>,
        hour: Option<u8>,
    ) -> Result<Vec<ToolStat>, AppError> {
        self.tool_stats_filtered_scope_time(
            range,
            provider,
            project_path,
            None,
            model,
            None,
            weekday,
            hour,
        )
    }

    pub fn tool_stats_filtered_scope_time(
        &self,
        range: Option<DateRange>,
        provider: Option<Provider>,
        project_path: Option<String>,
        project_key: Option<String>,
        model: Option<String>,
        models: Option<Vec<String>>,
        weekday: Option<u8>,
        hour: Option<u8>,
    ) -> Result<Vec<ToolStat>, AppError> {
        self.tool_stats_filtered_scope_time_tool(
            range,
            provider,
            project_path,
            project_key,
            model,
            models,
            weekday,
            hour,
            None,
        )
    }

    pub fn tool_stats_filtered_scope_time_tool(
        &self,
        range: Option<DateRange>,
        provider: Option<Provider>,
        project_path: Option<String>,
        project_key: Option<String>,
        model: Option<String>,
        models: Option<Vec<String>>,
        weekday: Option<u8>,
        hour: Option<u8>,
        tool: Option<String>,
    ) -> Result<Vec<ToolStat>, AppError> {
        self.ensure()?;
        let guard = self.cache.lock().map_err(|e| AppError::Io(e.to_string()))?;
        let sessions: Vec<_> = guard
            .entries
            .values()
            .filter(|cached| {
                provider.is_none_or(|wanted| wanted == cached.summary.provider)
                    && project_path
                        .as_ref()
                        .is_none_or(|wanted| wanted == &cached.summary.project_path)
                    && project_key
                        .as_ref()
                        .is_none_or(|wanted| wanted == &cached.summary.project_key)
            })
            .map(|cached| (&cached.summary, cached.message_metrics.as_slice()))
            .collect();
        Ok(metrics::get_tool_stats_for_messages_with_models_and_tool(
            &sessions,
            range,
            model.as_deref(),
            models.as_deref(),
            weekday,
            hour,
            tool.as_deref(),
        ))
    }

    pub fn session(&self, id: &str) -> Result<SessionDetail, AppError> {
        self.ensure()?;
        let (key, signature, source_dir, unit, summary, existing) = {
            let guard = self.cache.lock().map_err(|e| AppError::Io(e.to_string()))?;
            let key = guard
                .keys_by_id
                .get(id)
                .cloned()
                .ok_or_else(|| AppError::NotFound(id.into()))?;
            let cached = guard
                .entries
                .get(&key)
                .ok_or_else(|| AppError::NotFound(id.into()))?;
            (
                key,
                cached.signature.clone(),
                cached.source_dir.clone(),
                cached.unit.clone(),
                cached.summary.clone(),
                cached.detail.clone(),
            )
        };
        if let Some(detail) = existing {
            return Ok(detail);
        }
        let source = self
            .sources
            .iter()
            .find(|source| source.provider() == key.0 && source.source_dir() == source_dir)
            .ok_or_else(|| AppError::NotFound(id.into()))?;
        let mut detail = source.load_detail(&unit)?;
        source.refresh_metadata(&mut detail, &unit);
        detail.summary = summary;
        let mut guard = self.cache.lock().map_err(|e| AppError::Io(e.to_string()))?;
        if let Some(cached) = guard.entries.get_mut(&key) {
            if cached.signature == signature {
                cached.detail.get_or_insert_with(|| detail.clone());
                return cached
                    .detail
                    .clone()
                    .ok_or_else(|| AppError::NotFound(id.into()));
            }
        }
        Ok(detail)
    }
}

fn estimate_summary_bytes(summary: &SessionSummary) -> usize {
    size_of::<SessionSummary>()
        + summary.id.capacity()
        + summary.project_path.capacity()
        + summary.project_key.capacity()
        + summary.project_name.capacity()
        + summary.source_dir.as_ref().map_or(0, String::capacity)
        + summary.title.as_ref().map_or(0, String::capacity)
        + summary.first_prompt.as_ref().map_or(0, String::capacity)
        + summary.started_at.capacity()
        + summary.ended_at.capacity()
        + summary.models.capacity() * size_of::<String>()
        + summary.models.iter().map(String::capacity).sum::<usize>()
        + summary.git_branch.as_ref().map_or(0, String::capacity)
        + summary.cli_version.as_ref().map_or(0, String::capacity)
}

fn estimate_detail_bytes(detail: &SessionDetail) -> usize {
    size_of::<SessionDetail>()
        + estimate_summary_bytes(&detail.summary)
        + detail.messages.capacity() * size_of::<crate::model::Message>()
        + detail
            .messages
            .iter()
            .map(estimate_message_bytes)
            .sum::<usize>()
        + detail.subagents.capacity() * size_of::<crate::model::Subagent>()
        + detail
            .subagents
            .iter()
            .map(|subagent| {
                subagent.id.capacity()
                    + subagent.agent_type.as_ref().map_or(0, String::capacity)
                    + subagent
                        .parent_tool_call_id
                        .as_ref()
                        .map_or(0, String::capacity)
                    + subagent.started_at.capacity()
                    + subagent.ended_at.capacity()
                    + subagent.messages.capacity() * size_of::<crate::model::Message>()
                    + subagent
                        .messages
                        .iter()
                        .map(estimate_message_bytes)
                        .sum::<usize>()
            })
            .sum::<usize>()
}

fn estimate_message_bytes(message: &crate::model::Message) -> usize {
    size_of::<crate::model::Message>()
        + message.id.capacity()
        + message.timestamp.capacity()
        + message.model.as_ref().map_or(0, String::capacity)
        + message.branch.as_ref().map_or(0, String::capacity)
        + message.blocks.capacity() * size_of::<crate::model::Block>()
        + message
            .blocks
            .iter()
            .map(|block| match block {
                crate::model::Block::Text { text } | crate::model::Block::Thinking { text } => {
                    text.capacity()
                }
                crate::model::Block::ToolCall(tool) => {
                    tool.id.capacity()
                        + tool.name.capacity()
                        + tool.result.as_ref().map_or(0, String::capacity)
                        + tool.parent_call_id.as_ref().map_or(0, String::capacity)
                        + serde_json::to_vec(&tool.input).map_or(0, |json| json.len())
                }
            })
            .sum::<usize>()
}

fn signature(files: &[PathBuf]) -> Result<Signature, AppError> {
    let mut paths = files.to_vec();
    paths.sort();
    paths
        .into_iter()
        .map(|path| {
            let metadata = std::fs::metadata(&path).map_err(|e| AppError::Io(e.to_string()))?;
            Ok((path, metadata.modified().ok(), metadata.len()))
        })
        .collect()
}

fn count_lines(files: &[PathBuf]) -> Result<u64, AppError> {
    let mut lines = 0u64;
    for path in files {
        let file = std::fs::File::open(path).map_err(|error| AppError::Io(error.to_string()))?;
        let mut reader = std::io::BufReader::new(file);
        let mut buffer = Vec::new();
        loop {
            buffer.clear();
            let bytes = std::io::BufRead::read_until(&mut reader, b'\n', &mut buffer)
                .map_err(|error| AppError::Io(error.to_string()))?;
            if bytes == 0 {
                break;
            }
            lines = lines.saturating_add(1);
        }
    }
    Ok(lines)
}

fn newest_mtime(signature: &Signature) -> Option<SystemTime> {
    signature
        .iter()
        .filter_map(|(_, modified, _)| *modified)
        .max()
}

fn apply_project_identity(
    summary: &mut SessionSummary,
    resolver: &mut crate::projects::ProjectResolver,
) {
    summary.project_path = normalize_contract_path(&summary.project_path);
    let identity = resolver.resolve(&summary.project_path);
    summary.project_key = identity.key;
    summary.project_name = identity.name;
}

fn error_belongs_to_source(error: &ScanError, source_dir: &PathBuf) -> bool {
    PathBuf::from(&error.path).starts_with(source_dir)
}

fn provider_order(provider: Provider) -> u8 {
    match provider {
        Provider::Claude => 0,
        Provider::Codex => 1,
    }
}

fn rebuild_keys_by_id(guard: &mut Inner) {
    guard.keys_by_id.clear();
    let mut cached_entries: Vec<_> = guard
        .entries
        .iter()
        .map(|(key, cached)| (key.clone(), cached.summary.clone()))
        .collect();
    cached_entries.sort_by(|(key_a, a), (key_b, b)| {
        a.started_at
            .cmp(&b.started_at)
            .then_with(|| provider_order(key_a.0).cmp(&provider_order(key_b.0)))
            .then_with(|| key_a.1.cmp(&key_b.1))
    });
    for (key, summary) in cached_entries {
        if guard.keys_by_id.contains_key(&summary.id) {
            eprintln!(
                "Session id collision for {}; returning the most recent provider copy",
                summary.id
            );
        }
        guard.keys_by_id.insert(summary.id.clone(), key);
    }
}

fn build_report(
    guard: &Inner,
    source_dirs: &[(Provider, PathBuf)],
    errors: &[ScanError],
    scanning: bool,
) -> ScanReport {
    let source_scans: Vec<_> = source_dirs
        .iter()
        .map(|(provider, source_dir)| SourceScan {
            provider: *provider,
            source_dir: contract_path(source_dir),
            available: source_dir.is_dir(),
            sessions: guard
                .source_sessions
                .get(source_dir)
                .copied()
                .unwrap_or_else(|| {
                    guard
                        .entries
                        .values()
                        .filter(|entry| entry.summary.provider == *provider)
                        .count() as u32
                }),
            errors: errors
                .iter()
                .filter(|error| {
                    error.provider == Some(*provider) && error_belongs_to_source(error, source_dir)
                })
                .cloned()
                .map(|mut error| {
                    error.path = normalize_contract_path(&error.path);
                    error
                })
                .collect(),
            scanning: Some(
                guard
                    .source_scanning
                    .get(provider)
                    .copied()
                    .unwrap_or(false),
            ),
        })
        .collect();
    ScanReport {
        source_dir: source_dirs
            .iter()
            .find(|(_, path)| path.exists())
            .or_else(|| source_dirs.first())
            .map(|(_, path)| contract_path(path))
            .unwrap_or_default(),
        scanned_at: chrono::Utc::now().to_rfc3339_opts(chrono::SecondsFormat::Millis, true),
        sessions: guard.entries.len() as u32,
        errors: errors
            .iter()
            .cloned()
            .map(|mut error| {
                error.path = normalize_contract_path(&error.path);
                error
            })
            .collect(),
        scanning: Some(scanning),
        sources: Some(source_scans),
        duplicates_merged: Some(guard.duplicates_merged),
    }
}
