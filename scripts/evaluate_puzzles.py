from __future__ import annotations

import argparse
import json
import shutil
import subprocess
from dataclasses import asdict
from pathlib import Path

from chess_components import load_puzzles


def verify_with_stockfish(puzzles, depth: int, extra_plies: int) -> list[dict]:
    node = shutil.which("node") or shutil.which("node.exe")
    if node is None:
        raise RuntimeError("Node.js is required for Stockfish verification.")

    script = Path(__file__).with_name("verify_puzzles.mjs")
    payload = [
        {"puzzle_id": puzzle.puzzle_id, "fen": puzzle.fen, "setup_move": puzzle.setup_move, "moves": puzzle.moves}
        for puzzle in puzzles
    ]
    result = subprocess.run(
        [node, str(script), str(depth), str(extra_plies)],
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        check=True,
    )
    return json.loads(result.stdout)


def main() -> None:
    parser = argparse.ArgumentParser(description="Inspect evaluations for Lichess puzzles.")
    parser.add_argument("--limit", type=int, default=10)
    parser.add_argument("--verify", action="store_true", help="Compare solution moves with Node Stockfish.")
    parser.add_argument("--depth", type=int, default=10)
    parser.add_argument("--extra-plies", type=int, default=2)
    args = parser.parse_args()

    puzzles = load_puzzles(args.limit)
    if args.verify:
        static = {puzzle.puzzle_id: asdict(puzzle.evaluation) for puzzle in puzzles}
        for result in verify_with_stockfish(puzzles, args.depth, args.extra_plies):
            print(json.dumps({**static[result["puzzle_id"]], **result}))
    else:
        for puzzle in puzzles:
            print(json.dumps({"puzzle_id": puzzle.puzzle_id, **asdict(puzzle.evaluation)}))


if __name__ == "__main__":
    main()