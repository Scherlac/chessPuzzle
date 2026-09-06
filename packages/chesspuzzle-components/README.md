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

The Node-side puzzle service is implemented in
`browser-components/src/puzzle-solver.mjs` and is the single owner of image
recognition and Stockfish solving. Its API is:

```js
import { recognizePosition, solvePosition, solvePuzzle } from "./src/puzzle-solver.mjs";

const recognized = await recognizePosition(imagePath, {
	model: "gpt-5.6-luna",
});
const result = await solvePosition({
	fen: recognized.fen,
	sideToMove: "w",
	setupMove: null,
	depth: 12,
	plies: 6,
	expected: [],
});
```

`recognizePosition` returns board-placement FEN plus `orientation`,
`confidence`, and `notes`. Static images cannot establish side to move or
move counters, so callers must provide `sideToMove` when the response has only
the board-placement field. `solvePosition` accepts either a FEN or
`imagePath`, supports optional setup moves, and returns multi-PV candidates
with expected-move ranking. `solvePuzzle` adapts the repository puzzle record
shape to the same solver contract.
