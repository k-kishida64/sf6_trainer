"""Convert a MOV/MP4 video to an optimized GIF.

Usage:
    python convert_mov_to_gif.py input.mov
    python convert_mov_to_gif.py input.mov -o output.gif --width 480 --fps 12
    python convert_mov_to_gif.py

FFmpeg must be installed and available on PATH.
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path
import tkinter as tk
from tkinter import filedialog


def choose_input_file() -> Path | None:
    root = tk.Tk()
    root.withdraw()
    selected = filedialog.askopenfilename(
        title="MOVファイルを選択",
        filetypes=[
            ("Video files", "*.mov *.mp4 *.m4v *.avi *.webm"),
            ("MOV files", "*.mov"),
            ("All files", "*.*"),
        ],
    )
    root.destroy()
    return Path(selected) if selected else None


def convert(input_path: Path, output_path: Path, width: int, fps: int) -> None:
    if shutil.which("ffmpeg") is None:
        raise RuntimeError(
            "FFmpegが見つかりません。https://ffmpeg.org/download.html からインストールし、"
            "ffmpeg.exe がPATHにあることを確認してください。"
        )

    palette = output_path.with_name(f".{output_path.stem}_palette.png")
    filter_graph = (
        f"fps={fps},scale={width}:-1:flags=lanczos,"
        f"split[s0][s1];[s0]palettegen=max_colors=256[p];"
        f"[s1][p]paletteuse=dither=sierra2_4a"
    )

    command = [
        "ffmpeg",
        "-y",
        "-i",
        str(input_path),
        "-vf",
        filter_graph,
        "-loop",
        "0",
        str(output_path),
    ]

    try:
        subprocess.run(command, check=True)
    finally:
        if palette.exists():
            palette.unlink()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="MOV/MP4をGIFへ変換します")
    parser.add_argument("input", nargs="?", type=Path, help="変換元の動画ファイル")
    parser.add_argument("-o", "--output", type=Path, help="出力GIFファイル名")
    parser.add_argument("--width", type=int, default=480, help="GIFの幅（初期値: 480）")
    parser.add_argument("--fps", type=int, default=12, help="GIFのFPS（初期値: 12）")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    input_path = args.input or choose_input_file()

    if input_path is None:
        print("ファイルが選択されませんでした。")
        return 0
    if not input_path.exists():
        print(f"入力ファイルが見つかりません: {input_path}", file=sys.stderr)
        return 1
    if args.width <= 0 or args.fps <= 0:
        print("--width と --fps は1以上にしてください。", file=sys.stderr)
        return 1

    output_path = args.output or input_path.with_suffix(".gif")
    output_path.parent.mkdir(parents=True, exist_ok=True)

    print(f"変換中: {input_path} -> {output_path}")
    try:
        convert(input_path, output_path, args.width, args.fps)
    except subprocess.CalledProcessError:
        print("変換に失敗しました。入力動画を確認してください。", file=sys.stderr)
        return 1
    except RuntimeError as error:
        print(error, file=sys.stderr)
        return 1

    print(f"完了: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
