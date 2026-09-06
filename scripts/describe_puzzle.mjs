import { readFileSync } from "node:fs";
import { describePuzzle } from "../packages/chesspuzzle-components/browser-components/src/puzzle-description.mjs";

const input = JSON.parse(readFileSync(0, "utf8"));
describePuzzle(input).then((result) => process.stdout.write(`${JSON.stringify(result)}\n`)).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});