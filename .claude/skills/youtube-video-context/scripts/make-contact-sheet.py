import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


COLUMNS = 4
THUMB_WIDTH = 320
THUMB_HEIGHT = 180
LABEL_HEIGHT = 24
BACKGROUND = (24, 24, 24)
TEXT_COLOR = (255, 255, 255)


def load_label_font() -> ImageFont.ImageFont:
    try:
        return ImageFont.load_default(size=14)
    except TypeError:
        # Pillow < 10.1 does not accept a size argument.
        return ImageFont.load_default()


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--frame-dir", required=True, type=Path)
    parser.add_argument("--output-name", default="contact-sheet.jpg")
    parser.add_argument("--filter", default="frame-*.png")
    parser.add_argument(
        "--page-size",
        type=int,
        default=0,
        help="Frames per numbered sheet; 0 creates one unnumbered sheet.",
    )
    args = parser.parse_args()

    files = sorted(args.frame_dir.glob(args.filter))
    if not files:
        raise SystemExit(f"No files matched '{args.filter}' in {args.frame_dir}")

    if args.page_size < 0:
        raise SystemExit("--page-size cannot be negative")
    pages = (
        [files]
        if args.page_size == 0
        else [files[index : index + args.page_size] for index in range(0, len(files), args.page_size)]
    )
    requested_output = Path(args.output_name)
    outputs = []
    font = load_label_font()
    for page_index, page_files in enumerate(pages, start=1):
        rows = math.ceil(len(page_files) / COLUMNS)
        canvas_width = COLUMNS * THUMB_WIDTH
        canvas_height = rows * (THUMB_HEIGHT + LABEL_HEIGHT)
        canvas = Image.new("RGB", (canvas_width, canvas_height), BACKGROUND)
        draw = ImageDraw.Draw(canvas)
        for index, file_path in enumerate(page_files):
            column = index % COLUMNS
            row = index // COLUMNS
            x = column * THUMB_WIDTH
            y = row * (THUMB_HEIGHT + LABEL_HEIGHT)
            with Image.open(file_path) as source_image:
                thumbnail = source_image.convert("RGB").resize(
                    (THUMB_WIDTH, THUMB_HEIGHT), Image.LANCZOS
                )
            canvas.paste(thumbnail, (x, y))
            draw.text((x + 6, y + THUMB_HEIGHT + 3), file_path.stem, fill=TEXT_COLOR, font=font)
        if args.page_size == 0:
            output_name = requested_output.name
        else:
            output_name = f"{requested_output.stem}-{page_index:02d}{requested_output.suffix}"
        output_path = args.frame_dir / output_name
        canvas.save(output_path, "JPEG")
        outputs.append(str(output_path))
    print("\n".join(outputs))


if __name__ == "__main__":
    main()
