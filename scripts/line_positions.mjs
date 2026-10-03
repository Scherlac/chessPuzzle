import { Chess } from "../packages/chesspuzzle-components/browser-components/node_modules/chess.js/dist/esm/chess.js";

const [fen, encodedLine] = process.argv.slice(2);
if (!fen || !encodedLine) throw new Error("Usage: line_positions.mjs FEN JSON_LINE");
const game = new Chess(fen);
const positions = [{ ply: 0, fen: game.fen(), san: null, move: null }];
for (const move of JSON.parse(encodedLine)) {
  const played = game.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] ?? "q" });
  if (!played) throw new Error(`Illegal line move: ${move}`);
  positions.push({ ply: positions.length, fen: game.fen(), san: played.san, move });
}
process.stdout.write(JSON.stringify(positions));