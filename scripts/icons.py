#!/usr/bin/env python3
"""Renders the app's icon set (crates/gitnex-app/icons) from source.svg."""
import subprocess
from pathlib import Path

ICONS = Path(__file__).resolve().parent.parent / "crates" / "gitnex-app" / "icons"


def main() -> None:
    subprocess.run(
        ["cargo", "tauri", "icon", str(ICONS / "source.svg"), "-o", str(ICONS)],
        cwd=ICONS.parent,
        check=True,
    )


if __name__ == "__main__":
    main()
