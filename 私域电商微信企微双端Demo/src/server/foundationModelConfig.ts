export type FoundationModelProvider = "google" | "openai" | "deepseek" | "moonshot";
export interface FoundationModelConfig {
  provider: FoundationModelProvider; displayName: string; apiKey: string; model: string;
  baseUrl: string; chatCompletionsPath: string; systemPrompt: string; maxTokens: number;
}

function env(...keys: string[]) {
  for (const key of keys) { const value = process.env[key]?.trim(); if (value) return value; }
  return "";
}

export async function getFoundationModelConfig(): Promise<FoundationModelConfig> {
  const raw = env("FOUNDATION_MODEL_PROVIDER", "MODEL_PROVIDER").toLowerCase();
  const provider: FoundationModelProvider = raw === "openai" || raw === "deepseek" || raw === "moonshot" || raw === "google" ? raw : "google";
  const defaults = {
    google: ["https://generativelanguage.googleapis.com/v1beta/openai", "gemini-1.5-flash"],
    openai: ["https://api.openai.com/v1", "gpt-4o-mini"],
    deepseek: ["https://api.deepseek.com", "deepseek-chat"],
    moonshot: ["https://api.moonshot.cn/v1", "moonshot-v1-8k"],
  } as const;
  return {
    provider, displayName: provider.toUpperCase(),
    apiKey: env("FOUNDATION_MODEL_API_KEY", "MODEL_API_KEY"),
    baseUrl: (env("FOUNDATION_MODEL_BASE_URL", "MODEL_BASE_URL") || defaults[provider][0]).replace(/\/chat\/completions\/?$/, ""),
    model: env("FOUNDATION_MODEL_NAME", "MODEL_NAME") || defaults[provider][1],
    chatCompletionsPath: "/chat/completions",
    maxTokens: parseInt(env("FOUNDATION_MODEL_MAX_TOKENS") || "2048", 10),
    systemPrompt: "You are a helpful AI assistant.",
  };
}

export async function isFoundationModelConfigured() {
  return (await getFoundationModelConfig()).apiKey.length > 0;
}

/** 备用 LLM endpoint（主 API 不可用时自动降级） */
export interface BackupModelConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  maxTokens: number;
}

export async function getBackupModelConfig(): Promise<BackupModelConfig | null> {
  const baseUrl = env("BACKUP_MODEL_BASE_URL");
  const apiKey = env("BACKUP_MODEL_API_KEY");
  const model = env("BACKUP_MODEL_NAME");
  if (!baseUrl || !apiKey) return null;
  return {
    baseUrl: baseUrl.replace(/\/chat\/completions\/?$/, ""),
    apiKey,
    model: model || "default",
    maxTokens: parseInt(env("BACKUP_MODEL_MAX_TOKENS") || "4096", 10),
  };
}
