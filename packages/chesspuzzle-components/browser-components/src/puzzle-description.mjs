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
  const request = {
    model,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: [
      { type: "text", text: `Create a factual description and a short, funny, cross-cultural title for this chess puzzle. Do not invent moves or pieces. Return JSON with fields description and title. Puzzle details: ${JSON.stringify(details)}` },
      { type: "image_url", image_url: { url: `data:${imageMime(imagePath)};base64,${image}` } },
    ] }],
    max_completion_tokens: options.maxCompletionTokens ?? 700,
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
  return JSON.parse(payload.choices?.[0]?.message?.content ?? "{}");
}