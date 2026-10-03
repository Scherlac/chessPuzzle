import { readFileSync } from "node:fs";
import { validatePuzzleLine } from "../packages/chesspuzzle-components/browser-components/src/puzzle-solver.mjs";

const puzzles = JSON.parse(readFileSync(process.argv[2] ?? "data/puzzle_test_cases.json", "utf8"));
const results = puzzles.map((puzzle) => {
  const validation = validatePuzzleLine(puzzle);
  if (!validation.valid) throw new Error(`${puzzle.puzzle_id}: ${validation.error}`);
  return {
    puzzle_id: puzzle.puzzle_id,
    objective: puzzle.expected_objective ?? (puzzle.themes?.includes("mate") || puzzle.themes?.includes("checkmate") ? "mate" : "concept"),
    setup_move: puzzle.setup_move ?? null,
    moves: puzzle.moves,
    final_fen: validation.finalFen,
    game_over: validation.finalGameOver,
    checkmate: validation.finalCheckmate,
  };
});
process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);