"""Verify this interpreter can run the skill. Never installs anything.

Run it once, from the coordinator, before processing any video. Pass the
`interpreter` value it prints to every worker so the whole batch uses one
interpreter.
"""

import importlib.util
import json
import sys


MINIMUM_VERSION = (3, 10)

# (import name, pip package name)
REQUIREMENTS = (
    ("cv2", "opencv-python-headless"),
    ("PIL", "Pillow"),
    ("yt_dlp", "yt-dlp"),
)


def main() -> int:
    version = tuple(sys.version_info[:3])
    missing = [
        package
        for module, package in REQUIREMENTS
        if importlib.util.find_spec(module) is None
    ]
    too_old = version[:2] < MINIMUM_VERSION

    report = {
        "interpreter": sys.executable,
        "version": ".".join(str(part) for part in version),
        "minimum_version": ".".join(str(part) for part in MINIMUM_VERSION),
        "missing": missing,
        "result": "FAIL" if (missing or too_old) else "PASS",
    }
    print(json.dumps(report, indent=2))

    if too_old:
        print(
            f"ERROR: this interpreter is {report['version']}; the skill needs "
            f"{report['minimum_version']}+.\n"
            "Do NOT install another Python. Report this to the user and stop.",
            file=sys.stderr,
        )
        return 1

    if missing:
        print(
            "ERROR: missing packages: " + ", ".join(missing) + "\n"
            "Do NOT install them yourself and do NOT switch interpreters.\n"
            "Report this to the user, with the command they can run:\n"
            f'  "{sys.executable}" -m pip install ' + " ".join(missing),
            file=sys.stderr,
        )
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
