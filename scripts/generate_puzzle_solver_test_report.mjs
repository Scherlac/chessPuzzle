import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { solvePosition, validatePuzzleLine } from "../packages/chesspuzzle-components/browser-components/src/puzzle-solver.mjs";

const args = process.argv.slice(2);
const value = (name, fallback) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
};
const root = path.resolve(import.meta.dirname, "..");
const casesPath = path.resolve(value("--cases", "data/puzzle_test_cases.json"));
const reportPath = path.resolve(value("--report", "reports/puzzle-solver-test-report.md"));
const junitPath = value("--junitxml", null);
const depth = Number(value("--depth", "25"));
const candidates = Number(value("--candidates", "3"));
const cases = JSON.parse(await readFile(casesPath, "utf8"));
const json = (valueToFormat) => `\`\`\`json\n${JSON.stringify(valueToFormat, null, 2)}\n\`\`\``;
const results = [];
const junit = junitPath ? await readFile(path.resolve(junitPath), "utf8") : null;
const testCases = junit
  ? [...junit.matchAll(/<testcase\b[^>]*>/g)].map((match) => {
    const attributes = match[0];
    const bodyStart = (match.index ?? 0) + attributes.length;
    const bodyEnd = junit.indexOf("</testcase>", bodyStart);
    const body = attributes.endsWith("/>") || bodyEnd < 0 ? "" : junit.slice(bodyStart, bodyEnd);
    const name = attributes.match(/\bname="([^"]*)"/)?.[1] ?? "unknown";
    const skipped = body.match(/<skipped[^>]*message="([^"]*)"/);
    return { name, status: skipped ? "skipped" : body.includes("<failure") ? "failed" : body.includes("<error") ? "error" : "passed", reason: skipped?.[1] ?? null };
  })
  : [];

for (const puzzle of cases) {
  const validity = validatePuzzleLine(puzzle);
  const solved = await solvePosition({
    fen: puzzle.fen,
    setupMove: puzzle.setup_move ?? null,
    depth,
    plies: 1,
    multipv: candidates,
  });
  const first = solved.line[0];
  const firstExpected = puzzle.moves[0];
  const firstMate = first.candidates.find((candidate) => candidate.pv[0] === firstExpected)?.mate ?? null;
  const independentlySolved = puzzle.expected_objective === "mate"
    ? first.bestmove === firstExpected && firstMate !== null && firstMate > 0
    : null;
  results.push({
    puzzle_id: puzzle.puzzle_id,
    objective: puzzle.expected_objective,
    validity,
    search: {
      depth,
      candidatesRequested: candidates,
      plies: 1,
      expectedFirstMove: firstExpected,
      bestmove: first.bestmove,
      expectedRank: first.candidates.findIndex((candidate) => candidate.pv[0] === firstExpected) + 1,
      expectedMate: firstMate,
      independentlySolved,
      candidates: first.candidates,
    },
  });
}

const lines = [
  "# Puzzle Solver Test Report",
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  "This report uses the shared puzzle solver and declared-line validator. It performs one independent engine search from each fixture's starting position; it does not call an LLM.",
  "",
  "## Configuration",
  "",
  `- Cases: \`${path.relative(root, casesPath).replaceAll("\\", "/")}\``,
  `- Search depth: \`${depth}\``,
  `- Requested candidates: \`${candidates}\``,
  "- Search plies per fixture: `1`",
  ...(junit ? [`- Pytest results: \`${path.relative(root, path.resolve(junitPath)).replaceAll("\\", "/")}\``] : []),
  "",
  "## Summary",
  "",
  "| Puzzle | Objective | Line validity | Best first move | Expected rank | Mate score | Independent status |",
  "|---|---|---:|---|---:|---:|---|",
  ...results.map((result) => {
    const status = result.search.independentlySolved === null
      ? "not applicable"
      : result.search.independentlySolved ? "solved" : "not solved at this depth";
    return `| ${result.puzzle_id} | ${result.objective} | ${result.validity.valid ? "valid" : "invalid"} | ${result.search.bestmove} | ${result.search.expectedRank || "not returned"} | ${result.search.expectedMate ?? "none"} | ${status} |`;
  }),
  ...(junit ? ["", "## Pytest Results", "", `- Passed: \`${testCases.filter((test) => test.status === "passed").length}\``, `- Failed: \`${testCases.filter((test) => test.status === "failed").length}\``, `- Errors: \`${testCases.filter((test) => test.status === "error").length}\``, `- Skipped: \`${testCases.filter((test) => test.status === "skipped").length}\``, "", "| Test | Status | Reason |", "|---|---|---|", ...testCases.map((test) => `| ${test.name} | ${test.status} | ${test.reason ?? ""} |`)] : []),
  "",
  "## Details",
  "",
];
for (const result of results) {
  const puzzle = cases.find((candidate) => candidate.puzzle_id === result.puzzle_id);
  lines.push(
    `### ${result.puzzle_id}`,
    "",
    `- Objective: \`${result.objective}\``,
    `- Starting FEN: \`${puzzle.fen}\``,
    `- Setup move: \`${puzzle.setup_move ?? "none"}\``,
    `- Declared solution: \`${puzzle.moves.join(" ")}\``,
    `- Declared line validity: \`${result.validity.valid}\``,
    `- Final FEN: \`${result.validity.finalFen ?? "unavailable"}\``,
    "",
    json(result.search),
    "",
  );
}

await writeFile(reportPath, `${lines.join("\n")}\n`, "utf8");
process.stdout.write(`${JSON.stringify({ report: reportPath, puzzles: results.length })}\n`);