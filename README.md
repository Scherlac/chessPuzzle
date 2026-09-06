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

Solve one example with Stockfish and inspect the five candidate lines at each
ply:

```powershell
node scripts\solve_puzzle.mjs "7k/5Q2/7K/8/8/8/8/8 w - - 0 1" 14 1 '["f7f8"]'
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
