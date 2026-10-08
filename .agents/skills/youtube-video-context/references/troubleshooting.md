# Common failures and reusable prompt

# 1. Environment failures

## A worker cannot run Python

**Failure:** one subagent reports that `python` is missing, broken or the wrong
version, while its siblings work normally.

**Usual causes:**

- the worker resolved the bare name `python` through a different `PATH` than the
  coordinator did;
- several workers ran `pip install` concurrently against the same site-packages,
  and on Windows the loser hit a locked file;
- the worker ran a preflight it should never have run.

**Fix:** the coordinator resolves `pythonExe` **once** with `scripts/preflight.py`
and passes that absolute path to every worker. Workers never run the preflight,
never install and never verify — they use the path they were given, quoted.

**What must never happen:** a worker installing a Python interpreter, a package,
or anything else to "fix" the error. That is not a repair. It leaves a second
interpreter on the user's machine, splits the environment for every later run,
and hides the real cause — which is usually that nothing was broken at all.

A worker that cannot run `pythonExe` **stops and reports the exact error**. The
coordinator decides what happens next, and if a dependency really is missing, the
user is told with the exact command and installs it themselves.

## A worker stalls waiting on its own background job

**Failure:** a worker launches a long step — usually
`extract-adaptive-frames.py` — as a background job, reports "waiting for the
background task to finish", and ends its turn. Resumed, it finds nothing new and
waits again. The cycle repeats while the run makes no progress.

**Usual causes:**

- the step takes minutes, and detaching it looks like the efficient move;
- the background job died at launch and will never report anything, but nothing
  checks that;
- the worker treats "I will be notified" as a state it can wait in, when nothing
  is going to notify it.

**Fix:** run every step in the foreground and wait for it in the same turn.
`extract-adaptive-frames.py` prints progress to stderr precisely so a foreground
run is visibly alive. Minutes of waiting are the expected cost of the scan.

**How to detect it:** the directory is the ground truth. Count
`visual/frames/adaptive-*.png` and check whether `visual/coverage.json` exists.
If the count is zero minutes after launch, the job is dead — rerun it in the
foreground rather than waiting again.

If a step really must be detached, the one who detached it owns polling the
filesystem for its output. Waiting for a notification is not a recovery plan.

## The preflight fails

**Failure:** `scripts/preflight.py` exits non-zero before the batch starts.

**Fix:** report its stderr verbatim to the user, including the command it printed,
and stop. Do not run that command yourself, do not switch interpreters, and do
not start the batch hoping the workers will manage.

# 2. Common failures

## Dossier based only on the transcript

**Failure:** the Markdown paraphrases what was said but ignores interfaces,
examples or diagrams.

**Fix:** rebuild the ledger from the contact sheets and incorporate all material
visual information.

## Timeline outline instead of self-contained context

**Failure:** the dossier says what happens minute by minute but does not explain
what the video actually covers.

**Fix:** use timestamps only as provenance and write complete sections for each
topic.

## Summary that summarizes nothing

**Failure:** `General summary` is three sentences of throat-clearing —
"the video discusses several important points about X" — and the real content
only appears further down.

**Fix:** write it as if it were the only section anyone reads: what the video
is, what it argues, how it argues it, how it ends. Cover the whole runtime, not
the first ten minutes.

## Analysis with no position

**Failure:** `Analyst assessment` lists pros and cons, says "it depends", and
reaches no verdict. The document describes a video nobody has decided anything
about.

**Fix:** take a position and defend it from the ledger. Say who this is worth
watching for and with what caveats. If the honest answer is "this is thin", say
that and show why.

## Opinion smuggled into the source

**Failure:** the analyst's view appears as "the source states", or a
recommendation reads as if the creator gave it. The reader cannot tell who is
talking.

**Fix:** every judgment carries its signal phrase and lives in the analyst
sections or in `analyst_note`. The four source classes describe the video only.
This is the single most damaging failure in the new contract: it destroys the
trust that made the package worth building.

## Ungrounded judgment

**Failure:** the assessment asserts that the method is weak, the argument is
flawed or the creator is overselling — with nothing behind it. The ledger has no
row for it.

**Fix:** anchor each judgment in a quote, a frame, an omission or an internal
contradiction. If nothing anchors it, it is an impression and it does not go in.

## Lens chosen after the fact

**Failure:** the document was written first and `analysis_lens` was filled in
afterwards to describe whatever came out. The lens is a label, not a decision.

**Fix:** choose and record the lens in phase 12, from the ledger, before
drafting. Justify it against what the source actually is.

## Lens used to hide material

**Failure:** a critical lens omits everything the video got right; a technical
lens drops the business context the video spent ten minutes on.

**Fix:** the lens governs emphasis, never coverage. Restore the omitted material
under `What the source covers`, at whatever length is honest.

## Imported checklist

**Failure:** the recommendations are generic best practice — accessibility,
consent, security, licensing — bolted onto a video that raised none of them.
They would read identically for any other source.

**Fix:** delete them. Recommend what follows from *this* video, and when a
standing concern does apply, say what in the material triggers it.

## Attacking the creator instead of the work

**Failure:** the assessment questions the creator's competence, honesty or
motives rather than the claim, the method or the evidence.

**Fix:** rewrite each judgment as a statement about the material. "The claim is
unsupported" is analysis; "he does not know what he is talking about" is not.

## Uninspected frame package

**Failure:** twenty files exist, but most are duplicates or show the presenter.

**Fix:** open the sheet with `view-image` and add useful supplemental frames.

## Evidence inflation

**Failure:** a visible interface is described as a working integration or a
verified result.

**Fix:** claim only what the frame demonstrates; classify the rest as a source
claim or an inference.

## Source misidentified by the title

**Failure:** a title in one language causes audio in another to be ignored, or a
machine translation becomes the primary transcript.

**Fix:** reapply the order of confidence from phase 3 and redo the transcript
from the original track. This affects the evidence, not the output language.

## Hybrid document

**Failure:** `context.md` mixes languages: half-translated headings, untranslated
quotes, or `analysis.json` with English keys and Spanish values.

**Usual cause:** copying the heading template from an example written in another
language, or translating the body and forgetting the titles.

**Fix:** take the twelve canonical headings from [authoring.md](authoring.md)
for `context_language`, translate the quotes into the same language, and rewrite
`analysis.json` entirely in English. No script detects this for you: re-read it
before declaring the package finished.

## Translated evidence presented as the source

**Failure:** to write the dossier in English, a translated caption is downloaded
instead of the original, or `transcript/source.txt` is overwritten with its
translation.

**Fix:** the transcript always keeps the spoken language, fragment by fragment.
The translation lives only in `context.md`, and happens after the real source has
been analyzed. If you deleted the original, download it again before continuing.

## Promotion mixed into the analysis

**Failure:** sponsored tools or creator services appear as findings, or as
recommendations the analyst supposedly reached independently.

**Fix:** report the promotion as provenance and declared bias, and weigh it in
the assessment when it plausibly shapes the argument.

## Valid JSON but shallow content

**Failure:** `analysis.json` passes the schema but its topics restate the
transcript, its `analyst_note` fields paraphrase `what_the_source_says`, and its
recommendations are platitudes with `confidence: "high"`.

**Fix:** derive topics from the evidence ledger, write `analyst_note` only where
you have something to add, and set confidence from the evidence rather than from
enthusiasm.

# 3. Reusable instruction for an agent

This block serves two purposes: as a compact reminder of the contract, and as
the prompt for a subagent when the user explicitly asked to process videos in
parallel. In that case, give it to each worker with **a single ID**,
the stage, `<skill>`, `<workspace>` and the constraint that the worker must not
touch `manifest.json`: the coordinator does that.

```text
Process the given YouTube videos and turn each one into its own complete
analysis package: a general summary of the video, your own assessment of it and
your recommendations, backed by evidence. You may process them sequentially or
in parallel, but never combine several videos into one package.

First read the SKILL.md of the youtube-video-context skill and its references
(pipeline.md, authoring.md, validation.md), and use only the scripts in its
scripts/ folder. For each video, create and use only the directory derived from
its official title; that folder name must not contain the YouTube ID. Treat
manifest.json as the official inventory and coordinate its writes so no changes
are lost.

Skill root: <path to the skill>
Output workspace: <path to the workspace>
Python interpreter: <absolute pythonExe resolved by the coordinator>
Video IDs: <ID or list of IDs>
Stage: <stage>
Output language: <output_language, en by default>
Analysis lens: <only if the user stated one; otherwise you choose it per video>
Visual profile: <standard, auto or visual-heavy>

Use the Python interpreter given above, quoted, for every script and every yt-dlp
call. Do not call the bare name python, do not run the preflight, and do not
verify, install, upgrade or switch anything in the environment: no interpreters,
no pip packages, no virtual environments, no PATH changes, no system tools. If
you cannot run that interpreter, stop and report the exact error instead of
trying to fix it. Installing software to work around an error is never part of
this job.

For each ID, before downloading, probe the metadata and determine the real
spoken language and the original tracks available. Process silently. Download a
360p MP4, metadata and useful original caption variants. Never use a translation
as the primary source.

Separate the language of the evidence from the language of the product. The
transcript always keeps the spoken language, fragment by fragment, even if the
video mixes languages. context.md is written entirely in the output language,
with the twelve canonical headings from authoring.md in that same language and
with quotes translated while keeping their timestamps. analysis.json is written
entirely in English, always, except source.title and source.creator, which keep
the original title and channel.

For each video create videos/<title-slug>/ and inside it the four branches:
deliverables, transcript, visual/frames and source. Do not include the YouTube
ID in the folder name. Keep each ID's artifacts and temporary files fully
isolated. Clean each transcript and review its start, middle, end, duration,
duplication, terminology and speaking rate.

For each video extract exactly 20 uniform frames from 0% to 95%, generate its
contact sheet, open it with your agent's image-viewing tool to genuinely inspect
it as an image, and add timestamped supplemental frames for every demonstration,
interface, diagram, example or important numbered item missed by the sampling.
Inspect the supplemental evidence too.

When the visual profile is auto or visual-heavy, also run
scripts/extract-adaptive-frames.py in the foreground, build the paginated
adaptive contact sheets, inspect every page, and set the manual_review flags in
visual/coverage.json only for the reviews you actually performed. Run every long
step in the foreground and wait for it in the same turn: never detach one and
end your turn waiting to be told it finished.

Build an independent evidence ledger for each video separating direct transcript
evidence, visual confirmation, time-bound claims, unverified claims, promotions,
your own judgments and your recommendations. Every judgment row must point at the
quote, frame, omission or contradiction that produced it.

With the ledger built, choose the analysis lens for that video from the material
itself, unless the user stated one, and record it with its rationale. The lens
governs emphasis, never coverage.

For each ID write a self-contained deliverables/context.md that meets the
duration-scaled minimum the validator computes (80 words per minute of video,
floor 800, ceiling 5000). It must contain a general summary covering the whole
video, full coverage of what the source says, what the frames materially show,
your assessment with a verdict, your recommendations with rationale and
confidence, and the open questions the source leaves. The provenance timeline is
provenance only. Write its deliverables/analysis.json with the exact 2.0 schema
and every mandatory field.

State your judgments as judgments and never as things the source said. Raise
privacy, consent, security, accessibility, licensing or policy concerns only
when the material raises them, saying what triggers them. Criticize the work,
never the creator as a person.

Run scripts/validate-dossier.py separately for each package, passing
--video-dir, --expected-folder-name <title-slug> and --expected-visual-profile,
and fix every failure.
Manually confirm the quality of each transcript, the language, the visual
coverage, the evidence limits, the separation of promotions, the autonomy, that
the summary covers the whole video, and that every judgment is labeled and
grounded. Update manifest.json per
video only after that package reaches PASS, and only for resources that
physically exist. Revalidate from the package directory and report metrics and
limitations per video, plus the batch summary.

Do not mix artifacts between videos, delete experiments, play audio, fabricate
evidence, or claim that a visual demonstration proves production behavior. One
ID failing must not delete or invalidate the correct packages of the others.
```
