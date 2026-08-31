import { getRepository } from "./repository";
import { runPresalesGraph } from "./presalesGraph";
import { applyManualAdvance } from "./dealStage";
import { describeCustomerImage } from "./imageVision";
import { selectTriggeredImageAsset } from "./imageTriggers";
import { ForbiddenError } from "./identity";
import type { DealAdvanceAction, MessageRecord } from "@/types";

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

// 图片消息进入大模型输入时的唯一文案实现：历史消息与当前消息共用，避免两种格式并存。
function composeImageText(content: string, imageDescription: string | null): string {
  if (content) {
    return `${content}${imageDescription ? `（图片内容：${imageDescription}）` : "（附图片）"}`;
  }
  return imageDescription ? `[图片] ${imageDescription}` : "[图片]";
}

export function describeMessageForLlm(item: MessageRecord): string {
  if (item.contentType !== "image" || !item.mediaPath) return item.content;
  return composeImageText(item.content, item.imageDescription);
}

export async function handleCustomerMessage(sessionId: string, customerId: string, content: string, mediaPath: string | null = null) {
  const repo = getRepository();
  const conversation = repo.getConversation(sessionId, "customer");
  if (!conversation) throw new NotFoundError("会话不存在");
  if (conversation.customerId !== customerId) throw new ForbiddenError("无权访问该会话");
  if (conversation.status === "closed") throw new ConflictError("会话已关闭");
  const customerMessage = repo.appendMessage(sessionId, "customer", customerId, content, mediaPath);
  if (conversation.status === "human_serving") {
    return { mode: "human" as const, message: customerMessage, conversation: repo.getConversation(sessionId, "customer") };
  }
  let aiMessage = content || "[图片]";
  if (mediaPath) {
    const imageDescription = await describeCustomerImage(mediaPath);
    if (imageDescription) {
      repo.setMessageImageDescription(customerMessage.id, imageDescription);
    }
    aiMessage = composeImageText(content, imageDescription);
  }
  const history = conversation.messages.slice(-8).map((item) => ({
    role: item.actor === "customer" ? "user" as const : item.actor === "system" ? "system" as const : "assistant" as const,
    content: describeMessageForLlm(item),
  }));
  // 图片描述必须随 aiMessage 一起进入编排，否则识图结果不会影响回复。
  const { decision, nextStage } = await runPresalesGraph({ message: aiMessage, history, dealState: conversation.dealState });
  if (repo.getSessionStatus(sessionId) === "human_serving") {
    return { mode: "human" as const, message: customerMessage, conversation: repo.getConversation(sessionId, "customer") };
  }
  // 纯图片消息（无文字说明）不驱动成交阶段：视觉模型的自由文本不能当作事实凭据，
  // 阶段推进必须来自客户文字确认或客服手动操作。
  const imageOnly = Boolean(mediaPath) && !content;
  if (!imageOnly && nextStage !== conversation.dealState.stage) {
    repo.setDealState(sessionId, { stage: nextStage, trackingNo: conversation.dealState.trackingNo });
  }
  const turn = repo.saveAutomatedDecision(sessionId, customerMessage.id, content, decision);
  const sentMediaPaths = conversation.messages.map((item) => item.mediaPath).filter((value): value is string => Boolean(value));
  const triggeredAsset = selectTriggeredImageAsset({
    intent: decision.intent,
    subIntent: decision.subIntent,
    sentMediaPaths,
    stage: repo.getDealState(sessionId).stage,
  });
  let triggeredImage: MessageRecord | null = null;
  if (triggeredAsset) {
    triggeredImage = repo.appendMessage(sessionId, "ai", null, "", triggeredAsset);
  }
  return { mode: "ai" as const, decision, turn, triggeredImage, conversation: repo.getConversation(sessionId, "customer") };
}

export function advanceDealStage(sessionId: string, action: DealAdvanceAction) {
  const repo = getRepository();
  const conversation = repo.getConversation(sessionId);
  if (!conversation) throw new NotFoundError("会话不存在");
  if (conversation.status === "closed") throw new ConflictError("会话已关闭，无法推进进度");
  const result = applyManualAdvance(conversation.dealState, action);
  if (!result.ok) throw new ConflictError(result.error || "当前进度不支持该操作");
  repo.setDealState(sessionId, result.state);
  return { dealState: result.state, note: result.note ?? null, conversation: repo.getConversation(sessionId) };
}

export function handleAgentReply(sessionId: string, agentId: string, content: string, mediaPath: string | null = null) {
  const repo = getRepository();
  const status = repo.getSessionStatus(sessionId);
  if (!status) throw new NotFoundError("会话不存在");
  if (status !== "human_serving") throw new ConflictError("客服需先接管会话");
  const message = repo.appendMessage(sessionId, "agent", agentId, content, mediaPath);
  return { message, conversation: repo.getConversation(sessionId) };
}
