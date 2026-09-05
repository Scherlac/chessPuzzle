from __future__ import annotations

import csv
import io
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

import zstandard


@dataclass(frozen=True)
class PuzzleEvaluation:
    start_scenario: str
    start_side: str
    player_side: str
    setup_move: str
    step_count: int
    finish_situation: str
    objective: str
    phase: str
    last_move_by: str


@dataclass(frozen=True)
class Puzzle:
    puzzle_id: str
    fen: str
    moves: tuple[str, ...]
    rating: int
    themes: tuple[str, ...]
    game_url: str

    @property
    def evaluation(self) -> PuzzleEvaluation:
        return evaluate_puzzle(self)


def _phase(themes: tuple[str, ...], fen: str) -> str:
    theme_set = set(themes)
    if "endgame" in theme_set or "pawnEndgame" in theme_set or "rookEndgame" in theme_set:
        return "end"
    if "opening" in theme_set or "openingPrinciples" in theme_set:
        return "open"
    pieces = fen.split(" ")[0].replace("/", "")
    if sum(piece.lower() in "qrb" for piece in pieces) <= 4:
        return "end"
    return "mid"


def _objective(themes: tuple[str, ...]) -> str:
    theme_set = set(themes)
    if any(theme.startswith("mate") or theme in {"checkmate", "mate"} for theme in theme_set):
        return "mate"
    if theme_set & {"advantage", "crushing", "material", "winningQueen", "trappedPiece"}:
        return "gain"
    return "concept"


def _finish_situation(themes: tuple[str, ...], objective: str) -> str:
    theme_set = set(themes)
    if objective == "mate" or "checkmate" in theme_set:
        return "checkmate"
    if "check" in theme_set or "mateIn" in " ".join(themes):
        return "check"
    if objective == "gain":
        return "material_or_positional_gain"
    return "conceptual_position"


def evaluate_puzzle(puzzle: Puzzle) -> PuzzleEvaluation:
    fields = puzzle.fen.split()
    start_side = "white" if len(fields) < 2 or fields[1] == "w" else "black"
    player_side = "black" if start_side == "white" else "white"
    last_side = start_side if len(puzzle.moves) % 2 else player_side
    themes = puzzle.themes
    objective = _objective(themes)
    return PuzzleEvaluation(
        start_scenario="opponent_setup",
        start_side=start_side,
        player_side=player_side,
        setup_move=puzzle.moves[0] if puzzle.moves else "",
        step_count=max(0, len(puzzle.moves) - 1),
        finish_situation=_finish_situation(themes, objective),
        objective=objective,
        phase=_phase(themes, puzzle.fen),
        last_move_by=last_side,
    )


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