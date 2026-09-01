import { readFile } from "node:fs/promises";
import path from "node:path";
import { getDashscopeConfig } from "./dashscopeConfig";
import { chatText, transcribeAudio } from "./dashscopeClient";
import { resolveUploadDir } from "./uploadStorage";
import { sniffMimeType } from "./imageVision";

export type VoiceNormalization = { transcript: string; confidence: number };
export type ImageNormalizationKind = "payment" | "product" | "unknown";
export type ImageNormalization = { extracted: string; confidence: number; kind: ImageNormalizationKind };

function filenameFromMediaPath(mediaPath: string): string {
  const cleanPath = mediaPath.split("?")[0];
  return cleanPath.slice(cleanPath.lastIndexOf("/") + 1);
}

export function sniffAudioMimeType(buffer: Buffer): string | null {
  if (buffer.subarray(0, 3).toString("ascii") === "ID3") return "audio/mpeg";
  if (buffer.length > 1 && buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0) return "audio/mpeg";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WAVE") return "audio/wav";
  if (buffer.subarray(0, 4).toString("ascii") === "OggS") return "audio/ogg";
  if (buffer.subarray(0, 4).toString("hex") === "1a45dfa3") return "audio/webm";
  if (buffer.subarray(4, 8).toString("ascii") === "ftyp") return "audio/mp4";
  return null;
}

export function sniffMediaMimeType(buffer: Buffer): string | null {
  return sniffMimeType(buffer) ?? sniffAudioMimeType(buffer);
}

export function normalizeImage(visionDescription: string): ImageNormalization {
  const text = visionDescription.trim();
  if (!text) return { extracted: "", confidence: 0, kind: "unknown" };
  if (/金额|付款|支付|收款|转账|账单|二维码|小票|交易/i.test(text)) {
    return { extracted: text, confidence: 0.75, kind: "payment" };
  }
  if (/商品|药|包装|规格|外盒|实拍|陈列|价格表/i.test(text)) {
    return { extracted: text, confidence: 0.65, kind: "product" };
  }
  return { extracted: text, confidence: 0.4, kind: "unknown" };
}

export async function normalizeVoice(mediaPath: string): Promise<VoiceNormalization> {
  const filename = filenameFromMediaPath(mediaPath);
  let buffer: Buffer;
  try {
    buffer = await readFile(path.join(resolveUploadDir(), filename));
  } catch {
    return { transcript: "", confidence: 0 };
  }
  const mimeType = sniffAudioMimeType(buffer);
  if (!mimeType) return { transcript: "", confidence: 0 };
  const dashscope = getDashscopeConfig();
  if (!dashscope) return { transcript: "", confidence: 0 };
  const result = await transcribeAudio({
    buffer,
    filename,
    mimeType,
    config: dashscope,
  });
  if (!result) return { transcript: "", confidence: 0 };
  return result;
}

export async function normalizeImageDescription(visionDescription: string): Promise<ImageNormalization> {
  const dashscope = getDashscopeConfig();
  if (!dashscope) return normalizeImage(visionDescription);
  const result = await chatText({
    config: dashscope,
    prompt: visionDescription,
  });
  if (!result) return normalizeImage(visionDescription);
  return normalizeImage(result.extracted || visionDescription);
}
