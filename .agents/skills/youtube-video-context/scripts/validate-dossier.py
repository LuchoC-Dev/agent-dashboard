import argparse
import json
import re
import sys
from pathlib import Path


REQUIRED_TOP_KEYS = {
    "schema_version",
    "source",
    "analysis_lens",
    "summary",
    "topics",
    "recommendations",
    "assessment",
    "evidence_boundary",
}

REQUIRED_SOURCE_KEYS = (
    "video_id",
    "title",
    "url",
    "creator",
    "duration_seconds",
    "language",
)

REQUIRED_LENS_KEYS = (
    "lens",
    "rationale",
    "chosen_by",
)

REQUIRED_TOPIC_KEYS = (
    "id",
    "title",
    "what_the_source_says",
    "evidence_class",
    "timestamps",
    "visual_evidence",
)

REQUIRED_RECOMMENDATION_KEYS = (
    "id",
    "recommendation",
    "rationale",
    "confidence",
)

REQUIRED_ASSESSMENT_KEYS = (
    "strengths",
    "weaknesses",
    "verdict",
    "basis",
)

VALID_EVIDENCE_CLASSES = {"direct", "visual", "time_bound", "unverified"}
VALID_CONFIDENCE = {"high", "medium", "low"}
VALID_CHOSEN_BY = {"agent", "user"}

WORDS_PER_MINUTE = 80
MIN_WORDS_FLOOR = 800
MIN_WORDS_CEILING = 5000

UNIFORM_FRAME_RE = re.compile(r"^frame-\d{2}pct\.png$")
ADAPTIVE_FRAME_RE = re.compile(r"^adaptive-\d{9}ms\.png$")
CITATION_RE = re.compile(
    r"(?:frame-\d{2}pct|supplemental-\d+s|"
    r"adaptive-\d{9}ms|sequence-[A-Za-z0-9_-]+-\d{9}ms-\d{2})\.png"
)
CONTEXT_LANGUAGE_RE = re.compile(
    r'^\s*context_language\s*:\s*"?([A-Za-z-]+)"?\s*$', re.MULTILINE
)
ANALYSIS_LENS_RE = re.compile(r'^\s*analysis_lens\s*:\s*"?(.+?)"?\s*$', re.MULTILINE)
LENS_CHOSEN_BY_RE = re.compile(
    r'^\s*lens_chosen_by\s*:\s*"?([A-Za-z]+)"?\s*$', re.MULTILINE
)


class ValidationError(Exception):
    pass


def fail(message: str) -> None:
    raise ValidationError(message)


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig")


def required_words(duration_seconds: float) -> int:
    scaled = int(WORDS_PER_MINUTE * (duration_seconds / 60.0))
    return max(MIN_WORDS_FLOOR, min(MIN_WORDS_CEILING, scaled))


def check_non_empty(container: dict, keys, label: str, owner: str) -> None:
    for key in keys:
        if key not in container:
            fail(f"{label} '{owner}' is missing {key}")
        value = container[key]
        if value is None:
            fail(f"{label} '{owner}' has an empty {key}")
        if isinstance(value, str) and not value.strip():
            fail(f"{label} '{owner}' has an empty {key}")
        if isinstance(value, (list, dict)) and len(value) == 0:
            fail(f"{label} '{owner}' has an empty {key}")


def validate_visual_coverage(
    visual_dir: Path, frames_dir: Path, expected_profile: str
) -> dict:
    """Check the adaptive scan for auto and visual-heavy runs.

    `standard` runs have no adaptive stage, so an absent report is valid there
    and only there.
    """
    coverage_path = visual_dir / "coverage.json"
    if expected_profile == "standard" and not coverage_path.is_file():
        return {
            "requested_profile": "standard",
            "resolved_profile": "standard",
            "adaptive_frames": 0,
            "sequence_frames": 0,
            "adaptive_sheets": 0,
        }
    if not coverage_path.is_file():
        fail(
            f"Missing visual coverage report for profile {expected_profile}: "
            f"{coverage_path}"
        )

    coverage = json.loads(read_text(coverage_path))
    if coverage.get("schema_version") != "1.0":
        fail("Expected visual/coverage.json schema_version 1.0.")
    requested_profile = coverage.get("requested_profile")
    resolved_profile = coverage.get("resolved_profile")
    if requested_profile not in {"auto", "visual-heavy"}:
        fail("coverage.json requested_profile must be auto or visual-heavy.")
    if resolved_profile not in {"standard", "visual-heavy"}:
        fail("coverage.json resolved_profile must be standard or visual-heavy.")
    if expected_profile == "visual-heavy" and (
        requested_profile != "visual-heavy" or resolved_profile != "visual-heavy"
    ):
        fail("Expected an explicitly requested and resolved visual-heavy profile.")
    if expected_profile == "auto" and requested_profile != "auto":
        fail("Expected coverage.json requested_profile auto.")

    sampling = coverage.get("sampling", {})
    target_gap = float(sampling.get("target_max_gap_seconds", 0))
    observed_gap = float(sampling.get("max_observed_gap_seconds", -1))
    allowed_gap = 10.0 if resolved_profile == "visual-heavy" else 20.0
    if target_gap <= 0 or target_gap > allowed_gap + 0.01:
        fail(
            f"Visual target gap {target_gap}s exceeds {allowed_gap}s for "
            f"{resolved_profile}."
        )
    if observed_gap < 0 or observed_gap > target_gap + 0.05:
        fail(f"Observed visual coverage gap {observed_gap}s exceeds target {target_gap}s.")

    adaptive_frames = coverage.get("frames", [])
    if not adaptive_frames:
        fail("coverage.json contains no adaptive frames.")
    for frame in adaptive_frames:
        filename = frame.get("file", "")
        if not ADAPTIVE_FRAME_RE.fullmatch(filename):
            fail(f"Invalid adaptive frame name in coverage.json: {filename}")
        if not (frames_dir / filename).is_file():
            fail(f"Missing adaptive frame declared in coverage.json: {filename}")

    sheets = sorted(frames_dir.glob("adaptive-contact-sheet-*.jpg"))
    if not sheets:
        fail("No paginated adaptive contact sheets found.")

    # These flags are set by the agent after genuinely looking at the sheets.
    # No script can verify that, which is exactly why they are recorded.
    manual_review = coverage.get("manual_review", {})
    if manual_review.get("adaptive_sheets_inspected") is not True:
        fail("Adaptive contact sheets have not been marked as inspected.")
    if manual_review.get("timeline_coverage_reviewed") is not True:
        fail("Adaptive timeline coverage has not been marked as reviewed.")
    sequence_frames = list(frames_dir.glob("sequence-*.png"))
    if sequence_frames and manual_review.get("temporal_sequences_reviewed") is not True:
        fail("Temporal sequences exist but have not been marked as reviewed.")

    return {
        "requested_profile": requested_profile,
        "resolved_profile": resolved_profile,
        "adaptive_frames": len(adaptive_frames),
        "sequence_frames": len(sequence_frames),
        "adaptive_sheets": len(sheets),
        "max_observed_gap_seconds": observed_gap,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--video-dir", required=True, type=Path)
    parser.add_argument("--expected-folder-name", required=True)
    parser.add_argument(
        "--expected-visual-profile",
        choices=("standard", "auto", "visual-heavy"),
        default="standard",
    )
    args = parser.parse_args()

    resolved_dir = args.video_dir.resolve()
    context_path = resolved_dir / "deliverables" / "context.md"
    analysis_path = resolved_dir / "deliverables" / "analysis.json"
    transcript_path = resolved_dir / "transcript" / "source.txt"
    captions_path = resolved_dir / "transcript" / "source.vtt"
    visual_dir = resolved_dir / "visual"
    frames_dir = visual_dir / "frames"
    contact_sheet_path = frames_dir / "contact-sheet.jpg"
    video_path = resolved_dir / "source" / "video.mp4"
    metadata_path = resolved_dir / "source" / "metadata.json"

    required_files = (
        context_path,
        analysis_path,
        transcript_path,
        captions_path,
        contact_sheet_path,
        video_path,
        metadata_path,
    )

    for path in required_files:
        if not path.is_file():
            fail(f"Missing required file: {path}")

    context = read_text(context_path)
    analysis_text = read_text(analysis_path)
    analysis = json.loads(analysis_text)
    metadata = json.loads(read_text(metadata_path))

    actual_top = set(analysis.keys())
    if actual_top != REQUIRED_TOP_KEYS:
        fail("Top-level analysis.json keys do not match the v2 contract.")

    if analysis.get("schema_version") != "2.0":
        fail("Expected schema_version 2.0.")

    source = analysis.get("source", {})
    for key in REQUIRED_SOURCE_KEYS:
        if key not in source:
            fail(f"Missing source.{key}")
        value = source[key]
        if isinstance(value, str) and not value.strip():
            fail(f"Empty source.{key}")

    lens = analysis.get("analysis_lens", {})
    if not isinstance(lens, dict):
        fail("analysis_lens must be an object.")
    check_non_empty(lens, REQUIRED_LENS_KEYS, "analysis_lens", "analysis_lens")
    if lens.get("chosen_by") not in VALID_CHOSEN_BY:
        fail(
            "analysis_lens.chosen_by must be 'agent' or 'user'; got "
            f"'{lens.get('chosen_by')}'"
        )

    summary = analysis.get("summary", "")
    if not isinstance(summary, str) or not summary.strip():
        fail("analysis.json summary is empty.")

    topics = analysis.get("topics", [])
    if not topics:
        fail("analysis.json contains no topics.")
    for topic in topics:
        topic_id = topic.get("id")
        check_non_empty(topic, REQUIRED_TOPIC_KEYS, "Topic", topic_id)
        if topic["evidence_class"] not in VALID_EVIDENCE_CLASSES:
            fail(
                f"Topic '{topic_id}' has evidence_class "
                f"'{topic['evidence_class']}'; expected one of "
                f"{sorted(VALID_EVIDENCE_CLASSES)}"
            )

    recommendations = analysis.get("recommendations", [])
    for recommendation in recommendations:
        recommendation_id = recommendation.get("id")
        check_non_empty(
            recommendation,
            REQUIRED_RECOMMENDATION_KEYS,
            "Recommendation",
            recommendation_id,
        )
        if recommendation["confidence"] not in VALID_CONFIDENCE:
            fail(
                f"Recommendation '{recommendation_id}' has confidence "
                f"'{recommendation['confidence']}'; expected one of "
                f"{sorted(VALID_CONFIDENCE)}"
            )

    assessment = analysis.get("assessment", {})
    if not isinstance(assessment, dict):
        fail("assessment must be an object.")
    check_non_empty(assessment, REQUIRED_ASSESSMENT_KEYS, "assessment", "assessment")

    video_id = str(source.get("video_id", ""))
    if video_id not in context:
        fail(f"context.md does not contain video ID {video_id}")

    if not ANALYSIS_LENS_RE.search(context):
        fail("context.md header does not declare analysis_lens.")
    chosen_by_match = LENS_CHOSEN_BY_RE.search(context)
    if not chosen_by_match:
        fail("context.md header does not declare lens_chosen_by.")
    if chosen_by_match.group(1) not in VALID_CHOSEN_BY:
        fail(
            "context.md lens_chosen_by must be 'agent' or 'user'; got "
            f"'{chosen_by_match.group(1)}'"
        )

    actual_folder_name = resolved_dir.name
    if actual_folder_name != args.expected_folder_name:
        fail(
            f"Video directory '{actual_folder_name}' does not match expected "
            f"title slug '{args.expected_folder_name}'"
        )
    if video_id.lower() in actual_folder_name.lower():
        fail(f"Video directory must not contain YouTube ID {video_id}")

    duration_seconds = float(source.get("duration_seconds", 0))
    minimum_words = required_words(duration_seconds)
    word_count = len(context.split())
    if word_count < minimum_words:
        fail(
            f"context.md has only {word_count} words; this {duration_seconds:.0f}s "
            f"video requires at least {minimum_words}."
        )

    if metadata.get("id") != video_id:
        fail("metadata.json video ID does not match analysis.json.")
    if metadata.get("language") != source.get("language"):
        fail("metadata.json language does not match analysis.json.")
    if abs(float(metadata.get("duration", 0)) - duration_seconds) > 1:
        fail("metadata.json duration differs from analysis.json by more than 1 second.")

    uniform_frames = sorted(
        p.name for p in frames_dir.glob("*") if p.is_file() and UNIFORM_FRAME_RE.match(p.name)
    )
    if len(uniform_frames) != 20:
        fail(f"Expected 20 uniform frames; found {len(uniform_frames)}.")

    citations = sorted(set(CITATION_RE.findall(context + "\n" + analysis_text)))
    for citation in citations:
        if not (frames_dir / citation).is_file():
            fail(f"Missing cited frame: {citation}")

    coverage_metrics = validate_visual_coverage(
        visual_dir, frames_dir, args.expected_visual_profile
    )

    # Informational only: the declared language is reported, not validated.
    language_match = CONTEXT_LANGUAGE_RE.search(context)
    declared_language = language_match.group(1) if language_match else "(not declared)"

    result = {
        "video_id": video_id,
        "source_language": source.get("language"),
        "context_language": declared_language,
        "duration_seconds": source.get("duration_seconds"),
        "analysis_lens": lens.get("lens"),
        "lens_chosen_by": lens.get("chosen_by"),
        "context_words": word_count,
        "required_words": minimum_words,
        "topics": len(topics),
        "recommendations": len(recommendations),
        "uniform_frames": len(uniform_frames),
        "cited_frames": len(citations),
        "visual_coverage": coverage_metrics,
        "result": "PASS",
    }
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    try:
        main()
    except ValidationError as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)
    except (json.JSONDecodeError, OSError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        sys.exit(1)
