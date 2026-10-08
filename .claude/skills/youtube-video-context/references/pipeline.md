# Pipeline

The operational manual for turning **one or more YouTube videos** into
self-contained analysis packages for another agent.

Related references:

- [authoring.md](authoring.md) — how to write `context.md` and `analysis.json`
- [validation.md](validation.md) — validation, manifest, reporting, recovery
- [troubleshooting.md](troubleshooting.md) — common failures and a reusable prompt

## Purpose

The unit of work and of output is always one video: each ID produces its own
directory, transcript, visual evidence, dossier, structured analysis and
validation result. A run may process a single ID or a list of IDs, sequentially
or in parallel, without mixing their artifacts.

The consuming agent must not need to watch, listen to, open or consult the
original video. The final package must preserve:

- a general summary of what the video is and says, end to end;
- what the creator said, topic by topic;
- what the video materially showed;
- the sequence and provenance of the source;
- the analyst's own assessment of the material, labeled as such;
- recommendations that follow from the analysis, with their rationale;
- the limits of the evidence and what the source left unresolved.

The system applies this transformation independently to each video:

```text
each YouTube ID
  -> source evidence in the spoken language
  -> clean transcript
  -> inspected visual evidence
  -> evidence ledger
  -> chosen analysis lens
  -> self-contained context.md
  -> interoperable analysis.json
  -> validation
  -> independent manifest entry
```

Concurrency does not change the contract: every video must produce a complete,
self-contained, validated package. Never generate a combined dossier for several
videos, and never let one video write inside another's directory.

## Running on any agent

The `scripts/` scripts are pure Python and run unchanged on Windows, Linux and
macOS. This manual shows the surrounding orchestration — creating folders,
invoking `yt-dlp`, reading metadata — as Windows PowerShell examples, since that
was the original environment. On Linux/macOS, run the equivalent Bash: `mkdir
-p` instead of `New-Item`, `cp` instead of `Copy-Item`, the same `yt-dlp` flags.
Only the shell glue changes; the script paths and arguments do not.

This manual names **capabilities**, not the tools of any one agent. `SKILL.md`
has the mapping table for Claude Code, Codex and a generic agent; resolve it once
before starting.

- Run command blocks with `run-shell`: PowerShell on Windows, Bash on
  Linux/macOS.
- Windows PowerShell 5.1 does not support `&&` or `||`; chain with `;` or
  `if ($?) { ... }`.
- Read files with `read-file`, search with `search-files`, write deliverables
  with `write-file`, and modify the manifest with `edit-file` after re-reading
  it.
- **Inspecting visual evidence means opening the `.png` or `.jpg` with
  `view-image`**, so the agent sees the image directly. Listing or counting files
  is not inspection and does not license any claim that a scene was seen. An
  agent without `view-image` cannot run the visual phases and must say so.
- Do not use subagents unless the user explicitly asks. When they do, use
  `spawn-subagent` with one general-purpose worker per video.
- For batches of more than one video, reflect progress with `track-progress`
  when the agent has it.

### Long steps run in the foreground

Every phase here runs in the foreground and is awaited in the same turn. The
adaptive scan takes minutes on a long video; that is expected and is not a reason
to detach it.

Do not hand a phase to a background job or detached process and then end your
turn waiting to be told it finished. The observed failure mode is a worker that
detaches the extraction, announces it is "waiting for the background task",
stops, gets resumed, finds nothing new and waits again — while the job died at
launch. Nothing progresses and no one notices, because every report says work is
under way.

If you do detach something, you own polling for its output and acting on what
you find. "Waiting for a notification" is not a state this pipeline has.

### Paths and dependencies

The skill is self-sufficient: every script it needs lives in its own `scripts/`
directory. In this manual, `<skill>` is the folder containing this skill's
`SKILL.md`, and `<workspace>` is the directory where the user wants the video
packages, resolved at run time (by default, the current working directory).

```text
<skill>/
  SKILL.md
  references/
    pipeline.md
    authoring.md
    validation.md
    troubleshooting.md
  scripts/
    preflight.py
    extract-video-frames.py
    extract-adaptive-frames.py
    extract-frame-sequence.py
    extract-supplemental-frame.py
    vtt-to-clean-transcript.py
    make-contact-sheet.py
    validate-dossier.py
    requirements.txt
```

Every script under `scripts/` is pure Python and runs identically on Windows,
Linux and macOS. Define these three values once at the start and reuse them
everywhere:

```text
skillRoot = "<absolute-path-to-the-skill>"
workspace = "<absolute-path-to-the-workspace>"
pythonExe = "<absolute path printed by preflight.py>"
```

Every script invocation is `"<pythonExe>" "<skillRoot>/scripts/<name>.py" <args>`.

## The environment boundary

External dependency of the environment, **not** of the skill:

- **Python 3.10+** with the packages in `scripts/requirements.txt`
  (`opencv-python-headless`, `Pillow`, `yt-dlp`).

This skill **consumes** an environment. It never modifies one. The following are
forbidden without exception, for the coordinator and for every worker:

- installing, downloading, upgrading or switching a **Python interpreter**;
- installing packages with `pip`, `conda`, `winget`, `brew`, `apt` or anything
  else;
- creating or activating a virtual environment;
- modifying `PATH` or any other environment variable that changes which
  interpreter runs;
- installing `yt-dlp`, `ffmpeg` or any other tool at system level.

If something is missing, **stop and report it to the user with the exact command
they can run.** A missing dependency is a reported outcome, not a problem to
route around. Installing a second interpreter does not fix a broken environment;
it creates one, and it leaves the user's machine changed in a way they did not
ask for.

### Resolving the interpreter, once

Before any other work, the **coordinator** — the main thread, never a worker —
runs the preflight exactly once:

```text
python "<skillRoot>/scripts/preflight.py"
```

It prints the absolute path of the interpreter it ran under, its version, and
whether every required package imports. It **never installs anything**. On
success it exits 0 and prints `"result": "PASS"`. On failure it exits non-zero
and prints the command the user can run.

Take the `interpreter` value from that output and use it as `pythonExe` for the
entire run, quoted, in every command. Do not call the bare name `python` again:
which interpreter that resolves to depends on `PATH`, on the shell, and on the
process that launched it, and those are not guaranteed to be the same for a
subagent as for the coordinator.

If the preflight fails, stop the whole run and report it. Do not start a batch
hoping the workers will fare better.

### Workers never touch the environment

When the user asked for parallelism, every subagent receives `pythonExe` in its
prompt and:

- **does not run the preflight** — it was already run;
- **does not verify, install or repair anything**;
- uses the `pythonExe` it was given, verbatim.

This is not only about permissions. Several workers running `pip install`
concurrently against the same site-packages is a race: on Windows the loser hits
a locked file and reports a broken environment that is not broken. A worker that
then "fixes" it by installing another interpreter corrupts the run for everyone
and the machine for the user.

If a worker cannot run `pythonExe`, it **stops and reports that**, with the exact
error. The coordinator decides what happens next.

If `yt-dlp` is also available as an executable on the `PATH`, you may use it
instead of `"<pythonExe>" -m yt_dlp`. Do not depend on a binary located outside
the skill or the `PATH`, and do not install one.

## Definition of success

A video is complete only when:

1. the real source language and its secondary languages are known;
2. the captions or transcript remain in the spoken language;
3. a source video at the profile-appropriate resolution and its metadata are
   preserved;
4. the transcript has been cleaned and reviewed;
5. twenty uniform frames were extracted;
6. the uniform contact sheet was inspected with `view-image`;
7. important scenes missed by uniform sampling have supplemental frames;
8. `auto` and `visual-heavy` runs include inspected adaptive sheets and bounded
   timeline coverage; material motion has inspected frame sequences;
9. an analysis lens was chosen, justified and declared;
10. `context.md` is self-contained, summarizes the whole video, states the
    analyst's assessment and recommendations as such, respects evidence limits,
    and is written entirely in `context_language`;
11. `analysis.json` satisfies schema 2.0 and is written entirely in English;
12. every cited visual file exists;
13. the skill validator passes;
14. the manifest reflects only resources that physically exist.

The mere existence of files does not mean success. The agent must inspect and
reason about their content. When a run includes several videos, it ends when
each ID has its own complete package or is explicitly reported as failed or
pending — never by presenting the whole batch as complete.

# 1. Non-negotiable rules

## Source integrity

- Work by YouTube ID, not only by the visible title.
- Preserve the spoken language across all evidence: `source/` and `transcript/`
  are never translated.
- Translate the product — `context.md` and `analysis.json` — to the language
  required by the language contract, always after analyzing the real source.
- Never use machine-translated captions as the primary source.
- Prefer original manual captions when they faithfully represent the audio.
- Otherwise, prefer the track marked `Original` or `*-orig`.
- If no reliable original captions exist, transcribe the audio directly in the
  spoken language.
- Do not invent corrections for uncertain names or technical terms.

## Silent processing

- Never play audio for the user.
- Do not open or play the YouTube video in a browser.
- Download the source silently with `yt-dlp`.
- Inspect visual evidence through locally extracted frames.

## Evidence discipline

For every important claim, distinguish six classes. The first four describe the
source; the last two are the analyst speaking:

- **Direct source**: the video states or demonstrates it.
- **Visual confirmation**: it materially appears in inspected frames.
- **Time-bound claim**: it may have changed since recording.
- **Unverified claim**: asserted without sufficient primary evidence.
- **Analyst judgment**: the analyst's opinion or evaluation of the material.
- **Recommendation**: actionable advice the analyst derives from the analysis.

The analyst's voice is expected in this pipeline, not merely tolerated. The
package is an analysis, and an analysis without a position is a transcript with
extra steps. What is forbidden is the *blur*: a judgment written as if the source
had said it, or a recommendation presented as a finding.

Never turn a demonstration into a claim of production implementation. Never
infer operational integrations from a visual panel alone.

## Safety and quality

- Preserve previous experiments and completed dossiers.
- Do not overwrite an existing package without an explicit correction request.
- Separate promotions from the analysis; report them as provenance and bias.
- Raise privacy, consent, security, authorization, licensing or policy concerns
  when **the material raises them**, and say why they apply here. Do not append
  a standing checklist to every video.
- Criticize the work, never the creator as a person.
- Do not recommend deceptive practices: fabricated proof, hidden consent,
  manufactured urgency or manipulative pricing.

# 2. Run inputs

The agent must receive one or more IDs. For each video it must resolve these
values before creating its package:

```yaml
video_id: "YouTube ID"
video_url: "https://www.youtube.com/watch?v=<ID>"
playlist_url: "optional playlist used to determine ordering"
stage: "optional batch label, for example batch-1"
workspace: "absolute directory where videos/ and manifest.json will live"
output_language: "language of context.md; defaults to en"
analysis_lens: "optional; when absent, the agent chooses it per video"
visual_profile: "standard, auto or visual-heavy; defaults to auto"
```

`output_language` is given by the user and applies to the whole run. If they do
not state one, it is `en`. Do not infer it from the video's language: the
language of the source and the language of the product are independent
decisions.

`analysis_lens` is **optional and per video**. The default is that the agent
picks the lens itself, from the material, in phase 12. If the user states an
angle — in a full sentence, in passing, or for the whole batch — that angle wins
and is recorded with `chosen_by: "user"`. Do not ask for a lens the user did not
mention: choosing it is the agent's job. See
[authoring.md](authoring.md) for how to choose and justify one.

If `output_language` is neither `en` nor `es`, translate the twelve canonical
headings from [authoring.md](authoring.md) once, before drafting the first
dossier, and reuse that translation for every video in the batch. A
half-translated language is exactly the defect this contract removes.

For a multi-video run, the input may be expressed as:

```yaml
videos:
  - video_id: "ID-1"
    stage: "batch-N"
  - video_id: "ID-2"
    stage: "batch-N"
```

Each element of `videos` starts the same isolated pipeline described here.
Derived metadata, temporary directories and deliverables are never shared
between elements.

Resolve `workspace` like this, without inventing paths:

1. the path the user explicitly stated;
2. an existing directory in the project containing `videos/` or `manifest.json`;
3. the current working directory.

Confirm the choice with the user only if options 1 and 2 do not apply and the
current directory is not empty.

The agent will derive:

```yaml
title: "title from metadata"
creator: "uploader or channel from metadata"
duration_seconds: 0
source_language: "main spoken language of the video"
secondary_languages: ["other languages present in the audio, if any"]
transcript_language: "language the transcript stays in; same as the source"
context_language: "language of context.md; same as output_language"
analysis_lens: "the lens for this video, chosen by the agent unless the user stated one"
visual_profile: "the resolved visual profile for this video"
slug: "lowercase-title-slug"
folder_name: "title-slug-without-youtube-id"
```

`slug` and `folder_name` must be the same value. Derive them from the official
metadata title: lowercase it, replace runs of non-letter, non-digit characters
with hyphens, collapse repeated hyphens and trim hyphens at the edges. Keep
valid Unicode letters. Do not prepend, append or embed the YouTube ID.

If two titles produce the same name, do not use the ID to disambiguate. First
check whether one of the titles was truncated or incorrectly localized. If the
collision persists, stop and ask for a human label based on the title before
creating the second package.

# 3. Required output

For a video whose title produces `<title-slug>`, create inside `<workspace>`:

```text
videos/
  <title-slug>/
    deliverables/
      context.md
      analysis.json
    transcript/
      source.txt
      source.vtt
    visual/
      frames/
        frame-00pct.png
        frame-05pct.png
        frame-10pct.png
        frame-15pct.png
        frame-20pct.png
        frame-25pct.png
        frame-30pct.png
        frame-35pct.png
        frame-40pct.png
        frame-45pct.png
        frame-50pct.png
        frame-55pct.png
        frame-60pct.png
        frame-65pct.png
        frame-70pct.png
        frame-75pct.png
        frame-80pct.png
        frame-85pct.png
        frame-90pct.png
        frame-95pct.png
        contact-sheet.jpg
        adaptive-<milliseconds>ms.png
        adaptive-contact-sheet-01.jpg
        sequence-<label>-<milliseconds>ms-<index>.png
        sequence-contact-sheet-01.jpg
        supplemental-<seconds>s.png
        supplemental-contact-sheet.jpg
      coverage.json
    source/
      video.mp4
      metadata.json
      video.<language>.vtt
      video.<language>-orig.vtt
```

Supplemental files are optional, but become mandatory when uniform sampling
misses material evidence. They never replace the twenty uniform frames.
Adaptive files and `coverage.json` are mandatory for `auto` and `visual-heavy`.
The adaptive scan complements rather than replaces the uniform baseline.

`<workspace>/manifest.json` is the inventory of the collection. If it does not
exist, create it as `{ "videos": [] }` before the first entry.

# 4. Full flow

## Coordinating several videos

If the input contains several IDs:

1. first cross-check every ID against `manifest.json` and, when one exists, the
   current playlist;
2. derive a distinct directory for each video from its official title, without
   including its ID;
3. run phases 0 to 12 independently for each ID;
4. process sequentially unless the user asks for parallelism;
5. use separate variables, temporary files and logs per video;
6. validate each package individually;
7. update the manifest only for videos that reached `PASS`;
8. serialize writes to `manifest.json` so two processes cannot overwrite each
   other's changes;
9. deliver results and limitations per video, plus the batch summary.

One video failing does not invalidate the complete packages of the others. Nor
does it authorize marking the failed video as done.

The default mode is sequential on the main thread. When the user explicitly
asks for parallelism, the recommended split is one general-purpose
`spawn-subagent` worker per video, with the main thread as batch coordinator. Each subagent
receives the ID, the stage, `<skill>`, `<workspace>`, **`pythonExe`** and the
instruction to read this manual in its prompt; it produces and validates only its
own package, and writes only inside its own `videoDir`. The coordinator checks
results, is the only writer of `manifest.json`, and produces the aggregate
summary.

`pythonExe` is not optional in that prompt. A worker that has to work out which
interpreter to use will eventually work it out differently from its siblings, and
a worker that hits an environment error without being told the boundary will
eventually try to fix the environment. Both have already happened. The
coordinator resolved the interpreter once; the workers use that value and touch
nothing.

## Phase 0: inspect the workspace

Before modifying anything:

1. resolve `<workspace>` per section 2;
2. read `manifest.json` with `read-file` if it exists;
3. check whether the ID is already inventoried with `search-files`;
4. check whether a partial directory exists with `search-files`;
5. run `scripts/preflight.py` **once, as the coordinator**, and record the
   `interpreter` it prints as `pythonExe`. If it fails, stop the run and report
   the missing dependency with the command the user can run. Never install
   anything, and never repeat this step inside a worker.

If the ID is already complete, stop unless the user requested a verified
correction. If a partial directory exists, inspect it and resume the work. Do
not delete it or restart blindly.

If the host project defines its own rules in its agent instructions file
(`CLAUDE.md`, `AGENTS.md` or the equivalent), those rules take
precedence over this manual. Report any contradiction in the final report
instead of silently resolving it.

## Phase 1: confirm identity and playlist position

When the user provides a playlist, query it before computing what is pending:

```powershell
$playlistUrl = "<playlist-url-given-by-the-user>"
& "$pythonExe" -m yt_dlp `
  --flat-playlist `
  --dump-single-json `
  --quiet `
  $playlistUrl
```

Cross-check the IDs against `manifest.json`. Do not trust visible or localized
titles as identifiers.

Record:

- current number of videos;
- current position of the video;
- exact ID;
- source title from metadata.

If there is no playlist, skip this phase and work only with the received IDs.

## Phase 2: probe metadata before downloading

Query the video without downloading media:

```powershell
$videoId = "<ID>"
$videoUrl = "https://www.youtube.com/watch?v=$videoId"

$metadataProbe = & "$pythonExe" -m yt_dlp `
  --no-playlist `
  --skip-download `
  --dump-single-json `
  --quiet `
  $videoUrl | ConvertFrom-Json
```

Inspect at minimum:

```powershell
$metadataProbe.id
$metadataProbe.title
$metadataProbe.uploader
$metadataProbe.duration
$metadataProbe.language
$metadataProbe.subtitles.PSObject.Properties.Name
$metadataProbe.automatic_captions.PSObject.Properties.Name
```

Do not request English captions by default. First determine the real language
and the original tracks available.

## Phase 3: determine the real language

Use this order of confidence:

1. an audio or caption track explicitly marked `Original`;
2. a manual track matching the spoken language;
3. the `language` field from metadata;
4. inspection of the transcript content;
5. the visible title, only as weak evidence.

A title in one language does not prove the audio is in that language. YouTube
localizes titles automatically; this is the most common cause of a dossier
written about the wrong source language.

Resolve these explicit values:

```yaml
source_language: "..."
secondary_languages: []
transcript_language: "..."
context_language: "..."
```

`source_language` and `transcript_language` almost always match: evidence is
preserved as it was spoken. `context_language` is independent and comes from
`output_language`.

### Videos with more than one language

A video does not always have a single language. The presenter may quote a text
in another language, a guest may appear, or an interface may be shown in a
third one.

- `source_language` is the main language of the audio, not the only one.
- Record the others in `secondary_languages` when they appear materially, not
  for a single stray word.
- The transcript keeps **each fragment in the language it was spoken in**. Never
  homogenize it.
- Choosing the caption track is still governed by the main language.
- If a fragment in a secondary language supports an important claim, say so in
  `evidence.limitations` when the caption track transcribes it badly, which is
  the usual outcome.

## Language of the product

Always separate the two layers. Confusing them is the most expensive language
error in this system:

| Layer | Language | Translated |
|---|---|---|
| All of `source/`, `transcript/source.vtt`, `transcript/source.txt` | The original, fragment by fragment | Never |
| Analysis and reasoning | Over the original source | Not applicable |
| `deliverables/context.md` | `context_language` | Yes, entirely |
| `deliverables/analysis.json` | English, always | Yes, entirely |

The ban on machine translation refers to the **source**: never analyze a
translated caption believing it is the original. Translating the final product
into the requested language is a different operation and is allowed, because it
happens after the real source has been analyzed.

`analysis.json` is in English even when `context_language` is something else. It
is the interoperable artifact other agents consume; its language is not
negotiable.

### Choosing the caption source

```text
are there reliable manual captions in the source language?
  yes -> use the manual captions
  no  -> is there an original automatic track?
           yes -> use *-orig
           no  -> transcribe the original audio directly
```

Keep other useful original-language variants in `source/`. Record which one
became `transcript/source.vtt`.

## Phase 4: create the package structure

Create exactly four working branches:

```powershell
$videoTitle = [string]$metadataProbe.title
$folderName = ($videoTitle.Normalize([Text.NormalizationForm]::FormC).ToLowerInvariant() `
  -replace '[^\p{L}\p{Nd}]+', '-').Trim('-')

if ([string]::IsNullOrWhiteSpace($folderName)) {
  throw "The title does not produce a valid folder name"
}

$videoDir = Join-Path $workspace "videos\$folderName"

$requiredDirs = @(
  "$videoDir\deliverables",
  "$videoDir\transcript",
  "$videoDir\visual\frames",
  "$videoDir\source"
)

foreach ($directory in $requiredDirs) {
  New-Item -ItemType Directory -Force -Path $directory | Out-Null
}
```

Check that `$videoDir` does not already exist for another ID before writing. Do
not write into another video's directory. In parallel processing, each worker
keeps its own `$videoDir`; any temporary file must live inside that directory or
include the ID, even though the folder name never does.

## Phase 5: download silently

Use 360p for `standard`. Use up to 720p for `auto` and `visual-heavy` so small
interface and design details remain inspectable. If the source offers less,
preserve that limitation in `coverage.json` and the final report.

```powershell
$captionLanguages = "<resolved-language-or-track-list>"

& "$pythonExe" -m yt_dlp `
  --no-playlist `
  --write-info-json `
  --write-subs `
  --write-auto-subs `
  --sub-langs $captionLanguages `
  --sub-format vtt `
  -f "best[height<=<360-or-720>][ext=mp4]/best[height<=<360-or-720>]/best" `
  -o "$videoDir\source\video.%(ext)s" `
  $videoUrl
```

Initial files may be named:

```text
source/video.mp4
source/video.info.json
source/video.en.vtt
source/video.en-orig.vtt
```

Copy `video.info.json` to the canonical name:

```powershell
Copy-Item `
  -LiteralPath "$videoDir\source\video.info.json" `
  -Destination "$videoDir\source\metadata.json"
```

Do not mark any resource complete yet.

### Recovering a download

If a normal request receives HTTP 403:

1. retry only the failed video;
2. keep the partial directory;
3. consider `--http-chunk-size 1048576`;
4. do not switch to a translated or different source;
5. verify the finished MP4 opens before continuing.

## Phase 6: normalize the caption source

Copy the selected VTT to the transcript branch:

```powershell
Copy-Item `
  -LiteralPath "$videoDir\source\video.<selected-track>.vtt" `
  -Destination "$videoDir\transcript\source.vtt"
```

If the captions were produced by direct transcription, create a timestamped VTT
in the original language and document the method in `context.md`.

Never fabricate an empty VTT to satisfy the structure.

## Phase 7: create and review the clean transcript

Run:

```powershell
& "$pythonExe" "$skillRoot\scripts\vtt-to-clean-transcript.py" `
  "$videoDir\transcript\source.vtt" `
  "$videoDir\transcript\source.txt" `
  --title $metadataProbe.title `
  --video-id $videoId `
  --language "<language-code>"
```

The script removes the incremental duplication of automatic VTTs and groups the
text into roughly thirty-second segments. Do not change transcript content
merely to make the script run.

### Transcript quality checks

Inspect at least:

- the first two segments;
- two segments near the middle;
- the last two segments;
- total word count;
- segment count;
- approximate words per minute;
- time coverage against the duration from metadata.

Verify:

- no massive duplication produced by incremental captions;
- no abruptly missing middle or ending;
- that a translation is not being presented as the original source;
- name normalization only with clear evidence;
- ambiguous terms preserved or flagged;
- that promotions can be identified and separated.

A plausible speaking rate is a diagnostic signal, not an absolute rule.
Investigate extreme values instead of rewriting automatically.

## Phase 8: extract uniform visual evidence

```powershell
& "$pythonExe" "$skillRoot\scripts\extract-video-frames.py" `
  "$videoDir\source\video.mp4" `
  "$videoDir\visual\frames"
```

The output must contain exactly twenty uniform frames from 0% to 95%.

Generate the contact sheet:

```powershell
& "$pythonExe" "$skillRoot\scripts\make-contact-sheet.py" `
  --frame-dir "$videoDir\visual\frames"
```

## Phase 9: inspect visually, do not merely count

Open `visual/frames/contact-sheet.jpg` with `view-image` and inspect the image as
a sequence. If a detail is unreadable in the sheet, open the individual
`frame-XXpct.png` the same way.

Never declare a sheet inspected if you did not open it with `view-image`.

Build a coverage inventory:

```text
- presenter sections
- title cards
- interfaces
- diagrams
- demonstrations
- before and after states
- examples
- results
- transitions between concepts
- promotional sections
```

Ask yourself:

- Does the sheet cover every material concept?
- Are the important interfaces legible?
- Did a short demonstration fall between the 5% intervals?
- Are there duplicate images while a critical scene is missing?
- Does the capture demonstrate the claim, or only show a visual mockup?

For `auto` and `visual-heavy`, also run the independent visual scan before
relying on transcript timestamps. Run it **in the foreground** and wait for it:
it prints progress to stderr and takes minutes on a long video.

```powershell
& "$pythonExe" "$skillRoot\scripts\extract-adaptive-frames.py" `
  "$videoDir\source\video.mp4" `
  "$videoDir\visual\frames" `
  --profile "<auto-or-visual-heavy>" `
  --report "$videoDir\visual\coverage.json"

& "$pythonExe" "$skillRoot\scripts\make-contact-sheet.py" `
  --frame-dir "$videoDir\visual\frames" `
  --filter "adaptive-*.png" `
  --output-name "adaptive-contact-sheet.jpg" `
  --page-size 24
```

Open every `adaptive-contact-sheet-*.jpg` with `view-image`. Inspect individual
frames when text, spacing, type, color or controls are too small in the sheet.
The report bounds unsampled gaps to 10 seconds in `visual-heavy` and 20 seconds
when `auto` resolves to `standard`; scene changes add evidence between anchors.

## Phase 10: add supplemental frames

When a material scene is missing, locate its timestamp through the transcript,
the chapters or the video time directly, and run:

```powershell
& "$pythonExe" "$skillRoot\scripts\extract-supplemental-frame.py" `
  "$videoDir\source\video.mp4" `
  "$videoDir\visual\frames\supplemental-<seconds>s.png" `
  --timestamp <seconds>
```

For several frames, generate a second sheet:

```powershell
& "$pythonExe" "$skillRoot\scripts\make-contact-sheet.py" `
  --frame-dir "$videoDir\visual\frames" `
  --output-name "supplemental-contact-sheet.jpg" `
  --filter "supplemental-*.png"
```

Inspect every supplemental frame or its sheet with `view-image`. Do not use an
image of the presenter as evidence of a visual demonstration.

Cite supplemental names exactly in the dossier and the JSON.

When meaning depends on motion or an intermediate state, extract a temporal
burst rather than citing one still:

```powershell
& "$pythonExe" "$skillRoot\scripts\extract-frame-sequence.py" `
  "$videoDir\source\video.mp4" `
  "$videoDir\visual\frames" `
  --center <seconds> --radius 2 --step 0.5 --label "<event>"

& "$pythonExe" "$skillRoot\scripts\make-contact-sheet.py" `
  --frame-dir "$videoDir\visual\frames" `
  --filter "sequence-*.png" `
  --output-name "sequence-contact-sheet.jpg" `
  --page-size 24
```

Inspect the sequence pages in order. Then edit `visual/coverage.json`: set only
the reviews actually completed to `true`, and record unresolved legibility,
resolution or sampling limits in `manual_review.notes`. Automatic extraction is
not semantic inspection, and the flags are the only record that the difference
was respected.

## Phase 11: build an evidence ledger before writing

Create an internal map like this:

| Claim or topic | Transcript evidence | Visual evidence | Classification | Limit |
|---|---|---|---|---|
| Topic A | 03:10–04:20 | frame-25pct.png | direct + visual | none |
| Result B | 07:40 | none | direct claim | unverified |
| Tool behavior C | 09:15 | supplemental-555s.png | visual | time-bound |
| "The argument skips the base rate" | 12:02 | none | analyst judgment | opinion, grounded in the omission |
| "Verify the pricing before relying on it" | 07:40 | none | recommendation | confidence: medium |

The ledger is what makes the analysis honest. Build it **before** choosing the
lens, so the lens comes from the evidence rather than the evidence being
selected to fit the lens. It prevents four common failures:

1. repeating the transcript and ignoring visual content;
2. presenting a visual inference as a demonstrated fact;
3. blurring the analyst's judgment into what the creator said;
4. writing recommendations that owe nothing to this particular video.

Analyst rows are expected in the ledger, and each one must point at what
produced it: a quote, a frame, an omission or a contradiction. A judgment row
with an empty evidence column is an impression, and impressions do not enter the
package.

## Phase 12: choose the lens and build the analysis

Now that the evidence exists, decide the angle. Unless the user stated one, the
agent chooses the lens itself, from the material — see the lens rules in
[authoring.md](authoring.md). Write it down with its rationale before drafting;
a lens invented after the fact tends to be a description of whatever got
written.

Then, with the lens fixed, identify:

- the purpose of the video and what it argues;
- an end-to-end account of it, enough to write the general summary;
- the complete list of topics, points, steps or resources it covers;
- demonstrations, examples, interface states and visible artifacts;
- stated results, warnings and promotions;
- time-bound and unverified claims;
- where the source is strong and where it is weak, with the reason for each;
- what it leaves unresolved or contradicts;
- what you would actually recommend to someone after watching this, and how
  confident you are in each recommendation.

If the source contains a numbered list, keep all of its items. If it shows a
multi-step transformation, keep every stage. If it shows an interface, explain
what is visible without inventing backend behavior. The lens governs emphasis,
never coverage: nothing material disappears because it sits off-angle.

# Compact operating principle

The system is not "download captions and summarize them". It is:

```text
identify the real source
  -> preserve its language
  -> reconstruct what was said
  -> inspect what was shown
  -> relate evidence to claims
  -> choose the angle the material deserves
  -> summarize the whole video
  -> judge it, and say so as a judgment
  -> recommend what follows, with confidence
  -> validate content and files
  -> inventory only verified resources
```

This sequence lets another agent use the result without needing the original
video.
