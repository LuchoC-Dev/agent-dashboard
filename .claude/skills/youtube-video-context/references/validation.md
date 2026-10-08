# Validation, manifest and reporting

Read [pipeline.md](pipeline.md) for the phases and [authoring.md](authoring.md)
for the deliverable contracts.

# 1. Validation

## The skill validator

Run (identical on Windows, Linux and macOS):

```text
"<pythonExe>" "<skillRoot>/scripts/validate-dossier.py" \
  --video-dir "<videoDir>" \
  --expected-folder-name "<folderName>" \
  --expected-visual-profile "<standard|auto|visual-heavy>"
```

Do not update the manifest until you get `PASS`. On failure the validator exits
with a non-zero status and prints `ERROR: <exact reason>` on the first problem
found; fix it and run again. On success it prints a JSON summary ending in
`"result": "PASS"`.

The validator checks:

- the required canonical files;
- an exact match between the directory and the slug derived from the title;
- absence of the YouTube ID in the directory name;
- presence of the ID in `context.md`;
- presence of `analysis_lens` and a valid `lens_chosen_by` in the header;
- context depth against the **duration-scaled minimum**
  (`clamp(80 words × minutes, 800, 5000)`);
- the eight exact top-level JSON keys;
- schema version `2.0`;
- the six `source` fields;
- the three `analysis_lens` fields, with `chosen_by` in `{agent, user}`;
- a non-empty `summary` and at least one topic;
- the six fields of every topic, with `evidence_class` in
  `{direct, visual, time_bound, unverified}`;
- the four fields of every recommendation, with `confidence` in
  `{high, medium, low}`;
- the four `assessment` fields, all non-empty;
- ID, language and duration matching `metadata.json`;
- exactly twenty uniform frames;
- existence of the contact sheet;
- existence of every frame cited in the dossier or the JSON;
- for `auto` and `visual-heavy`: `coverage.json` schema 1.0, the requested and
  resolved profiles, the bounded timeline gap, every declared adaptive frame on
  disk, at least one paginated adaptive sheet, and the `manual_review` flags.

The validator **does not check languages**. It reports the declared
`context_language` as informational output, but it does not verify it, nor
review the headings, nor the language of `analysis.json`. The language contract
is the responsibility of the agent writing the dossier, and it is met by
following the rules in [authoring.md](authoring.md), not by expecting a script to
enforce them.

It also cannot check whether the analysis is any good. It confirms that a lens,
an assessment and recommendations **exist and are well-formed**; whether the lens
fits the material, whether the verdict is defensible and whether the
recommendations follow from this video are judgments only the writing agent and
the reader can make.

## Mandatory manual reviews

Automation does not check:

- semantic coherence of the transcript;
- that the detected language really is the original audio;
- that `context.md` is entirely in `context_language`, headings and quotes
  included;
- that `analysis.json` is entirely in English;
- that a translated quote says the same as the original;
- that the contact sheet was inspected with `view-image`;
- that every adaptive sheet and temporal sequence was inspected when present;
- whether the `manual_review` flags in `coverage.json` are honest;
- coverage of important visual moments;
- that a frame demonstrates the claim attached to it;
- the dossier's autonomy;
- that the general summary really covers the whole video;
- that the chosen lens fits the source, and that it shaped emphasis without
  suppressing material content;
- that every analyst judgment is labeled as one and anchored in the ledger;
- that recommendations derive from this video rather than generic best practice,
  and that their confidence matches the evidence;
- separation of promotions, and whether they were weighed in the assessment;
- that the coverage does not omit a numbered item or a demonstration.

Record these reviews in the final report.

## Final validation checklist

```text
[ ] ID, title, creator, duration and language from metadata verified
[ ] context.md entirely in context_language, quotes included
[ ] all twelve headings in the same language, re-read one by one
[ ] every translated quote keeps its timestamp
[ ] analysis.json entirely in English except title and creator
[ ] secondary audio languages recorded if any
[ ] source video present and readable
[ ] original captions or direct transcription preserved
[ ] start, middle and end of the transcript inspected
[ ] transcript rate and duration plausible
[ ] 20 uniform frames present
[ ] uniform contact sheet opened with view-image
[ ] every adaptive contact-sheet page opened with view-image when required
[ ] temporal sequences extracted and inspected where motion carries meaning
[ ] coverage.json manual_review flags reflect inspections actually done
[ ] supplemental scenes added where needed
[ ] supplemental evidence opened with view-image
[ ] context.md contains the ID and is self-contained
[ ] folder named only with the title slug, no YouTube ID
[ ] analysis lens declared, justified, and honest about who chose it
[ ] general summary covers the whole video and stands alone
[ ] numbered list or full topic coverage preserved
[ ] every analyst judgment labeled as judgment and anchored in the ledger
[ ] assessment takes a position and includes strengths
[ ] recommendations specific to this video, each with rationale and confidence
[ ] time-bound and unverified claims labeled
[ ] promotions isolated and weighed as bias
[ ] no imported checklist: raised concerns actually arise from the material
[ ] analysis.json valid
[ ] exact schema 2.0 keys present
[ ] topics and recommendations complete
[ ] every cited frame exists
[ ] skill validator at PASS
[ ] resources verified before marking them true in the manifest
```

# 2. Updating the manifest

After a video passes all validation, add its entry to
`<workspace>/manifest.json`:

```json
{
  "video_id": "<ID>",
  "slug": "<slug>",
  "source_language": "<language of the video>",
  "dossier_language": "<context_language of context.md>",
  "analysis_lens": "<the lens used, in English>",
  "lens_chosen_by": "agent",
  "visual_profile": "<resolved visual profile>",
  "stage": "<stage>",
  "resources": {
    "context": true,
    "analysis": true,
    "transcript": true,
    "original_captions": true,
    "frames": true,
    "source_video": true,
    "metadata": true
  }
}
```

`source_language` is the spoken language of the video and `dossier_language` is
that of `context.md`. They no longer match by definition: a French video with
English output produces `"source_language": "fr"` and `"dossier_language": "en"`.
`analysis.json` is always English, which is why it has no field of its own.

`analysis_lens` is recorded in English regardless of `dossier_language`, so the
inventory stays searchable across a mixed-language collection, and
`lens_chosen_by` preserves whether the angle was the agent's decision or the
user's instruction.

Set a value to `true` only after verifying the artifact.

Write the entry with `edit-file`, never by rewriting the file whole: a full
rewrite could lose existing entries. Re-read the file with `read-file`
immediately before each edit.

After editing:

1. parse `manifest.json` and confirm it is still valid JSON;
2. verify the ID is unique;
3. verify the slug matches the directory exactly and does not contain the
   YouTube ID;
4. run the validator again;
5. refresh the playlist before reporting what is pending, if there is one.

In a multi-video run, do not build several disconnected versions of the manifest
and pick one at the end. Re-read the file before each write, incorporate only
validated entries, preserve existing entries, and re-parse the JSON after each
coordinated update.

# 3. Final report

Report this block for each video:

```text
Video ID:
Title:
Package directory:
Source language:
Transcript language:
Dossier language:
Analysis lens (and who chose it):
Duration:
Caption or transcript source:
Clean transcript words:
Dossier words (and the duration-scaled requirement):
Topic count:
Recommendation count:
Verdict in one line:
Resolved visual profile:
Source resolution:
Uniform frames:
Adaptive frames:
Sequence frames:
Supplemental frames:
Contact sheets inspected:
Validator:
Evidence limitations:
Manifest updated:
```

When there is a playlist, add its current total and the pending count.

Do not merely say "completed". Include enough evidence for another agent to
trust the package.

If there were several videos, add a batch summary:

```text
Videos requested:
Complete packages:
Failed packages:
Pending packages:
Entries added to the manifest:
```

Do not hide individual failures behind an aggregate status.

# 4. Recovery and idempotency

## Safe resumption

If a run is interrupted:

1. inspect the partial directory;
2. keep the valid artifacts;
3. compare metadata and ID before resuming;
4. resume only the missing phases;
5. regenerate an artifact only if it is invalid or incomplete;
6. repeat the full validation.

## Forbidden actions when resuming

- deleting the partial directory without inspecting it;
- overwriting a dossier completed by another run;
- changing the slug after it entered the manifest without migration;
- marking resources as `true` to simulate complete validation;
- substituting translated captions after an original track failed;
- using stale browser screenshots instead of local extraction.
