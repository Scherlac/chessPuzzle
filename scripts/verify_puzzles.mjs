import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import readline from "node:readline";
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
    const existingIndex = outputLines.findIndex((line) => match.test(line));
    if (existingIndex >= 0) {
      resolve(outputLines.splice(existingIndex, 1)[0]);
      return;
    }
    const timer = setTimeout(() => reject(new Error(`Stockfish timeout waiting for ${match}`)), timeout);
    outputWaiters.push({
      match: (line) => match.test(line),
      resolve: (line) => {
        clearTimeout(timer);
        resolve(line);
      },
    });
  });
}

function command(value) {
  engine.ccall("uci_command", "number", ["string"], [value]);
}

async function analyse(fen, depth) {
  outputLines.length = 0;
  command(`position fen ${fen}`);
  command(`go depth ${depth}`);
  const lines = [];
  let line;
  do {
    line = await waitFor(/^(info |bestmove )/);
    lines.push(line);
  } while (!line.startsWith("bestmove "));
  const bestmove = line.split(/\s+/)[1];
  const latestInfo = lines.filter((value) => value.startsWith("info ")).at(-1) ?? "";
  const score = latestInfo.match(/score cp (-?\d+)/)?.[1];
  const mate = latestInfo.match(/score mate (-?\d+)/)?.[1];
  const pv = latestInfo.match(/\bpv (.+)$/)?.[1]?.split(" ") ?? [];
  return {
    bestmove,
    score: score === undefined ? null : Number(score) / 100,
    mate: mate === undefined ? null : Number(mate),
    pv,
  };
}

function apply(game, uci) {
  try {
    return game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? "q" });
  } catch {
    return null;
  }
}

async function verifyPuzzle(puzzle, depth, extraPlies) {
  const game = new Chess(puzzle.fen);
  const declaredMoves = [...puzzle.moves];
  const setupMove = puzzle.setup_move ?? null;
  if (setupMove) apply(game, setupMove);
  const checks = [];
  for (const move of declaredMoves) {
    const analysis = await analyse(game.fen(), depth);
    checks.push({ move, engineBest: analysis.bestmove, agrees: move === analysis.bestmove, score: analysis.score, mate: analysis.mate });
    if (!apply(game, move)) {
      return {
        puzzle_id: puzzle.puzzle_id,
        setup_move: setupMove,
        error: `Declared move ${move} is illegal after the preceding line`,
        checked_steps: checks.length,
        agreement: checks,
      };
    }
  }

  const continuation = [];
  for (let index = 0; index < extraPlies && !game.isGameOver(); index += 1) {
    const analysis = await analyse(game.fen(), depth);
    continuation.push(analysis);
    if (!analysis.bestmove || analysis.bestmove === "(none)") break;
    if (!apply(game, analysis.bestmove)) {
      continuation.push({ ...analysis, error: `Engine move ${analysis.bestmove} is illegal` });
      break;
    }
  }
  const lastCheck = checks.at(-1);
  const allAgree = checks.length > 0 && checks.every((check) => check.agrees);
  return {
    puzzle_id: puzzle.puzzle_id,
    setup_move: setupMove,
    checked_steps: checks.length,
    engine_agrees_with_solution: allAgree,
    agreement: checks,
    declared_finish: {
      game_over: game.isGameOver(),
      checkmate: game.isCheckmate(),
      fen: game.fen(),
    },
    continuation,
    continuation_confirms_mate: continuation.some((item) => item.mate !== null),
    last_declared_engine_score: lastCheck?.score ?? null,
  };
}

async function main() {
  const input = readFileSync(0, "utf8");
  const puzzles = JSON.parse(input);
  await new Promise((resolve) => setTimeout(resolve, 100));
  command("uci");
  await waitFor(/^uciok$/);
  command("isready");
  await waitFor(/^readyok$/);
  const depth = Number(process.argv[2] ?? 10);
  const extraPlies = Number(process.argv[3] ?? 2);
  const results = [];
  for (const puzzle of puzzles) results.push(await verifyPuzzle(puzzle, depth, extraPlies));
  process.stdout.write(`${JSON.stringify(results)}\n`);
  command("quit");
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
