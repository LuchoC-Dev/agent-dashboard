# youtube-video-context

An [Agent Skill](https://agentskills.io) that turns YouTube videos into
self-contained analysis packages another agent can work from without ever
opening the original video.

It is written against **capabilities**, not the tool names of one product, so it
runs on any agent that can use a shell, read and write files, and **look at an
image**. `SKILL.md` carries the mapping table for Claude Code, Codex and a
generic agent.

```bash
npx skills add LuchoC-Dev/youtube-video-context
```

## What it does

Given one or more YouTube IDs, it produces a validated package per video:

```
videos/<title-slug>/
  deliverables/
    context.md      summary + analysis + recommendations, length scaled to duration
    analysis.json   machine-readable analysis, schema 2.0
  transcript/
    source.txt      clean transcript, incremental duplication removed
    source.vtt      the original caption track
  visual/
    frames/
      frame-00pct.png ... frame-95pct.png 20 uniform frames
      contact-sheet.jpg                   labeled 4-column grid
      adaptive-<ms>ms.png                 scene changes + bounded timeline anchors
      adaptive-contact-sheet-01.jpg ...   paginated sheets, inspected page by page
      sequence-<label>-<ms>ms-<n>.png     dense burst where motion carries meaning
      supplemental-<seconds>s.png         timestamped, when sampling misses a scene
    coverage.json                         what was sampled, and what was reviewed
  source/
    video.mp4       360p, or up to 720p when the content is visual
    metadata.json
```

The point is not "download the captions and summarize them". The agent inspects
the contact sheets **as images**, builds an evidence ledger, picks the angle the
material deserves, and then says what it actually thinks — while keeping six
things apart that are easy to blur together:

| Class | Meaning |
|---|---|
| Direct source | The video states or demonstrates it |
| Visual confirmation | It materially appears in an inspected frame |
| Time-bound claim | True as recorded, may have changed |
| Unverified claim | Asserted without sufficient primary evidence |
| **Analyst judgment** | The agent's opinion, labeled and grounded in the ledger |
| **Recommendation** | Actionable advice, with rationale and explicit confidence |

A screenshot of an interface never becomes a claim that something works in
production, and an opinion never becomes something the creator said.

## Visual coverage

Twenty evenly spaced frames are a baseline, not coverage: a three-second
before/after can fall between two of them. For anything where meaning lives in
the image — design styles, UI, slides, diagrams, code, motion — the
`visual-heavy` profile adds an independent scan that follows scene changes and
bounds the unsampled gap to ten seconds, then paginates the result into sheets
the agent inspects page by page.

`visual/coverage.json` records what was sampled and, separately, what the
reviewing agent actually looked at. No script can verify that second part, which
is exactly why it is written down: the validator refuses to pass a `visual-heavy`
package whose review flags were never set.

## The analysis lens

Each video is analyzed through one lens — technical soundness, practical
applicability, critical review, pedagogical, strategic, or whatever the source
actually calls for. **The agent picks it**, from the material, after building the
evidence ledger. Say nothing and you get its judgment; say "review it critically"
or "I want this for teaching" and that angle wins.

The lens is declared in the header, justified in the document, and recorded in
the manifest. It governs emphasis, never coverage: a critical lens still reports
what the video gets right.

## Document shape

```
Purpose · Analysis lens · Evidence and limits · General summary · Provenance timeline
What the source covers  (one section per topic)
Visible demonstrations and examples
Analyst assessment      (strengths, weaknesses, verdict)
Recommendations         (each with rationale and confidence)
Open questions and contradictions
Compact summary
```

Length scales with the video: `clamp(80 words × minutes, 800, 5000)`, enforced by
the validator. A six-minute video is not padded to the size of a lecture.

## Language contract

Evidence and product are separate layers, and they do not share a language:

| Layer | Language |
|---|---|
| `source/`, `transcript/` | The spoken one, fragment by fragment — **never translated** |
| `context.md` | Whatever the user asks for, **English by default** |
| `analysis.json` | **Always English** |

A French video with default settings yields a French transcript and an English
dossier. Quotes inside `context.md` are translated and keep their timestamp, so
they stay verifiable against `transcript/source.txt`.

## Requirements

- Python 3.10+
- `pip install -r scripts/requirements.txt` (`opencv-python-headless`,
  `Pillow`, `yt-dlp`)
- Internet access to download from YouTube

The skill **verifies** this environment and never changes it. `scripts/preflight.py`
reports the absolute interpreter path and whether every package imports; it
installs nothing. If something is missing it prints the command for you to run
and the skill stops. In a parallel batch the coordinator runs the preflight once
and passes that interpreter path to every worker, so no two workers can race each
other installing packages — and no worker ever "fixes" an error by installing a
second Python.

The scripts are pure Python and run on Windows, Linux and macOS. Note that the
orchestration examples in `references/pipeline.md` are written in Windows
PowerShell syntax; on Linux/macOS the equivalent Bash is a direct translation
(`mkdir -p`, `cp`, the same `yt-dlp` flags) and the script calls themselves are
unchanged.

## Layout

```
SKILL.md                  metadata + the instructions the agent loads
references/
  pipeline.md             phases 0-12, rules, inputs, output
  authoring.md            lens, context.md and analysis.json contracts
  validation.md           validator, manifest, reporting, recovery
  troubleshooting.md      common failures, reusable subagent prompt
scripts/
  preflight.py                   verifies the interpreter; installs nothing
  extract-video-frames.py        20 uniform frames from 0% to 95%
  extract-adaptive-frames.py     scene changes, timeline anchors, coverage.json
  extract-frame-sequence.py      dense frames around a transition or action
  extract-supplemental-frame.py  one frame at a given timestamp
  vtt-to-clean-transcript.py     VTT -> clean transcript
  make-contact-sheet.py          paginatable labeled contact sheets
  validate-dossier.py            structural validator
```

The validator is structural — files, schema, frame counts, the duration-scaled
word minimum, coherence with the metadata. It confirms that a lens, an assessment
and recommendations exist and are well-formed, but it deliberately does **not**
check languages or judge whether the analysis is any good; that is the writing
agent's responsibility, guided by `references/authoring.md`.

Run it directly on any package:

```bash
python scripts/validate-dossier.py \
  --video-dir path/to/videos/some-title-slug \
  --expected-folder-name some-title-slug \
  --expected-visual-profile visual-heavy
```

## License

MIT — see [LICENSE](LICENSE).
