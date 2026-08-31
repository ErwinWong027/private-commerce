import { getRepository } from "./repository";
import { runPresalesSkillOrchestrator } from "./presalesOrchestrator";
import { describeCustomerImage } from "./imageVision";
import { selectTriggeredImageAsset } from "./imageTriggers";
import type { MessageRecord } from "@/types";

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

export function describeMessageForLlm(item: MessageRecord): string {
  if (item.contentType !== "image" || !item.mediaPath) return item.content;
  const imageText = item.imageDescription ? `（图片内容：${item.imageDescription}）` : "（附图片）";
  return item.content ? `${item.content}${imageText}` : `[图片]${item.imageDescription ? ` ${item.imageDescription}` : ""}`;
}

export async function handleCustomerMessage(sessionId: string, content: string, mediaPath: string | null = null) {
  const repo = getRepository();
  const conversation = repo.getConversation(sessionId);
  if (!conversation) throw new NotFoundError("会话不存在");
  if (conversation.status === "closed") throw new ConflictError("会话已关闭");
  const customerMessage = repo.appendMessage(sessionId, "customer", "U-CUSTOMER-001", content, mediaPath);
  if (conversation.status === "human_serving") {
    return { mode: "human" as const, message: customerMessage, conversation: repo.getConversation(sessionId) };
  }
  let aiMessage = content || "[图片]";
  if (mediaPath) {
    const imageDescription = await describeCustomerImage(mediaPath);
    if (imageDescription) {
      repo.setMessageImageDescription(customerMessage.id, imageDescription);
      aiMessage = content ? `${content}（图片内容：${imageDescription}）` : `客户发来一张图片：${imageDescription}`;
    }
  }
  const history = conversation.messages.slice(-8).map((item) => ({
    role: item.actor === "customer" ? "user" as const : item.actor === "system" ? "system" as const : "assistant" as const,
    content: describeMessageForLlm(item),
  }));
  const decision = await runPresalesSkillOrchestrator({ message: aiMessage, history });
  if (repo.getSessionStatus(sessionId) === "human_serving") {
    return { mode: "human" as const, message: customerMessage, conversation: repo.getConversation(sessionId) };
  }
  const turn = repo.saveAutomatedDecision(sessionId, customerMessage.id, content, decision);
  const sentMediaPaths = conversation.messages.map((item) => item.mediaPath).filter((value): value is string => Boolean(value));
  const triggeredAsset = selectTriggeredImageAsset({ intent: decision.intent, subIntent: decision.subIntent, sentMediaPaths });
  let triggeredImage: MessageRecord | null = null;
  if (triggeredAsset) {
    triggeredImage = repo.appendMessage(sessionId, "ai", null, "", triggeredAsset);
  }
  return { mode: "ai" as const, decision, turn, triggeredImage, conversation: repo.getConversation(sessionId) };
}

export function handleAgentReply(sessionId: string, content: string, mediaPath: string | null = null) {
  const repo = getRepository();
  const status = repo.getSessionStatus(sessionId);
  if (!status) throw new NotFoundError("会话不存在");
  if (status !== "human_serving") throw new ConflictError("客服需先接管会话");
  const message = repo.appendMessage(sessionId, "agent", "U-AGENT-001", content, mediaPath);
  return { message, conversation: repo.getConversation(sessionId) };
}
