import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { solvePosition } from "../packages/chesspuzzle-components/browser-components/src/puzzle-solver.mjs";
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
if (!imagePath && !fen) throw new Error("Provide --image or --fen");

const root = path.resolve(import.meta.dirname, "..");
const trace = {};
const solved = await solvePosition({ imagePath: puzzle ? undefined : (imagePath ? path.resolve(imagePath) : undefined), fen, setupMove: puzzle?.setup_move ?? null, sideToMove, depth: Number(value("--depth", "12")), plies: Number(value("--plies", "6")), expected: puzzle?.moves ?? [], trace });
const chosenLine = puzzle?.moves ?? solved.line[0]?.candidates?.[0]?.pv ?? [];
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
  metadata = await describePuzzle({ imagePath: capturePath, details: { side_to_move: sideToMove, objective, winner, line: chosenLine } }, { trace: descriptionTrace });
} catch (error) { descriptionError = error.message; }
const relativeImage = path.relative(path.dirname(reportPath), capturePath).replaceAll("\\", "/");
const sourceImage = imagePath ? path.relative(path.dirname(reportPath), path.resolve(imagePath)).replaceAll("\\", "/") : null;
const json = (value) => `\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``;
const lines = [
  "# Puzzle Designer Test Report", "", `Generated: ${new Date().toISOString()}`, "",
  "## 1. Position Input", "", `- Source: ${imagePath ? "uploaded image" : "FEN"}`, `- Side to move: ${sideToMove}`, `- Objective: ${objective}`, `- Winner: ${winner}`,
  ...(sourceImage ? ["", `![Input board](${sourceImage})`] : []), "", "### Recognition output", "", json(solved.recognized ?? { fen }), "",
  "## 2. Ranked Solutions", "", `- Start FEN: \`${solved.startFen}\``, `- Setup move: \`${solved.setupMove ?? "none"}\``, `- Selected declared line: \`${chosenLine.join(" ")}\``, "", json(solved.line), "",
  "## 3. Generated Puzzle Image", "", `![Starting position with arrows and final position](${relativeImage})`, "",
  "## 4. LLM Input", "", "### Vision request", "", json(trace.request ?? { note: "No vision request was made" }), "",
  "### Description request", "", json(descriptionTrace.request ?? { note: "Description request was not completed" }), "",
  "## 5. LLM Output", "", "### Vision response", "", json(trace.response ?? null), "", "### Description response", "", json(descriptionTrace.response ?? (descriptionError ? { error: descriptionError } : null)), "",
  "## 6. Generated Metadata", "", json(metadata ?? { error: descriptionError ?? "No metadata returned" }), "",
];
await mkdir(path.dirname(reportPath), { recursive: true });
await writeFile(reportPath, lines.join("\n"), "utf8");
process.stdout.write(`${JSON.stringify({ report: reportPath, image: capturePath, metadata })}\n`);