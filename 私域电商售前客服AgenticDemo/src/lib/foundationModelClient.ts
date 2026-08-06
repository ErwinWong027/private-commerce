import { AgentIntentHints, GuardrailCategory, Ticket } from "@/types";
import { getFoundationModelConfig, isFoundationModelConfigured } from "@/lib/foundationModelConfig";
import { createTicketTimeContext } from "@/lib/timeContext";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface ChatCompletionChoice {
  message?: {
    content?: string;
  };
}

interface ChatCompletionResponse {
  choices?: ChatCompletionChoice[];
}

const VALID_GUARDRAIL_CATEGORIES: GuardrailCategory[] = [
  "NONE",
  "PROMPT_INJECTION",
  "PII",
  "FRAUD",
  "THREAT",
  "FORCE_MAJEURE",
  "OUT_OF_SCOPE",
];

function serializeEntities(entities: Ticket[]): string {
  // Serializer placeholder
  return JSON.stringify(entities, null, 2);
}

function normalizeGuardrailCategory(value: unknown): GuardrailCategory {
  if (typeof value !== "string") {
    return "NONE";
  }
  const normalized = value.trim().toUpperCase() as GuardrailCategory;
  return VALID_GUARDRAIL_CATEGORIES.includes(normalized) ? normalized : "NONE";
}

function sanitizeNullableString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function sanitizeBoolean(value: unknown): boolean {
  return value === true;
}

function sanitizeAction(value: unknown): AgentIntentHints["action"] {
  if (value === "REFUND" || value === "REBOOK") {
    return value;
  }
  return "NONE";
}

function extractJsonObject(rawText: string): string {
  const trimmed = rawText.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("基础模型未返回合法 JSON");
  }
  return trimmed.slice(start, end + 1);
}

function buildUserPrompt(
  message: string,
  historyMessages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  entities: Ticket[]
): string {
  const condensedHistory = historyMessages.slice(-6).map((item) => ({
    role: item.role,
    content: item.content,
  }));
  const currentTime = createTicketTimeContext().currentTimeIso;

  return [
    "请分析旅客最新消息并提取意图参数：",
    "",
    "【当前系统时间】",
    currentTime,
    "",
    "【历史对话】",
    JSON.stringify(condensedHistory, null, 2),
    "",
    "【车票资产】",
    serializeEntities(entities),
    "",
    "【最新消息】",
    message,
  ].join("\n");
}

function sanitizeMatchingTicketIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((id) => id.length > 0);
}

function sanitizeFoundationModelResult(payload: Record<string, unknown>): AgentIntentHints {
  return {
    action: sanitizeAction(payload.action),
    matchingTicketIds: sanitizeMatchingTicketIds(payload.matchingTicketIds),
    ticketId: sanitizeNullableString(payload.ticketId),
    trainNo: sanitizeNullableString(payload.trainNo),
    from: sanitizeNullableString(payload.from),
    to: sanitizeNullableString(payload.to),
    date: sanitizeNullableString(payload.date),
    rebookTargetDate: sanitizeNullableString(payload.rebookTargetDate),
    rebookTargetTrainNo: sanitizeNullableString(payload.rebookTargetTrainNo),
    rebookTargetSeatType: sanitizeNullableString(payload.rebookTargetSeatType),
    needsClarification: sanitizeBoolean(payload.needsClarification),
    clarificationQuestion: sanitizeNullableString(payload.clarificationQuestion),
    assistantReply: sanitizeNullableString(payload.assistantReply),
    guardrailCategory: normalizeGuardrailCategory(payload.guardrailCategory),
    guardrailReply: sanitizeNullableString(payload.guardrailReply),
  };
}

export async function analyzeMessageWithFoundationModel(
  message: string,
  historyMessages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  entities: Ticket[]
): Promise<AgentIntentHints | null> {
  const isConfigured = await isFoundationModelConfigured();
  if (!isConfigured) {
    console.warn("[FoundationModel] AI API Key not configured. Falling back to local rule engine.");
    return getMockHintsForTest(message);
  }

  const config = await getFoundationModelConfig();
  console.log(`[FoundationModel] Calling ${config.displayName} API (${config.model})...`);

  const messages: ChatMessage[] = [
    { role: "system", content: config.systemPrompt },
    { role: "user", content: buildUserPrompt(message, historyMessages, entities) },
  ];

  try {
    const response = await fetch(`${config.baseUrl}${config.chatCompletionsPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${config.displayName} 接口调用失败: ${response.status} - ${errorText}`);
    }

    const payload = (await response.json()) as ChatCompletionResponse;
    const rawContent = payload.choices?.[0]?.message?.content;
    if (!rawContent) {
      throw new Error(`${config.displayName} 未返回消息内容`);
    }

    const parsed = JSON.parse(extractJsonObject(rawContent)) as Record<string, unknown>;
    return sanitizeFoundationModelResult(parsed);
  } catch (error) {
    console.error("Foundation model integration error:", error);
    return null;
  }
}

export async function streamAnalyzeMessageWithFoundationModel(
  message: string,
  historyMessages: Array<{ role: "user" | "assistant" | "system"; content: string }>,
  entities: Ticket[],
  onChunk: (text: string) => void
): Promise<AgentIntentHints | null> {
  const isConfigured = await isFoundationModelConfigured();
  if (!isConfigured) {
    console.warn("[FoundationModel] AI API Key not configured. Falling back to local rule engine.");
    const mock = getMockHintsForTest(message);
    if (mock && mock.assistantReply) {
      onChunk(mock.assistantReply);
    }
    return mock;
  }

  const config = await getFoundationModelConfig();
  console.log(`[FoundationModel] Calling streaming ${config.displayName} API (${config.model})...`);

  const messages: ChatMessage[] = [
    { role: "system", content: config.systemPrompt },
    { role: "user", content: buildUserPrompt(message, historyMessages, entities) },
  ];

  try {
    const response = await fetch(`${config.baseUrl}${config.chatCompletionsPath}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${config.displayName} 接口调用失败: ${response.status} - ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error("无法读取流响应");
    }

    const decoder = new TextDecoder();
    let done = false;
    let fullAiResponse = "";
    let lastSentReply = "";
    let lastSentGuardrail = "";
    let buffer = "";

    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) {
        buffer += decoder.decode(value, { stream: !done });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed === "data: [DONE]") continue;
          if (trimmed.startsWith("data: ")) {
            const dataStr = trimmed.slice(6);
            try {
              const parsed = JSON.parse(dataStr);
              const chunkText = parsed.choices?.[0]?.delta?.content || "";
              fullAiResponse += chunkText;

              const currentReply = extractStreamingField(fullAiResponse, "assistantReply");
              if (currentReply && currentReply !== lastSentReply) {
                const diff = currentReply.slice(lastSentReply.length);
                onChunk(diff);
                lastSentReply = currentReply;
              }

              const currentGuardrail = extractStreamingField(fullAiResponse, "guardrailReply");
              if (currentGuardrail && currentGuardrail !== lastSentGuardrail) {
                const diff = currentGuardrail.slice(lastSentGuardrail.length);
                onChunk(diff);
                lastSentGuardrail = currentGuardrail;
              }
            } catch (e) {}
          }
        }
      }
    }

    const finalCleanJson = extractJsonObject(fullAiResponse);
    const parsed = JSON.parse(finalCleanJson) as Record<string, unknown>;
    return sanitizeFoundationModelResult(parsed);
  } catch (error) {
    console.error("Foundation model streaming integration error:", error);
    return null;
  }
}

function extractStreamingField(partialJson: string, fieldName: string): string {
  const pattern = new RegExp(`"${fieldName}"\\s*:\\s*"`);
  const match = partialJson.match(pattern);
  if (!match || match.index === undefined) return "";
  
  const startIndex = match.index + match[0].length;
  let content = "";
  let isEscaped = false;
  
  for (let i = startIndex; i < partialJson.length; i++) {
    const char = partialJson[i];
    if (isEscaped) {
      if (char === '"') content += '"';
      else if (char === '\\') content += '\\';
      else if (char === 'n') content += '\n';
      else if (char === 't') content += '\t';
      else content += '\\' + char;
      isEscaped = false;
    } else if (char === '\\') {
      isEscaped = true;
    } else if (char === '"') {
      break;
    } else {
      content += char;
    }
  }
  return content;
}

export function getMockHintsForTest(message: string): AgentIntentHints | null {
  const msg = message.toLowerCase();

  // A. Prompt injection safety simulation
  if (msg.includes("忽略") || msg.includes("扮演") || msg.includes("指令") || msg.includes("hack") || msg.includes("system rules")) {
    return {
      action: "NONE",
      matchingTicketIds: [],
      ticketId: null,
      trainNo: null,
      from: null,
      to: null,
      date: null,
      rebookTargetDate: null,
      rebookTargetTrainNo: null,
      rebookTargetSeatType: null,
      needsClarification: false,
      clarificationQuestion: null,
      assistantReply: null,
      guardrailCategory: "PROMPT_INJECTION",
      guardrailReply: "【规则拦截】安全防御系统已拦截到忽略或更改指令的恶意请求。我们已拒绝此操作。"
    };
  }

  // B. Specific ticket matching simulation
  if (msg.includes("g101") || msg.includes("第一张")) {
    const isRefund = msg.includes("退") || msg.includes("取消");
    return {
      action: isRefund ? "REFUND" : "NONE",
      matchingTicketIds: ["T1001"],
      ticketId: "T1001",
      trainNo: "G101",
      from: "北京南",
      to: "上海虹桥",
      date: null,
      rebookTargetDate: null,
      rebookTargetTrainNo: null,
      rebookTargetSeatType: null,
      needsClarification: false,
      clarificationQuestion: null,
      assistantReply: isRefund 
        ? "好的，已为您定位车票 G101。这是一张普通票，目前可以办理退票。确认后将进入退票说明预览。"
        : "好的，已为您定位车票 G101。请问您是需要办理退票还是改签？",
      guardrailCategory: "NONE",
      guardrailReply: null
    };
  }

  if (msg.includes("g5") || msg.includes("第二张")) {
    const isRebook = msg.includes("改") || msg.includes("变更");
    return {
      action: isRebook ? "REBOOK" : "NONE",
      matchingTicketIds: ["T1002"],
      ticketId: "T1002",
      trainNo: "G5",
      from: "广州南",
      to: "香港西九龙",
      date: null,
      rebookTargetDate: null,
      rebookTargetTrainNo: null,
      rebookTargetSeatType: null,
      needsClarification: false,
      clarificationQuestion: null,
      assistantReply: isRebook
        ? "好的，已为您定位到车票 G5。这是一张跨境车票，请在下方选择改签方案。"
        : "好的，已为您定位到车票 G5。请问您需要退票还是改签？",
      guardrailCategory: "NONE",
      guardrailReply: null
    };
  }

  if (msg.includes("g105") || msg.includes("第三张")) {
    return {
      action: "NONE",
      matchingTicketIds: ["T1003"],
      ticketId: "T1003",
      trainNo: "G105",
      from: "北京南",
      to: "上海虹桥",
      date: null,
      rebookTargetDate: null,
      rebookTargetTrainNo: null,
      rebookTargetSeatType: null,
      needsClarification: false,
      clarificationQuestion: null,
      assistantReply: "您好，系统已匹配到您的车票 G105。但该车票状态为“已乘车”，根据业务红线规定，已使用的车票无法再办理退改签手续。",
      guardrailCategory: "NONE",
      guardrailReply: null
    };
  }

  // C. Clarification trigger if user is too vague
  if (msg.includes("退票") || msg.includes("退款")) {
    return {
      action: "REFUND",
      matchingTicketIds: [],
      ticketId: null,
      trainNo: null,
      from: null,
      to: null,
      date: null,
      rebookTargetDate: null,
      rebookTargetTrainNo: null,
      rebookTargetSeatType: null,
      needsClarification: true,
      clarificationQuestion: "好的，请问您想办理哪张车票的退款业务？您可以输入车次名称，例如“退票 G101”。",
      assistantReply: null,
      guardrailCategory: "NONE",
      guardrailReply: null
    };
  }

  if (msg.includes("改签") || msg.includes("换票")) {
    return {
      action: "REBOOK",
      matchingTicketIds: [],
      ticketId: null,
      trainNo: null,
      from: null,
      to: null,
      date: null,
      rebookTargetDate: null,
      rebookTargetTrainNo: null,
      rebookTargetSeatType: null,
      needsClarification: true,
      clarificationQuestion: "好的，请问您想办理哪张车票的改签业务？您可以输入车次名称，例如“改签 G5”。",
      assistantReply: null,
      guardrailCategory: "NONE",
      guardrailReply: null
    };
  }

  // D. General Out-of-scope greeting fallback
  return {
    action: "NONE",
    matchingTicketIds: [],
    ticketId: null,
    trainNo: null,
    from: null,
    to: null,
    date: null,
    rebookTargetDate: null,
    rebookTargetTrainNo: null,
    rebookTargetSeatType: null,
    needsClarification: false,
    clarificationQuestion: null,
    assistantReply: "您好！我是智能助理。我可以帮您快速解答业务政策、计算退票改签手续费差额并确认交易。请告诉我您的车次或具体需求。",
    guardrailCategory: "NONE",
    guardrailReply: null
  };
}
