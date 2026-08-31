import { PAYMENT_CODE_ASSET, QUOTE_SHEET_ASSET } from "./imageAssets";

// 基于真实聊天记录的客服发图规则:
// 1) 客户"首次"问价格类问题(pricing 意图)→ 额外发送全规格报价表;
// 2) 客户"首次"进入付款环节(询问支付方式 payment_methods)→ 额外发送收款码。
// "首次"以会话内是否已发送过同一物料判断(人工客服发过同样算,不会重复发)。
export interface ImageTriggerInput {
  intent: string;
  subIntent: string | null | undefined;
  sentMediaPaths: string[];
}

export function selectTriggeredImageAsset({ intent, subIntent, sentMediaPaths }: ImageTriggerInput): string | null {
  if (intent === "pricing" && !sentMediaPaths.includes(QUOTE_SHEET_ASSET)) {
    return QUOTE_SHEET_ASSET;
  }
  if (intent === "fulfillment_payment" && subIntent === "payment_methods" && !sentMediaPaths.includes(PAYMENT_CODE_ASSET)) {
    return PAYMENT_CODE_ASSET;
  }
  return null;
}
