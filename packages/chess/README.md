## Chess Puzzle Components

This package provides Streamlit Components v2 for loading and bridging browser
components registered on the page.

### Build

From `packages/chess/frontend`:

```powershell
npm install
npm run typecheck
npm run lint
npm run package
```

`npm run package` builds the browser bundle into the Python package assets and
creates a wheel in `packages/chess/dist`.

### Install

From the repository root:

```powershell
uv pip install --python .venv\Scripts\python.exe packages\chess
```

The public Python API is `chess_components.load_components` and
`chess_components.check_component`.
