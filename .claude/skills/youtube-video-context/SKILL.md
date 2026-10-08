---
name: youtube-video-context
description: Turns one or more YouTube videos into self-contained, validated analysis packages, with a transcript in the spoken language, inspected visual evidence, and a context.md that summarizes the video, assesses it and recommends what follows — written in the language the user asks for (English by default), plus an analysis.json always in English and a coordinated manifest update. The analysis angle is chosen by the agent unless the user states one. Use when the user asks to summarize, analyze, review or build the full context of videos or playlists so another agent can work without consulting the original sources.
compatibility: Requires Python 3.10+ with opencv-python-headless, Pillow and yt-dlp (scripts/requirements.txt), and internet access to download from YouTube. The scripts/ scripts are pure Python and run unchanged on Windows, Linux and macOS. The reference docs show example commands in Windows PowerShell syntax; on Linux/macOS translate them to Bash (mkdir -p, cp, standard yt-dlp flags) — the script invocations themselves do not change.
license: MIT
allowed-tools: Read Write Edit Glob Grep Bash PowerShell TaskCreate TaskUpdate TaskList
metadata:
  author: LuchoC-Dev
  version: "2.0"
---

# YouTube video context

## Goal

Turn each YouTube ID into an independent analysis package another agent can use
without watching, listening to or consulting the original video.

Each package answers three things: **what the video says**, **what it is worth**,
and **what follows from it**. The first is reporting, the last two are the
analyst's own judgment — and the contract's job is to keep those layers visible
and separate, never to suppress the judgment.

Allow one or more videos per run. Always keep one unit of output, evidence and
validation per video.

## Load the procedure

Read the reference files before processing videos. They are the source of truth:

- [references/pipeline.md](references/pipeline.md) — non-negotiable rules, run
  inputs, required output, and phases 0 to 12 (probe, download, transcript,
  frames, evidence ledger, lens).
- [references/authoring.md](references/authoring.md) — how to choose the analysis
  lens, the `context.md` and `analysis.json` contracts, canonical headings, the
  six evidence classes, and how to write the assessment and the recommendations.
- [references/validation.md](references/validation.md) — validator, manual
  reviews, manifest, final report, recovery.
- [references/troubleshooting.md](references/troubleshooting.md) — common
  failures and the reusable subagent prompt.

Read `pipeline.md` and `authoring.md` before writing anything. Read the other
two when you reach validation or hit a problem.

If the host project defines its own rules in its agent instructions file
(`CLAUDE.md`, `AGENTS.md` or the equivalent), those rules take
precedence. Report any contradiction in the final report instead of silently
resolving it.

## The analysis lens

Every video is analyzed through one lens: the angle that makes the analysis
useful.

**By default you choose it yourself**, from the material, after building the
evidence ledger and before drafting. Do not ask the user for one they did not
mention — deciding the angle is part of the job. If they do state an angle, in
any form, that angle wins and you do not renegotiate it.

Declare the lens in the `analysis_lens` header field, mark `lens_chosen_by` as
`agent` or `user`, and justify it in two to four sentences in the document. The
lens governs **emphasis, never coverage**: nothing material disappears because it
sits off-angle, and a critical lens still reports what the source gets right.

`authoring.md` has the selection rules and the shapes a lens usually takes.

## Evidence classes

Six, and every material claim belongs to exactly one:

| Class | Whose voice |
|---|---|
| Direct source | The video states or demonstrates it |
| Visual confirmation | It materially appears in an inspected frame |
| Time-bound claim | True as recorded, may have changed |
| Unverified claim | Asserted without sufficient primary evidence |
| **Analyst judgment** | Your opinion or evaluation, stated as such |
| **Recommendation** | Your actionable advice, with rationale and confidence |

The two analyst classes are what make this package an analysis rather than a
transcript. They are not a loophole: a judgment stated as a judgment is honest,
and the same sentence written as "the source states" is fabrication. Ground every
judgment in something specific — a quote, a frame, an omission, a contradiction.

## Language contract

This is the rule that gets broken most often. There are two layers and **they do
not share a language**:

| Layer | Language | Translated |
|---|---|---|
| `source/`, `transcript/source.vtt`, `transcript/source.txt` | The spoken one, fragment by fragment | Never |
| `deliverables/context.md` | The `output_language` the user asks for, **`en` by default** | Yes, entirely |
| `deliverables/analysis.json` | **English, always**, whatever the rest is | Yes, entirely |

- The video's language does **not** determine the dossier's language. A French
  video with the default output produces an English `context.md`.
- `context.md` is written in one language with no exceptions: headings, tables,
  bullets and **quotes**. Quotes are translated and keep their timestamp, which
  is what keeps them verifiable against `transcript/source.txt`.
- The twelve canonical headings live in `authoring.md`, in English and in
  Spanish. For any other language, translate them **all at once** before
  drafting and reuse that translation for the whole batch.
- `analysis.json` stays in English even when `context.md` is in Spanish. Only
  `source.title` and `source.creator` keep the original.
- A video may have several languages: record the secondary ones and keep each
  transcript fragment as it was spoken.
- **No script checks any of this.** The validator does not look at languages.
  Before closing a package, re-read the headings and confirm all twelve are in
  the same language, and that `analysis.json` has no values in another.
- Banning machine translation refers to the **source**. Translating the final
  product is a different thing and is allowed, because it happens after the real
  source has been analyzed.

## Skill contents

Everything the pipeline needs lives inside this folder:

```text
SKILL.md
references/
  pipeline.md        phases 0-12, rules, inputs, output
  authoring.md       lens, context.md and analysis.json contracts
  validation.md      validator, manifest, reporting, recovery
  troubleshooting.md common failures, reusable prompt
scripts/
  preflight.py                   verifies the interpreter; never installs
  extract-video-frames.py        20 uniform frames from 0% to 95%
  extract-adaptive-frames.py     scene changes, timeline anchors, coverage.json
  extract-frame-sequence.py      dense frames around a transition or action
  extract-supplemental-frame.py  one frame at a given timestamp
  vtt-to-clean-transcript.py     VTT -> clean transcript without duplication
  make-contact-sheet.py          paginatable 4-column labeled contact sheets
  validate-dossier.py            structural validator for the v2 contract
  requirements.txt               Python dependencies
```

Every script under `scripts/` is pure Python and runs unchanged on any OS. This
is what removes the old Windows-only blocker — no `System.Drawing`, no
PowerShell-only APIs anywhere in `scripts/`. Always call them through their path
inside the skill, with the resolved interpreter. Define at the start:

```text
skillRoot = "<absolute-path-to-this-skill>"
workspace = "<absolute-path-to-the-output-workspace>"
pythonExe = "<absolute path printed by preflight.py>"
```

Every invocation is `"<pythonExe>" "<skillRoot>/scripts/<name>.py" <args>`.

## The environment boundary

Requires Python 3.10+ with `opencv-python-headless`, `Pillow` and `yt-dlp`. These
belong to the environment, not to the skill.

**This skill consumes an environment. It never modifies one.** Forbidden without
exception, for the coordinator and for every worker:

- installing, downloading, upgrading or switching a **Python interpreter**;
- installing packages with `pip`, `conda`, `winget`, `brew`, `apt` or anything
  else;
- creating or activating a virtual environment;
- modifying `PATH` or anything else that changes which interpreter runs;
- installing `yt-dlp`, `ffmpeg` or any other tool at system level.

If something is missing, **stop and report it with the exact command the user can
run.** A missing dependency is a reported outcome, not a problem to route around.
Installing a second interpreter does not fix a broken environment — it creates
one, and leaves the machine changed in a way nobody asked for.

### Resolve the interpreter once

Before any other work, the **coordinator** runs the preflight exactly once:

```text
python "<skillRoot>/scripts/preflight.py"
```

It reports the absolute interpreter path, the version, and whether every required
package imports. It never installs anything. Take its `interpreter` value as
`pythonExe` and use it, quoted, in every later command — including the ones you
pass to subagents.

Do not call the bare name `python` again after this point: which interpreter that
resolves to depends on `PATH`, on the shell and on the launching process, and
those are not guaranteed to match between the coordinator and a subagent.

If the preflight fails, stop the whole run. Do not start a batch hoping the
workers will fare better.

### Workers never touch the environment

Every subagent receives `pythonExe` in its prompt, does **not** run the preflight,
does **not** verify or repair anything, and uses that interpreter verbatim. If it
cannot run it, it stops and reports the exact error; the coordinator decides what
happens next.

This is not only about permissions. Several workers running `pip install`
concurrently against the same site-packages is a race, and on Windows the loser
hits a locked file and reports a broken environment that is not broken.

If `yt-dlp` is on the `PATH`, it can be used directly instead of
`"<pythonExe>" -m yt_dlp`. Do not install one if it is not.

## Capabilities this skill needs

The skill is written against **capabilities, not tool names**, so it runs on any
agent that has them. Map each capability to whatever your environment calls it,
once, before starting:

| Capability | What the skill does with it | Required |
|---|---|---|
| `run-shell` | Run `yt-dlp` and the skill's Python scripts | Yes |
| `read-file` | Read the manifest, transcripts and metadata | Yes |
| `write-file` | Create `context.md` and `analysis.json` | Yes |
| `edit-file` | Update `manifest.json` without rewriting it whole | Yes |
| `search-files` | Locate existing packages, frames or entries | Yes |
| **`view-image`** | **Inspect frames and contact sheets as images** | **Yes** |
| `spawn-subagent` | One worker per video, only when the user asks for parallelism | No |
| `track-progress` | Show batch status during long runs | No |

`view-image` is the one that cannot be substituted. The pipeline's core claim is
that a human-free package saw what the video showed, and an agent that cannot
look at a `.png` cannot make that claim honestly — it can only fabricate it. If
your agent has no image input, **stop and report that**; do not run the visual
phases and declare them done.

Known mappings:

| Capability | Claude Code | Codex | Generic |
|---|---|---|---|
| `run-shell` | `PowerShell` / `Bash` | shell command tool | any shell |
| `read-file` | `Read` | filesystem read | `cat` |
| `write-file` | `Write` | `apply_patch` | editor |
| `edit-file` | `Edit` | `apply_patch` | editor |
| `search-files` | `Glob`, `Grep` | `rg --files`, `rg` | `find`, `grep` |
| `view-image` | `Read` on the image | `view_image` | multimodal read |
| `spawn-subagent` | `Agent` | collaboration subagent | — |
| `track-progress` | `TaskCreate` / `TaskUpdate` | `update_plan` | — |

Where this document says *inspect*, it means `view-image`. Listing or counting
files is never inspection, on any agent.

Environment notes:

- Every call into `scripts/` is `"<pythonExe>" "<path>/script.py" <args>`,
  identical on Windows, Linux and macOS. `pipeline.md` shows the surrounding
  orchestration
  (creating folders, invoking `yt-dlp`, reading metadata) as Windows PowerShell
  examples; on Linux/macOS run the equivalent Bash (`mkdir -p`, `cp`, the same
  `yt-dlp` flags) — only the shell glue changes, not the script calls or their
  arguments.
- Windows PowerShell 5.1 supports neither `&&` nor `||`. Chain with `;` or
  `if ($?) { ... }`.
- Visual inspection is **not optional and not simulated**: you must open
  `contact-sheet.jpg` with `view-image` and actually look at it before writing
  the dossier. Counting files is not inspecting.

## Run long steps in the foreground

Every step in this pipeline runs **in the foreground**, and you wait for it to
finish inside the same turn. The adaptive scan takes minutes on a long video;
that is expected, and it is not a reason to detach it.

Never hand a step to a background job, a detached process or a queue and then end
your turn waiting to be told it finished. That failure has a shape: the worker
detaches the extraction, reports "waiting for the background task", stops, gets
resumed, finds nothing new, and waits again — while the job it is waiting for
died at launch and will never report anything. The run makes no progress and the
transcript fills with status updates about work nobody is doing.

If a step is slow, let it be slow. If you genuinely must detach one, you own
polling the filesystem for its output and acting on what you find; "I am waiting
for a notification" is not a state this pipeline has.

`extract-adaptive-frames.py` prints progress to stderr so a foreground run
visibly advances. Use `--quiet` only when the output is a problem.

## Resolve the scope

1. Resolve `<workspace>`: the path the user stated; otherwise a directory that
   already contains `videos/` or `manifest.json`; otherwise the current one.
2. Resolve `output_language`: the one the user asked for; if they said nothing,
   `en`. Do not ask if they did not mention it, and do not infer it from the
   video's language.
3. Note any analysis angle the user stated. If they stated none, you will choose
   one per video in phase 12 — do not ask.
4. Get the exact list of requested IDs or URLs.
5. Resolve `visual_profile`: use an explicit user choice; otherwise use `auto`.
   Force `visual-heavy` when meaning depends on visuals, including design
   styles, UI, slides, diagrams, code, motion, before/after states, silent
   demonstrations or fine visible text. Never downgrade an explicit
   `visual-heavy` request based on automatic metrics.
6. If `output_language` is neither `en` nor `es`, translate the twelve
   canonical headings once, before writing the first dossier.
7. Query the current playlist when the user provides one and it determines
   identity, ordering or what is pending.
8. Cross-check every ID against `manifest.json` if it exists.
9. Derive a readable, stable folder name from each official title, without the
   YouTube ID.
10. Do not redo complete packages unless a correction is explicitly requested.
11. Inspect and resume partial packages without deleting them.

Do not ask for data that can be resolved from the metadata or the workspace.

## Coordinate one or more videos

Apply the full pipeline separately to each ID.

By default, process videos **sequentially on the main thread**. Only when the
user explicitly asks for parallelism, use `spawn-subagent`:

- one general-purpose subagent per video, with the ID, the stage, `skillRoot`
  and `workspace` in the prompt;
- run in waves if concurrency is limited;
- the main thread acts as coordinator: it inspects results and is the **sole
  owner of writes to `manifest.json`**;
- each subagent writes only inside its own video directory;
- directories and temporary files isolated per ID.

Never merge several videos into a single dossier. One ID failing does not
invalidate the approved packages of the others. Each video gets its own lens:
do not carry one video's angle over to the next.

For batches of more than one video, register each ID with `track-progress` when
the agent has it, so the user sees status during long work.

## Run each package

For each video:

0. Use the `pythonExe` the coordinator resolved. As a worker, never run the
   preflight yourself and never install anything.
1. Probe metadata and original tracks before downloading.
2. Create the folder as `<workspace>/videos/<title-slug>/`. Derive the slug from
   the official title; never prepend, append or embed the YouTube ID.
3. Determine `source_language`, any secondary languages,
   `transcript_language` and `context_language` (= `output_language`).
4. Silently download the video, metadata and original captions; use up to 360p
   for `standard` and up to 720p for `auto` or `visual-heavy` when available;
   never play audio.
5. Create `deliverables`, `transcript`, `visual/frames` and `source`.
6. Clean the transcript with `scripts/vtt-to-clean-transcript.py` and review its
   start, middle, end, duration, duplication and terminology.
7. Extract twenty uniform frames with `scripts/extract-video-frames.py` and
   build the sheet with `scripts/make-contact-sheet.py`.
8. Inspect the sheet with `view-image` and add supplemental frames with
   `scripts/extract-supplemental-frame.py` for material scenes that were missed.
9. For `auto` or `visual-heavy`, run `scripts/extract-adaptive-frames.py` in the
   foreground, build paginated `adaptive-contact-sheet-*.jpg` files and inspect
   every page with `view-image`. Automatic `auto` may resolve to `standard` or
   `visual-heavy`; explicit visual topics must already have selected
   `visual-heavy`. For transitions, animations or actions whose meaning changes
   over time, extract and inspect a sequence with
   `scripts/extract-frame-sequence.py`. After genuine inspection, set the
   corresponding `manual_review` values in `visual/coverage.json` to `true` and
   record limitations in `notes`.
10. Build a ledger separating direct source, visual confirmation, time-bound
    claims, unverified claims, promotions, your judgments and your
    recommendations — each judgment anchored in what produced it.
11. Choose the analysis lens from the ledger, unless the user stated one, and
    write down its rationale before drafting.
12. Write a self-contained `context.md`, entirely in `context_language`, with the
    twelve canonical headings in that language and quotes translated with their
    timestamps. It must contain a general summary that covers the whole video,
    full coverage of what the source says, an assessment that reaches a verdict,
    and recommendations with rationale and confidence.
13. Write `analysis.json` against schema 2.0 with **all of its content in
    English**, except `source.title` and `source.creator`.
14. Run `scripts/validate-dossier.py` with the expected visual profile and
    perform every manual review.
15. Update the manifest only if the package reaches `PASS`.

## Protect the evidence

- Do not use machine translations as the primary source.
- Do not invent names, terms, scenes or results.
- Do not present an interface as proof of a working integration.
- Do not turn a demonstration into a production claim.
- Report promotions as provenance and bias, never as findings.
- Explicitly label time-bound and unverified claims.
- Label every judgment as a judgment, and anchor it in the ledger.
- Give every recommendation a rationale and an explicit confidence.
- Raise privacy, consent, security, accessibility, licensing or policy concerns
  only when the material raises them, and say what triggers them. Do not import
  a standing checklist.
- Criticize the work, never the creator as a person.
- Never declare an image inspected if it was not opened with `view-image`.

## Validate before declaring it done

Run for each package:

```text
"<pythonExe>" "<skillRoot>/scripts/validate-dossier.py" \
  --video-dir "<videoDir>" \
  --expected-folder-name "<folderName>" \
  --expected-visual-profile "<standard|auto|visual-heavy>"
```

The validator is **structural**: files, schema, frames, the duration-scaled word
minimum, coherence with the metadata, and — for `auto` and `visual-heavy` — the
declared adaptive timeline coverage and review flags. It confirms that a lens, an
assessment and recommendations exist and are well-formed; it cannot judge whether
they are any good, it does not understand the semantics of the images, and it
does not check languages.

Beyond `PASS`, manually confirm:

- the source language was correctly identified;
- the body of `context.md` really is in `context_language`, quotes included;
- translated quotes are faithful to the original and carry timestamps;
- the transcript is coherent and in the spoken language;
- the contact sheet was actually opened with `view-image`;
- every adaptive sheet and temporal sequence was inspected when present;
- `coverage.json` truthfully records those reviews and any limitations;
- the general summary covers the whole video and stands alone;
- the lens fits the material and did not suppress anything material;
- every judgment is labeled and grounded, and the assessment reaches a verdict;
- recommendations come from this video, not from generic best practice;
- coverage of demonstrations and numbered items;
- the dossier's autonomy;
- honest separation of the evidence classes;
- every cited frame exists;
- the folder name equals the title slug and has no YouTube ID.

After copying or consolidating files, validate again from the package's final
directory.

If the validator fails, say so with its output. Never present a package as
finished without `PASS`.

## Report the result

Deliver metrics and limitations per video:

- the interpreter used (`pythonExe`), reported once for the batch;
- ID, title, languages and duration;
- package directory;
- caption or transcript source;
- the analysis lens and who chose it;
- transcript and dossier word counts, plus the duration-scaled requirement;
- topics and recommendations;
- the verdict in one line;
- resolved visual profile, source resolution, uniform, adaptive, sequence and
  supplemental frames;
- sheets inspected;
- validator result;
- limitations;
- manifest status.

For several videos, add totals of requested, complete, failed, pending and
entries added. Never hide an individual failure behind an aggregate status.
