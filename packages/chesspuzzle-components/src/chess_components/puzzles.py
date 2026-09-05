from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import zstandard


@dataclass(frozen=True)
class Puzzle:
    puzzle_id: str
    fen: str
    moves: tuple[str, ...]
    rating: int
    themes: tuple[str, ...]
    game_url: str


def _dataset_path() -> Path:
    return Path(__file__).resolve().parents[4] / "data" / "lichess_db_puzzle.csv.zst"


@lru_cache(maxsize=4)
def load_puzzles(limit: int = 100) -> tuple[Puzzle, ...]:
    puzzles: list[Puzzle] = []
    with _dataset_path().open("rb") as compressed:
        reader = zstandard.ZstdDecompressor().stream_reader(compressed)
        text = io.TextIOWrapper(reader, encoding="utf-8", newline="")
        for row in csv.DictReader(text):
            puzzles.append(
                Puzzle(
                    puzzle_id=row["PuzzleId"],
                    fen=row["FEN"],
                    moves=tuple(row["Moves"].split()),
                    rating=int(row["Rating"]),
                    themes=tuple(row["Themes"].split()),
                    game_url=row["GameUrl"],
                )
            )
            if len(puzzles) >= limit:
                break
    return tuple(puzzles)