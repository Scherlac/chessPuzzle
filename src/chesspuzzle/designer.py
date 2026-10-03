from __future__ import annotations

import json
import shutil
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
PIECE_NAMES = {"p": "pawn", "n": "knight", "b": "bishop", "r": "rook", "q": "queen", "k": "king"}


def _piece_at(fen: str, square: str) -> str | None:
    board = fen.split()[0].split("/")
    file_index = ord(square[0]) - ord("a")
    for symbol in board[8 - int(square[1])]:
        if symbol.isdigit():
            file_index -= int(symbol)
        elif file_index == 0:
            return symbol
        else:
            file_index -= 1
    return None


def classify_candidates(fen: str, candidates: list[dict], per_outcome: int = 2) -> dict:
    groups: dict[str, list[dict]] = {}
    for candidate in candidates:
        score = candidate.get("score")
        mate = candidate.get("mate")
        if mate is not None:
            outcome = "forced mate" if mate > 0 else "forced loss"
        elif score is not None and score >= 1:
            outcome = "winning"
        elif score is not None and score <= -1:
            outcome = "losing"
        else:
            outcome = "equal or drawing"
        piece_types = {
            PIECE_NAMES[piece.lower()]
            for move in candidate.get("pv", [])
            for piece in [_piece_at(fen, move[:2])]
            if piece and piece.lower() in PIECE_NAMES
        }
        groups.setdefault(outcome, []).append({**candidate, "outcome": outcome, "involved_pieces": sorted(piece_types)})
    priority = {"forced mate": 0, "winning": 1, "equal or drawing": 2, "losing": 3, "forced loss": 4}
    representatives = []
    for outcome in sorted(groups, key=lambda value: priority.get(value, 99)):
        representatives.extend(groups[outcome][:per_outcome])
    return {"groups": groups, "representatives": representatives}


def rank_solutions(
    fen: str | None = None,
    *,
    image_path: Path | None = None,
    setup_move: str | None = None,
    side_to_move: str = "w",
    depth: int = 25,
    plies: int = 6,
    per_outcome: int = 2,
    explore_depths: list[int] | None = None,
    explore_candidates: int = 20,
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
    result = subprocess.run(args, cwd=ROOT, capture_output=True, text=True)
    if result.returncode:
        detail = result.stderr.strip() or result.stdout.strip() or "solver exited without a message"
        raise RuntimeError(f"Puzzle solver failed: {detail}")
    if not result.stdout.strip():
        raise RuntimeError("Puzzle solver returned no result")
    parsed = json.loads(result.stdout)
    first_position = parsed.get("line", [{}])[0] if parsed.get("line") else {}
    parsed["candidate_classification"] = classify_candidates(parsed["startFen"], first_position.get("candidates", []), per_outcome)
    parsed["explorations"] = []
    for exploratory_depth in explore_depths or []:
        exploratory = rank_solutions(
            parsed["startFen"],
            setup_move=parsed.get("setupMove"),
            side_to_move=side_to_move,
            depth=exploratory_depth,
            plies=plies,
            per_outcome=per_outcome,
            explore_candidates=explore_candidates,
        )
        parsed["explorations"].append({"depth": exploratory_depth, "result": exploratory})
    return parsed


def line_positions(fen: str, line: list[str]) -> list[dict]:
    node = shutil.which("node") or shutil.which("node.exe")
    if node is None:
        raise RuntimeError("Node.js is required to preview puzzle lines")
    result = subprocess.run(
        [node, str(ROOT / "scripts" / "line_positions.mjs"), fen, json.dumps(line)],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
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


def generate_report(
    fen: str,
    line: list[str],
    report_path: Path,
    *,
    side_to_move: str = "w",
    objective: str = "concept",
    winner: str = "White",
    depth: int = 25,
    per_outcome: int = 2,
    explore_depths: list[int] | None = None,
    explore_candidates: int = 20,
    image_path: Path | None = None,
    setup_move: str | None = None,
) -> dict:
    node = shutil.which("node") or shutil.which("node.exe")
    if node is None:
        raise RuntimeError("Node.js is required for puzzle report generation")
    args = [
            node,
            str(ROOT / "scripts" / "generate_puzzle_design_report.mjs"),
            "--image" if image_path else "--fen", str(image_path or fen),
            "--setup", setup_move or "",
            "--side-to-move", side_to_move,
            "--objective", objective,
            "--winner", winner,
            "--depth", str(depth),
            "--per-outcome", str(per_outcome),
            "--explore-depths", ",".join(str(value) for value in (explore_depths or [6, 12, 16])),
            "--explore-candidates", str(explore_candidates),
            "--plies", str(len(line) or 5),
            "--report", str(report_path),
        ]
    if line:
        args.extend(["--line", json.dumps(line)])
    result = subprocess.run(
        args,
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(result.stdout)