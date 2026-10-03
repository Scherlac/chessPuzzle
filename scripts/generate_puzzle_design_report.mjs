import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { solvePosition, solvePuzzle } from "../packages/chesspuzzle-components/browser-components/src/puzzle-solver.mjs";
import { describePuzzle } from "../packages/chesspuzzle-components/browser-components/src/puzzle-description.mjs";
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
if (!imagePath && !fen) throw new Error("Provide --image or --fen");

const root = path.resolve(import.meta.dirname, "..");
const trace = {};
const expectedLine = puzzle?.moves ?? declaredLine ?? [];
const solved = puzzle
  ? await solvePuzzle(puzzle, { depth: Number(value("--depth", "12")), plies: Number(value("--plies", "6")), multipv: candidates, trace })
  : await solvePosition({ imagePath: imagePath ? path.resolve(imagePath) : undefined, fen, sideToMove, depth: Number(value("--depth", "12")), plies: Number(value("--plies", "6")), expected: expectedLine, followExpected: expectedLine.length > 0, multipv: candidates, trace });
const chosenLine = expectedLine.length > 0 ? expectedLine : solved.line[0]?.candidates?.[0]?.pv ?? [];
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
  metadata = await describePuzzle({ imagePath: capturePath, details: { side_to_move: sideToMove, objective, winner, line: chosenLine } }, { model: "gpt-5.6-luna", trace: descriptionTrace });
} catch (error) { descriptionError = error.message; }
const relativeImage = path.relative(path.dirname(reportPath), capturePath).replaceAll("\\", "/");
const sourceImage = imagePath ? path.relative(path.dirname(reportPath), path.resolve(imagePath)).replaceAll("\\", "/") : null;
const json = (value) => `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
const lines = [
  "# Puzzle Designer Test Report", "", `Generated: ${new Date().toISOString()}`, "",
  "## 1. Position Input", "", `- Source: ${imagePath ? "uploaded image" : "FEN"}`, `- Side to move: ${sideToMove}`, `- Objective: ${objective}`, `- Winner: ${winner}`,
  ...(sourceImage ? ["", `![Input board](${sourceImage})`] : []), "", "### Position recognition", "", json(solved.recognized ?? { fen }), "",
  "## 2. Selected Puzzle Line and Engine Ranking", "", `- Start FEN: \`${solved.startFen}\``, `- Setup move: \`${solved.setupMove ?? "none"}\``, `- Selected declared line: \`${chosenLine.join(" ")}\``, `- Requested candidates per position: \`${candidates}\``, "", "The engine ranks moves at each position; the analysis follows the selected declared line so every step is evaluated in the correct position.", "", json(solved.line), "",
  "## 3. Generated Puzzle Image", "", `![Starting position with arrows and final position](${relativeImage})`, "",
  "## 4. LLM Input", "", "### Position recognition request", "", json(trace.request ?? { note: "No position recognition request was made because the position was provided as FEN." }), "",
  "### Puzzle-design image description request", "", json(descriptionTrace.request ?? { note: "Description request was not completed" }), "",
  "## 5. LLM Output", "", "### Position recognition response", "", json(trace.response ?? null), "", "### Puzzle-design image description response", "", json(descriptionTrace.response ?? (descriptionError ? { error: descriptionError } : null)), "",
  "## 6. Generated Metadata", "", json(metadata ?? { error: descriptionError ?? "No metadata returned" }), "",
];
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, lines.join("\n"), "utf8");
process.stdout.write(`${JSON.stringify({ report: reportPath, image: capturePath, metadata })}\n`);