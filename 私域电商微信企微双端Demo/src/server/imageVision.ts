import { readFile } from "node:fs/promises";
import path from "node:path";
import { getFoundationModelConfig, isFoundationModelConfigured } from "./foundationModelConfig";
import { resolveUploadDir } from "./uploadStorage";

// 视觉模型配置:默认复用主模型 key/基址。google、openai 的默认模型自带视觉能力;
// deepseek/moonshot 默认无视觉,需显式配置 FOUNDATION_VISION_MODEL_NAME(可配合
// FOUNDATION_VISION_BASE_URL / FOUNDATION_VISION_API_KEY 指向支持图片的 OpenAI 兼容接口)。
const VISION_CAPABLE_PROVIDERS = new Set(["google", "openai"]);
const DEFAULT_VISION_MODELS: Record<string, string> = {
  google: "gemini-1.5-flash",
  openai: "gpt-4o-mini",
};

export interface VisionModelConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
}

function envValue(key: string): string {
  return process.env[key]?.trim() || "";
}

export async function getVisionModelConfig(): Promise<VisionModelConfig | null> {
  if (!(await isFoundationModelConfigured())) return null;
  const config = await getFoundationModelConfig();
  const model =
    envValue("FOUNDATION_VISION_MODEL_NAME") ||
    (VISION_CAPABLE_PROVIDERS.has(config.provider) ? DEFAULT_VISION_MODELS[config.provider] : "");
  if (!model) return null;
  return {
    apiKey: envValue("FOUNDATION_VISION_API_KEY") || config.apiKey,
    baseUrl: (envValue("FOUNDATION_VISION_BASE_URL") || config.baseUrl).replace(/\/chat\/completions\/?$/, ""),
    model,
  };
}

// 魔数嗅探：上传校验与视觉调用共用同一实现，避免信任客户端声明的 MIME。
export function sniffMimeType(buffer: Buffer): string | null {
  if (buffer.subarray(0, 8).toString("hex") === "89504e470d0a1a0a") return "image/png";
  if (buffer.subarray(0, 3).toString("hex") === "ffd8ff") return "image/jpeg";
  if (buffer.subarray(0, 4).toString("hex") === "47494638") return "image/gif";
  if (buffer.subarray(0, 4).toString("hex") === "52494646" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

// 调用视觉模型描述客户图片。任何失败(未配置、文件缺失、接口报错)都返回 null,
// 由调用方回退到原有的 [图片] 文本标记行为,不阻断聊天;失败原因写 warn 日志便于排查。
const VISION_TIMEOUT_MS = 15000;

function visionSkipped(reason: string): null {
  console.warn(`[imageVision] 跳过识图：${reason}`);
  return null;
}

export async function describeCustomerImage(mediaPath: string): Promise<string | null> {
  const filename = mediaPath.split("?")[0].slice(mediaPath.split("?")[0].lastIndexOf("/") + 1);
  let buffer: Buffer;
  try {
    buffer = await readFile(path.join(resolveUploadDir(), filename));
  } catch {
    return visionSkipped(`图片文件不存在 ${filename}`);
  }
  const vision = await getVisionModelConfig();
  if (!vision) return visionSkipped("未配置具备视觉能力的模型");
  const dataUrl = `data:${sniffMimeType(buffer) ?? "image/png"};base64,${buffer.toString("base64")}`;
  try {
    const response = await fetch(`${vision.baseUrl}/chat/completions`, {
      method: "POST",
      signal: AbortSignal.timeout(VISION_TIMEOUT_MS),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${vision.apiKey}` },
      body: JSON.stringify({
        model: vision.model,
        temperature: 0.1,
        max_tokens: 300,
        messages: [
          {
            role: "system",
            content: [
              "你是私域电商售前客服的图片理解助手。客户在聊天中发来图片,请用 1-2 句中文说明图片大致内容,只需包含:",
              "1) 图片类型(付款截图 / 商品或药品实拍 / 价格表 / 聊天记录 / 其他);",
              "2) 若能看出商品品类,写出品类名称。",
              "严禁抽取或转述金额、时间、订单号、单号、支付平台等具体数字与凭据信息;这些事实一律由客服与系统核对,不得由图片描述引入。",
              "只输出描述本身,不要任何前缀或解释。",
            ].join("\n"),
          },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: dataUrl } },
              { type: "text", text: "请描述这张客户发来的图片。" },
            ],
          },
        ],
      }),
    });
    if (!response.ok) return visionSkipped(`视觉接口返回 ${response.status}`);
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = payload.choices?.[0]?.message?.content?.trim();
    return text ? text : visionSkipped("视觉接口返回空描述");
  } catch (error) {
    return visionSkipped(error instanceof Error ? error.message : "视觉接口调用异常");
  }
}
