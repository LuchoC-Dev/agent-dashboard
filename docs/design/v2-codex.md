# v2 design — Codex sessions

Status: proposal (research + design only, no production code). Date: 2026-10-06.
Decisions on the open questions: §7.
Inputs: `AGENTS.md`, `docs/architecture/frontend.md`, `src-tauri/src/model.rs`, `cache.rs`, `pricing.rs`,
`commands.rs`, and a read-only survey of the Codex session logs on the development machine.

The survey read **only** `~/.codex/sessions/**/*.jsonl`, `~/.codex/archived_sessions/*.jsonl` and the
key shape of `~/.codex/session_index.jsonl`. `auth.json`, `config.toml`, caches, SQLite databases and
everything else under `~/.codex` were not opened. Snippets below are structural and anonymized.

---

## 0. Summary

- Codex writes one **rollout file per thread** (`rollout-<local time>-<thread uuid>.jsonl`), one JSON
  object per line, `{timestamp, ordinal, type, payload}`. The first line is always `session_meta`.
- Conversation content is in `response_item` lines (messages, reasoning, tool calls/outputs); UI-level
  facts (clean user text, command exit codes, durations, sub-agent activity) are in
  `event_msg/item_completed`; usage is in `event_msg/token_count` (all versions) and
  `token_usage_record` (CLI ≥ 0.149, per response, with `response_id`).
- `token_count` carries both a **cumulative** total and the **last request's** usage, is often emitted
  twice in a row, can reset, and is **copied** into forked sub-agent files. Correct accounting:
  prefer `token_usage_record` (one per `response_id`); otherwise sum `last_token_usage` of
  `token_count` events whose cumulative total changed, and only for turns that belong to the file.
- Sub-agents are separate rollout files linked by `parent_thread_id`; every file of a tree shares
  `session_id` = the root thread id. Two kinds: spawned agents (`thread_spawn`, e.g. role `explorer`)
  and **guardian** auto-review agents (model `codex-auto-review`) — the latter are ~half of all files.
- **Forked** sub-agents replay the parent's history at the top of their file; the replayed part is
  identified by turn ids (UUIDv7) older than the fork's own thread id.
- One thread can span **several files** (rollback/branch segments, `history_base`).
- Contract changes are additive: optional provider argument on the metric commands, per-provider
  scan report, `Metrics.by_provider`, `Usage.reasoning_tokens`, `ToolCall.parent_call_id`,
  `Message.branch`, `unpriced_tokens` on summaries and aggregates.
- Prices for 7 of the 9 models seen are confirmed on OpenAI's pricing page; `gpt-5.5-mini` and
  `codex-auto-review` are **TBD**.

---

## 1. Codex log format

### 1.1 Corpus surveyed

| | |
|---|---|
| Files | 860 in `sessions/YYYY/MM/DD/`, 8 in `archived_sessions/` (flat), 1.7 GB + 17 MB |
| Dates | 2026-06-14 → 2026-10-06 |
| CLI versions | 37 distinct, `0.140.0-alpha.2` → `0.160.1` |
| Originators | `Codex Desktop` (820), `codex_work_desktop` (61), `codex-tui` (45) |
| `model_provider` | always `openai` |
| Malformed lines | 0 (but files of live sessions can end mid-write; see §2.6) |
| Threads | 243 top-level (`source` `vscode`/`cli`/`exec`; `thread_source` `user`/`automation`), 157 spawned sub-agents, 448 guardian reviews |

### 1.2 File layout

```
~/.codex/
  sessions/2026/10/06/rollout-2026-10-06T09-50-52-<threadId>.jsonl          one thread
  sessions/2026/08/22/rollout-…-<threadId>_<segmentId>.jsonl               branch segment of <threadId>
  archived_sessions/rollout-…-<threadId>.jsonl                             archived by the user (moved)
  session_index.jsonl                                                      {id, thread_name, updated_at}
```

- The date folders and the file-name timestamp are **local time** of thread creation; the
  `timestamp` fields inside are UTC (`2026-10-06T12:50:52.123Z`).
- All ids (thread, session, turn) are UUIDv7 (time-ordered); 10 turn ids in old files are short
  non-UUID strings.
- Files are append-only while the thread is alive. `ordinal` is contiguous inside a file and starts at
  0, except for segment files, which start at `history_base.end_ordinal_exclusive`.

### 1.3 Line types

Every line: `{ "timestamp": RFC3339 UTC, "ordinal": n, "type": T, "payload": {...} }`.

| `type` / `payload.type` | Count | Meaning | Used? |
|---|---:|---|---|
| `session_meta` | 926 | Thread header (first line; a 2nd one at ordinal 1 in 58 forks = parent's header) | yes |
| `turn_context` | 4 795 | Per-turn settings: `turn_id`, `cwd`, `model`, `effort`, `timezone`, sandbox… | yes (model, cwd) |
| `event_msg/task_started` | 4 655 | Turn start: `turn_id`, `started_at` (unix s), `model_context_window` | yes |
| `event_msg/task_complete` | 4 466 | Turn end: `duration_ms`, `time_to_first_token_ms`, `last_agent_message` | yes (ended_at) |
| `event_msg/turn_aborted` | 108 | Turn interrupted: `reason`, `duration_ms` | yes (ended_at) |
| `event_msg/item_completed` | 49 342 | UI item finished: `item.type` ∈ UserMessage, AgentMessage, Reasoning, CommandExecution, McpToolCall, FileChange, ImageView, WebSearch, DynamicToolCall, CollabAgentToolCall, SubAgentActivity, Extension, ContextCompaction, FunctionCallOutput; `started_at_ms`/`completed_at_ms` | yes |
| `event_msg/token_count` | 31 056 | `info.total_token_usage` (cumulative), `info.last_token_usage` (last request), `model_context_window`; plus `rate_limits` | yes (usage) |
| `event_msg/thread_settings_applied` | 4 192 | `model`, `service_tier`, `reasoning_effort`, `cwd` | no (v2.1: service tier) |
| `token_usage_record` | 9 443 | Per response: `response_id`, `turn_id`, `thread_id`, `usage`, `turn_token_usage`, `thread_token_usage` (CLI ≥ 0.149) | yes (usage) |
| `response_item/message` | 18 816 | `role` ∈ user/assistant/developer, `content[]` (`input_text`, `output_text`, `input_image`), `phase` ∈ commentary/final_answer | yes |
| `response_item/reasoning` | 24 448 | `summary[]` (`summary_text`), `content` (raw text, sometimes), `encrypted_content` | summary only |
| `response_item/function_call` (+`_output`) | 4 529 | `name`, `namespace` (e.g. `collaboration`, `mcp__engram`), `arguments` (JSON string), `call_id` | yes |
| `response_item/custom_tool_call` (+`_output`) | 17 317 | `name` ∈ `exec` (code-mode JS script) / `apply_patch`, `input` (raw string), `call_id` | yes |
| `response_item/tool_search_call` (+`_output`), `web_search_call` | 93 / 56 | Tool discovery, hosted web search | yes (as tool calls) |
| `response_item/agent_message` | 625 | Inter-agent message (`author`, `recipient`, `content`) | yes (as text) |
| `response_item/compaction`, `compacted` | 220 / 174 | Context compaction (encrypted / `replacement_history`) | marker only |
| `world_state`, `inter_agent_communication_metadata` | 1 915 / 625 | Environment snapshot, routing flag | no |

`session_meta.payload` (anonymized shape):

```json
{ "id": "<thread uuid>", "session_id": "<root thread uuid>", "timestamp": "…Z",
  "cwd": "C:\\Users\\me\\dev\\app", "originator": "Codex Desktop", "cli_version": "0.160.0",
  "source": "vscode" | "cli" | "exec" | {"subagent": {"thread_spawn": {"parent_thread_id": "…", "depth": 1,
            "agent_nickname": "Galileo", "agent_role": "explorer", "agent_path": null}}}
            | {"subagent": {"other": "guardian"}},
  "thread_source": "user" | "automation" | "subagent" | "guardian_review",
  "parent_thread_id": "…", "forked_from_id": "…", "agent_nickname": "…", "agent_role": "…",
  "git": {"commit_hash": "…", "branch": "…", "repository_url": "…"},
  "history_base": {"thread_id": "…", "end_ordinal_exclusive": 1058, "end_byte_offset": 1708209},
  "base_instructions": {"text": "<~20 KB system prompt>"}, "model_provider": "openai" }
```

Optional fields appear by version (`git` only in 228 headers, `agent_*` only on sub-agents,
`history_base` only on segments). The parser must treat every field except `id` as optional.

### 1.4 How each concept is represented

**User messages.** Two copies: `response_item/message role=user` (also carries injected context:
`<environment_context>`, `<recommended_plugins>`, `<skill>`, `<turn_aborted>`, `<subagent_notification>`,
… — 14 tag kinds seen) and `item_completed` with `item.type = "UserMessage"` (only what the user typed,
plus `text_elements`). Use `UserMessage` for user text; skip `role=user` response items that start with
an XML-like wrapper tag; skip `role=developer` entirely.

**Assistant text.** `response_item/message role=assistant`, `output_text`; `phase = commentary`
(progress notes) or `final_answer`. `item_completed/AgentMessage` duplicates it — ignore.

**Reasoning.** `response_item/reasoning`: `summary[].text` is readable; `encrypted_content` is opaque;
`content` (raw reasoning text) is present in ~40 % of items. Map summary (or content when present) to
`Block::Thinking`. `item_completed/Reasoning` duplicates it — ignore.

**Tool calls.** Three shapes, joined to outputs by `call_id`:
- `function_call` / `function_call_output` — classic tools (`shell_command`, `update_plan`, `view_image`,
  `collaboration.spawn_agent`/`wait_agent`/`send_message`, MCP tools with `namespace` `mcp__<server>`).
- `custom_tool_call` / `custom_tool_call_output` — `apply_patch` (patch text) and **`exec`**: in recent
  versions the model writes a JS script (`const r = await tools.…`) that calls the real tools.
- Inner executions show up as `item_completed` items between the `exec` call and its output:
  `CommandExecution` (`command`, `cwd`, `exit_code`, `status` completed/failed/declined, `duration`,
  `aggregated_output`), `McpToolCall` (`server`, `tool`, `arguments`, `result.isError`, `duration`),
  `FileChange` (`changes{path: {type, content}}`), `WebSearch`, `ImageView`, `DynamicToolCall`,
  `CollabAgentToolCall`. Their `id` joins a `call_id` only when they were called directly (not via
  `exec`); `started_at_ms`/`completed_at_ms` give the duration.

Error signal: `status == "failed"` or `"declined"`, `exit_code != 0`, `result.isError == true`,
`success == false`.

**Model.** Not on messages. The current model is `turn_context.model` (one per turn; can change between
turns). Models seen: `gpt-5.6-sol`, `gpt-5.6-terra`, `gpt-5.6-luna`, `gpt-6-luna`, `gpt-6.1-sol`,
`gpt-5.5`, `gpt-5.5-mini`, `gpt-5.4-mini`, `codex-auto-review` (guardian).

**cwd / project.** `session_meta.cwd` (thread start) and `turn_context.cwd` (per turn). Windows paths.
`turn_context.workspace_roots` lists extra roots.

**Git.** `session_meta.git` `{commit_hash, branch, repository_url}` when the cwd is a repo (newer CLIs).

**Timestamps.** Line `timestamp` (UTC, ms). `task_started.started_at` / `task_complete.completed_at`
are unix seconds; `item_completed.*_at_ms` unix ms. In forked files the replayed lines get **new**
timestamps (the copy time), so they are useless to separate replay from own events.

**Title.** No title in the rollout. `session_index.jsonl` has `{id, thread_name, updated_at}` for 207 of
243 top-level threads (several lines per id possible — take the latest `updated_at`).

**Sub-agents.** Separate rollout files with `parent_thread_id` and `session_id` = root thread id (true for
all 605 sub-agent files). The parent records the spawn as `function_call collaboration.spawn_agent`
(or `multi_agent_v1.spawn_agent` in older CLIs) and as `item_completed/SubAgentActivity`
`{kind: started|interacted|completed|interrupted, id: <parent call id>, agent_thread_id, agent_path}`.
Guardian reviewers have `source.subagent.other = "guardian"`, model `codex-auto-review`, 12–25 lines.

**Forks.** `forked_from_id` (131 sub-agent files): the child file starts with a copy of the parent's
history — response items, `turn_context`, `task_*` **and `token_count` events** (75 of 131 forks carry
copied token counts). Verified rule: every copied turn has a `turn_id` whose UUIDv7 time is earlier than
the child's thread id; every own turn is later (0 exceptions across 666 turns).
`subagent_history_start_ordinal` is **not** a replay boundary (it equals the file length when written).

**Segments.** 14 threads span 2–4 files. A segment's header has the same `id` and a `history_base`
pointing at the previous file (`thread_id` = previous file's segment id, `end_ordinal_exclusive`). The
segment continues the conversation from that ordinal: the base file's lines at or after that ordinal are
an abandoned branch (rollback/edit). Segments do not replay content; each file has its own cumulative
token counter starting near zero.

### 1.5 Token usage

`token_count.info` (and `token_usage_record.usage`) use OpenAI semantics:

```json
{ "input_tokens": 29404, "cached_input_tokens": 16256, "cache_write_input_tokens": 0,
  "output_tokens": 155, "reasoning_output_tokens": 68, "total_tokens": 29559 }
```

- `input_tokens` **includes** `cached_input_tokens` (cached ≤ input in every event);
  `output_tokens` **includes** `reasoning_output_tokens`; `cache_write_input_tokens` was 0 everywhere.
- `total_token_usage` is cumulative per file; `last_token_usage` is the last request.
- Pitfalls observed (738 files with `token_count`):
  - **Duplicates**: 485 events repeat the previous cumulative total verbatim → skip.
  - **Resets**: 16 files where the cumulative drops back to `last` (thread reloaded) → deltas of the
    cumulative go negative; summing `last` is immune.
  - **Inherited baseline**: forked files start with the parent's cumulative → `final total` overcounts.
  - **Copied events**: forks replay the parent's `token_count`s → must skip replayed turns.
  - **Context-only events**: 127 events with `input = output = 0` and `total_tokens > 0` → contribute 0
    (never use `total_tokens`).
- `token_usage_record` (279 files) has a unique `response_id` (0 duplicates) and a `turn_id`. It starts
  **mid-file** when a thread was continued after a CLI upgrade, and covers 1–3 % more responses than the
  deduplicated `token_count` stream (responses not followed by a count, e.g. compactions/aborts).

**Accounting rule** (per file, own turns only):
1. Usage events from ordinals ≥ the first `token_usage_record`: one per distinct `response_id`.
2. Before it: each `token_count` whose `total_token_usage` differs from the previous one contributes its
   `last_token_usage`.
3. A turn is *own* unless the file is a fork and the turn id's UUIDv7 time < the thread id's time.
4. Each usage event is attributed to the model of the enclosing turn (`turn_context.model` by
   `turn_id`; `token_usage_record.turn_id` resolves in 100 % of records).

Validation on the corpus: rule (2) equals the final cumulative in 701/738 files; all mismatches are
forks/resets that the rule handles on purpose; (1) equals `thread_token_usage` in 270/279 files (the
rest start mid-file).

Mapping to our `Usage`:

| Codex | `model::Usage` |
|---|---|
| `input_tokens − cached_input_tokens` | `input_tokens` |
| `cached_input_tokens` | `cache_read_tokens` |
| `cache_write_input_tokens` | `cache_creation_tokens` |
| `output_tokens` (incl. reasoning) | `output_tokens` |
| `reasoning_output_tokens` | `reasoning_tokens` (new, optional, informational subset of output) |

### 1.6 Field mapping to `model.rs`

| `model.rs` | Codex source |
|---|---|
| `SessionSummary.id` | root `session_meta.id` (= `session_id` of every file in the tree) |
| `provider` | `Provider::Codex` |
| `project_path` | root `session_meta.cwd` |
| `project_name` | last segment of `project_path` |
| `title` | latest `session_index.jsonl` `thread_name` for the id |
| `first_prompt` | first `item_completed/UserMessage` text (root thread), whitespace-collapsed, ~200 chars |
| `started_at` / `ended_at` | first / last line `timestamp` of the root thread's own events (all segments) |
| `duration_ms` | `ended_at − started_at` (same as Claude) |
| `models` | distinct `turn_context.model` over root + sub-agents, ordered by tokens |
| `git_branch` | `session_meta.git.branch` |
| `cli_version` | latest `session_meta.cli_version` in the root thread |
| `message_count` | user + assistant `Message`s, root + sub-agents (own events only) |
| `tool_call_count` / `tool_error_count` | every tool call, `exec` wrappers and their inner calls alike (decision D6), root + sub-agents |
| `subagent_count` | number of sub-agent threads in the tree (spawned + guardian) |
| `usage`, `cost_usd`, `cost_breakdown` | §1.5 + §4, root + sub-agents |
| `Message` (user) | `item_completed/UserMessage`; `id` = item `client_id` or `<thread>:<ordinal>` |
| `Message` (assistant) | one per **model response**: all `reasoning`/`message`/tool items between two usage events, `model` = turn model, `usage` = that response's usage, `id` = first `response_item.id` or `<thread>:<ordinal>` |
| `Block::Text` | assistant `output_text`; `agent_message` content (prefixed by author) |
| `Block::Thinking` | `reasoning.summary[].text` (or `content` when present) |
| `Block::ToolCall` | function/custom/tool_search/web_search calls and `item_completed` tool items (§1.4) |
| `ToolCall.name` | `name`, or `<namespace>.<name>` for namespaced functions, `mcp__<server>__<tool>` for MCP, `shell` for `CommandExecution`, `apply_patch` for `FileChange`, `web_search`, `view_image`, `exec` |
| `ToolCall.input` | parsed `arguments` JSON; raw `input` string; `{command, cwd}` for commands |
| `ToolCall.result` | `*_output.output` / `aggregated_output` / MCP `result.content[].text`, ≤ 20 KB |
| `ToolCall.is_error` | §1.4 error signal |
| `ToolCall.duration_ms` | `duration` (secs+nanos) or `completed_at_ms − started_at_ms` |
| `Subagent.id` | sub-agent `session_meta.id` |
| `Subagent.agent_type` | `agent_role` → `agent_nickname` → `"guardian"` |
| `Subagent.parent_tool_call_id` | `SubAgentActivity(kind=started).id` in the parent, else the `spawn_agent` `call_id` whose output names the child |
| `ScanError` | unreadable file / bad header / bad line (§2.6) |

---

## 2. `CodexSource` design

### 2.1 Discovery

- Root: `%USERPROFILE%\.codex` (`$CODEX_HOME` overrides, as the Codex CLI does).
- Walk `sessions/**/rollout-*.jsonl` and `archived_sessions/rollout-*.jsonl`. Ignore every other file.
- Read **only the first line** of each file (`BufReader::read_line`, `File::open`) to get
  `session_meta`: `id`, `session_id`, `parent_thread_id`, `forked_from_id`, `history_base`, `source`.
- Group files into **session units** keyed by `session_id` (fallback: `id`). A unit = the root thread's
  files (base + segments ordered by the `history_base` chain) + every sub-agent thread's files.
- Read `session_index.jsonl` once per scan (titles). Missing file → no titles, no error.
- Missing `~/.codex` → the source reports `available = false`, zero sessions, no error.

### 2.2 Parsing (one unit)

Streaming, line by line (files reach tens of MB; never load a file into one string):

1. Per thread, concatenate its files in chain order. For a segment with
   `history_base.end_ordinal_exclusive = N`, the base file's lines with `ordinal ≥ N` form an
   **abandoned branch**. It is part of the history (decision D4): its messages are kept, tagged with
   `Message.branch = <id of the file that holds the branch>`, and its usage and tool calls **are
   counted** (they were really spent). The UI can split and hide them (§5).
2. Track the current turn (`task_started.turn_id`) and its model (`turn_context`). In forks, mark turns
   older than the thread id as replayed and drop every event inside them (messages, tools, usage).
3. Build messages per §1.6. Join tool outputs by `call_id`; enrich with the matching `item_completed`
   (status, exit code, duration). Inner items emitted while an `exec` call is open get
   `parent_call_id = <exec call_id>`.
4. Usage per §1.5; each usage event closes the current assistant `Message`. Cost per usage event with
   the model of its turn (per-request pricing allows long-context tiers, §4).
5. Skip heavy/irrelevant payloads without keeping them: `base_instructions`, `world_state`,
   `compacted.replacement_history`, `encrypted_content`, `Extension.result` (base64 images, up to 1 MB),
   `rate_limits` (account info, never stored).

### 2.3 Dedupe

| Duplication | Rule |
|---|---|
| `token_count` repeated | skip when `total_token_usage` equals the previous one |
| `token_count` vs `token_usage_record` | records win from the first record's ordinal on |
| Fork replay | skip turns whose UUIDv7 time < thread id time |
| 2nd `session_meta` in forks | ignore every `session_meta` after line 0 |
| User text in `response_item` and `UserMessage` | use `UserMessage` |
| Assistant text / reasoning in `item_completed` | use `response_item` |
| Same thread id in several files | merge as segments (§2.2), never as separate sessions |
| Same id in `sessions/` and `archived_sessions/` | not seen; if it happens keep the larger file, add a `ScanError` warning |

### 2.4 Sub-agents

- All sub-agent threads of a unit become `SessionDetail.subagents` (flattened; `depth > 1` agents are
  attached to the root as well, their real parent kept via `parent_tool_call_id`).
- Guardian reviews are sub-agents with `agent_type = "guardian"`. They are ~52 % of all files and add
  cost under `codex-auto-review` (price TBD). The UI should allow hiding them (§5).
- Orphans (root thread file missing, e.g. deleted; not seen in the corpus — all 605 parents were found):
  the unit has no root, so the earliest sub-agent thread becomes the session's main thread and a debug
  log line is written. They are real spend, so they are not dropped and not reported as errors.

### 2.5 Caching

Same model as Claude in `cache.rs`:
- Cache key: `(Provider, unit key)`; signature = sorted `(path, mtime, len)` of every file in the unit
  (+ `session_index.jsonl` mtime only affects titles, which are applied after parsing, so a title change
  does not reparse anything).
- Refresh: rediscover (first lines only), recompute signatures, reparse changed units in parallel with
  rayon, drop vanished units.
- First-line reads cost ~868 small reads. If profiling shows it matters, cache `path → header` by
  `(mtime, len)` too.
- Memory: the cached `SessionDetail`s are the main cost (1.7 GB of raw logs). Truncated results
  (20 KB), dropped payloads (§2.2) and no `base_instructions` should keep it far below the raw size;
  measure in the real-data smoke test and, if needed, keep only summaries + aggregates and load
  details on demand (risk R2).

### 2.6 Errors → `ScanReport`

| Situation | Behavior |
|---|---|
| File cannot be opened/read | skip the unit's file, `ScanError{path, message}`, `provider = codex` |
| First line is not a `session_meta` | `ScanError`, file ignored |
| Malformed JSON line in the middle | skip line; one `ScanError` per file with the count (`"3 malformed lines"`) |
| Truncated last line and file modified < 60 s ago | ignore silently (live session being written) |
| Unknown `type` / `payload.type` / item type | ignore silently (forward compatible) |
| Usage event with no known turn model | usage counted, model `"unknown"`, cost 0, logged once |
| Unknown model price | cost 0, logged once per model (as today) |

---

## 3. Contract changes (all additive)

### 3.1 `model.rs`

```rust
pub struct Usage {
    // … existing four fields …
    /// Reasoning tokens, already included in `output_tokens` (Codex only). Informational.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional, type = "number")]
    pub reasoning_tokens: Option<u64>,
}

pub struct ToolCall {
    // … existing fields …
    /// Call that ran this one (Codex `exec` scripts run inner tools). Used for nesting only:
    /// stats count every call, wrappers included.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub parent_call_id: Option<String>,
}

pub struct Message {
    // … existing fields …
    /// Set on messages of a discarded branch (Codex rollback): the branch id. `None` = main history.
    /// Consecutive messages with the same value form one branch.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub branch: Option<String>,
}

// `unpriced_tokens`: tokens (input + cache + output) of models with no known price, so
// `cost_usd` excludes them. Added to SessionSummary, Subagent, Totals, DayBucket and GroupBucket.
// Absent = 0. The UI shows a "sin precio" marker when > 0 (decision D2).
pub struct SessionSummary {
    // … existing fields …
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional, type = "number")]
    pub unpriced_tokens: Option<u64>,
}
// same field on Subagent, Totals, DayBucket, GroupBucket

pub struct Metrics {
    // … existing fields …
    /// Per-provider totals, sorted by cost. Present only when more than one provider has data.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub by_provider: Option<Vec<GroupBucket>>, // key = "claude" | "codex", label = "Claude" | "Codex"
}

pub struct ScanError {
    pub path: String,
    pub message: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub provider: Option<Provider>,
}

/// One provider's part of a scan.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct SourceScan {
    pub provider: Provider,
    pub source_dir: String,
    /// False when the directory does not exist (provider not installed).
    pub available: bool,
    pub sessions: u32,
    pub errors: Vec<ScanError>,
}

pub struct ScanReport {
    // existing fields keep their meaning for v1 clients:
    // source_dir = first available provider's dir, sessions = total, errors = all errors
    #[serde(default, skip_serializing_if = "Option::is_none")]
    #[ts(optional)]
    pub sources: Option<Vec<SourceScan>>,
}
```

`SessionFilter.provider` and `Provider::Codex` already exist. `Usage` derives `Copy`; `Option<u64>` keeps
it `Copy`. Adding fields to `Usage` touches every struct literal in Rust (`..Default::default()` already
used in most places); TS consumers are unaffected because the field is optional.

### 3.2 Commands

| Command | Change |
|---|---|
| `list_sessions(filter)` | none (already filters by `provider`) |
| `get_session(id)` | none; ids are thread UUIDs, unique across providers in practice (cache keys include the provider; a collision returns the most recent and logs it) |
| `get_metrics(range, provider?)` | new optional arg `provider: Option<Provider>`; filters every aggregate; fills `by_provider` when `None` and ≥ 2 providers have data |
| `get_tool_stats(range, provider?)` | new optional arg; tool names are provider-specific, so the UI groups by provider |
| `refresh()` / `get_scan_report()` | same signature; report gains `sources` |

Tauri passes missing optional args as `None`, so v1 calls keep working. `src/api.ts` gets the optional
parameter and the mock fallback filters by it.

### 3.3 Internal (not contract)

- `SessionSource` trait grows to what `cache.rs` actually needs:
  `fn source_dir(&self) -> PathBuf`, `fn discover(&self) -> Result<Vec<Unit>, AppError>` (unit = key +
  files) and `fn parse(&self, unit: &Unit) -> Result<Parsed, AppError>` where `Parsed` = detail +
  per-model usage + per-model cost + non-fatal errors (today `parse_file_with_model_costs`).
- `AppState { sources: Vec<Box<dyn SessionSource>>, cache: Mutex<Inner> }`, `Inner.entries` keyed by
  `(Provider, String)`; `refresh` loops over sources and builds one `SourceScan` each.
- `metrics::get_tool_stats` counts every `ToolCall`, wrappers included (D6); `exec` is one more tool row.

---

## 4. Pricing

### 4.1 OpenAI prices (USD per 1M tokens, Standard tier)

Source: OpenAI API pricing, <https://developers.openai.com/api/docs/pricing> (redirect target of
`platform.openai.com/docs/pricing`), read 2026-10-06. Short context = ≤ 272K input tokens per request;
long context = > 272K.

| Model | Input | Cached input | Cache write | Output | Long ctx (in / cached / write / out) |
|---|---:|---:|---:|---:|---|
| `gpt-6.1-sol` | 2.00 | 0.10 | 2.50 | 10.00 | 4.00 / 0.20 / 5.00 / 15.00 |
| `gpt-6-sol` (not seen yet) | 2.00 | 0.20 | 2.50 | 10.00 | 4.00 / 0.40 / 5.00 / 15.00 |
| `gpt-6-luna` | 0.10 | 0.01 | 0.125 | 0.50 | 0.20 / 0.02 / 0.25 / 0.75 |
| `gpt-5.6-sol` | 4.00 | 0.40 | 5.00 | 20.00 | 8.00 / 0.80 / 10.00 / 30.00 |
| `gpt-5.6-terra` | 2.00 | 0.20 | 2.50 | 12.00 | 4.00 / 0.40 / 5.00 / 18.00 |
| `gpt-5.6-luna` | 0.20 | 0.02 | 0.25 | 1.20 | 0.40 / 0.04 / 0.50 / 1.80 |
| `gpt-5.5` | 5.00 | 0.50 | — | 30.00 | TBD (only short context listed) |
| `gpt-5.4-mini` | 0.75 | 0.075 | — | 4.50 | — (short context only) |
| `gpt-5.5-mini` | unpriced | unpriced | | unpriced | not on the pricing page (D2) |
| `codex-auto-review` | unpriced | unpriced | | unpriced | not on the pricing page, guardian model (D2) |

Batch/Flex = 50 % of Standard; "Fast" (former Priority) = 2–4× depending on the model. Every
`thread_settings_applied.service_tier` seen is `default` (or absent), so Standard applies. No request in
the corpus exceeded 272K input tokens (max context window seen: 760K), but the long tier must still be
implemented because the windows allow it.

Note for the UI: Codex Desktop runs on a ChatGPT plan here (`rate_limits.plan_type`), so the cost is an
**API-equivalent estimate**, as it already is for Claude subscriptions.

Third-party pages found during research quoted different numbers for `gpt-5.6-sol`/`gpt-5.6-luna`;
only the official page above is used.

### 4.2 Token volume per model in the corpus (own turns, deduplicated)

| Model | Uncached input | Cached input | Output |
|---|---:|---:|---:|
| gpt-5.6-sol | 53.7 M | 1 365.8 M | 5.26 M |
| codex-auto-review | 22.3 M | 102.2 M | 0.26 M |
| gpt-5.6-terra | 21.7 M | 453.8 M | 2.02 M |
| gpt-6-luna | 8.3 M | 307.1 M | 1.47 M |
| gpt-5.6-luna | 6.2 M | 222.0 M | 0.64 M |
| gpt-5.5 | 4.7 M | 47.6 M | 0.29 M |
| gpt-6.1-sol | 1.7 M | 32.3 M | 0.15 M |
| gpt-5.4-mini | 0.3 M | 2.0 M | 0.02 M |

Cached input dominates (≈ 95 % of input), so the cached rate matters more than the input rate.

### 4.3 Provider-aware `pricing.rs`

- Split the table: `CLAUDE_RATES` (current) and `OPENAI_RATES`; select by `Provider`.
- OpenAI rate: `{ id, input, cached_input, cache_write: Option<f64>, output, long: Option<Tier> }`.
- **Match by exact id** after stripping a trailing date snapshot (`-YYYY-MM-DD`), not by longest prefix:
  `gpt-5.5` is a prefix of `gpt-5.5-mini` and `gpt-6-luna` would also match a future `gpt-6-luna-x`.
- Public API:
  ```rust
  pub fn cost_breakdown_for(provider: Provider, model: &str, usage: Usage, ctx: PriceCtx) -> CostBreakdown
  // PriceCtx { cache_write_5m: u64, cache_write_1h: u64, request_input_tokens: Option<u64> }
  ```
  Claude keeps its 5m/1h split; OpenAI uses `request_input_tokens` (the request's total input incl.
  cached) to pick the short/long tier. Existing `cost*` functions stay as Claude wrappers.
- OpenAI breakdown: `input = uncached × in`, `cache_read = cached × cached_in`,
  `cache_write = cache_write_input × write` (0 today), `output = output × out` (reasoning included).
- Unknown model → 0, its tokens added to `unpriced_tokens` (D2), and a one-time log naming the provider
  (today it says "Claude" for any model).
- Tests: per-model table checks, long-tier switch at 272 001 tokens, `gpt-5.5-mini` not priced as
  `gpt-5.5`, date-suffix stripping, unknown model.

---

## 5. UI impact

**Provider filter.** A segmented control in the topbar: *Todos · Claude · Codex*, stored in the URL as
`proveedor=claude|codex` (absent = all), carried by `RangeLink`/`useRangeNavigate` like the date range,
included in every query key, passed to `list_sessions` (`filter.provider`), `get_metrics` and
`get_tool_stats`. Hidden when only one provider has sessions (`ScanReport.sources`).

**Colors.** Tokens already exist (`:root[data-provider="codex"]` overrides `--brand-*`;
`useTheme.ts` hard-codes `"claude"`).
- Single provider selected (or only one with data) → set `data-provider` to it; every chart keeps
  using `--brand-*`, nothing else changes.
- *Todos* with both providers → comparison views need both palettes at once: expose static tokens
  `--color-provider-claude` / `--color-provider-codex` (the two `--brand-base` values) and use them for
  provider series; `data-provider` stays on the default for the rest.
- Model colors: `lib/models.ts` only parses `claude-(opus|sonnet|haiku)`. Add Codex families
  `sol`, `terra`, `luna`, `mini` (`gpt-<ver>-<family>`, `gpt-<ver>-mini`; plain `gpt-5.5` → `sol` tier or
  its own) and `auto-review`, colored as analogous steps of the Codex palette — no gray for real data;
  `--color-family-other` only for truly unknown ids. Labels: "Sol 6.1", "Luna 6", "Terra 5.6".

**Screens.**

| Screen | Both providers (*Todos*) | One provider |
|---|---|---|
| Resumen | KPI strip with a per-provider split line (from `by_provider`); trend chart stacked/colored by provider; models panel grouped by provider; projects merged by `project_path` | as today, in that provider's color |
| Sesiones | provider badge column, provider filter; Codex rows show `thread_name` titles | as today |
| Sesión (detail) | n/a (a session has one provider) | Codex: reasoning summaries as Thinking, `exec` blocks with nested inner calls (`parentCallId`), sub-agent list with *explorer*/*guardian* types and a toggle to hide guardian reviews, discarded branches (`branch`) shown as separate collapsible "Rama descartada" groups with a toggle to hide them all, compaction marker, "API-equivalent" cost note |
| Proyectos / proyecto | one row per path; per-provider split in the project dashboard | as today |
| Herramientas | tool names differ (`Bash` vs `shell`, `Edit` vs `apply_patch`): group the ranking by provider, or show a provider badge per row; the matrix stays per provider | as today |

**Comparisons between providers** — deferred to after v2 (D8); kept here as the plan
(only when both have data in the range): cost and tokens per
provider over time, cost per session/turn, cache-read share, tool error rate per provider, and
projects where both were used. These are client-side from `by_provider` + two filtered
`get_metrics` calls; no new command needed.

**Empty/one-sided states.** A provider whose directory is missing is not mentioned anywhere except
the scan-report notice ("Codex: no encontrado en ~/.codex"); a provider with zero sessions in the range
shows the standard empty state inside its own column/series, never an error.

Project path matching across providers: Claude and Codex both report the cwd, but casing and trailing
separators may differ on Windows → normalize (case-insensitive on Windows, strip trailing `\`) for the
grouping key, keep the original for display.

---

## 6. Tests and implementation plan

### 6.1 Anonymized fixtures

`src-tauri/tests/fixtures/codex/` — hand-written minimal JSONL (no real content: placeholder prompts,
`C:\Users\me\dev\app`, fake UUIDv7 ids with controlled timestamps), each one targeting a rule:

| Fixture | Asserts |
|---|---|
| `basic.jsonl` | header, one turn, user/assistant/reasoning, one `function_call` + output, usage mapping (input − cached) |
| `dup-token-count.jsonl` | repeated cumulative totals counted once |
| `reset.jsonl` | cumulative reset → sum of `last` still right |
| `context-only-count.jsonl` | `input = output = 0, total > 0` contributes 0 |
| `records-mid-file.jsonl` | `token_count` before the first `token_usage_record`, records after; no double count |
| `exec-inner.jsonl` | `exec` call with inner `CommandExecution` (exit 1) and `McpToolCall`; `parent_call_id` nesting, wrapper and inner calls all counted, `is_error`, durations |
| `fork/parent.jsonl` + `fork/child.jsonl` | child replays parent turns + `token_count`s; replayed turns dropped; usage = own only; 2nd `session_meta` ignored |
| `spawn/…` | parent with `SubAgentActivity(started)`, child with `thread_spawn` source; nesting, `agent_type`, `parent_tool_call_id`, totals include child |
| `guardian/…` | guardian child, `codex-auto-review` model, unknown price → 0 |
| `segments/…` | base + 2 segments with `history_base`; one session, abandoned tail tagged with `branch` and counted |
| `session_index.jsonl` | latest `thread_name` wins |
| `broken/…` | non-meta first line, malformed middle line, truncated last line |
| `model-switch.jsonl` | two turns with different models; per-model usage and `models` order |

Rust tests: parser unit tests per fixture; `pricing` tests (§4.3); `cache` test with a temp copy of the
fixture tree (read-only on the source tree: tests copy into a temp dir and only read from it — the copy
happens in the test, never in app code); multi-source `AppState` test (Claude + Codex fixtures:
provider filter, `by_provider`, `ScanReport.sources`, missing Codex dir → `available = false`).

Real-data smoke test (`#[ignore]`, like the Claude one): scans `~/.codex`, asserts no errors except
truncated live files, every session's usage equals the sum of its records where records exist, and no
fork's usage exceeds its own turns' records; prints timings and an estimate of cache memory.

Frontend (Vitest): `parseModel`/`modelOrder`/colors for GPT ids; provider URL param round-trip and its
presence in query keys; mock API filtering by provider; route smoke tests with a mixed fixture and a
Codex-only fixture; `npm run mock:gen` generates Codex sessions (sub-agents, guardian, exec nesting).

### 6.2 Steps

Step 0 (one owner, first, small): **contract commit** — §3.1 fields + optional command args, bindings
regenerated, mock generator emitting Codex sessions and `scanReport.sources`. After it, both tracks run
in parallel against the contract.

Backend track:
1. B1 — `pricing.rs` provider-aware (§4.3) with tests; unknown models → `unpriced_tokens`. Independent.
2. B2 — `SessionSource` trait refactor + multi-source `AppState` with only `ClaudeSource` (no behavior
   change; `cargo test` must stay green). **Needs `claude.rs`, so it starts after the v1.1 title work
   in `claude.rs` is committed.**
3. B3 — `sources/codex.rs` discovery + grouping (headers, segments, sub-agent trees, `session_index`).
4. B4 — Codex parser: messages, tools (incl. `exec` nesting), usage rules, fork replay, errors; fixtures.
5. B5 — register `CodexSource`; provider arg in `get_metrics`/`get_tool_stats`; `by_provider`;
   `ScanReport.sources`.
6. B6 — real-data smoke test, memory/timing measurement, fix outliers; `npm run check`.

Frontend track:
1. F1 — `api.ts` optional provider arg + mock filtering; provider in query keys.
2. F2 — URL `proveedor` param, topbar segmented control (hidden with one provider), `data-provider`
   driven by it, static provider color tokens.
3. F3 — model families for GPT ids (parse, order, labels, analogous colors).
4. F4 — Resumen/Proyectos: `by_provider` KPI split, provider-colored trend, models grouped by provider,
   "sin precio" marker wherever `unpricedTokens > 0` (also session list/detail).
5. F5 — Session detail: `parentCallId` nesting, guardian toggle, reasoning display, cost note.
6. F6 — Herramientas grouped by provider; scan-report notice per source; discarded-branch groups.

F1–F3 need only Step 0; F4–F6 can be verified against mock data before B5 lands.

### 6.3 Risks

- **R1 Format churn.** 37 CLI versions in four months, mostly alphas; event shapes changed
  (`token_usage_record` appeared at 0.149, `exec` code mode, `multi_agent_v1` → `collaboration`). Parse
  defensively, ignore unknown types, keep fixtures per shape and re-run the smoke test on upgrades.
- **R2 Volume.** 1.7 GB of logs (guardians alone are half the files). First scan time and cached
  detail memory may be much higher than Claude's; fallback is caching summaries/aggregates and loading
  details lazily.
- **R3 Fork detection relies on UUIDv7 ordering.** Verified on all 131 forks; if Codex changes id
  generation, fall back to matching replayed turn ids against the parent thread (also implemented as a
  check in the smoke test).
- **R4 Prices.** Two models TBD; pricing for new OpenAI models will be missing until the table is
  updated (cost shows 0 + log, same as Claude today).
- **R5 Live files.** Codex appends while the app reads; handled as a partial last line, never by
  locking or touching the file.
- **R6 Contract.** `Usage` gains a field used in many literals; the frontend must tolerate optional
  `reasoningTokens`, `parentCallId`, `byProvider`, `sources`.

### 6.4 Open questions

Answered on 2026-10-06; see §7.

---

## 7. Decisions (2026-10-06)

| # | Question | Decision |
|---|---|---|
| D1 | Guardian reviews | Sub-agents of their session, cost included; UI toggle to hide them. |
| D2 | Models without a public price | Unpriced for now (cost 0, flagged); table maintained by hand (see below). |
| D3 | `session_index.jsonl` for titles | Read it. |
| D4 | Discarded branches (rollback segments) | Part of the history: counted, shown, and splittable/hideable in the UI (`Message.branch`). |
| D5 | `archived_sessions/` | Included like any session; no marker field. |
| D6 | `exec` wrapper | Counted too. Prefer more data over less: every call is a `ToolCall`; `parentCallId` only nests. |
| D7 | Long-context tier (> 272K input) | Implement now. |
| D8 | Provider comparison panel | Later, not in v2. The provider filter and per-provider colors stay in v2. |

### D2 — pricing of Codex sessions

Codex logs contain **no cost per request**. The only money-related data is account state in
`token_count.rate_limits.credits` (`balance`, `has_credits`, `unlimited`), per account, not stored.
Codex costs are therefore computed like Claude's: our token counts × the price table in `pricing.rs`,
built from OpenAI's official pricing page (§4.1).

Decided:
1. **Models without a public price** (`gpt-5.5-mini`, `codex-auto-review`, and any future unknown id)
   stay **unpriced**: cost 0, logged once, and their tokens counted in `unpriced_tokens`. No assumed prices.
2. **The table is updated by hand** in `pricing.rs` (new build per change). Automatic price updates are
   a future feature, out of v2 scope (it would need a network fetch, which the read-only app does not
   do today — to be designed then).
3. **The UI flags incomplete costs**: wherever a cost includes tokens without a price, it shows a
   marker ("incluye tokens sin precio") with the token count in the tooltip. Applies to Claude too.
