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
