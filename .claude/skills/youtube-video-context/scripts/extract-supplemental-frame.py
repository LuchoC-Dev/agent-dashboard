import argparse
from pathlib import Path

import cv2


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("video", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--timestamp", type=float, required=True)
    args = parser.parse_args()

    capture = cv2.VideoCapture(str(args.video))
    if not capture.isOpened():
        raise SystemExit(f"Could not open {args.video}")

    capture.set(cv2.CAP_PROP_POS_MSEC, args.timestamp * 1000)
    ok, frame = capture.read()
    capture.release()
    if not ok:
        raise SystemExit(f"Could not read frame at {args.timestamp:.2f}s")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(args.output), frame):
        raise SystemExit(f"Could not write {args.output}")

    print(f"{args.output}: timestamp={args.timestamp:.2f}s")


if __name__ == "__main__":
    main()
