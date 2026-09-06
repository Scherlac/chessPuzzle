from __future__ import annotations

import csv
import io
import json
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
    setup_move: str | None
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
    if any(theme in {"checkmate", "mate"} or theme.startswith("mateIn") for theme in theme_set):
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
    last_side = player_side if len(puzzle.moves) % 2 else start_side
    themes = puzzle.themes
    objective = _objective(themes)
    return PuzzleEvaluation(
        start_scenario="opponent_setup" if puzzle.setup_move else "position_as_given",
        start_side=start_side,
        player_side=player_side,
        setup_move=puzzle.setup_move or "",
        step_count=len(puzzle.moves),
        finish_situation=_finish_situation(themes, objective),
        objective=objective,
        phase=_phase(themes, puzzle.fen),
        last_move_by=last_side,
    )


def _dataset_path() -> Path:
    return Path(__file__).resolve().parents[4] / "data" / "lichess_db_puzzle.csv.zst"


def _custom_dataset_path() -> Path:
    return Path(__file__).resolve().parents[4] / "data" / "custom_puzzles.json"


def _load_custom_puzzles() -> list[Puzzle]:
    path = _custom_dataset_path()
    if not path.exists():
        return []
    records = json.loads(path.read_text(encoding="utf-8"))
    return [
        Puzzle(
            puzzle_id=record["puzzle_id"],
            fen=record["fen"],
            setup_move=record.get("setup_move"),
            moves=tuple(record["moves"]),
            rating=int(record["rating"]),
            themes=tuple(record["themes"]),
            game_url=record.get("game_url", ""),
        )
        for record in records
    ]


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
                    setup_move=(row["Moves"].split() or [None])[0],
                    moves=tuple(row["Moves"].split()[1:]),
                    rating=int(row["Rating"]),
                    themes=tuple(row["Themes"].split()),
                    game_url=row["GameUrl"],
                )
            )
            if len(puzzles) >= limit:
                break
    puzzles.extend(_load_custom_puzzles())
    return tuple(puzzles)