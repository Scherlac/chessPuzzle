## Development

Run the complete status check, frontend validation, browser bundle build, wheel
build, and editable Python install from the repository root:

```powershell
.\build.ps1
```

Use `-Clean` to remove generated package output before rebuilding:

```powershell
.\build.ps1 -Clean
```

Start the Streamlit app. The default behavior rebuilds first:

```powershell
.\run.ps1
```

To run without rebuilding, or to choose another port:

```powershell
.\run.ps1 -NoBuild -Port 8510
```

Inspect the static classification for puzzle records:

```powershell
.\.venv\Scripts\python.exe scripts\evaluate_puzzles.py --limit 10
```

Verify the declared solution against the bundled Node Stockfish engine and
search beyond the solution line:

```powershell
.\.venv\Scripts\python.exe scripts\evaluate_puzzles.py `
	--limit 3 --verify --depth 10 --extra-plies 2
```

The verification output includes per-step engine agreement, the engine score,
the principal variation, and whether the extra continuation confirms mate.

Validate the bundled gain, mate, and concept examples without an API call:

```powershell
node scripts\validate_puzzle_examples.mjs
```

Validate every declared line independently of engine ranking. This checks legal
setup and puzzle moves and records the terminal state appropriate to each
objective:

```powershell
node scripts\validate_declared_puzzles.mjs data\puzzle_test_cases.json
```

Generate a readable, deterministic solver report for every bundled fixture.
This records declared-line validity, independent first-move ranking, mate
scores, and the complete candidate set without calling an LLM:

```powershell
node scripts\generate_puzzle_solver_test_report.mjs --depth 25 --candidates 3 --report reports\puzzle-solver-test-report.md
```

To include the actual pytest outcomes in that Markdown report, first produce
JUnit XML and pass it to the same generator:

```powershell
.\.venv\Scripts\python.exe -m pytest tests\test_puzzle_solver_examples.py -q -k "not llm" --junitxml=reports\puzzle-solver-test-report.xml
node scripts\generate_puzzle_solver_test_report.mjs --depth 25 --candidates 3 --junitxml reports\puzzle-solver-test-report.xml --report reports\puzzle-solver-test-report.md
```

The test suite deliberately keeps engine claims objective-specific. The gain
fixture attempts to require the declared move to be Stockfish's top-ranked move
at depth equal to the puzzle length. It is currently an explicit skip when the
shallow search ranks it lower, with the observed rank preserved in the test
failure context. The mate-in-one fixture requires a mate candidate. The
composed bishop mate is independently solved at depth 25, although Stockfish
may select an alternate equally valid defense line. Concept puzzles are also
not required to receive labels such as fork,
skewer, or discovered attack because Stockfish evaluation does not provide
those semantics. Both gaps are explicit skipped tests rather than false green
engine claims; the declared lines remain covered by the independent legality
validator.

Solve one example with Stockfish and inspect the five candidate lines at each
ply:

```powershell
node scripts\solve_puzzle.mjs "7k/5Q2/7K/8/8/8/8/8 w - - 0 1" 14 1 '["f7f8"]'
```

Use `--candidates` to request a larger MultiPV set. The wrapper caps the UCI
request at 500 because larger values are rejected by the bundled Stockfish;
Stockfish still returns no more than the legal moves available in the position:

```powershell
node scripts\solve_puzzle.mjs "8/8/8/R7/8/8/Bpp1p3/k1rbK3 w - - 0 1" 12 1 --candidates 2000
node scripts\generate_puzzle_design_report.mjs --fen "8/8/8/R7/8/8/Bpp1p3/k1rbK3 w - - 0 1" --line '["a2b3","a1b1","b3a4","b1a2","a4c2"]' --side-to-move w --objective mate --winner White --depth 12 --plies 5 --candidates 2000 --report reports\bishop-puzzle-demo-report.md
```

Use `--setup <uci>` when the recognized FEN includes an opponent setup move;
omit it for puzzles whose position is already ready for the player:

```powershell
node scripts\solve_puzzle.mjs "8/8/8/R7/8/8/Bpp1p3/1krbK3 b - - 0 1" 10 2 '["a2c4","a1b1"]' --setup b1a1
```

To validate board-image recognition, place images named after the puzzle IDs
in a directory and run the optional live check:

```powershell
node scripts\validate_puzzle_examples.mjs --llm --image-dir path\to\images
```

### Lichess puzzle database

`data/lichess_db_puzzle.csv.zst` is a local download and is intentionally
ignored by Git. It comes from the official [Lichess Open Database](https://database.lichess.org/),
under the [Puzzles](https://database.lichess.org/#puzzles) section:

```text
https://database.lichess.org/lichess_db_puzzle.csv.zst
```

Lichess states that database exports are released under the
[Creative Commons CC0 license](https://creativecommons.org/publicdomain/zero/1.0/).
The archive is a Zstandard-compressed CSV containing fields such as
`PuzzleId`, `FEN`, `Moves`, `Rating`, `Themes`, and `GameUrl`.

Download it locally on Windows with:

```powershell
.\scripts\download_lichess_puzzles.ps1
```

The script prints the SHA-256 hash after downloading. To hash an existing
download without downloading again:

```powershell
.\scripts\download_lichess_puzzles.ps1 -VerifyOnly
```

The repository contains only the small custom puzzle JSON and test fixtures;
the multi-gigabyte external database is never committed or stored in Git LFS.
