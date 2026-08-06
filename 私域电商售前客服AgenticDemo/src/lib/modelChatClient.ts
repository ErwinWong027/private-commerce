import { getFoundationModelConfig, isFoundationModelConfigured } from "@/lib/foundationModelConfig";

export interface ModelChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ModelChatErrorShape {
  status: number;
  code: string;
  message: string;
}

function mapModelError(status: number, detail: string): ModelChatErrorShape {
  if (status === 400) {
    return { status, code: "BAD_REQUEST", message: `请求参数错误：${detail || "请检查模型请求体。"}` };
  }
  if (status === 401 || status === 403) {
    return { status, code: "AUTH_INVALID", message: "模型 API 密钥无效或无权限，请检查服务端环境变量配置。" };
  }
  if (status === 429) {
    return { status, code: "RATE_LIMIT", message: "请求过于频繁或额度已达上限，请稍后重试。" };
  }
  if (status >= 500) {
    return { status, code: "UPSTREAM_UNAVAILABLE", message: "模型服务暂时不可用，请稍后再试。" };
  }
  return { status, code: "UPSTREAM_ERROR", message: detail || "模型服务请求失败。" };
}

export async function createModelChatStream(
  historyMessages: ModelChatMessage[],
): Promise<{ response: Response; configLabel: string }> {
  const isConfigured = await isFoundationModelConfigured();
  if (!isConfigured) {
    throw new Error("服务端未配置 FOUNDATION_MODEL_API_KEY，无法发起大模型请求。");
  }

  const config = await getFoundationModelConfig();
  const normalizedMessages = historyMessages.length > 0 ? historyMessages : [{ role: "user", content: "Hello!" }];
  const response = await fetch(`${config.baseUrl}${config.chatCompletionsPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      messages: normalizedMessages,
      stream: true,
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    const mappedError = mapModelError(response.status, detail);
    throw new Error(JSON.stringify(mappedError));
  }

  return {
    response,
    configLabel: `${config.displayName} / ${config.model}`,
  };
}

export function normalizeModelServiceError(error: unknown): ModelChatErrorShape {
  if (error instanceof Error) {
    try {
      const parsed = JSON.parse(error.message) as ModelChatErrorShape;
      if (parsed && typeof parsed.message === "string" && typeof parsed.code === "string") {
        return parsed;
      }
    } catch {
      return {
        status: 500,
        code: "LOCAL_ERROR",
        message: error.message.includes("fetch")
          ? "网络请求失败，请确认当前环境可以访问模型网关。"
          : error.message,
      };
    }
  }

  return {
    status: 500,
    code: "LOCAL_ERROR",
    message: "模型服务调用失败，请稍后重试。",
  };
}
