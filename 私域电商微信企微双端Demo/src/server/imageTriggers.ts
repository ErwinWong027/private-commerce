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
  message?: string;
  sentMediaPaths: string[];
  stage: DealStage;
}

const PREPAYMENT_STAGES: DealStage[] = DEAL_STAGE_ORDER.slice(0, DEAL_STAGE_ORDER.indexOf("awaiting_review"));

export function selectTriggeredImageAsset({ intent, subIntent, message = "", sentMediaPaths, stage }: ImageTriggerInput): string | null {
  if (!PREPAYMENT_STAGES.includes(stage)) return null;
  const asksForSpecifications = /规格|型号|剂量|多少毫克|几毫克|一盒几支|包装|版本|哪一款|怎么选/i.test(message);
  if ((intent === "pricing" || (intent === "version" && asksForSpecifications)) && !sentMediaPaths.includes(QUOTE_SHEET_ASSET)) {
    return QUOTE_SHEET_ASSET;
  }
  const asksForPayment = /怎么付|如何付款|付款方式|支付方式|收款码|二维码|转账|付款链接/i.test(message);
  if (
    intent === "fulfillment_payment" &&
    (subIntent === "payment_methods" || asksForPayment) &&
    !sentMediaPaths.includes(PAYMENT_CODE_ASSET)
  ) {
    return PAYMENT_CODE_ASSET;
  }
  return null;
}
