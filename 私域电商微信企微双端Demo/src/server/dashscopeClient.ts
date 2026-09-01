import { readFile } from "node:fs/promises";
import { getDashscopeConfig, type DashscopeConfig } from "./dashscopeConfig";

export async function chatText(input: { config?: DashscopeConfig | null; prompt: string }): Promise<{ extracted: string; confidence: number } | null> {
  const config = input.config ?? getDashscopeConfig();
  if (!config) return null;
  try {
    const response = await fetch(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.llmModel,
        messages: [
          { role: "system", content: "请将输入文本提炼为简短结构化结果，只返回 JSON。" },
          { role: "user", content: input.prompt },
        ],
      }),
    });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null) as { choices?: Array<{ message?: { content?: string } }> } | null;
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) return null;
    return { extracted: content, confidence: 0.6 };
  } catch {
    return null;
  }
}

export async function transcribeAudio(input: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  config?: DashscopeConfig | null;
}): Promise<{ transcript: string; confidence: number } | null> {
  const config = input.config ?? getDashscopeConfig();
  if (!config) return null;
  try {
    const response = await fetch(config.asrEndpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: config.asrModel,
        input: {
          audio: input.buffer.toString("base64"),
          filename: input.filename,
          mime_type: input.mimeType,
        },
      }),
    });
    if (!response.ok) return null;
    const payload = await response.json().catch(() => null) as { output?: { text?: string; confidence?: number } } | null;
    const text = payload?.output?.text?.trim();
    if (!text) return null;
    return { transcript: text, confidence: typeof payload?.output?.confidence === "number" ? payload.output.confidence : 0.6 };
  } catch {
    return null;
  }
}
