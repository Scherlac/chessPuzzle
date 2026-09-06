from __future__ import annotations

import json
import os
import shutil
import struct
import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CASES = ROOT / "data" / "puzzle_test_cases.json"
SAMPLES = ROOT / "tests" / "fixtures" / "board_samples"


def run_node(script: str, *args: str) -> subprocess.CompletedProcess[str]:
    node = shutil.which("node") or shutil.which("node.exe")
    assert node, "Node.js is required for puzzle solver tests"
    return subprocess.run(
        [node, str(ROOT / "scripts" / script), *args],
        cwd=ROOT,
        text=True,
        capture_output=True,
        check=True,
    )


def png_size(path: Path) -> tuple[int, int]:
    with path.open("rb") as image:
        assert image.read(8) == b"\x89PNG\r\n\x1a\n"
        length = struct.unpack(">I", image.read(4))[0]
        assert image.read(4) == b"IHDR"
        width, height = struct.unpack(">II", image.read(length)[:8])
        return width, height


def test_playwright_board_samples_exist_and_have_expected_sizes() -> None:
    samples = sorted(SAMPLES.glob("*.png"))
    assert len(samples) == 8
    manifest = SAMPLES / "manifest.json"
    assert manifest.exists()
    metadata = json.loads(manifest.read_text(encoding="utf-8"))
    assert {item["image"] for item in metadata} == {sample.name for sample in samples}
    for sample in samples:
        width, height = png_size(sample)
        assert (width, height) in {(420, 500), (900, 700)}
        assert sample.stat().st_size > 2_000


def test_playwright_samples_are_distinct_images() -> None:
    samples = sorted(SAMPLES.glob("*.png"))
    assert len({sample.read_bytes() for sample in samples}) == len(samples)


def test_fixture_validator_covers_concept_gain_and_mate() -> None:
    result = json.loads(run_node("validate_puzzle_examples.mjs").stdout)
    assert {item["objective"] for item in result} == {"concept", "gain", "mate"}
    assert next(item for item in result if item["objective"] == "mate")["checkmate"] is True
    assert next(item for item in result if item["objective"] == "gain")["setup_move"] is None


def test_solver_ranks_declared_mate_line() -> None:
    result = json.loads(run_node(
        "solve_puzzle.mjs",
        "7k/5Q2/7K/8/8/8/8/8 w - - 0 1",
        "10",
        "1",
        '["f7f8"]',
    ).stdout)
    step = result["line"][0]
    assert step["expected"] == "f7f8"
    assert step["expectedRank"] > 0
    assert any(candidate["mate"] == 1 for candidate in step["candidates"])


def test_solver_applies_setup_and_keeps_concept_move_as_candidate() -> None:
    result = json.loads(run_node(
        "solve_puzzle.mjs",
        "8/8/8/R7/8/8/Bpp1p3/1krbK3 b - - 0 1",
        "8",
        "1",
        '["a2c4"]',
        "--setup",
        "b1a1",
    ).stdout)
    assert result["setupMove"] == "b1a1"
    assert result["line"][0]["expectedRank"] > 0


def test_solver_accepts_position_without_setup_move() -> None:
    result = json.loads(run_node(
        "solve_puzzle.mjs",
        "4k3/8/8/8/8/8/4r3/3QK3 w - - 0 1",
        "8",
        "1",
        '["d1e2"]',
    ).stdout)
    assert result["setupMove"] is None
    assert result["line"][0]["expectedRank"] > 0


def test_solver_validates_all_fixture_objectives() -> None:
    cases = json.loads(CASES.read_text(encoding="utf-8"))
    assert {case["expected_objective"] for case in cases} >= {"concept", "gain", "mate"}
    for case in cases:
        result = run_node(
            "solve_puzzle.mjs",
            case["fen"],
            "8",
            str(min(2, len(case["moves"]))),
            json.dumps(case["moves"][:2]),
            *( ["--setup", case["setup_move"]] if case["setup_move"] else [] ),
        )
        payload = json.loads(result.stdout)
        assert payload["line"]
        assert payload["line"][0]["expected"] == case["moves"][0]
        assert payload["line"][0]["expectedRank"] > 0


def test_fixture_set_includes_late_opening_and_early_middlegame_positions() -> None:
    cases = json.loads(CASES.read_text(encoding="utf-8"))
    by_id = {case["puzzle_id"]: case for case in cases}
    opening = by_id["TEST-LATE-OPENING-DEVELOPMENT-001"]
    middlegame = by_id["TEST-EARLY-MIDDLEGAME-CENTER-001"]
    for case in (opening, middlegame):
        piece_count = sum(character.isalpha() for character in case["fen"].split()[0])
        assert piece_count >= 20
        assert len(case["moves"]) >= 5
    assert "opening" in opening["themes"]
    assert "middlegame" in middlegame["themes"]


def test_llm_recognizes_playwright_board_samples() -> None:
    if os.environ.get("RUN_LLM_INTEGRATION") != "1":
        import pytest
        pytest.skip("Set RUN_LLM_INTEGRATION=1 to run real vision API integration tests")
    if not os.environ.get("LLM_API_KEY"):
        import pytest
        pytest.skip("LLM_API_KEY is required for real vision API integration tests")
    result = run_node(
        "validate_puzzle_examples.mjs",
        "--llm",
        "--image-dir",
        str(SAMPLES),
    )
    payload = json.loads(result.stdout)
    recognitions = [item for item in payload if "recognized" in item]
    assert len(recognitions) == 8