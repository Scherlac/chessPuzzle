import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Chess } from "../packages/chesspuzzle-components/browser-components/node_modules/chess.js/dist/esm/chess.js";

const require = createRequire(new URL("../packages/chesspuzzle-components/browser-components/package.json", import.meta.url));
const { chromium } = require("playwright");

const root = path.resolve(import.meta.dirname, "..");
const bundlePath = path.join(root, "packages", "chesspuzzle-components", "src", "chess_components", "assets", "browser-components.js");
const outputDir = path.join(root, "tests", "fixtures", "board_samples");

const cases = [
  {
    id: "concept-compact-white",
    fen: "8/8/8/R7/8/8/Bpp1p3/1krbK3 b - - 0 1",
    setupMove: "b1a1",
    orientation: "white",
    width: 420,
    height: 500,
    colors: ["#f4e7c5", "#7a5138", "#d3543f"],
  },
  {
    id: "concept-wide-black",
    fen: "8/8/8/R7/8/8/Bpp1p3/1krbK3 b - - 0 1",
    setupMove: "b1a1",
    orientation: "black",
    width: 900,
    height: 700,
    colors: ["#dbe8f2", "#40647c", "#e0a458"],
  },
  {
    id: "gain-compact-white",
    fen: "4k3/8/8/8/8/8/4r3/3QK3 w - - 0 1",
    orientation: "white",
    width: 420,
    height: 500,
    colors: ["#e7f2e4", "#47705c", "#c44536"],
  },
  {
    id: "gain-wide-black",
    fen: "4k3/8/8/8/8/8/4r3/3QK3 w - - 0 1",
    orientation: "black",
    width: 900,
    height: 700,
    colors: ["#f0e1ee", "#765070", "#2a9d8f"],
  },
  {
    id: "mate-compact-white",
    fen: "7k/5Q2/7K/8/8/8/8/8 w - - 0 1",
    orientation: "white",
    width: 420,
    height: 500,
    colors: ["#f7e8cf", "#8c5d3b", "#b23a48"],
  },
  {
    id: "mate-wide-black",
    fen: "7k/5Q2/7K/8/8/8/8/8 w - - 0 1",
    orientation: "black",
    width: 900,
    height: 700,
    colors: ["#e4edf4", "#34526f", "#f4a261"],
  },
  {
    id: "opening-dense-compact-white",
    fen: "r1bqk2r/pppp1ppp/2n2n2/8/1b2P3/2N5/PPPP1PPP/R1BQKBNR w KQkq - 4 4",
    orientation: "white",
    width: 420,
    height: 500,
    colors: ["#f1e6c8", "#72513c", "#d66b4d"],
  },
  {
    id: "middlegame-dense-wide-black",
    fen: "r1bq1rk1/ppp2ppp/2n5/3pp3/3PP3/2P1BN2/PP3PPP/R2QKB1R w KQ - 0 8",
    orientation: "black",
    width: 900,
    height: 700,
    colors: ["#dce9ef", "#41677a", "#e29b54"],
  },
];

const bundle = await readFile(bundlePath, "utf8");
await mkdir(outputDir, { recursive: true });
const manifest = [];
const expectedFenFor = (sample) => {
  const game = new Chess(sample.fen);
  if (sample.setupMove) game.move({ from: sample.setupMove.slice(0, 2), to: sample.setupMove.slice(2, 4), promotion: sample.setupMove[4] ?? "q" });
  return game.fen();
};
const browser = await chromium.launch({ headless: true });
try {
  for (const sample of cases) {
    const expectedFen = expectedFenFor(sample);
    const page = await browser.newPage({ viewport: { width: sample.width, height: sample.height }, deviceScaleFactor: 1 });
    await page.setContent(`<main id="mount"></main><script>${bundle}</script>`, { waitUntil: "load" });
    await page.evaluate((props) => {
      const target = document.querySelector("#mount");
      const board = document.createElement("div");
      target.append(board);
      window.__CHESS_PUZZLE_COMPONENTS__["chess-board"](board, {
        fen: props.displayFen,
        orientation: props.orientation,
        playAs: "white",
        puzzleMode: false,
        puzzleSetupMove: null,
        puzzleMoves: [],
      });
      const element = board.querySelector("chess-board");
      element.style.setProperty("--light-color", props.colors[0]);
      element.style.setProperty("--dark-color", props.colors[1]);
      element.style.setProperty("--highlight-color", props.colors[2]);
    }, { ...sample, displayFen: expectedFen });
    await page.locator("chess-board").waitFor({ state: "visible" });
    await page.screenshot({ path: path.join(outputDir, `${sample.id}.png`), fullPage: false });
    manifest.push({
      image: `${sample.id}.png`,
      puzzle_id: sample.id.split("-").slice(0, 1).join("-"),
      source_fen: sample.fen,
      setup_move: sample.setupMove ?? null,
      expected_fen: expectedFen,
      width: sample.width,
      height: sample.height,
      orientation: sample.orientation,
      colors: sample.colors,
    });
    await page.close();
  }
} finally {
  await browser.close();
}
await writeFile(path.join(outputDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Generated ${cases.length} board samples in ${path.relative(root, outputDir)}`);