"""Extract scene changes and bounded timeline anchors from a video.

Runs in the foreground and prints progress to stderr. Both passes decode
sequentially: seeking once per sample is what used to make this step slow
enough that agents pushed it to the background and lost track of it.
"""

import argparse
import json
import math
import sys
from pathlib import Path

import cv2


def visual_signature(frame):
    small = cv2.resize(frame, (160, 90), interpolation=cv2.INTER_AREA)
    gray = cv2.cvtColor(small, cv2.COLOR_BGR2GRAY)
    hsv = cv2.cvtColor(small, cv2.COLOR_BGR2HSV)
    histogram = cv2.calcHist([hsv], [0, 1], None, [24, 16], [0, 180, 0, 256])
    cv2.normalize(histogram, histogram)
    return gray, histogram


def change_score(previous, current):
    previous_gray, previous_histogram = previous
    current_gray, current_histogram = current
    pixel_delta = float(cv2.absdiff(previous_gray, current_gray).mean()) / 255.0
    correlation = cv2.compareHist(
        previous_histogram, current_histogram, cv2.HISTCMP_CORREL
    )
    histogram_delta = max(0.0, min(1.0, 1.0 - float(correlation)))
    return 0.55 * histogram_delta + 0.45 * pixel_delta


def add_candidate(candidates, timestamp, reason, score=0.0):
    timestamp = round(max(0.0, timestamp), 3)
    current = candidates.setdefault(timestamp, {"reasons": [], "change_score": 0.0})
    if reason not in current["reasons"]:
        current["reasons"].append(reason)
    current["change_score"] = max(current["change_score"], round(score, 6))


def open_capture(video_path: Path) -> cv2.VideoCapture:
    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise SystemExit(f"Could not open {video_path}")
    return capture


def progress(label: str, done: int, total: int, every: int, quiet: bool) -> None:
    """Report progress on stderr so a foreground run visibly advances."""
    if quiet or total <= 0:
        return
    if done % every and done != total:
        return
    percent = 100.0 * done / total
    print(f"[{label}] {done}/{total} ({percent:.0f}%)", file=sys.stderr, flush=True)


def walk_sequentially(capture, target_indices, quiet, label):
    """Yield (index, frame) for each target index, decoding in one forward pass.

    `grab()` advances without decoding, which is far cheaper than a seek. Only
    the frames actually wanted are decoded with `retrieve()`.
    """
    if not target_indices:
        return
    total = len(target_indices)
    every = max(1, total // 20)
    pending = 0
    current_index = 0
    delivered = 0
    while pending < total:
        if not capture.grab():
            break
        target = target_indices[pending]
        if current_index >= target:
            ok, frame = capture.retrieve()
            if not ok:
                break
            delivered += 1
            progress(label, delivered, total, every, quiet)
            yield target, frame
            pending += 1
            # Several targets can collapse onto one decoded frame on short videos.
            while pending < total and target_indices[pending] <= current_index:
                pending += 1
        current_index += 1


def main():
    parser = argparse.ArgumentParser(
        description="Extract scene changes and bounded timeline anchors."
    )
    parser.add_argument("video", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--profile", choices=("auto", "visual-heavy"), default="auto")
    parser.add_argument("--sample-step", type=float, default=0.5)
    parser.add_argument("--scene-threshold", type=float, default=0.20)
    parser.add_argument("--min-scene-gap", type=float, default=1.0)
    parser.add_argument("--max-scenes", type=int, default=160)
    parser.add_argument("--report", type=Path)
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="Suppress the stderr progress output.",
    )
    args = parser.parse_args()

    if args.sample_step <= 0 or args.min_scene_gap < 0 or args.max_scenes < 1:
        raise SystemExit("Sampling arguments must be positive.")

    capture = open_capture(args.video)
    frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = float(capture.get(cv2.CAP_PROP_FPS))
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    if frame_count <= 0 or fps <= 0:
        raise SystemExit("Video metadata does not contain a usable duration.")
    duration = frame_count / fps

    sample_times = []
    timestamp = 0.0
    while timestamp < duration:
        sample_times.append(timestamp)
        timestamp += args.sample_step
    end_timestamp = max(0.0, duration - (1.0 / fps))
    if not sample_times or end_timestamp - sample_times[-1] > 0.05:
        sample_times.append(end_timestamp)

    # Pass 1: scan for scene changes, decoding only the sampled frames.
    sample_indices = sorted({min(int(round(t * fps)), frame_count - 1) for t in sample_times})
    scene_candidates = []
    previous_signature = None
    previous_scene_time = -math.inf
    scores = []
    for index, frame in walk_sequentially(capture, sample_indices, args.quiet, "scan"):
        sample_time = index / fps
        signature = visual_signature(frame)
        if previous_signature is not None:
            score = change_score(previous_signature, signature)
            scores.append(score)
            if (
                score >= args.scene_threshold
                and sample_time - previous_scene_time >= args.min_scene_gap
            ):
                scene_candidates.append((sample_time, score))
                previous_scene_time = sample_time
        previous_signature = signature
    capture.release()

    if len(scene_candidates) > args.max_scenes:
        scene_candidates = sorted(
            sorted(scene_candidates, key=lambda item: item[1], reverse=True)[: args.max_scenes]
        )

    minutes = max(duration / 60.0, 1.0 / 60.0)
    scene_changes_per_minute = len(scene_candidates) / minutes
    mean_change_score = sum(scores) / len(scores) if scores else 0.0
    if args.profile == "visual-heavy":
        resolved_profile = "visual-heavy"
    elif scene_changes_per_minute >= 2.0 or mean_change_score >= 0.055:
        resolved_profile = "visual-heavy"
    else:
        resolved_profile = "standard"
    max_gap = 10.0 if resolved_profile == "visual-heavy" else 20.0

    candidates = {}
    add_candidate(candidates, 0.0, "start")
    add_candidate(candidates, end_timestamp, "end")
    for scene_time, score in scene_candidates:
        add_candidate(candidates, min(scene_time, end_timestamp), "scene-change", score)
    anchor = max_gap
    while anchor < end_timestamp:
        add_candidate(candidates, anchor, "timeline-anchor")
        anchor += max_gap

    selected_times = sorted(candidates)
    args.output_dir.mkdir(parents=True, exist_ok=True)
    report_path = args.report or args.output_dir.parent / "coverage.json"
    report_path.parent.mkdir(parents=True, exist_ok=True)

    # Pass 2: write the selected frames, again in a single forward pass.
    index_to_time = {}
    for selected_time in selected_times:
        index = min(int(round(selected_time * fps)), frame_count - 1)
        index_to_time.setdefault(index, selected_time)
    capture = open_capture(args.video)
    frames = []
    for index, frame in walk_sequentially(
        capture, sorted(index_to_time), args.quiet, "write"
    ):
        selected_time = index_to_time[index]
        milliseconds = int(round(selected_time * 1000.0))
        filename = f"adaptive-{milliseconds:09d}ms.png"
        output_path = args.output_dir / filename
        if not cv2.imwrite(str(output_path), frame):
            raise SystemExit(f"Could not write {output_path}")
        data = candidates[selected_time]
        frames.append(
            {
                "file": filename,
                "timestamp_seconds": selected_time,
                "reasons": data["reasons"],
                "change_score": data["change_score"],
            }
        )
    capture.release()

    if not frames:
        raise SystemExit("No adaptive frames could be decoded from the video.")

    written_times = [frame["timestamp_seconds"] for frame in frames]
    observed_gaps = [
        right - left for left, right in zip(written_times, written_times[1:])
    ]
    report = {
        "schema_version": "1.0",
        "requested_profile": args.profile,
        "resolved_profile": resolved_profile,
        "source": {
            "video": str(args.video),
            "duration_seconds": round(duration, 3),
            "fps": round(fps, 6),
            "width": width,
            "height": height,
        },
        "sampling": {
            "sample_step_seconds": args.sample_step,
            "scene_threshold": args.scene_threshold,
            "min_scene_gap_seconds": args.min_scene_gap,
            "target_max_gap_seconds": max_gap,
            "max_observed_gap_seconds": round(max(observed_gaps, default=0.0), 3),
        },
        "metrics": {
            "analyzed_samples": len(sample_indices),
            "scene_changes": len(scene_candidates),
            "scene_changes_per_minute": round(scene_changes_per_minute, 3),
            "mean_change_score": round(mean_change_score, 6),
            "adaptive_frames": len(frames),
        },
        "frames": frames,
        "manual_review": {
            "adaptive_sheets_inspected": False,
            "timeline_coverage_reviewed": False,
            "temporal_sequences_reviewed": False,
            "notes": [],
        },
    }
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(
        json.dumps(
            {
                "report": str(report_path),
                **report["metrics"],
                "resolved_profile": resolved_profile,
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
