# Authoring the deliverables

How to write `deliverables/context.md` and `deliverables/analysis.json`. Read
[pipeline.md](pipeline.md) first for the phases that produce the evidence these
documents are built from.

The deliverable is an **analysis of the video**: what it covers, what it is
worth, and what the analyst recommends. It is not an execution manual and it is
not a domain checklist. The analyst's own judgment is welcome and expected —
provided it is labeled as judgment and never dressed up as something the source
said.

# 1. Choosing the analysis lens

Every video is analyzed through a lens: the angle that makes the analysis
useful. **By default the agent chooses the lens itself**, from the material,
after building the evidence ledger and before drafting.

The user may override it with a single sentence ("analyze it from a business
angle", "focus on whether the technique actually works", "I want it for
teaching"). When they do, that lens wins and the agent does not renegotiate it.

Choose from the material, not from a menu. A lens is one line describing what
this analysis is *for*. Useful shapes it often takes:

- technical soundness — does the method hold up, where does it break;
- practical applicability — what can a reader actually do with this;
- critical review — claims versus evidence, incentives, what is being sold;
- pedagogical — how well does it teach, what does it assume, what is missing;
- strategic — what it implies for decisions, positioning or planning;
- descriptive — a faithful map of a dense source that mostly needs organizing.

These are examples of the shape, not a closed list. A video may deserve a lens
that appears on no list, and picking one off the list because it is convenient
is worse than writing the honest one.

Rules for the lens:

- pick exactly one primary lens; a document that tries every angle argues
  nothing;
- record it verbatim in the `analysis_lens` header field and in `analysis.json`;
- justify it in the `Analysis lens` section, in two to four sentences: why this
  angle and not another, given what the source actually is;
- do not let the lens filter the evidence. The lens decides emphasis and what
  gets discussed at length. It never authorizes omitting something material the
  source said or showed. A critical lens still reports what the video gets
  right.

## Metadata header

The header always uses these English keys; the values describe the video:

```yaml
---
title: "<document title in context_language> — <video title>"
source_video: "https://www.youtube.com/watch?v=<ID>"
video_id: "<ID>"
creator: "<creator>"
duration_seconds: 0
source_language: "<code>"
secondary_languages: []
transcript_language: "<code>"
context_language: "<code>"
analysis_lens: "<one line, in context_language>"
lens_chosen_by: "agent"
analysis_type: "original-language captions or transcript + direct inspection of 20 uniform frames, N adaptive frames and N supplemental frames"
visual_profile: "standard | auto | visual-heavy"
---
```

`context_language` is mandatory in the header: it tells the consuming agent
which language it is reading, and it is what the manifest reflects.

`lens_chosen_by` is `agent` when the agent picked the lens and `user` when the
user stated it. The validator checks that both lens fields are present and
non-empty.

## Required document architecture

Headings are **not improvised and not translated on the fly**. They are these
twelve, in English, which is the default language:

```text
# Autonomous context for an agent

## Purpose
## Analysis lens
## Evidence and limits
## General summary
## Provenance timeline

# What the source covers
## Topic 1
## Topic 2
...

# Visible demonstrations and examples
# Analyst assessment
# Recommendations
# Open questions and contradictions
# Compact summary
```

And these when `context_language` is `es`:

```text
# Contexto autónomo para un agente

## Propósito
## Enfoque del análisis
## Evidencia y límites
## Resumen general
## Mapa temporal de procedencia

# Lo que cubre la fuente
## Tema 1
...

# Demostraciones y ejemplos visibles
# Valoración del analista
# Recomendaciones
# Preguntas abiertas y contradicciones
# Resumen compacto
```

For any other language, translate the twelve English headings **once and
completely** before drafting, then use that translation from beginning to end of
the document. The error this prevents is translating the body of the dossier and
leaving half the titles in the template's language.

The `##` headings naming each topic inside "What the source covers" are
free-form and written in `context_language`.

Before considering the dossier finished, re-read the list of headings you wrote
and confirm all twelve are in the same language. It is a ten-second check that
prevents the document's most visible defect.

## What goes in each section

| Section | Content | Whose voice |
|---|---|---|
| Purpose | What this document is for and who consumes it | Analyst, neutral |
| Analysis lens | The chosen lens and why, in two to four sentences | Analyst |
| Evidence and limits | What the evidence supports, what it cannot, what was unreachable | Analyst, neutral |
| General summary | What the video is and says, end to end, in prose | The source |
| Provenance timeline | Timestamps mapped to segments, as provenance only | The source |
| What the source covers | One `##` per topic: what was said, explained so it is understandable without the video | The source |
| Visible demonstrations and examples | What the inspected frames materially show | The source + visual |
| Analyst assessment | Strengths, weaknesses, what holds up, what does not, and a verdict | **Analyst, explicitly** |
| Recommendations | Actionable advice derived from the analysis, each with its rationale and confidence | **Analyst, explicitly** |
| Open questions and contradictions | What the source leaves unresolved, contradicts, or asserts without support | Analyst |
| Compact summary | The whole document compressed for an agent that reads only this | Analyst, neutral |

The **General summary** is the section the user asked for: a real end-to-end
summary of the video in prose, not a bullet dump and not a teaser for the rest of
the document. It must stand alone. Someone who reads only that section should
know what the video is, what it argues, how it argues it and how it ends.

**What the source covers** replaces the old step-by-step method reconstruction.
If the video *is* a method, its topics are its steps and every step stays. If it
is an interview, an essay or an analysis, the topics are its themes. Do not force
narrative material into procedural shape.

The provenance timeline indicates provenance; it does not replace explanation.
The reader must understand each topic without consulting the timestamps.

## One language throughout the document

`context.md` is written entirely in `context_language`. No exceptions for a
paragraph, heading, table, label or bullet.

### Transcript quotes

Quotes are **translated** into `context_language` and keep their timestamp as
provenance. This also applies to fragments in secondary languages: a Spanish
video quoting something in English produces, in an English dossier, an English
quote.

Correct, in an `en` dossier about a Spanish video:

```text
> "The model only works if you already have distribution." (03:14)
```

Incorrect, because it reintroduces the language mix:

```text
> «El modelo sólo funciona si ya tenés distribución.» (03:14)
```

The timestamp is what makes the quote verifiable: anyone in doubt can open
`transcript/source.txt` at the stated timestamp and compare. That is why **every
translated quote must carry a timestamp**; without it, the claim stops being
traceable and becomes unverified.

Translate meaning, not word by word, and do not soften or harden what was
claimed: a translation that turns "it usually works" into "it works" fabricates
evidence.

### What is kept untranslated

Even when the document is in another language, do not translate:

- proper nouns, names of people, channels, brands and products;
- frame file names (`frame-25pct.png`, `adaptive-000123456ms.png`);
- technical identifiers, commands, paths and code fragments;
- interface text visible in a frame, when the claim depends on what is literally
  read on screen; in that case quote the text verbatim and explain its meaning
  in `context_language`;
- the original video title, which also appears in `source.title`.

## Depth standard

The minimum word count **scales with the video's duration**, because a five
minute video and a ninety minute lecture do not deserve the same document:

```text
minimum = clamp(80 words × duration_in_minutes, floor 800, ceiling 5000)
```

The validator computes this from `duration_seconds` and reports both the
requirement and the actual count. A ten minute video requires 800 words; a
forty minute one requires 3,200; anything past about an hour is capped at 5,000.

Do not pad a short source with repetition. Depth comes from

- a general summary that genuinely covers the whole video;
- an explanation of each topic that stands without the source;
- what was materially shown;
- an assessment that says something, with reasons;
- recommendations that follow from the analysis;
- the limits of the evidence;
- unresolved questions.

If the video is genuinely too thin to sustain its computed minimum, report the
limitation instead of inflating the text. A dossier that misses the threshold
with an honest explanation is worth more than one that reaches it by repeating
itself.

## Evidence classes

Six classes. The first four describe the source, the last two are the analyst
speaking. **Every material claim belongs to exactly one, and the reader must
always be able to tell which.**

| Class | Meaning | Signal phrase (en) |
|---|---|---|
| Direct source | The video states or demonstrates it | The source states… |
| Visual confirmation | It materially appears in an inspected frame | `frame-40pct.png` shows… |
| Time-bound claim | True as recorded, may have changed | This interface is time-bound. |
| Unverified claim | Asserted without sufficient primary evidence | This metric is an unverified claim from the source. |
| **Analyst judgment** | The analyst's opinion or evaluation | In my assessment… / This analysis considers… |
| **Recommendation** | Actionable advice from the analyst, not the source | Recommendation: … |

The two analyst classes are what changed in this contract. They are not a
loophole in the evidence discipline — they are what keeps opinion from leaking
into the other four. A judgment stated as a judgment is honest; the same
sentence written as "the source states" is fabrication.

If `context_language` is another language, use the natural equivalent, but keep
all six distinctions intact. What cannot be lost in translation is the
difference between *the source claims this* and *I think this*.

## Writing the assessment and the recommendations

These two sections are the point of the document. Write them with conviction and
with reasons.

**Analyst assessment** must:

- take a position — "it depends" and "there are pros and cons" are not
  assessments;
- ground every judgment in something specific from the ledger: a quote, a frame,
  an omission, an internal contradiction;
- say what the source gets right, not only what it gets wrong, whatever the lens;
- distinguish *the argument is wrong* from *the argument is unsupported* from
  *the argument is unfashionable*;
- attack the material, never the person. Criticize the claim, the method or the
  evidence — not the creator's competence, motives or character;
- end in a verdict: is this worth someone's time, for whom, and with what
  caveats.

**Recommendations** must:

- follow from this specific video, not from generic best practice. A
  recommendation that could have been written without watching anything is noise;
- carry a rationale that points at the evidence it came from;
- carry an explicit confidence — `high`, `medium` or `low` — reflecting how well
  the evidence supports it;
- stay within what the analyst can actually judge from a video. If the source
  showed an interface, do not recommend architecture for a backend nobody saw;
- be relevant to the topic. Do not append safety, privacy or accessibility
  boilerplate to a video that raises none of it. Raise those when the material
  raises them, with the reason it applies here.

An honest "no strong recommendation follows from this source" is acceptable and
is better than five hollow bullets.

## Visual citations

Correct citation:

```text
`frame-40pct.png` shows the pricing comparison with three visible tiers.
```

Incorrect citation:

```text
The integration is production-ready, as frame-40pct.png shows.
```

An image of an interface does not demonstrate that something is production-ready.
Never turn a demonstration into a claim of production behavior, and never infer
an operational integration from a visual panel alone.

## Promotions

Identify sponsors, affiliate links, channel subscriptions, products, discounts
and creator services. Report them as provenance and as declared bias, and factor
them into the assessment when they plausibly shape what the source argues. Do not
let a promotion enter the analysis as if it were a finding.

# 2. Writing `analysis.json`

The machine-readable companion to `context.md`. Same analysis, structured, so
another agent can consume it without parsing Markdown.

Use exactly these top-level keys:

```json
{
  "schema_version": "2.0",
  "source": {},
  "analysis_lens": {},
  "summary": "",
  "topics": [],
  "recommendations": [],
  "assessment": {},
  "evidence_boundary": {}
}
```

## Language of analysis.json

**Keys and values go in English, always**, whatever `context_language` is and
whatever the video's language is.

Kept untranslated:

- `source.title`: the official title exactly as it appears in metadata;
- `source.creator`: the channel name exactly as it appears in metadata;
- `source.url`, `source.video_id`;
- `source.language`, which is the language code **of the video**, not of the
  dossier.

Everything else — `analysis_lens`, `summary`, every field of every topic and
recommendation, `assessment`, `evidence_boundary` — is written in English. If
the video is in Spanish and the dossier is too, `analysis.json` is still in
English.

## Full template

```json
{
  "schema_version": "2.0",
  "source": {
    "video_id": "<ID>",
    "title": "<title>",
    "url": "https://www.youtube.com/watch?v=<ID>",
    "creator": "<creator>",
    "duration_seconds": 0,
    "language": "<code>"
  },
  "analysis_lens": {
    "lens": "One line naming the angle of this analysis.",
    "rationale": "Why this angle fits what the source actually is.",
    "chosen_by": "agent"
  },
  "summary": "<self-contained summary of the whole video, several sentences>",
  "topics": [
    {
      "id": "stable_identifier",
      "title": "Readable topic name",
      "what_the_source_says": "The content itself, explained so it stands alone.",
      "evidence_class": "direct",
      "timestamps": ["03:10-04:20"],
      "visual_evidence": [
        "frame-25pct.png shows...",
        "adaptive-000123456ms.png shows...",
        "supplemental-300s.png shows..."
      ],
      "analyst_note": "Optional. Judgment about this specific topic, if any."
    }
  ],
  "recommendations": [
    {
      "id": "stable_identifier",
      "recommendation": "What the reader should do or consider.",
      "rationale": "The evidence in this video that leads here.",
      "confidence": "high"
    }
  ],
  "assessment": {
    "strengths": [
      "What the source does well, specifically"
    ],
    "weaknesses": [
      "Where it falls short, specifically"
    ],
    "verdict": "Is this worth someone's time, for whom, with what caveats.",
    "basis": "What this verdict rests on, and what it does not cover."
  },
  "evidence_boundary": {
    "transcript": "What the transcript establishes.",
    "frames": "What the inspected images establish.",
    "analyst_opinion": "Which parts of this package are the analyst's judgment rather than the source.",
    "unverified": "Claims carried from the source without primary evidence."
  }
}
```

## Field rules

Every topic must contain six non-empty fields:

1. `id`
2. `title`
3. `what_the_source_says`
4. `evidence_class`
5. `timestamps`
6. `visual_evidence`

`analyst_note` is optional: include it when the topic deserves comment, omit it
otherwise. Do not fill it with restatements of `what_the_source_says`.

`evidence_class` must be one of `direct`, `visual`, `time_bound` or `unverified`
— a topic describes the source, so it never carries an analyst class. Analyst
voice lives in `analyst_note`, `recommendations` and `assessment`.

Every recommendation must contain `id`, `recommendation`, `rationale` and
`confidence`, with `confidence` one of `high`, `medium`, `low`.

`assessment` must contain `strengths`, `weaknesses`, `verdict` and `basis`, and
`strengths` must be non-empty: a review that finds nothing good in a source is
usually a review that stopped looking.

Topics must be meaningful groupings, not arbitrary paragraphs from the
transcript. Preserve the whole source, but group related material when that makes
the JSON more useful. The Markdown dossier remains the exhaustive human-readable
record.

Every file name cited in `visual_evidence` must exist in `visual/frames`: the
validator checks this. Uniform, adaptive, sequence and supplemental frames are
all citable, and each is cited by its exact file name.

# 3. Keeping the analysis honest

The freedom to judge comes with the obligation to judge well.

- **Label every judgment.** The reader must never have to guess whether a
  sentence is the source or the analyst.
- **Ground it.** A judgment with no anchor in the ledger is an impression. Point
  at the quote, the frame, the omission or the contradiction that produced it.
- **Do not invent.** Names, terms, scenes, numbers and results are never
  reconstructed from plausibility. An unclear name stays unclear and is flagged.
- **Separate confidence from certainty.** Say how sure you are and why; do not
  round a weak inference up to a finding.
- **Criticize the work, not the person.**
- **Do not import a checklist.** Relevance is decided by the material. If the
  video raises consent, security, licensing, accessibility or legal exposure,
  address it and say why it applies here. If it does not, do not manufacture the
  concern to look thorough.
- **Disclose your own limits.** You analyzed captions and a finite set of
  frames, not the full viewing experience. Where that matters, say so in
  `Evidence and limits`, and keep `visual/coverage.json` truthful about which
  sheets you actually inspected and what stayed illegible.
