import argparse
from pathlib import Path

import cv2


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("video", type=Path)
    parser.add_argument("output_dir", type=Path)
    parser.add_argument("--count", type=int, default=20)
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)
    capture = cv2.VideoCapture(str(args.video))
    if not capture.isOpened():
        raise SystemExit(f"Could not open {args.video}")

    frame_count = int(capture.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = capture.get(cv2.CAP_PROP_FPS)
    duration = frame_count / fps

    for index in range(args.count):
        fraction = index / args.count
        timestamp_ms = fraction * duration * 1000
        capture.set(cv2.CAP_PROP_POS_MSEC, timestamp_ms)
        ok, frame = capture.read()
        if not ok:
            raise SystemExit(f"Could not read frame at {timestamp_ms / 1000:.2f}s")
        percent = round(fraction * 100)
        output = args.output_dir / f"frame-{percent:02d}pct.png"
        if not cv2.imwrite(str(output), frame):
            raise SystemExit(f"Could not write {output}")

    capture.release()
    print(f"{args.count} frames, duration={duration:.2f}s, fps={fps:.3f}")


if __name__ == "__main__":
    main()
