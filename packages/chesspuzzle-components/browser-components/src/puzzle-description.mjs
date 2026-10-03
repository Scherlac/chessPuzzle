import { readFileSync } from "node:fs";
import { extname } from "node:path";

function imageMime(path) {
  return { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp" }[extname(path).toLowerCase()] ?? "image/png";
}

function loadDotEnv() {
  try {
    const text = readFileSync(new URL("../../../../.env", import.meta.url), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*["']?(.*?)["']?\s*$/);
      if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
    }
  } catch {}
}

export async function describePuzzle({ imagePath, details }, options = {}) {
  loadDotEnv();
  const apiKey = options.apiKey ?? process.env.LLM_API_KEY;
  if (!apiKey) throw new Error("LLM_API_KEY is required for puzzle description");
  const baseUrl = (options.baseUrl ?? process.env.LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = options.model ?? process.env.LLM_MODEL ?? "gpt-5.6-luna";
  const image = readFileSync(imagePath).toString("base64");
  const prompt = `You are writing editorial copy for a chess puzzle. Use only the verified facts in the supplied analysis. Return JSON with exactly these string fields: title, short_description, description, warning.

Title rules: 3 to 8 words, memorable and genuinely playful, with chess-specific wordplay. Do not use stereotypes, nationality jokes, or cultural references that target a group. Do not claim a win unless the verified result says mate or a material advantage.
Short description: one sentence explaining the tactical idea and result.
Description: 2 to 4 sentences telling the story: what the tempting ideas do, which exploratory lines are traps, what punishment the defender can give, what the key move changes, and how the verified line ends. Mention the important pieces and material only when supported by the facts. Use algebraic move notation where available. Never invent a capture, check, mate, or evaluation. Treat risk_lines as warnings, not as the solution.
Warning: one direct sentence beginning with “Avoid ...” that names the concrete losing move or plan and the punishment shown by risk_lines. If no losing line was found, say that no concrete losing line was established at the searched depths.

Verified puzzle analysis:
${JSON.stringify(details, null, 2)}`;
  const request = {
    model,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: [
      { type: "text", text: prompt },
      { type: "image_url", image_url: { url: `data:${imageMime(imagePath)};base64,${image}` } },
    ] }],
    max_completion_tokens: options.maxCompletionTokens ?? 1000,
  };
  if (!model.startsWith("gpt-5")) request.temperature = 0;
  options.trace && Object.assign(options.trace, { kind: "description", model, request: { ...request, messages: request.messages.map((message) => ({ ...message, content: message.content.map((part) => part.type === "image_url" ? { type: "image_url", image_url: { url: `[base64 image: ${imagePath}]` } } : part) })) } });
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!response.ok) throw new Error(`Description request failed: ${response.status} ${await response.text()}`);
  const payload = await response.json();
  options.trace && Object.assign(options.trace, { response: payload.choices?.[0]?.message?.content ?? "", responsePayload: { ...payload, choices: undefined } });
  const content = payload.choices?.[0]?.message?.content ?? "{}";
  let result;
  try {
    result = JSON.parse(content);
  } catch (error) {
    throw new Error(`Description model returned invalid JSON: ${error.message}`);
  }
  if (!result.title || !result.short_description || !result.description || !result.warning) {
    throw new Error("Description model returned incomplete metadata");
  }
  return result;
}