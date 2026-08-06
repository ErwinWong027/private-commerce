// Universal Foundation Model configuration settings
export type FoundationModelProvider = "google" | "openai" | "deepseek" | "moonshot";

export interface FoundationModelConfig {
  provider: FoundationModelProvider;
  displayName: string;
  apiKey: string;
  model: string;
  baseUrl: string;
  chatCompletionsPath: string;
  systemPrompt: string;
}

const DEFAULT_PROVIDER: FoundationModelProvider = "google";

function getEnvValue(...keys: string[]): string {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return "";
}

function normalizeProvider(provider: string): FoundationModelProvider {
  const normalized = provider.trim().toLowerCase();
  if (normalized === "openai") return "openai";
  if (normalized === "deepseek") return "deepseek";
  if (normalized === "moonshot" || normalized === "kimi") return "moonshot";
  return DEFAULT_PROVIDER;
}

export async function getFoundationModelConfig(): Promise<FoundationModelConfig> {
  const provider = normalizeProvider(getEnvValue("FOUNDATION_MODEL_PROVIDER", "MODEL_PROVIDER") || DEFAULT_PROVIDER);
  
  // Read system prompts dynamically from docs/ontology and docs/prd if they exist, to automatically inject agent rules!
  let systemPrompt = "You are a helpful AI assistant.";
  try {
    const { getDocHtml } = await import("./docRegistry");
    const ontologyHtml = await getDocHtml("ontology");
    if (ontologyHtml) {
      systemPrompt = `You are an Agentic Customer Service Assistant. Guide the user based on the ontology design and policies below.\n\n${ontologyHtml.replace(/<[^>]*>/g, '')}`;
    }
  } catch {
    // Fallback if registry fails
  }

  const rawBaseUrl = getEnvValue("FOUNDATION_MODEL_BASE_URL", "MODEL_BASE_URL");
  let baseUrl = "";
  let defaultModel = "";

  switch (provider) {
    case "google":
      baseUrl = rawBaseUrl || "https://generativelanguage.googleapis.com/v1beta/openai";
      defaultModel = "gemini-1.5-flash";
      break;
    case "openai":
      baseUrl = rawBaseUrl || "https://api.openai.com/v1";
      defaultModel = "gpt-4o-mini";
      break;
    case "deepseek":
      baseUrl = rawBaseUrl || "https://api.deepseek.com";
      defaultModel = "deepseek-chat";
      break;
    case "moonshot":
      baseUrl = rawBaseUrl || "https://api.moonshot.cn/v1";
      defaultModel = "moonshot-v1-8k";
      break;
  }

  // Ensure baseUrl doesn't end with /chat/completions
  baseUrl = baseUrl.replace(/\/chat\/completions\/?$/, "");

  return {
    provider,
    displayName: provider.toUpperCase(),
    apiKey: getEnvValue("FOUNDATION_MODEL_API_KEY", "MODEL_API_KEY"),
    model: getEnvValue("FOUNDATION_MODEL_NAME", "MODEL_NAME") || defaultModel,
    baseUrl,
    chatCompletionsPath: "/chat/completions",
    systemPrompt,
  };
}

export async function isFoundationModelConfigured(): Promise<boolean> {
  const config = await getFoundationModelConfig();
  return config.apiKey.length > 0;
}
