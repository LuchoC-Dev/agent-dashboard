import argparse
import json
from pathlib import Path

import cv2


def main():
    parser = argparse.ArgumentParser(
        description="Extract a temporal frame sequence around a material event."
    )
    parser.add_argument("video", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--center", type=float, required=True)
    parser.add_argument("--radius", type=float, default=2.0)
    parser.add_argument("--step", type=float, default=0.5)
    parser.add_argument("--label", default="event")
    args = parser.parse_args()

    if args.radius < 0 or args.step <= 0:
        raise SystemExit("--radius must be non-negative and --step must be positive.")

    capture = cv2.VideoCapture(str(args.video))
    if not capture.isOpened():
        raise SystemExit(f"Could not open {args.video}")
    frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = float(capture.get(cv2.CAP_PROP_FPS))
    if frame_count <= 0 or fps <= 0:
        raise SystemExit("Video metadata does not contain a usable duration.")
    duration = frame_count / fps
    end = max(0.0, duration - (1.0 / fps))

    start_time = max(0.0, args.center - args.radius)
    stop_time = min(end, args.center + args.radius)
    timestamps = []
    timestamp = start_time
    while timestamp <= stop_time + 1e-9:
        timestamps.append(round(timestamp, 3))
        timestamp += args.step
    if not timestamps or stop_time - timestamps[-1] > 0.05:
        timestamps.append(round(stop_time, 3))

    safe_label = "".join(character if character.isalnum() or character in "-_" else "-" for character in args.label).strip("-") or "event"
    args.output_dir.mkdir(parents=True, exist_ok=True)
    outputs = []
    center_ms = int(round(args.center * 1000.0))
    for index, timestamp in enumerate(timestamps):
        capture.set(cv2.CAP_PROP_POS_MSEC, timestamp * 1000.0)
        ok, frame = capture.read()
        if not ok:
            raise SystemExit(f"Could not read frame at {timestamp:.3f}s")
        filename = f"sequence-{safe_label}-{center_ms:09d}ms-{index:02d}.png"
        output = args.output_dir / filename
        if not cv2.imwrite(str(output), frame):
            raise SystemExit(f"Could not write {output}")
        outputs.append({"file": filename, "timestamp_seconds": timestamp})
    capture.release()
    print(json.dumps({"center_seconds": args.center, "frames": outputs}, indent=2))


if __name__ == "__main__":
    main()
