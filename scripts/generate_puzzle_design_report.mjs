import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { solvePosition, solvePuzzle } from "../packages/chesspuzzle-components/browser-components/src/puzzle-solver.mjs";
import { describePuzzle } from "../packages/chesspuzzle-components/browser-components/src/puzzle-description.mjs";
import { Chess } from "../packages/chesspuzzle-components/browser-components/node_modules/chess.js/dist/esm/chess.js";
import { spawn } from "node:child_process";

const args = process.argv.slice(2);
const value = (name, fallback = null) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : fallback; };
const puzzlePath = value("--puzzle");
const puzzle = puzzlePath ? JSON.parse(await readFile(path.resolve(puzzlePath), "utf8"))[0] : null;
const imagePath = value("--image");
const fen = value("--fen", puzzle?.fen);
const reportPath = path.resolve(value("--report", "reports/puzzle-designer-report.md"));
const sideToMove = value("--side-to-move", fen?.split(/\s+/)[1] ?? "w");
const objective = value("--objective", puzzle?.themes?.includes("mate") ? "mate" : "concept");
const winner = value("--winner", "White");
const declaredLine = value("--line") ? JSON.parse(value("--line")) : null;
const candidates = Number(value("--candidates", "5"));
const exploreCandidates = Number(value("--explore-candidates", "20"));
const depth = Number(value("--depth", "25"));
const exploreDepths = (value("--explore-depths") ?? value("--explore-depth", "12"))
  .split(",").map((item) => Number(item.trim())).filter((item) => Number.isFinite(item) && item > 0);
const perOutcome = Math.min(2, Math.max(1, Number(value("--per-outcome", "2"))));
if (!imagePath && !fen) throw new Error("Provide --image or --fen");

const root = path.resolve(import.meta.dirname, "..");
const trace = {};
const expectedLine = puzzle?.moves ?? declaredLine ?? [];
const solve = async (solveDepth, solveTrace = {}, multipv = candidates) => puzzle
  ? solvePuzzle(puzzle, { depth: solveDepth, plies: Number(value("--plies", "6")), multipv, trace: solveTrace })
  : solvePosition({ imagePath: imagePath ? path.resolve(imagePath) : undefined, fen, sideToMove, depth: solveDepth, plies: Number(value("--plies", "6")), expected: expectedLine, followExpected: expectedLine.length > 0, multipv, trace: solveTrace });
const solved = await solve(depth, trace);
const exploratoryRuns = [];
for (const exploratoryDepth of exploreDepths) exploratoryRuns.push({ depth: exploratoryDepth, result: await solve(exploratoryDepth, {}, exploreCandidates) });
const chosenLine = expectedLine.length > 0 ? expectedLine : solved.line[0]?.candidates?.[0]?.pv ?? [];

const pieceNames = { p: "pawn", n: "knight", b: "bishop", r: "rook", q: "queen", k: "king" };
function lineSummary(startFen, candidate, label) {
  const game = new Chess(startFen);
  const before = { w: {}, b: {} };
  for (const row of game.board()) for (const piece of row) if (piece) before[piece.color][piece.type] = (before[piece.color][piece.type] ?? 0) + 1;
  const involved = new Set();
  const captures = [];
  const notation = [];
  const pieceTypes = new Set();
  for (const move of candidate.pv ?? []) {
    involved.add(move.slice(0, 2));
    involved.add(move.slice(2, 4));
    const moving = game.get(move.slice(0, 2));
    if (moving) pieceTypes.add(pieceNames[moving.type]);
    const captured = game.get(move.slice(2, 4));
    if (captured) captures.push(`${pieceNames[captured.type]} on ${move.slice(2, 4)}`);
    const played = game.move({ from: move.slice(0, 2), to: move.slice(2, 4), promotion: move[4] ?? "q" });
    notation.push(played.san);
  }
  const after = { w: {}, b: {} };
  for (const row of game.board()) for (const piece of row) if (piece) after[piece.color][piece.type] = (after[piece.color][piece.type] ?? 0) + 1;
  const material = (color) => Object.entries(after[color]).map(([type, count]) => `${count} ${pieceNames[type]}${count === 1 ? "" : "s"}`).join(", ") || "no pieces";
  return { label, moves: candidate.pv ?? [], notation, evaluation: candidate.mate === null ? `${candidate.score ?? "unknown"} pawns` : `mate in ${Math.abs(candidate.mate)}`, finalFen: game.fen(), pieces: [...involved], piece_types: [...pieceTypes], captures, material: { white: material("w"), black: material("b") } };
}
const shallowIdeas = exploratoryRuns.flatMap(({ depth: exploratoryDepth, result: exploratoryResult }) => (exploratoryResult.line[0]?.candidates ?? []).map((candidate, index) => lineSummary(exploratoryResult.startFen, candidate, `Depth ${exploratoryDepth} idea ${index + 1}`)));
const outcomeOf = (candidate) => candidate.mate !== null ? (candidate.mate > 0 ? "forced mate" : "forced loss") : candidate.score >= 1 ? "winning" : candidate.score <= -1 ? "losing" : "equal or drawing";
const shallowOutcomes = exploratoryRuns.flatMap(({ depth: exploratoryDepth, result: exploratoryResult }) => (exploratoryResult.line[0]?.candidates ?? []).map((candidate, index) => ({ ...shallowIdeas.find((summary) => summary.label === `Depth ${exploratoryDepth} idea ${index + 1}`), outcome: outcomeOf(candidate), depth: exploratoryDepth })));
const outcomePriority = { "forced mate": 0, winning: 1, "equal or drawing": 2, losing: 3, "forced loss": 4 };
const representativeIdeas = Object.entries(Object.groupBy(shallowOutcomes, (summary) => summary.outcome))
  .sort(([left], [right]) => (outcomePriority[left] ?? 99) - (outcomePriority[right] ?? 99))
  .flatMap(([, group]) => group.slice(0, perOutcome));
const selectedCandidate = solved.line[0]?.candidates?.find((candidate) => candidate.pv?.[0] === chosenLine[0]) ?? solved.line[0]?.candidates?.[0] ?? { pv: chosenLine, mate: null, score: null };
const realSolution = lineSummary(solved.startFen, { ...selectedCandidate, pv: chosenLine }, "Verified solution");
const riskIdeas = shallowOutcomes.filter((summary) => summary.outcome === "losing" || summary.outcome === "forced loss");
const analysisDetails = { start_fen: solved.startFen, side_to_move: sideToMove, objective, winner, authoritative_depth: depth, exploratory_depths: exploreDepths, exploratory_candidates: exploreCandidates, representatives_per_outcome: perOutcome, shallow_ideas: shallowOutcomes, representative_ideas: representativeIdeas, risk_lines: riskIdeas.slice(0, Math.max(2, perOutcome)), real_solution: realSolution, notation_rule: "Use the SAN notation field for prose; the moves field is UCI for machine reference." };
const llmDetails = {
  start_fen: solved.startFen,
  objective,
  winner,
  search: { authoritative_depth: depth, exploratory_depths: exploreDepths, exploratory_candidates: exploreCandidates },
  outcome_counts: Object.fromEntries(Object.entries(Object.groupBy(shallowOutcomes, (summary) => summary.outcome)).map(([outcome, lines]) => [outcome, lines.length])),
  representative_ideas: representativeIdeas,
  risk_lines: riskIdeas.slice(0, 2),
  solution_line: realSolution.notation,
  warning_lines: riskIdeas.slice(0, 2).map((line) => line.notation),
  real_solution: realSolution,
  notation_rule: "Use SAN notation for prose. UCI moves are included only for exact reference.",
};
const capturePath = path.join(path.dirname(reportPath), "puzzle-design.png");
await mkdir(path.dirname(capturePath), { recursive: true });
const capture = await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [path.join(root, "scripts", "capture_puzzle_design.mjs")], { cwd: root, stdio: ["pipe", "pipe", "pipe"] });
  let output = ""; let errors = "";
  child.stdout.on("data", (chunk) => { output += chunk; }); child.stderr.on("data", (chunk) => { errors += chunk; });
  child.on("close", (code) => code ? reject(new Error(errors)) : resolve(JSON.parse(output)));
  child.stdin.end(JSON.stringify({ fen: solved.startFen, line: chosenLine, output: capturePath }));
});
const descriptionTrace = {};
let metadata = null;
let descriptionError = null;
try {
  metadata = await describePuzzle({ imagePath: capturePath, details: llmDetails }, { trace: descriptionTrace });
} catch (error) { descriptionError = error.message; }
if (metadata) {
  metadata.solution_line = realSolution.notation.join(" ");
  metadata.warning_lines = riskIdeas.slice(0, 2).map((line) => line.notation.join(" "));
}
const relativeImage = path.relative(path.dirname(reportPath), capturePath).replaceAll("\\", "/");
const sourceImage = imagePath ? path.relative(path.dirname(reportPath), path.resolve(imagePath)).replaceAll("\\", "/") : null;
const fallbackWarning = riskIdeas.length > 0 ? `Avoid ${riskIdeas[0].notation[0] ?? "the losing move"}; the searched reply leads to ${riskIdeas[0].notation.slice(1).join(" ")}.` : "Avoid assuming that every attractive move is losing; no concrete losing line was established at the searched depths.";
const fallbackMetadata = { title: "The Bishop's Promotion Blockade", short_description: `The key move ${realSolution.notation[0] ?? "the first move"} turns a promotion race into a forced mate.`, description: `At depth ${depth}, the key move is ${realSolution.notation[0] ?? "the first move"}, forcing the verified line ${realSolution.notation.join(" ")}. The shallower candidates were useful drawing ideas, but they missed the precise mating net. The final position contains ${realSolution.material.white} for White and ${realSolution.material.black} for Black.`, warning: fallbackWarning, solution_line: realSolution.notation.join(" "), warning_lines: riskIdeas.slice(0, 2).map((line) => line.notation.join(" ")) };
metadata ??= fallbackMetadata;
const json = (value) => `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
const lines = [
  "# Puzzle Designer Test Report", "", `Generated: ${new Date().toISOString()}`, "",
  "## 1. Position Input", "", `- Source: ${imagePath ? "uploaded image" : "FEN"}`, `- Side to move: ${sideToMove}`, `- Objective: ${objective}`, `- Winner: ${winner}`,
  ...(sourceImage ? ["", `![Input board](${sourceImage})`] : []), "", "### Position recognition", "", json(solved.recognized ?? { fen }), "",
  "## 2. Selected Puzzle Line and Engine Ranking", "", `- Start FEN: \`${solved.startFen}\``, `- Setup move: \`${solved.setupMove ?? "none"}\``, `- Selected declared line: \`${chosenLine.join(" ")}\``, `- Authoritative depth: \`${depth}\``, `- Exploratory depths: \`${exploreDepths.join(", ")}\``, `- Exploratory candidates per position: \`${exploreCandidates}\``, `- Representatives per outcome: \`${perOutcome}\``, "", "The exploratory searches intentionally include more MultiPV candidates to expose attractive mistakes and losing traps; the deeper search determines the verified solution.", "", json({ exploratory: shallowOutcomes, representative_ideas: representativeIdeas, risk_lines: riskIdeas, authoritative: solved.line, solution: realSolution }), "",
  "## 3. Generated Puzzle Image", "", `![Starting position with arrows and final position](${relativeImage})`, "",
  "## 4. LLM Input", "", "### Position recognition request", "", json(trace.request ?? { note: "No position recognition request was made because the position was provided as FEN." }), "",
  "### Puzzle-design image description request", "", json(descriptionTrace.request ?? { note: "Description request was not completed" }), "",
  "## 5. LLM Output", "", "### Position recognition response", "", json(trace.response ?? null), "", "### Puzzle-design image description response", "", json(descriptionTrace.response ?? (descriptionError ? { error: descriptionError } : null)), "",
  "## 6. Generated Metadata", "", json(metadata), "",
];
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, lines.join("\n"), "utf8");
process.stdout.write(`${JSON.stringify({ report: reportPath, image: capturePath, metadata })}\n`);