import { getRepository } from "./repository";
import { runPresalesSkillOrchestrator } from "./presalesOrchestrator";

export class NotFoundError extends Error {}
export class ConflictError extends Error {}

export async function handleCustomerMessage(sessionId: string, content: string) {
  const repo = getRepository();
  const conversation = repo.getConversation(sessionId);
  if (!conversation) throw new NotFoundError("会话不存在");
  if (conversation.status === "closed") throw new ConflictError("会话已关闭");
  const customerMessage = repo.appendMessage(sessionId, "customer", "U-CUSTOMER-001", content);
  if (conversation.status === "human_serving") {
    return { mode: "human" as const, message: customerMessage, conversation: repo.getConversation(sessionId) };
  }
  const history = conversation.messages.slice(-8).map((item) => ({
    role: item.actor === "customer" ? "user" as const : item.actor === "system" ? "system" as const : "assistant" as const,
    content: item.content,
  }));
  const decision = await runPresalesSkillOrchestrator({ message: content, history });
  if (repo.getSessionStatus(sessionId) === "human_serving") {
    return { mode: "human" as const, message: customerMessage, conversation: repo.getConversation(sessionId) };
  }
  const turn = repo.saveAutomatedDecision(sessionId, customerMessage.id, content, decision);
  return { mode: "ai" as const, decision, turn, conversation: repo.getConversation(sessionId) };
}

export function handleAgentReply(sessionId: string, content: string) {
  const repo = getRepository();
  const status = repo.getSessionStatus(sessionId);
  if (!status) throw new NotFoundError("会话不存在");
  if (status !== "human_serving") throw new ConflictError("客服需先接管会话");
  const message = repo.appendMessage(sessionId, "agent", "U-AGENT-001", content);
  return { message, conversation: repo.getConversation(sessionId) };
}
