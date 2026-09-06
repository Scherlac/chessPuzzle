import { readFileSync } from "node:fs";
import { solvePosition } from "../packages/chesspuzzle-components/browser-components/src/puzzle-solver.mjs";

function loadDotEnv() {
  try {
    const text = readFileSync(new URL("../.env", import.meta.url), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*["']?(.*?)["']?\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  } catch {}
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
  const result = await solvePosition({ imagePath, fen, setupMove, sideToMove, depth, plies, expected });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
