import { createRequire } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { stdin } from "node:process";
import path from "node:path";
import { Chess } from "../packages/chesspuzzle-components/browser-components/node_modules/chess.js/dist/esm/chess.js";

const require = createRequire(new URL("../packages/chesspuzzle-components/browser-components/package.json", import.meta.url));
const { chromium } = require("playwright");
let stdinText = "";
for await (const chunk of stdin) stdinText += chunk;
const input = JSON.parse(stdinText);
const root = path.resolve(import.meta.dirname, "..");
const bundle = await readFile(path.join(root, "packages", "chesspuzzle-components", "src", "chess_components", "assets", "browser-components.js"), "utf8");
const output = path.resolve(input.output);
const game = new Chess(input.fen);
for (const move of input.setupMove ? [input.setupMove, ...input.line] : input.line) game.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] ?? "q" });
const finalFen = game.fen();
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 650 }, deviceScaleFactor: 1 });
  await page.setContent(`<main id="mount"></main><script>${bundle}</script>`, { waitUntil: "load" });
  await page.evaluate(({ fen, finalFen, line }) => {
    const mount = document.querySelector("#mount");
    mount.innerHTML = `<style>body{margin:0;background:#f6f0e3;font-family:Georgia,serif}main{display:flex;gap:28px;padding:28px}.panel{background:#fffaf0;padding:14px;width:488px;border:1px solid #c9b99d}.title{font-weight:700;margin:0 0 8px}.board-wrap,.board-slot{position:relative;width:460px}.board-wrap .chess-board-wrapper,.board-slot .chess-board-wrapper{width:460px;max-width:none}.board-wrap chess-board,.board-slot chess-board{width:460px}.arrows{position:absolute;left:0;top:0;width:460px;height:460px;pointer-events:none}.legend{margin:10px 0 0;font:14px sans-serif;line-height:1.5;color:#40372e}</style><section class="panel"><p class="title">Starting position - follow the numbered solution</p><div class="board-wrap"><div id="start" class="board-slot"></div><svg class="arrows" viewBox="0 0 8 8"></svg></div><div class="legend" id="legend"></div></section><section class="panel"><p class="title">Final position</p><div id="final" class="board-slot"></div></section>`;
    const render = (id, position) => window.__CHESS_PUZZLE_COMPONENTS__["chess-board"](document.querySelector(id), { fen: position, orientation: "white", playAs: "white", puzzleMode: false });
    render("#start", fen);
    render("#final", finalFen);
    const svg = document.querySelector(".arrows");
    const playerColor = "#f2c94c";
    const opponentColor = "#9b7bb5";
    const legend = [];
    for (const [index, uci] of line.entries()) {
      const file = (square) => square.charCodeAt(0) - 97;
      const rank = (square) => 8 - Number(square[1]);
      const x1 = file(uci.slice(0, 2)) + 0.5;
      const y1 = rank(uci.slice(0, 2)) + 0.5;
      const x2 = file(uci.slice(2, 4)) + 0.5;
      const y2 = rank(uci.slice(2, 4)) + 0.5;
      const color = index % 2 === 0 ? playerColor : opponentColor;
      const opacity = Math.max(0.45, 0.9 - index * 0.1).toFixed(2);
      const markerId = `arrow-${index}`;
      const midX = (x1 + x2) / 2;
      const midY = (y1 + y2) / 2;
      svg.insertAdjacentHTML("beforeend", `<defs><marker id="${markerId}" markerWidth="0.35" markerHeight="0.35" refX="0.3" refY="0.175" orient="auto"><path d="M0,0 L0.35,0.175 L0,0.35 z" fill="${color}"/></marker></defs><line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="0.11" marker-end="url(#${markerId})" opacity="${opacity}"/><circle cx="${midX}" cy="${midY}" r="0.18" fill="${color}" stroke="#fffaf0" stroke-width="0.04" opacity="${opacity}"/><text x="${midX}" y="${midY + 0.06}" text-anchor="middle" font-size="0.22" font-weight="bold" fill="white" opacity="${opacity}">${index + 1}</text>`);
      legend.push(`<span style="color:${color};font-weight:700">${index + 1}.</span> ${uci.slice(0, 2)}-${uci.slice(2, 4)}`);
    }
    document.querySelector("#legend").innerHTML = legend.join(" &nbsp; ");
  }, { fen: input.fen, finalFen, line: input.line });
  await page.locator("chess-board").first().waitFor({ state: "visible" });
  await mkdir(path.dirname(output), { recursive: true });
  await page.screenshot({ path: output, fullPage: true });
} finally {
  await browser.close();
}
process.stdout.write(`${JSON.stringify({ output, finalFen })}\n`);
