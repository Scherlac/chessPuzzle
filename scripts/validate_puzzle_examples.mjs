import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { Chess } from "../packages/chesspuzzle-components/browser-components/node_modules/chess.js/dist/esm/chess.js";

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

function imageMime(path) {
  return { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" }[extname(path).toLowerCase()] ?? "image/png";
}

async function recognize(path) {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error("LLM_API_KEY is required for --llm");
  const baseUrl = (process.env.LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.VISION_MODEL ?? process.env.LLM_MODEL ?? "gpt-4o-mini";
  const image = readFileSync(path).toString("base64");
  const request = {
    model,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: [
      { type: "text", text: "Recognize this chess board square by square. Return only JSON with fields fen, orientation, confidence, and notes. Read the coordinate labels: orientation is white when rank 1 is at the bottom and files a through h run left to right; orientation is black when rank 8 is at the bottom and files h through a run left to right. The FEN must always use canonical chess order, regardless of visual orientation: rank 8 is the first FEN row, rank 1 is the last FEN row, and each row runs from file a to file h. Never return rows in screenshot order. Verify every occupied and empty square before producing the FEN board-placement field. If the image cannot establish side to move or counters, return the board-placement field only; never invent pieces. Do not solve the position." },
      { type: "image_url", image_url: { url: `data:${imageMime(path)};base64,${image}` } },
    ] }],
    max_completion_tokens: 1000,
  };
  if (!model.startsWith("gpt-5")) request.temperature = 0;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(`vision request failed: ${response.status} ${await response.text()}`);
  const payload = await response.json();
  const content = payload.choices?.[0]?.message?.content ?? "";
  try {
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`vision model returned invalid JSON: ${error.message}`);
  }
}

async function recognizeWithRetry(path, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await recognize(path);
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