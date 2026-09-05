import process from "node:process";
import { chromium } from "playwright";

const appUrl = process.argv[2] ?? "http://localhost:8501";
const browserPath = process.argv[3] ?? "";

const browser = await chromium.launch({
  ...(browserPath ? { executablePath: browserPath } : {}),
  headless: false,
  args: ["--start-maximized"],
});
const page = await browser.newPage({ viewport: null });

const formatValue = (value) => {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

page.on("console", async (message) => {
  const values = await Promise.all(message.args().map(async (argument) => {
    try {
      return formatValue(await argument.jsonValue());
    } catch {
      return message.text();
    }
  }));
  console.log(`[browser ${message.type()}] ${values.join(" ")}`);
});

page.on("pageerror", (error) => {
  console.error(`[browser pageerror] ${error.stack ?? error.message}`);
});

page.on("requestfailed", (request) => {
  console.warn(`[browser requestfailed] ${request.method()} ${request.url()} ${request.failure()?.errorText ?? "unknown error"}`);
});

page.on("load", () => {
  console.log(`[browser load] ${page.url()}`);
});

console.log(`[browser] opening ${appUrl}`);
await page.goto(appUrl, { waitUntil: "domcontentloaded" });
console.log("[browser] Playwright listener active; press Ctrl+C to stop.");

const shutdown = async () => {
  await browser.close();
  process.exit(0);
};
process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

await new Promise(() => {});