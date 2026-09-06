import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { extname } from "node:path";
import { Chess } from "../packages/chesspuzzle-components/browser-components/node_modules/chess.js/dist/esm/chess.js";

const require = createRequire(import.meta.url);
const outputWaiters = [];
const outputLines = [];
global.postMessage = (message) => {
  const line = String(message);
  outputLines.push(line);
  for (let index = 0; index < outputWaiters.length; index += 1) {
    if (outputWaiters[index].match(line)) {
      const waiter = outputWaiters.splice(index, 1)[0];
      waiter.resolve(line);
      return;
    }
  }
};
global.close = () => {};
const engine = require("../packages/chesspuzzle-components/browser-components/node_modules/stockfish.js/stockfish.js");

function waitFor(match, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const existing = outputLines.find((line) => match.test(line));
    if (existing) {
      outputLines.splice(outputLines.indexOf(existing), 1);
      resolve(existing);
      return;
    }
    const timer = setTimeout(() => reject(new Error(`Stockfish timeout waiting for ${match}`)), timeout);
    outputWaiters.push({ match: (line) => match.test(line), resolve: (line) => { clearTimeout(timer); resolve(line); } });
  });
}

function command(value) {
  engine.ccall("uci_command", "number", ["string"], [value]);
}

function apply(game, uci) {
  return game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? "q" });
}

async function analyse(fen, depth) {
  outputLines.length = 0;
  command("setoption name MultiPV value 5");
  command(`position fen ${fen}`);
  command(`go depth ${depth}`);
  const lines = [];
  let line;
  do {
    line = await waitFor(/^(info |bestmove )/);
    lines.push(line);
  } while (!line.startsWith("bestmove "));
  const latestByPv = new Map();
  for (const info of lines.filter((value) => value.startsWith("info "))) {
    latestByPv.set(Number(info.match(/\bmultipv (\d+)/)?.[1] ?? 1), info);
  }
  const parseInfo = (info) => {
    const score = info.match(/score cp (-?\d+)/)?.[1];
    const mate = info.match(/score mate (-?\d+)/)?.[1];
    return {
      multipv: Number(info.match(/\bmultipv (\d+)/)?.[1] ?? 1),
      score: score === undefined ? null : Number(score) / 100,
      mate: mate === undefined ? null : Number(mate),
      pv: info.match(/\bpv (.+)$/)?.[1]?.split(" ") ?? [],
    };
  };
  return {
    bestmove: line.split(/\s+/)[1],
    candidates: [...latestByPv.values()].map(parseInfo).sort((a, b) => a.multipv - b.multipv),
  };
}

function imageMime(path) {
  return { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" }[extname(path).toLowerCase()] ?? "image/png";
}

function loadDotEnv() {
  try {
    const text = readFileSync(new URL("../.env", import.meta.url), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*["']?(.*?)["']?\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  } catch {}
}

async function recognizePosition(imagePath) {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error("LLM_API_KEY is required for --image recognition");
  const baseUrl = (process.env.LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.VISION_MODEL ?? process.env.LLM_MODEL ?? "gpt-4o-mini";
  const image = readFileSync(imagePath).toString("base64");
  const request = {
    model,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: [
      { type: "text", text: "Recognize this chess board square by square. Return only JSON with fields fen, orientation, confidence (0 to 1), and notes. Read the coordinate labels: orientation is white when rank 1 is at the bottom and files a through h run left to right; orientation is black when rank 8 is at the bottom and files h through a run left to right. The FEN must always use canonical chess order, regardless of visual orientation: rank 8 is the first FEN row, rank 1 is the last FEN row, and each row runs from file a to file h. Never return rows in screenshot order. Verify every occupied and empty square before producing the FEN board-placement field. If the image cannot establish side to move or counters, return the board-placement field only; never invent pieces. Do not solve the position." },
      { type: "image_url", image_url: { url: `data:${imageMime(imagePath)};base64,${image}` } },
    ] }],
    max_completion_tokens: 1000,
  };
  if (!model.startsWith("gpt-5")) request.temperature = 0;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(`Vision request failed: ${response.status} ${await response.text()}`);
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content ?? "";
  let recognized;
  try {
    recognized = JSON.parse(content);
  } catch (error) {
    throw new Error(`Vision model returned invalid JSON: ${error.message}`);
  }
  if (!recognized.fen) throw new Error("Vision model did not return a FEN");
  new Chess(recognized.fen);
  return recognized;
}

async function main() {
  loadDotEnv();
  const args = process.argv.slice(2);
  const imageIndex = args.indexOf("--image");
  const imagePath = imageIndex >= 0 ? args[imageIndex + 1] : null;
  if (imageIndex >= 0) args.splice(imageIndex, 2);
  const setupIndex = args.indexOf("--setup");
  const setupMove = setupIndex >= 0 ? args[setupIndex + 1] : null;
  if (setupIndex >= 0) args.splice(setupIndex, 2);
  const sideIndex = args.indexOf("--side-to-move");
  const sideToMove = sideIndex >= 0 ? args[sideIndex + 1] : "w";
  if (sideIndex >= 0) args.splice(sideIndex, 2);
  const fen = args[0]?.startsWith("--") ? null : args[0];
  const depth = Number(args[1] ?? 18);
  const plies = Number(args[2] ?? 8);
  const expected = args[3] ? JSON.parse(args[3]) : [];
  const recognized = imagePath ? await recognizePosition(imagePath) : null;
  const recognizedFen = recognized?.fen ?? fen;
  const startFen = recognizedFen && recognizedFen.trim().split(/\s+/).length === 1
    ? `${recognizedFen.trim()} ${sideToMove} - - 0 1`
    : recognizedFen;
  if (!startFen) throw new Error("Usage: node scripts/solve_puzzle.mjs <fen> [depth] [plies] [expectedMovesJson] or --image <path> [depth] [plies]");
  new Chess(startFen);
  command("uci");
  await waitFor(/^uciok$/);
  command("isready");
  await waitFor(/^readyok$/);
  const game = new Chess(startFen);
  if (setupMove && !apply(game, setupMove)) throw new Error(`Illegal setup move: ${setupMove}`);
  const line = [];
  for (let index = 0; index < plies && !game.isGameOver(); index += 1) {
    const analysis = await analyse(game.fen(), depth);
    const expectedMove = expected[index] ?? null;
    const expectedRank = expectedMove ? analysis.candidates.findIndex((candidate) => candidate.pv[0] === expectedMove) + 1 : null;
    line.push({ fen: game.fen(), expected: expectedMove, expectedRank, ...analysis });
    if (!analysis.bestmove || analysis.bestmove === "(none)" || !apply(game, analysis.bestmove)) break;
  }
  command("quit");
  process.stdout.write(`${JSON.stringify({ startFen, setupMove, recognized, depth, line }, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
