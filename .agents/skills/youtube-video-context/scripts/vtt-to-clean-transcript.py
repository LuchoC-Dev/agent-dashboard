import argparse
import html
import re
from pathlib import Path


TIMESTAMP = re.compile(
    r"(?P<h>\d{2}):(?P<m>\d{2}):(?P<s>\d{2})[.,](?P<ms>\d{3})"
)
TAG = re.compile(r"<[^>]+>")


def seconds(value: str) -> float:
    match = TIMESTAMP.search(value)
    if not match:
        raise ValueError(value)
    return (
        int(match["h"]) * 3600
        + int(match["m"]) * 60
        + int(match["s"])
        + int(match["ms"]) / 1000
    )


def clock(value: float) -> str:
    total = int(value)
    hours, remainder = divmod(total, 3600)
    minutes, secs = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{secs:02d}"


def normalize(token: str) -> str:
    return token.casefold().strip()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--title", required=True)
    parser.add_argument("--video-id", required=True)
    parser.add_argument("--language", required=True)
    args = parser.parse_args()

    raw = args.input.read_text(encoding="utf-8-sig")
    blocks = re.split(r"\r?\n\r?\n+", raw)
    transcript: list[str] = []
    paragraphs: list[tuple[float, list[str]]] = []
    paragraph_words: list[str] = []
    paragraph_start: float | None = None

    for block in blocks:
        lines = [line.strip() for line in block.splitlines() if line.strip()]
        timestamp_index = next(
            (index for index, line in enumerate(lines) if "-->" in line), None
        )
        if timestamp_index is None:
            continue

        start = seconds(lines[timestamp_index])
        text = " ".join(lines[timestamp_index + 1 :])
        text = html.unescape(TAG.sub("", text))
        words = text.split()
        if not words:
            continue

        overlap = 0
        limit = min(len(transcript), len(words), 80)
        for size in range(limit, 0, -1):
            left = [normalize(token) for token in transcript[-size:]]
            right = [normalize(token) for token in words[:size]]
            if left == right:
                overlap = size
                break

        new_words = words[overlap:]
        if not new_words:
            continue

        transcript.extend(new_words)
        if paragraph_start is None:
            paragraph_start = start
        if start - paragraph_start >= 30 and paragraph_words:
            paragraphs.append((paragraph_start, paragraph_words))
            paragraph_words = []
            paragraph_start = start
        paragraph_words.extend(new_words)

    if paragraph_words and paragraph_start is not None:
        paragraphs.append((paragraph_start, paragraph_words))

    header = [
        f"# {args.title}",
        "",
        f"- video_id: {args.video_id}",
        f"- language: {args.language}",
        f"- caption_source: {args.input.name}",
        "",
    ]
    body: list[str] = []
    for start, words in paragraphs:
        body.append(f"[{clock(start)}] {' '.join(words)}")
        body.append("")

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text("\n".join(header + body).rstrip() + "\n", encoding="utf-8")
    print(f"{args.video_id}: {len(transcript)} words, {len(paragraphs)} segments")


if __name__ == "__main__":
    main()
