import {
  HandoffTriggerType,
  PresalesDecision,
  PresalesIntent,
  PresalesTraceStep,
  ProductVersion,
  PromoRule,
  SkuPrice,
} from "@/types";
import { presalesKnowledgeBase } from "@/lib/presalesKnowledge";

interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface EngineInput {
  message: string;
  history?: ConversationMessage[];
}

interface ConversationContext {
  version: ProductVersion | null;
  dose: string | null;
}

const GREETINGS = ["在吗", "在么", "在不在", "你好", "您好", "哈喽", "hi", "hello", "有人吗", "咨询下", "想了解", "了解一下"];
const INTENT_PRIORITY: PresalesIntent[] = [
  "handoff",
  "risk",
  "fulfillment_payment",
  "pricing",
  "authenticity",
  "version",
  "identity",
  "greeting",
  "unknown",
];

export function runPresalesEngine({ message, history = [] }: EngineInput): PresalesDecision {
  const safeMessage = message.trim();
  const context = resolveConversationContext(safeMessage, history);
  const intentResult = classifyIntent(safeMessage);
  const decision = routeIntent(safeMessage, history, context, intentResult.intent);

  return {
    intent: intentResult.intent,
    confidence: intentResult.confidence,
    reply: decision.reply,
    needHuman: decision.needHuman,
    silentIntercept: false,
    interceptReason: undefined,
    notificationStatus: decision.needHuman ? "pending" : "not_applicable",
    handoffTriggerType: decision.handoffTriggerType,
    boundaryDecision: decision.boundaryDecision,
    matchedEvidence: decision.matchedEvidence,
    handoffSummary: decision.handoffSummary,
    toolName: decision.toolName,
    toolArgs: [],
    toolResult: null,
    subIntent: "legacy",
    styleVariant: null,
    trace: buildTrace(intentResult.reasoning, decision),
  };
}

function classifyIntent(message: string): { intent: PresalesIntent; confidence: number; reasoning: string } {
  const lowered = message.toLowerCase();
  if (isGreeting(message)) {
    return { intent: "greeting", confidence: 0.92, reasoning: "客户主要是在打招呼，优先走首响承接。" };
  }

  if (matchNotInScope(message)) {
    return { intent: "version", confidence: 0.93, reasoning: "命中非在售商品边界，先走商品范围判断而不是直接报价。" };
  }

  const scores = new Map<PresalesIntent, number>();
  const routing = presalesKnowledgeBase.routing.intentKeywords;
  Object.entries(routing).forEach(([intentKey, words]) => {
    const intent = intentKey as PresalesIntent;
    const score = words.reduce((acc, word) => acc + (message.includes(word) ? 1 : 0), 0);
    scores.set(intent, intent === "risk" ? score * 1.5 : score);
  });

  if (lowered.includes("钱都付了") || lowered.includes("没人理我")) {
    return { intent: "fulfillment_payment", confidence: 0.96, reasoning: "客户在催处理付款后的承接，归入付款承接异常分支。" };
  }

  const ranked = [...INTENT_PRIORITY].filter((item) => item !== "greeting" && item !== "unknown");
  const best = ranked.find((intent) => (scores.get(intent) ?? 0) > 0);
  if (best) {
    const confidence = Math.min(0.98, 0.38 + (scores.get(best) ?? 0) * 0.18);
    return { intent: best, confidence, reasoning: `命中「${best}」意图关键词，进入对应业务处理分支。` };
  }

  return { intent: "unknown", confidence: 0.25, reasoning: "未命中明确规则，走知识盲区保守兜底。" };
}

function routeIntent(
  message: string,
  history: ConversationMessage[],
  context: ConversationContext,
  intent: PresalesIntent,
): Omit<PresalesDecision, "intent" | "confidence" | "trace"> {
  if (intent === "greeting") {
    return buildDecision(
      `${presalesKnowledgeBase.welcomeTemplate}\n\n您想先了解版本、正品还是价格呢？`,
      false,
      null,
      "ab_first_response -> 秒级首轮承接",
      ["welcome_template"],
      "",
      "welcome_template",
    );
  }

  if (intent === "identity") {
    return buildDecision(
      presalesKnowledgeBase.identityReply,
      false,
      null,
      "ab_first_response -> 身份口径按预置模板回答",
      ["identity_reply"],
      "",
      "identity",
    );
  }

  if (intent === "handoff") {
    return buildHumanDecision(
      "好的，已为您转接人工客服，马上为您跟进，请稍等～",
      "客户点名人工",
      "ab_first_response -> 客户明确要求人工，AI 停止实质作答",
      makeSummary("客户明确要求转人工", extractLastAssistantReply(history), "等待人工接管后继续服务"),
      ["handoff keyword"],
      "handoff",
    );
  }

  if (intent === "risk") {
    return handleRisk(message);
  }

  if (intent === "fulfillment_payment") {
    return handleFulfillment(message);
  }

  if (intent === "pricing") {
    return handlePricing(message, context);
  }

  if (intent === "authenticity") {
    return handleAuthenticity(message);
  }

  if (intent === "version") {
    return handleVersion(message, context);
  }

  return buildHumanDecision(
    "这个问题我这边暂时没法准确回答，帮您确认一下请稍等。",
    "知识盲区",
    "ab_kb_fallback -> 知识库无命中，保守答复并转人工",
    makeSummary("知识库暂未覆盖该问题", "未给出不确定口径", "等待人工进一步确认"),
    ["knowledge miss"],
    "fallback",
  );
}

function handleRisk(message: string): Omit<PresalesDecision, "intent" | "confidence" | "trace"> {
  const group = presalesKnowledgeBase.contraindications.groups.find((item) => message.includes(item));
  if (group) {
    return buildHumanDecision(
      presalesKnowledgeBase.contraindications.reply,
      "敏感功效",
      "ab_risk_compliance -> 禁忌人群命中，不推进成交",
      makeSummary(`客户自述属于禁忌/慎用人群「${group}」`, "已按固定口径说明不建议自行使用", "是否继续推进需人工确认，AI 不再促单"),
      [`contraindications.groups:${group}`],
      "compliance",
    );
  }

  const rule = presalesKnowledgeBase.complianceWhitelist.find((item) =>
    item.triggerWords.some((word) => message.includes(word)),
  );
  if (!rule) {
    return buildHumanDecision(
      "这个问题我不方便直接下结论，帮您确认一下请稍等。",
      "知识盲区",
      "ab_risk_compliance -> 风险问题未命中白名单，保守答复并转人工",
      makeSummary("风险类问题未命中白名单", "未即兴作答", "等待人工按合规口径处理"),
      ["compliance_whitelist:miss"],
      "compliance",
    );
  }

  if (rule.responseMode === "transfer") {
    return buildHumanDecision(
      rule.reply,
      "敏感功效",
      `ab_risk_compliance -> 命中白名单「${rule.intent}」，response_mode=transfer`,
      makeSummary(`客户咨询「${rule.intent}」类问题`, "已给出保守口径并建议遵医嘱", "该问题需要人工进一步承接"),
      [`compliance_whitelist:${rule.intent}`],
      "compliance",
    );
  }

  return buildDecision(
    rule.reply,
    false,
    null,
    `ab_risk_compliance -> 命中白名单「${rule.intent}」，输出预审核保守话术`,
    [`compliance_whitelist:${rule.intent}`],
    "",
    "compliance",
  );
}

function handleFulfillment(message: string): Omit<PresalesDecision, "intent" | "confidence" | "trace"> {
  const info = presalesKnowledgeBase.fulfillmentPayment;
  if (message.includes("钱都付了") || message.includes("没人理我")) {
    return buildHumanDecision(
      "非常抱歉让您久等，已收到付款信息，客服正在加急处理，马上安排接单核对，请再稍等一下～",
      "承接超时",
      "ab_order_handoff -> 付款承接超时，触发升级安抚",
      makeSummary("客户反馈付款后长时间无人跟进", "已安抚并说明正在加急处理", "需要值班客服立即接管核对订单信息"),
      ["order_intake:o_intake_stalled"],
      "payment_handoff",
    );
  }

  if (looksLikePaymentCompletion(message)) {
    return buildHumanDecision(
      info.screenshotHandoff,
      "付款承接",
      "ab_order_handoff -> 已收到付款截图或收货信息，创建付款承接工单",
      makeSummary("客户发送付款凭证并补充收货信息", "已告知需要人工复述核对订单要素", "等待人工接管，不确认收款成功"),
      ["payment_screenshot:true"],
      "payment_handoff",
    );
  }

  if (message.includes("包邮") || message.includes("运费") || message.includes("邮费")) {
    return buildDecision(
      info.freight,
      false,
      null,
      "ab_order_handoff -> 运费口径来自履约规则库",
      ["fulfillment_payment.freight"],
      "",
      "fulfillment",
    );
  }

  if (message.includes("从哪发") || message.includes("哪里发货")) {
    return buildDecision(
      `${info.shippingOrigin}发货。${info.shipTime}，${info.deliveryTime}。`,
      false,
      null,
      "ab_order_handoff -> 发货地与时效按固定口径输出",
      ["fulfillment_payment.shipping_origin", "fulfillment_payment.ship_time"],
      "",
      "fulfillment",
    );
  }

  if (message.includes("多久发货") || message.includes("几天到") || message.includes("多久到")) {
    return buildDecision(
      `${info.shipTime}，${info.deliveryTime}。`,
      false,
      null,
      "ab_order_handoff -> 发货时效口径固定，不承诺具体到货日",
      ["fulfillment_payment.ship_time", "fulfillment_payment.delivery_time"],
      "",
      "fulfillment",
    );
  }

  if (message.includes("付款") || message.includes("支付") || message.includes("付钱") || message.includes("转账")) {
    return buildDecision(
      `目前支持${info.paymentMethods.join(" / ")}。另外，${info.paymentUnavailable}。`,
      false,
      null,
      "ab_order_handoff -> 支付方式按固定口径输出",
      ["fulfillment_payment.payment_methods", "fulfillment_payment.payment_unavailable"],
      "",
      "fulfillment",
    );
  }

  return buildDecision(
    `${info.shippingOrigin}发货，${info.shipTime}，${info.deliveryTime}。运费方面：${info.freight}`,
    false,
    null,
    "ab_order_handoff -> 履约口径命中，统一按规则库回复",
    ["fulfillment_payment"],
    "",
    "fulfillment",
  );
}

function handlePricing(message: string, context: ConversationContext): Omit<PresalesDecision, "intent" | "confidence" | "trace"> {
  const manualPromoSignals = ["优惠 10", "80 拿", "送一支", "买三", "打个折"];
  if (manualPromoSignals.some((item) => message.includes(item))) {
    return buildHumanDecision(
      "额外的优惠我这边不能自己做主哦，当前有效活动以规则表为准，其他优惠帮您确认一下请稍等。",
      "口径冲突",
      "ab_deterministic_pricing -> 规则库外议价诉求，需转人工确认",
      makeSummary("客户提出规则库外议价/赠送诉求", "已说明当前只能按规则表口径报价", "等待人工确认是否存在额外口径"),
      ["manual_only_promos"],
      "pricing",
    );
  }

  const notInScope = matchNotInScope(message);
  if (notInScope) {
    return buildDecision(
      notInScope.reply,
      false,
      null,
      "ab_deterministic_pricing -> 非在售商品命中，不报价",
      [`not_in_scope:${notInScope.item}`],
      "",
      "pricing",
    );
  }

  const version = context.version;
  if (!version) {
    return buildDecision(
      "请问您想了解哪个版本的价格呢？目前在售的是日版礼来、孟版杰西卡、珠峰。",
      false,
      null,
      "ab_deterministic_pricing -> 未识别版本，先澄清版本",
      ["product_versions"],
      "",
      "pricing",
    );
  }

  const dose = context.dose ?? resolveDefaultDose(version, message);
  if (!dose) {
    return buildDecision(
      `${version.name} 目前有 ${version.doses.join("/")} 这些档位，您想看哪一档？`,
      false,
      null,
      "ab_deterministic_pricing -> 未识别剂量，先澄清规格",
      [`product_version:${version.name}`],
      "",
      "pricing",
    );
  }

  if (!version.doses.includes(dose)) {
    return buildDecision(
      `${version.name}没有 ${dose} 这个档位哦，实际只有 ${version.doses.join("/")} 这些档位，不方便虚构价格。`,
      false,
      null,
      "ab_deterministic_pricing -> 不存在的规格，纠正认知不虚构价格",
      [`sku_spec:missing:${version.name}:${dose}`],
      "",
      "pricing",
    );
  }

  const sku = findSku(version.name, dose);
  if (!sku || sku.listPrice === null || sku.stock === "out_of_stock") {
    return buildDecision(
      `${version.name} ${dose} 这个档位目前暂时缺货，没法下单哦，需要的话我可以帮您看看其他有货档位。`,
      false,
      null,
      "ab_deterministic_pricing -> 缺货档位不报价成交",
      [`sku_spec:out_of_stock:${version.name}:${dose}`],
      "",
      "pricing",
    );
  }

  const promo = shouldUsePromo(message) ? findActivePromo(version.name) : null;
  const reply = promo ? buildPromoReply(version, sku, promo) : buildBasePriceReply(version, sku);
  return buildDecision(
    reply,
    false,
    null,
    promo
      ? "ab_deterministic_pricing -> 命中促销规则，确定性算出到手价"
      : "ab_deterministic_pricing -> 价格按规则表直接输出",
    promo
      ? [`sku_spec:${version.name}:${dose}`, `promo_rule:${promo.id}`]
      : [`sku_spec:${version.name}:${dose}`],
    "",
    "pricing",
  );
}

function handleAuthenticity(message: string): Omit<PresalesDecision, "intent" | "confidence" | "trace"> {
  const proofs = presalesKnowledgeBase.authenticityProofs;
  if (message.includes("蓝帽子") || message.includes("批准文号") || message.includes("注册证")) {
    return buildHumanDecision(
      `这类编号我这边不能随便提供，但您可以先按这几个路径自行验证：${proofs.verifySteps.join("、")}。其余我帮您确认一下请稍等。`,
      "监管凭据诱导",
      "ab_authenticity_reply -> 禁止编造监管编号，仅输出可验证路径",
      makeSummary("客户索要监管编号类凭据", "已提供扫码与官网验真路径", "等待人工确认其他可公开材料"),
      ["authenticity_proofs.forbidden"],
      "authenticity",
    );
  }

  if ((message.includes("验不出来") || message.includes("是不是假货")) && message.includes("收到了")) {
    return buildHumanDecision(
      `别急，按我们承诺——${proofs.refundPromise}。我马上帮您核实处理，请稍等。`,
      "知识盲区",
      "ab_authenticity_reply -> 客户反馈验真失败，按退款承诺兜底并转人工",
      makeSummary("客户反馈收货后验真失败", "已按假货退款承诺安抚", "等待人工核实并处理后续售后"),
      ["authenticity_proofs.refund_promise"],
      "authenticity",
    );
  }

  if (message.includes("假货")) {
    return buildDecision(
      proofs.refundPromise,
      false,
      null,
      "ab_authenticity_reply -> 假货承诺按标准口径回复",
      ["authenticity_proofs.refund_promise"],
      "",
      "authenticity",
    );
  }

  return buildDecision(
    `您可以按这几个路径自己验真：${proofs.verifySteps.join("、")}。另外包装侧会有${proofs.packaging.join("、")}，我们不会用绝对化表述替代凭据。`,
    false,
    null,
    "ab_authenticity_reply -> 正品验真路径来自知识库凭据",
    ["authenticity_proofs.verify_steps", "authenticity_proofs.packaging"],
    "",
    "authenticity",
  );
}

function handleVersion(message: string, context: ConversationContext): Omit<PresalesDecision, "intent" | "confidence" | "trace"> {
  const notInScope = matchNotInScope(message);
  if (notInScope) {
    return buildDecision(
      notInScope.reply,
      false,
      null,
      "ab_version_answering -> 非在售商品只说明范围边界",
      [`not_in_scope:${notInScope.item}`],
      "",
      "version",
    );
  }

  if (message.includes("替C") || message.includes("替尔") || message.includes("替尔泊肽") || message.includes("替西帕肽")) {
    return buildDecision(
      `${presalesKnowledgeBase.synonymsNote}`,
      false,
      null,
      "ab_version_answering -> 同义词归一到统一成分口径",
      ["synonyms_note"],
      "",
      "version",
    );
  }

  if (message.includes("珠峰")) {
    return buildDecision(
      "珠峰是孟版杰西卡的低配版，不是独立第四版本；目前只有 2.5/5.0/7.5/10 四个档位。",
      false,
      null,
      "ab_version_answering -> 珠峰版本定位按知识库说明",
      ["product_versions:珠峰"],
      "",
      "version",
    );
  }

  if ((message.includes("区别") || message.includes("哪个好")) && message.includes("日版") && message.includes("孟版")) {
    return buildDecision(
      "日版礼来是一盒两支、原研自动笔，操作更便捷；孟版杰西卡是一盒一支、仿制针剂，性价比更高。没有绝对哪个更好，主要看您的预算和使用习惯。",
      false,
      null,
      "ab_version_answering -> 版本差异只回答包装与剂型，不评价疗效优劣",
      ["product_versions:日版礼来", "product_versions:孟版杰西卡"],
      "",
      "version",
    );
  }

  if ((message.includes("只买一支") || message.includes("太多")) && message.includes("日版")) {
    return buildDecision(
      "日版礼来只能整盒购买，不拆盒销售。如果您想单支入手，可以看看一盒一支的孟版杰西卡或珠峰。",
      false,
      null,
      "ab_version_answering -> 日版整盒销售约束不可突破",
      ["product_versions:日版礼来.integral_only"],
      "",
      "version",
    );
  }

  if (message.includes("打几次") || message.includes("用多久")) {
    return buildDecision(
      presalesKnowledgeBase.usageStorage.usage,
      false,
      null,
      "ab_version_answering -> 使用口径来自高频事实问答库",
      ["usage_storage.usage"],
      "",
      "version",
    );
  }

  if (message.includes("放冰箱") || message.includes("冷藏") || message.includes("保存")) {
    return buildDecision(
      `${presalesKnowledgeBase.usageStorage.storageUnopened}；${presalesKnowledgeBase.usageStorage.storageOpened}`,
      false,
      null,
      "ab_version_answering -> 保存口径来自高频事实问答库",
      ["usage_storage.storage"],
      "",
      "version",
    );
  }

  if (context.version) {
    return buildDecision(
      `${context.version.name}是${context.version.packageDesc}，属于${context.version.productForm}；${context.version.compareNote}。`,
      false,
      null,
      "ab_version_answering -> 版本基础信息来自知识库",
      [`product_versions:${context.version.name}`],
      "",
      "version",
    );
  }

  return buildDecision(
    "目前在售的是日版礼来、孟版杰西卡、珠峰三个版本。您想先看版本区别、正品凭据，还是具体价格？",
    false,
    null,
    "ab_version_answering -> 引导客户继续澄清咨询主题",
    ["product_versions"],
    "",
    "version",
  );
}

function buildDecision(
  reply: string,
  needHuman: boolean,
  handoffTriggerType: HandoffTriggerType | null,
  boundaryDecision: string,
  matchedEvidence: string[],
  handoffSummary: string,
  toolName: string,
): Omit<PresalesDecision, "intent" | "confidence" | "trace"> {
  return {
    reply,
    needHuman,
    silentIntercept: false,
    interceptReason: undefined,
    notificationStatus: needHuman ? "pending" : "not_applicable",
    handoffTriggerType,
    boundaryDecision,
    matchedEvidence,
    handoffSummary,
    toolName,
    toolArgs: [],
    toolResult: null,
    subIntent: "legacy",
    styleVariant: null,
  };
}

function buildHumanDecision(
  reply: string,
  handoffTriggerType: HandoffTriggerType,
  boundaryDecision: string,
  handoffSummary: string,
  matchedEvidence: string[],
  toolName: string,
): Omit<PresalesDecision, "intent" | "confidence" | "trace"> {
  return buildDecision(reply, true, handoffTriggerType, boundaryDecision, matchedEvidence, handoffSummary, toolName);
}

function buildTrace(classificationReason: string, decision: Omit<PresalesDecision, "intent" | "confidence" | "trace">): PresalesTraceStep[] {
  return [
    { id: "step-1", title: "语义意图识别", stage: "llm", content: classificationReason },
    { id: "step-2", title: "选择规则工具", stage: "llm", content: `本轮调用工具：${decision.toolName ?? "none"}。` },
    { id: "step-3", title: "确定性判定结果", stage: "tool", content: `${decision.boundaryDecision}\n证据：${decision.matchedEvidence.join("；") || "无"}` },
    { id: "step-4", title: "输出对客回复", stage: "output", content: decision.reply },
  ];
}

function resolveConversationContext(message: string, history: ConversationMessage[]): ConversationContext {
  const contentPool = [message, ...history.slice().reverse().map((item) => item.content)];
  return {
    version: findVersion(contentPool),
    dose: findDose(contentPool),
  };
}

function findVersion(contentPool: string[]): ProductVersion | null {
  for (const text of contentPool) {
    const matched = presalesKnowledgeBase.productVersions.find((version) =>
      [version.name, ...version.aliases].some((alias) => text.includes(alias)),
    );
    if (matched) {
      return matched;
    }
  }
  return null;
}

function findDose(contentPool: string[]): string | null {
  const validDoses = new Set(["2.5", "5.0", "7.5", "10", "12.5", "15"]);
  for (const text of contentPool) {
    const matchedValues = text.match(/\d+\.?\d*/g) ?? [];
    for (const rawValue of matchedValues) {
      const normalized = normalizeDose(rawValue);
      if (validDoses.has(normalized)) {
        return normalized;
      }
    }
  }
  return null;
}

function normalizeDose(value: string): string {
  if (value === "5") {
    return "5.0";
  }
  if (value === "10.0") {
    return "10";
  }
  if (value === "15.0") {
    return "15";
  }
  return value;
}

function findSku(versionName: string, dose: string): SkuPrice | undefined {
  return presalesKnowledgeBase.skuPrices.find((item) => item.version === versionName && item.dose === dose);
}

function findActivePromo(versionName: string): PromoRule | null {
  return presalesKnowledgeBase.promoRules.find((item) => item.version === versionName && item.validity === "active") ?? null;
}

function buildBasePriceReply(version: ProductVersion, sku: SkuPrice): string {
  const pieces = [`${version.name} ${sku.dose} 表价 ${sku.listPrice} 元/${sku.unit}（价格以规则表为准）。`];
  if (version.integralOnly) {
    pieces.push("该版本只能整盒购买，不拆盒销售。");
  }
  return pieces.join("");
}

function buildPromoReply(version: ProductVersion, sku: SkuPrice, promo: PromoRule): string {
  const finalPrice = (sku.listPrice ?? 0) - promo.discount;
  const pieces = [
    `${version.name} ${sku.dose} 表价 ${sku.listPrice} 元/${sku.unit}。`,
    `当前「${promo.name}」减 ${promo.discount} 元，到手 ${finalPrice} 元/${sku.unit}。`,
  ];
  if (version.integralOnly) {
    pieces.push("日版只能整盒购买，不拆盒销售。");
  }
  return pieces.join("");
}

function resolveDefaultDose(version: ProductVersion, message: string): string | null {
  if (!["一支", "单支", "一盒", "整盒"].some((item) => message.includes(item))) {
    return null;
  }
  return version.doses[0] ?? null;
}

function shouldUsePromo(message: string): boolean {
  return ["优惠", "活动", "到手", "618", "便宜", "折扣"].some((item) => message.includes(item));
}

function matchNotInScope(message: string) {
  return presalesKnowledgeBase.notInScope.find((item) =>
    [item.item, ...item.aliases].some((alias) => message.includes(alias)),
  );
}

function looksLikePaymentCompletion(message: string): boolean {
  return ["付好了", "付款截图", "截图", "地址", "138", "收货"].some((item) => message.includes(item));
}

function makeSummary(concern: string, answered: string, unresolved: string): string {
  return `【客户关注点】${concern}\n【已答内容】${answered || "暂无"}\n【未解决问题】${unresolved}`;
}

function extractLastAssistantReply(history: ConversationMessage[]): string {
  const lastAssistant = [...history].reverse().find((item) => item.role === "assistant");
  return lastAssistant?.content ?? "已说明将为其转接人工";
}

function isGreeting(message: string): boolean {
  return GREETINGS.some((item) => message.toLowerCase().includes(item));
}
