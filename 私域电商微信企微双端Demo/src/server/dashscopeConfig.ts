export interface DashscopeConfig {
  apiKey: string;
  endpoint: string;
  asrEndpoint: string;
  llmModel: string;
  asrModel: string;
}

function env(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) return value;
  }
  return "";
}

function normalizeEndpoint(value: string, suffix: string): string {
  const base = value.replace(/\/$/, "");
  if (base.endsWith(suffix)) return base;
  return `${base}${suffix}`;
}

export function getDashscopeConfig(): DashscopeConfig | null {
  const apiKey = env("DASHSCOPE_API_KEY");
  if (!apiKey) return null;
  const host = env("DASHSCOPE_ENDPOINT", "DASHSCOPE_ASR_ENDPOINT");
  const llmModel = env("DASHSCOPE_LLM_MODEL") || "qwen3.7-plus";
  const asrModel = env("DASHSCOPE_ASR_MODEL") || "qwen-audio-3.0-asr-flash";
  const endpoint = normalizeEndpoint(host || "https://dashscope.aliyuncs.com", "/compatible-mode/v1/chat/completions");
  const asrEndpoint = normalizeEndpoint(host || "https://dashscope.aliyuncs.com", "/api/v1/services/aigc/multimodal-generation/generation");
  return { apiKey, endpoint, asrEndpoint, llmModel, asrModel };
}
