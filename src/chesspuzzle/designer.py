from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]


def rank_solutions(
    fen: str | None = None,
    *,
    image_path: Path | None = None,
    setup_move: str | None = None,
    side_to_move: str = "w",
    depth: int = 12,
    plies: int = 6,
) -> dict:
    node = shutil.which("node") or shutil.which("node.exe")
    if node is None:
        raise RuntimeError("Node.js is required for puzzle design")
    args = [node, str(ROOT / "scripts" / "solve_puzzle.mjs")]
    if image_path:
        args.extend(["--image", str(image_path)])
    else:
        args.append(fen or "")
    args.extend([str(depth), str(plies)])
    if setup_move:
        args.extend(["--setup", setup_move])
    if side_to_move != "w":
        args.extend(["--side-to-move", side_to_move])
    result = subprocess.run(args, cwd=ROOT, capture_output=True, text=True, check=True)
    return json.loads(result.stdout)


def describe_puzzle(image_path: Path, details: dict) -> dict:
    node = shutil.which("node") or shutil.which("node.exe")
    if node is None:
        raise RuntimeError("Node.js is required for puzzle description")
    payload = json.dumps({"imagePath": str(image_path), "details": details})
    result = subprocess.run(
        [node, str(ROOT / "scripts" / "describe_puzzle.mjs")],
        cwd=ROOT,
        input=payload,
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout)


def capture_design(fen: str, line: list[str], output_path: Path, setup_move: str | None = None) -> dict:
    node = shutil.which("node") or shutil.which("node.exe")
    if node is None:
        raise RuntimeError("Node.js is required for puzzle image capture")
    result = subprocess.run(
        [node, str(ROOT / "scripts" / "capture_puzzle_design.mjs")],
        cwd=ROOT,
        input=json.dumps({"fen": fen, "line": line, "setupMove": setup_move, "output": str(output_path)}),
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout)