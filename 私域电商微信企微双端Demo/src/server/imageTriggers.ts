import { PAYMENT_CODE_ASSET, QUOTE_SHEET_ASSET } from "./imageAssets";
import { DEAL_STAGE_ORDER, type DealStage, type PresalesIntent } from "@/types";

// 基于真实聊天记录的客服发图规则:
// 1) 客户"首次"问价格类问题(pricing 意图)→ 额外发送全规格报价表;
// 2) 客户"首次"进入付款环节(询问支付方式 payment_methods)→ 额外发送收款码。
// "首次"以会话内是否已发送过同一物料判断(人工客服发过同样算,不会重复发)。
// 另加阶段前置：报价表与收款码都属于付款前物料，客户已进入待核对及之后阶段
// (说明款已付)就不再重复推送，避免出现"已付款还在发收款码"的事实错位。
export interface ImageTriggerInput {
  intent: PresalesIntent;
  subIntent: string | null | undefined;
  sentMediaPaths: string[];
  stage: DealStage;
}

const PREPAYMENT_STAGES: DealStage[] = DEAL_STAGE_ORDER.slice(0, DEAL_STAGE_ORDER.indexOf("awaiting_review"));

export function selectTriggeredImageAsset({ intent, subIntent, sentMediaPaths, stage }: ImageTriggerInput): string | null {
  if (!PREPAYMENT_STAGES.includes(stage)) return null;
  if (intent === "pricing" && !sentMediaPaths.includes(QUOTE_SHEET_ASSET)) {
    return QUOTE_SHEET_ASSET;
  }
  if (intent === "fulfillment_payment" && subIntent === "payment_methods" && !sentMediaPaths.includes(PAYMENT_CODE_ASSET)) {
    return PAYMENT_CODE_ASSET;
  }
  return null;
}
