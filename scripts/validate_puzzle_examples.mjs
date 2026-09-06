import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Chess } from "../packages/chesspuzzle-components/browser-components/node_modules/chess.js/dist/esm/chess.js";
import { recognizePosition } from "../packages/chesspuzzle-components/browser-components/src/puzzle-solver.mjs";

const cases = JSON.parse(readFileSync(new URL("../data/puzzle_test_cases.json", import.meta.url), "utf8"));

function loadDotEnv() {
  try {
    const text = readFileSync(new URL("../.env", import.meta.url), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*["']?(.*?)["']?\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  } catch {}
}

const positionKey = (fen) => fen.split(/\s+/).slice(0, 4).join(" ");

function objective(themes) {
  const themeSet = new Set(themes);
    if ([...themeSet].some((theme) => theme.startsWith("mateIn") || ["checkmate", "mate"].includes(theme))) return "mate";
  if (["advantage", "crushing", "material", "winningQueen", "trappedPiece"].some((theme) => themeSet.has(theme))) return "gain";
  return "concept";
}

function apply(game, uci) {
  return game.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] ?? "q" });
}

function validateCase(puzzle) {
  const game = new Chess(puzzle.fen);
  if (puzzle.setup_move) apply(game, puzzle.setup_move);
  for (const move of puzzle.moves) {
    if (!apply(game, move)) throw new Error(`${puzzle.puzzle_id}: illegal move ${move}`);
  }
  const actualObjective = objective(puzzle.themes);
  if (actualObjective !== puzzle.expected_objective) {
    throw new Error(`${puzzle.puzzle_id}: expected ${puzzle.expected_objective}, got ${actualObjective}`);
  }
  return {
    puzzle_id: puzzle.puzzle_id,
    setup_move: puzzle.setup_move,
    moves: puzzle.moves.length,
    objective: actualObjective,
    finish_fen: game.fen(),
    checkmate: game.isCheckmate(),
  };
}

async function recognizeWithRetry(path, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await recognizePosition(path);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function main() {
  loadDotEnv();
  const results = cases.map(validateCase);
  if (process.argv.includes("--llm")) {
    const imageDir = process.argv[process.argv.indexOf("--image-dir") + 1];
    if (!imageDir) throw new Error("--llm requires --image-dir <directory>");
    const manifest = JSON.parse(readFileSync(join(imageDir, "manifest.json"), "utf8"));
    for (const sample of manifest) {
      const imagePath = join(imageDir, sample.image);
      let recognized;
      let lastError;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          recognized = await recognizeWithRetry(imagePath, 1);
          const fenFields = String(recognized.fen ?? "").trim().split(/\s+/);
          const validFen = fenFields.length === 1 ? `${fenFields[0]} w - - 0 1` : recognized.fen;
          new Chess(validFen);
          if (fenFields[0] !== sample.expected_fen.split(/\s+/)[0]) {
            throw new Error(`recognized position differs: ${recognized.fen}`);
          }
          if (recognized.orientation !== sample.orientation) {
            throw new Error(`recognized orientation ${recognized.orientation} does not match ${sample.orientation}`);
          }
          if (recognized.confidence !== undefined && Number(recognized.confidence) < 0.5) {
            throw new Error(`low recognition confidence ${recognized.confidence}`);
          }
          lastError = null;
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (lastError) {
        throw new Error(`${sample.image}: ${lastError.message}`);
      }
      const fenFields = String(recognized.fen).trim().split(/\s+/);
      results.push({ image: sample.image, recognized, recognized_fen_fields: fenFields.length, expected_fen: sample.expected_fen });
    }
  }
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});