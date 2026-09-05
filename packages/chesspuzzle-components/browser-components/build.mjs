import { readFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

const stockfishPath = path.resolve("node_modules/stockfish.js/stockfish.js");

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  format: "iife",
  platform: "browser",
  loader: { ".css": "text", ".html": "text" },
  outfile: "../src/chess_components/assets/browser-components.js",
  plugins: [
    {
      name: "stockfish-worker-source",
      setup(buildContext) {
        buildContext.onLoad({ filter: /stockfish\.js[\\/]stockfish\.js$/ }, async (args) => ({
          contents: await readFile(args.path, "utf8"),
          loader: "text",
        }));
      },
    },
  ],
});