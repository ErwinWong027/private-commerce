import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  HandoffTriggerType,
  PresalesDecision,
  PresalesIntent,
  PresalesTraceStep,
} from "@/types";
import { getFoundationModelConfig, isFoundationModelConfigured } from "./foundationModelConfig";

const execFileAsync = promisify(execFile);
const PROJECT_ROOT = process.cwd();
const WORKSPACE_ROOT = path.resolve(PROJECT_ROOT, "..");
const PLANNING_ROOT = path.join(WORKSPACE_ROOT, "私域电商售前客服AI规划");
const SKILL_ROOT = path.join(PLANNING_ROOT, "presales-qa-agent");
const SKILL_PROMPT_PATH = path.join(SKILL_ROOT, "references", "agent_system_prompt.md");
const ANSWER_ENGINE_PATH = path.join(SKILL_ROOT, "scripts", "answer_engine.py");
const KNOWLEDGE_BASE_PATH = path.join(PLANNING_ROOT, "私域电商售前客服-售前问答知识库.yaml");

interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

interface IntentPlan {
  intent: PresalesIntent;
  confidence: number;
  toolName: string | null;
  toolArgs: {
    version?: string | null;
    dose?: string | null;
    quantity?: number | null;
    msg?: string | null;
  };
  subIntent: string;
  reasoning: string;
}

interface ToolExecution {
  toolName: string | null;
  toolArgs: string[];
  result: Record<string, unknown> | null;
}

interface EvaluatedOutcome {
  needHuman: boolean;
  handoffTriggerType: HandoffTriggerType | null;
  boundaryDecision: string;
  matchedEvidence: string[];
  fallbackReply: string;
  handoffSummary: string;
}

interface RiskContextAnalysis {
  summary: string;
  knownDimensions: string[];
  missingDimensions: string[];
  hasEnoughContext: boolean;
}

let cachedSkillPrompt = "";
let cachedKnowledgeText = "";

export async function runPresalesSkillOrchestrator({
  message,
  history = [],
}: {
  message: string;
  history?: ConversationMessage[];
}): Promise<PresalesDecision> {
  const safeMessage = message.trim();
  const safeHistory = history.slice(-6);

  if (!safeMessage) {
    throw new Error("消息内容为空");
  }

  const plan = await classifyIntentWithSkill(safeMessage, safeHistory);
  const riskAnalysis = plan.toolName === "compliance" ? analyzeRiskContext(safeMessage, safeHistory) : null;
  const toolExecution = plan.toolName ? await executeSkillTool(plan) : { toolName: null, toolArgs: [], result: null };
  const outcome = evaluateOutcome(plan, toolExecution.result, safeMessage, safeHistory, riskAnalysis);
  const silentIntercept = shouldSilentlyIntercept(plan, outcome);
  const notificationStatus = outcome.needHuman ? "pending" : "not_applicable";
  const styleVariant = silentIntercept ? null : pickStyleVariant(plan, outcome);
  const reply = await generateCustomerReply({
    message: safeMessage,
    history: safeHistory,
    plan,
    toolExecution,
    outcome,
    silentIntercept,
    styleVariant,
    riskAnalysis,
  });

  return {
    intent: plan.intent,
    confidence: plan.confidence,
    reply,
    needHuman: outcome.needHuman,
    silentIntercept,
    interceptReason: silentIntercept ? "已识别为人工转接诉求，本轮不向客户发送 AI 自动回复。" : undefined,
    notificationStatus,
    handoffTriggerType: outcome.handoffTriggerType,
    boundaryDecision: outcome.boundaryDecision,
    matchedEvidence: outcome.matchedEvidence,
    handoffSummary: outcome.handoffSummary,
    toolName: plan.toolName,
    toolArgs: toolExecution.toolArgs,
    toolResult: toolExecution.result,
    subIntent: plan.subIntent,
    styleVariant,
    riskContextSummary: riskAnalysis?.summary ?? null,
    trace: buildTrace(plan, toolExecution, outcome, reply),
  };
}

async function classifyIntentWithSkill(
  message: string,
  history: ConversationMessage[],
): Promise<IntentPlan> {
  const prompt = await getSkillPrompt();
  const knowledgeText = await getKnowledgeText();
  const payload = await callModelForJson([
    {
      role: "system",
      content: [
        prompt,
        "",
        "你现在只负责两个动作：",
        "1. 对客户最新消息做语义级意图识别。",
        "2. 选择应该调用的 answer_engine.py 工具和参数。",
        "",
        "禁止直接生成对客户的话术。",
        "必须返回 JSON，字段固定为：",
        JSON.stringify(
          {
            intent: "greeting",
            confidence: 0.92,
            toolName: "fulfillment",
            toolArgs: {
              version: null,
              dose: null,
              quantity: 1,
              msg: null,
            },
            subIntent: "payment_methods",
            reasoning: "一句中文解释",
          },
          null,
          2,
        ),
        "",
        "toolName 只能取：price, promo, compliance, manual_promo, authenticity, fulfillment, product, all_products, null。",
        "intent 只能取：greeting, identity, handoff, risk, fulfillment_payment, pricing, authenticity, version, unknown。",
        "如果需要使用工具，请尽量补全 toolArgs；risk 类把原消息放入 msg。",
        "pricing 类：",
        "- 问表价/库存 -> price",
        "- 问活动/到手价 -> promo",
        "- 规则外议价/组合优惠 -> manual_promo",
        "version 类：",
        "- 指向具体版本 -> product",
        "- 比较版本/同义词归一/非在售范围 -> all_products",
        "fulfillment_payment 类：subIntent 只能取 payment_methods, payment_completed, payment_timeout, shipping_origin, delivery_time, freight。",
        "authenticity 类：subIntent 只能取 verify, refund_promise, regulatory_id, received_verify_failed。",
        "handoff 类不调用工具，toolName=null。",
        "",
        "以下是知识库原文，请以它为准：",
        knowledgeText,
      ].join("\n"),
    },
    {
      role: "user",
      content: [
        "【最近历史对话】",
        formatHistory(history),
        "",
        "【客户最新消息】",
        message,
      ].join("\n"),
    },
  ], {
    temperature: 0.05,
  });

  return normalizeIntentPlan(payload);
}

async function executeSkillTool(plan: IntentPlan): Promise<ToolExecution> {
  const python = await resolvePythonCommand();
  const toolArgs = buildToolArgs(plan);
  const { stdout } = await execFileAsync(python.command, [...python.prefixArgs, ANSWER_ENGINE_PATH, KNOWLEDGE_BASE_PATH, ...toolArgs], {
    cwd: SKILL_ROOT,
    encoding: "utf8",
    maxBuffer: 1024 * 1024,
    env: {
      ...process.env,
      PYTHONIOENCODING: "utf-8",
      PYTHONUTF8: "1",
    },
  });

  return {
    toolName: plan.toolName,
    toolArgs,
    result: JSON.parse(stdout) as Record<string, unknown>,
  };
}

async function generateCustomerReply({
  message,
  history,
  plan,
  toolExecution,
  outcome,
  silentIntercept,
  styleVariant,
  riskAnalysis,
}: {
  message: string;
  history: ConversationMessage[];
  plan: IntentPlan;
  toolExecution: ToolExecution;
  outcome: EvaluatedOutcome;
  silentIntercept: boolean;
  styleVariant: string | null;
  riskAnalysis: RiskContextAnalysis | null;
}): Promise<string> {
  if (silentIntercept) {
    return "";
  }

  const effectiveFallbackReply = buildVariantFallbackReply({
    message,
    plan,
    toolResult: toolExecution.result,
    outcome,
    styleVariant,
  });
  const directReply = getDirectReply(plan, outcome);
  if (directReply) {
    return directReply;
  }

  if (!(await isFoundationModelConfigured())) {
    return effectiveFallbackReply;
  }

  try {
    const prompt = await getSkillPrompt();
    const payload = await callModelForJson([
      {
        role: "system",
        content: [
          prompt,
          "",
          "你现在只负责第⑤、⑥步：基于工具结果生成对客户话术。",
          "必须严格保留工具事实，不允许新增知识库外信息。",
          "必须严格遵守：",
          `- need_human = ${outcome.needHuman ? "true" : "false"}`,
          `- handoff_trigger = ${outcome.handoffTriggerType ?? "null"}`,
          "- 不得出现“转人工/AI/机器人”字样。",
          "- 如果是 need_human=true，只能用“我帮您确认一下/稍等哦”这类无感承接表述。",
          "- 如果工具结果里有价格、支付、合规、验真信息，不能改写事实。",
          "- 如果客户明确问了某种支付方式（如红包、扫码、转账），要正面回应该方式是否支持；若不支持，要明确说清不支持，但不能编造替代收款能力。",
          plan.toolName === "compliance" && outcome.matchedEvidence.includes("risk:clarify_needed")
            ? "- 当前任务是先安抚客户，再围绕既往病史、当前用药、特殊阶段、当前不适这几个维度补充追问；不要直接下医疗结论。"
            : "- 如果不是风险补信息场景，就按正常客服话术输出。",
          styleVariant ? `- 本轮话术风格必须使用：${styleVariant}。` : "- 本轮话术保持稳定、克制。",
          "",
          "只返回 JSON：",
          JSON.stringify(
            {
              customer_reply: "发给客户的话术",
            },
            null,
            2,
          ),
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          "【最近历史对话】",
          formatHistory(history),
          "",
          "【客户最新消息】",
          message,
          "",
          "【LLM 语义识别结果】",
          JSON.stringify(plan, null, 2),
          "",
          "【工具调用】",
          JSON.stringify(
            {
              toolName: toolExecution.toolName,
              toolArgs: toolExecution.toolArgs,
            },
            null,
            2,
          ),
          "",
          "【工具返回结果】",
          JSON.stringify(toolExecution.result, null, 2),
          "",
          "【行动边界】",
          JSON.stringify(
            {
              boundaryDecision: outcome.boundaryDecision,
              matchedEvidence: outcome.matchedEvidence,
              fallbackReply: effectiveFallbackReply,
              handoffSummary: outcome.handoffSummary,
              styleVariant,
              riskContextSummary: riskAnalysis?.summary ?? "",
              missingRiskDimensions: riskAnalysis?.missingDimensions ?? [],
            },
            null,
            2,
          ),
        ].join("\n"),
      },
    ], {
      temperature: resolveGenerationTemperature(plan, outcome),
    });

    const customerReply = typeof payload.customer_reply === "string" ? payload.customer_reply.trim() : "";
    if (!customerReply) {
      return effectiveFallbackReply;
    }
    return validateGeneratedReply(plan, toolExecution.result, effectiveFallbackReply, outcome, customerReply);
  } catch {
    return effectiveFallbackReply;
  }
}

function evaluateOutcome(
  plan: IntentPlan,
  toolResult: Record<string, unknown> | null,
  message: string,
  history: ConversationMessage[],
  riskAnalysis: RiskContextAnalysis | null,
): EvaluatedOutcome {
  if (plan.intent === "greeting") {
    const reply = "哈喽～欢迎添加，专注替西帕肽正品渠道，规格齐全、价优靠谱，支持一对一用量指导，有需要随时滴滴我～";
    return makeOutcome(false, null, "ab_first_response -> 首响欢迎语按预置模板输出", ["welcome_template"], reply, "");
  }

  if (plan.intent === "identity") {
    const reply = "我是您的专属客服，专注替西帕肽正品渠道，规格齐全、价优靠谱，有什么可以帮您的吗？";
    return makeOutcome(false, null, "ab_first_response -> 身份口径直接走预置模板", ["identity_reply"], reply, "");
  }

  if (plan.intent === "handoff") {
    const reply = "我帮您确认一下，稍等哦～";
    return makeOutcome(
      true,
      "客户点名人工",
      "ab_first_response -> 客户明确要求人工接管，AI 停止实质判断",
      ["handoff"],
      reply,
      buildHandoffSummary(message, "已先做安抚承接。", "需要人工立即接管本轮会话。"),
    );
  }

  if (!toolResult || !plan.toolName) {
    const fallbackReply = "这个问题我帮您确认一下，稍等哦～";
    return makeOutcome(
      true,
      "知识盲区",
      "ab_kb_fallback -> 未能成功调用工具，保守答复并转人工",
      ["tool_execution_failed"],
      fallbackReply,
      buildHandoffSummary(message, "未输出知识库外结论。", "需要人工继续确认。"),
    );
  }

  switch (plan.toolName) {
    case "compliance":
      return evaluateComplianceOutcome(toolResult, message, history, riskAnalysis);
    case "manual_promo":
      return evaluateManualPromoOutcome(toolResult, message);
    case "price":
    case "promo":
      return evaluatePricingOutcome(plan.toolName, toolResult, message);
    case "authenticity":
      return evaluateAuthenticityOutcome(plan, toolResult, message);
    case "fulfillment":
      return evaluateFulfillmentOutcome(plan, toolResult, message);
    case "product":
    case "all_products":
      return evaluateVersionOutcome(plan, toolResult, message);
    default:
      return makeOutcome(
        true,
        "知识盲区",
        "ab_kb_fallback -> 工具返回无法解析，保守答复并转人工",
        ["tool_unparsed"],
        "这个问题我帮您确认一下，稍等哦～",
        buildHandoffSummary(message, "未直接作答。", "需要人工继续确认。"),
      );
  }
}

function evaluateComplianceOutcome(
  toolResult: Record<string, unknown>,
  message: string,
  history: ConversationMessage[],
  riskAnalysis: RiskContextAnalysis | null,
): EvaluatedOutcome {
  if (toolResult.type === "contraindication") {
    const skeleton = asString(toolResult.reply_skeleton) || "您提到的情况属于禁忌/慎用人群，需要遵医嘱。";
    return makeOutcome(
      true,
      "敏感功效",
      "ab_risk_compliance -> 禁忌人群命中，不推进成交",
      [`contraindication:${asString(toolResult.matched_group) || "unknown"}`],
      skeleton,
      buildHandoffSummary(message, "已按禁忌/慎用人群固定口径回复。", "需要人工继续承接，不推进成交。"),
    );
  }

  if (toolResult.type === "compliance_whitelist" && toolResult.response_mode === "transfer") {
    const skeleton = asString(toolResult.reply_skeleton) || "这类问题我不能直接给结论，建议遵医嘱。";
    return makeOutcome(
      true,
      "敏感功效",
      `ab_risk_compliance -> 命中白名单「${asString(toolResult.intent) || "风险问题"}」，response_mode=transfer`,
      [`compliance_whitelist:${asString(toolResult.intent) || "unknown"}`],
      skeleton,
      buildHandoffSummary(message, "已给出保守合规口径。", "需要人工进一步承接该风险咨询。"),
    );
  }

  if (toolResult.type === "compliance_whitelist" && toolResult.response_mode === "safe_reply") {
    return makeOutcome(
      false,
      null,
      `ab_risk_compliance -> 命中白名单「${asString(toolResult.intent) || "风险问题"}」，输出预审核安全回复`,
      [`compliance_whitelist:${asString(toolResult.intent) || "unknown"}`],
      asString(toolResult.reply_skeleton) || "每个人情况不同，具体以说明和个人情况为准哦。",
      "",
    );
  }

  const effectiveRiskAnalysis = riskAnalysis ?? analyzeRiskContext(message, history);
  if (!effectiveRiskAnalysis.hasEnoughContext) {
    return makeOutcome(
      false,
      null,
      "ab_risk_compliance -> 风险问题信息不足，先安抚并补充收集体质/病史/用药/不适信息",
      ["risk:clarify_needed", ...effectiveRiskAnalysis.knownDimensions.map((item) => `risk_context:${item}`)],
      buildRiskClarifyFallbackReply(effectiveRiskAnalysis),
      "",
    );
  }

  return makeOutcome(
    true,
    "知识盲区",
    "ab_risk_compliance -> 风险类问题已补充关键信息仍未命中规则，执行标准转接并提交工单",
    ["compliance:miss_transfer", ...effectiveRiskAnalysis.knownDimensions.map((item) => `risk_context:${item}`)],
    "这个问题我不方便直接下结论，我帮您确认一下，稍等哦～",
    buildHandoffSummary(
      `${message}\n${effectiveRiskAnalysis.summary}`,
      "已先收集风险背景信息，但未输出知识库外风险结论。",
      "需要人工结合完整会话与风险背景继续处理。",
    ),
  );
}

function evaluateManualPromoOutcome(toolResult: Record<string, unknown>, message: string): EvaluatedOutcome {
  if (toolResult.hit === true) {
    return makeOutcome(
      true,
      "口径冲突",
      "ab_deterministic_pricing -> 规则库外议价诉求命中，禁止 AI 自行承诺",
      ["manual_only_promos"],
      "额外优惠我这边不能自己做主哦，当前有效活动以规则表为准，其他口径我帮您确认一下，稍等哦～",
      buildHandoffSummary(message, "已说明当前活动以规则表为准。", "需要人工确认是否存在额外优惠口径。"),
    );
  }

  return makeOutcome(
    false,
    null,
    "ab_deterministic_pricing -> 议价检测未命中人工口径，仍按规则表口径回复",
    ["manual_promo:miss"],
    "当前有效活动我可以按规则表帮您看哦，您想看哪个版本和档位？",
    "",
  );
}

function evaluatePricingOutcome(
  toolName: "price" | "promo",
  toolResult: Record<string, unknown>,
  message: string,
): EvaluatedOutcome {
  if (typeof toolResult.error === "string") {
    const error = toolResult.error;
    const availableVersions = asStringArray(toolResult.available_versions);
    const availableDoses = asStringArray(toolResult.available_doses);
    const validDoses = asStringArray(toolResult.valid_doses);

    const clarifyReply =
      availableVersions.length > 0
        ? `目前在售的是 ${availableVersions.join("、")}，您想了解哪个版本呢？`
        : availableDoses.length > 0
          ? `这个规格我这边没法直接确认，当前可选档位是 ${availableDoses.join("/")}，您想看哪一档？`
          : validDoses.length > 0
            ? `这个剂量写法我这边先帮您核一下，常见档位是 ${validDoses.join("/")}。`
            : "这个规格我先帮您确认一下，稍等哦～";

    return makeOutcome(
      availableVersions.length === 0 && availableDoses.length === 0 && validDoses.length === 0,
      availableVersions.length === 0 && availableDoses.length === 0 && validDoses.length === 0 ? "知识盲区" : null,
      "ab_deterministic_pricing -> 工具返回 error，先澄清规格或保守承接",
      [`pricing_error:${error}`],
      clarifyReply,
      availableVersions.length === 0 && availableDoses.length === 0 && validDoses.length === 0
        ? buildHandoffSummary(message, "未输出知识库外价格。", "需要人工确认缺失规格或口径。")
        : "",
    );
  }

  if (toolResult.stock === "out_of_stock" || toolResult.list_price === null) {
    return makeOutcome(
      true,
      "口径冲突",
      "ab_deterministic_pricing -> 档位缺货，不由 AI 自行推进成交",
      [`sku_out_of_stock:${asString(toolResult.version) || "unknown"}:${asString(toolResult.dose) || "unknown"}`],
      `${asString(toolResult.version) || "该版本"} ${asString(toolResult.dose) || ""} 这个档位目前暂时缺货，我帮您看看其他有货档位，稍等哦～`,
      buildHandoffSummary(message, "已说明当前档位暂时缺货。", "需要人工协助推荐其他有货档位。"),
    );
  }

  const evidence =
    toolName === "promo"
      ? [`promo_rule:${asString(toolResult.promo_name) || "active"}`]
      : [`sku_price:${asString(toolResult.version) || "unknown"}:${asString(toolResult.dose) || "unknown"}`];
  const fallbackReply =
    toolName === "promo"
      ? `${asString(toolResult.version) || "该版本"} ${asString(toolResult.dose) || ""} 当前活动后是 ${toolResult.final_price} 元/${asString(toolResult.unit) || "件"}，表价 ${toolResult.list_price} 元，活动减 ${toolResult.discount} 元。`
      : `${asString(toolResult.version) || "该版本"} ${asString(toolResult.dose) || ""} 表价 ${toolResult.list_price} 元/${asString(toolResult.unit) || "件"}。`;

  return makeOutcome(
    false,
    null,
    toolName === "promo" ? "ab_deterministic_pricing -> 到手价由 promo 工具确定性算出" : "ab_deterministic_pricing -> 价格只由 price 工具查表输出",
    evidence,
    fallbackReply,
    "",
  );
}

function evaluateAuthenticityOutcome(
  plan: IntentPlan,
  toolResult: Record<string, unknown>,
  message: string,
): EvaluatedOutcome {
  const forbidden = asStringArray(toolResult.forbidden);
  if (plan.subIntent === "regulatory_id") {
    return makeOutcome(
      true,
      "监管凭据诱导",
      "ab_authenticity_reply -> 禁止编造监管编号，仅输出可验证路径",
      forbidden.length > 0 ? forbidden.map((item) => `forbidden:${item}`) : ["authenticity:forbidden"],
      `这类编号我这边不能随便提供，您可以先按 ${asStringArray(toolResult.verify_steps).join("、")} 这些方式自己验真，我再帮您确认一下，稍等哦～`,
      buildHandoffSummary(message, "已提供可验证路径，未编造任何监管编号。", "需要人工确认其他可公开材料。"),
    );
  }

  if (plan.subIntent === "received_verify_failed") {
    return makeOutcome(
      true,
      "知识盲区",
      "ab_authenticity_reply -> 收货后反馈验真失败，按退款承诺安抚并转人工",
      ["authenticity:refund_promise"],
      `别急，${asString(toolResult.refund_promise) || "到货后验出是假货可以退"}，我帮您核实一下，稍等哦～`,
      buildHandoffSummary(message, "已按假货退款承诺安抚。", "需要人工继续核实并处理售后。"),
    );
  }

  return makeOutcome(
    false,
    null,
    "ab_authenticity_reply -> 正品凭据只来自知识库验真路径",
    ["authenticity_proofs"],
    `您可以按 ${asStringArray(toolResult.verify_steps).join("、")} 这些方式自己验真，包装侧会有 ${asStringArray(toolResult.packaging).join("、")}。`,
    "",
  );
}

function evaluateFulfillmentOutcome(
  plan: IntentPlan,
  toolResult: Record<string, unknown>,
  message: string,
): EvaluatedOutcome {
  if (plan.subIntent === "payment_timeout") {
    return makeOutcome(
      true,
      "承接超时",
      "ab_order_handoff -> 客户反馈付款后无人跟进，触发升级安抚",
      ["payment_timeout"],
      "非常抱歉让您久等了，已收到您的付款信息，我这边马上帮您加急核一下，稍等哦～",
      buildHandoffSummary(message, "已先做安抚并说明会加急处理。", "需要人工立即核对付款后的承接状态。"),
    );
  }

  if (plan.subIntent === "payment_completed") {
    return makeOutcome(
      true,
      "付款承接",
      "ab_order_handoff -> 收到付款截图或收货信息，进入人工核对承接",
      ["payment_screenshot:true"],
      `已收到您的付款信息，我先帮您把订单信息核对一下，稍等哦～${asString(toolResult.screenshot_handoff) || "收到付款截图后帮您核对订单信息，不确认收款成功"}`,
      buildHandoffSummary(message, "已提示先核对订单信息，不确认收款成功。", "需要人工接管付款承接。"),
    );
  }

  if (plan.subIntent === "freight") {
    return makeOutcome(
      false,
      null,
      "ab_order_handoff -> 运费口径来自 fulfillment 工具",
      ["fulfillment_payment.freight"],
      asString(toolResult.freight) || "运费以后台运单数据为准。",
      "",
    );
  }

  if (plan.subIntent === "shipping_origin") {
    return makeOutcome(
      false,
      null,
      "ab_order_handoff -> 发货地口径来自 fulfillment 工具",
      ["fulfillment_payment.shipping_origin", "fulfillment_payment.ship_time"],
      `${asString(toolResult.shipping_origin) || "一般深圳"}发货，${asString(toolResult.ship_time) || ""}`,
      "",
    );
  }

  if (plan.subIntent === "delivery_time") {
    return makeOutcome(
      false,
      null,
      "ab_order_handoff -> 发货时效口径来自 fulfillment 工具",
      ["fulfillment_payment.ship_time", "fulfillment_payment.delivery_time"],
      `${asString(toolResult.ship_time) || ""}，${asString(toolResult.delivery_time) || ""}`,
      "",
    );
  }

  return makeOutcome(
    false,
    null,
    "ab_order_handoff -> 支付方式按 fulfillment 工具固定口径输出",
    ["fulfillment_payment.payment_methods", "fulfillment_payment.payment_unavailable"],
    buildPaymentFallbackReply(message, toolResult),
    "",
  );
}

function evaluateVersionOutcome(
  plan: IntentPlan,
  toolResult: Record<string, unknown>,
  message: string,
): EvaluatedOutcome {
  if (plan.subIntent === "not_in_scope") {
    const notInScope = asRecordArray(toolResult.not_in_scope).find((item) =>
      asStringArray(item.aliases).some((alias) => message.includes(alias)) || message.includes(asString(item.item) || ""),
    );
    return makeOutcome(
      false,
      null,
      "ab_version_answering -> 非在售商品只说明范围边界",
      [`not_in_scope:${asString(notInScope?.item) || "unknown"}`],
      asString(notInScope?.reply) || "该商品不在售，我可以先帮您介绍当前在售版本。",
      "",
    );
  }

  if (typeof toolResult.error === "string") {
    const availableVersions = asStringArray(toolResult.available_versions);
    return makeOutcome(
      false,
      null,
      "ab_version_answering -> 版本未识别，先澄清商品范围",
      ["product_versions"],
      availableVersions.length > 0
        ? `目前在售的是 ${availableVersions.join("、")}，您想先了解哪个版本？`
        : "您想先了解哪个版本呢？",
      "",
    );
  }

  if (plan.subIntent === "synonym") {
    const note = asString(toolResult.synonyms_note) || "替C、替尔、替西帕肽是同一成分的不同叫法。";
    return makeOutcome(false, null, "ab_version_answering -> 同义词归一口径直接回复", ["synonyms_note"], note, "");
  }

  return makeOutcome(
    false,
    null,
    plan.toolName === "all_products"
      ? "ab_version_answering -> 版本对比与商品范围由 all_products 提供事实基础"
      : "ab_version_answering -> 商品版本详情由 product 工具提供",
    [plan.toolName === "all_products" ? "all_products" : `product:${asString(toolResult.name) || "unknown"}`],
    buildVersionFallbackReply(plan, toolResult),
    "",
  );
}

function buildVersionFallbackReply(plan: IntentPlan, toolResult: Record<string, unknown>): string {
  if (plan.toolName === "all_products") {
    const versions = asRecordArray(toolResult.versions);
    if (versions.length >= 2 && plan.subIntent === "compare_versions") {
      const first = versions[0];
      const second = versions[1];
      return `${asString(first.name) || "版本A"}是${asString(first.product_form) || "当前版本"}，${asString(first.package_desc) || ""}；${asString(second.name) || "版本B"}是${asString(second.product_form) || "当前版本"}，${asString(second.package_desc) || ""}。具体选哪个更适合，主要看您的预算和使用习惯。`;
    }
    return `目前在售的是 ${versions.map((item) => asString(item.name)).filter(Boolean).join("、")}。您想先了解哪个版本？`;
  }

  return `${asString(toolResult.name) || "这个版本"}是${asString(toolResult.product_form) || ""}，${asString(toolResult.package_desc) || ""}，可选档位有 ${asStringArray(toolResult.doses).join("/")}。`;
}

function buildPaymentFallbackReply(message: string, toolResult: Record<string, unknown>): string {
  const paymentMethods = asStringArray(toolResult.payment_methods).join(" / ");
  const unavailable = asString(toolResult.payment_unavailable) || "企微未开通转账收款功能";

  if (message.includes("红包")) {
    return `微信红包这种方式这边不支持哦，目前支持 ${paymentMethods}，另外 ${unavailable}。`;
  }

  if (message.includes("扫码")) {
    return `扫码这边不太方便安排哦，目前支持 ${paymentMethods}，另外 ${unavailable}。`;
  }

  if (message.includes("转账")) {
    return `转账这边暂时不支持哦，目前支持 ${paymentMethods}，另外 ${unavailable}。`;
  }

  return `目前支持 ${paymentMethods}，另外 ${unavailable}。`;
}

function buildRiskClarifyFallbackReply(riskAnalysis: RiskContextAnalysis): string {
  const opening = pickOne([
    "先别着急，我先帮您把情况判断清楚。",
    "这个我先帮您仔细看一下，您先别担心。",
    "这个我先帮您理一下情况，再给您更准确的说明。",
  ]);

  const questionMap: Record<string, string> = {
    既往病史: "之前有没有甲状腺、血糖、肾功能这类病史",
    当前用药: "现在有没有在用胰岛素、磺脲类，或者其他长期在吃的药",
    特殊阶段: "目前是否在备孕、怀孕或哺乳阶段",
    当前不适: "现在最担心的是哪种不适，或者已经出现了什么反应",
  };

  const followUps = riskAnalysis.missingDimensions
    .map((item) => questionMap[item])
    .filter(Boolean)
    .slice(0, 3);

  if (followUps.length === 0) {
    return `${opening}您把目前的体质情况、既往病史、正在用的药，还有现在担心的反应跟我说一下，我再帮您往下判断。`;
  }

  return `${opening}${followUps.join("；")}？您补充一下，我再结合情况帮您往下看。`;
}

function analyzeRiskContext(message: string, history: ConversationMessage[]): RiskContextAnalysis {
  const userText = [...history.filter((item) => item.role === "user").map((item) => item.content), message].join(" ");
  const knownDimensions: string[] = [];

  if (/(病史|甲状腺|甲减|甲状腺结节|糖尿病|高血压|肾功能|肾病|过敏|桥本|体质)/.test(userText)) {
    knownDimensions.push("既往病史");
  }
  if (/(胰岛素|磺脲|在吃|用药|吃药|长期用药|联合用药|药物)/.test(userText)) {
    knownDimensions.push("当前用药");
  }
  if (/(备孕|怀孕|孕期|哺乳)/.test(userText)) {
    knownDimensions.push("特殊阶段");
  }
  if (/(副作用|恶心|呕吐|嗜睡|口渴|便秘|发热|头晕|不舒服|难受|反应)/.test(userText)) {
    knownDimensions.push("当前不适");
  }

  const allDimensions = ["既往病史", "当前用药", "特殊阶段", "当前不适"];
  const missingDimensions = allDimensions.filter((item) => !knownDimensions.includes(item));
  const hasEnoughContext = knownDimensions.length >= 2;

  const summaryParts = [
    knownDimensions.includes("既往病史") ? "已提到既往病史/体质情况" : null,
    knownDimensions.includes("当前用药") ? "已提到当前用药情况" : null,
    knownDimensions.includes("特殊阶段") ? "已提到备孕/孕期/哺乳等特殊阶段" : null,
    knownDimensions.includes("当前不适") ? "已提到当前担心的不适或副作用" : null,
  ].filter(Boolean);

  return {
    summary: summaryParts.length > 0 ? `【风险背景】${summaryParts.join("；")}` : "【风险背景】暂未收集到完整的体质、病史、用药与不适信息。",
    knownDimensions,
    missingDimensions,
    hasEnoughContext,
  };
}

function shouldSilentlyIntercept(plan: IntentPlan, outcome: EvaluatedOutcome): boolean {
  return plan.intent === "handoff" && outcome.needHuman;
}

function pickStyleVariant(plan: IntentPlan, outcome: EvaluatedOutcome): string | null {
  if (outcome.needHuman) {
    return null;
  }

  if (plan.toolName === "fulfillment") {
    switch (plan.subIntent) {
      case "payment_methods":
        return pickOne(["直接确认型", "解释原因型", "下一步引导型"]);
      case "shipping_origin":
      case "delivery_time":
      case "freight":
        return pickOne(["简洁告知型", "口语说明型", "轻引导型"]);
      default:
        return null;
    }
  }

  if (plan.toolName === "product" || plan.toolName === "all_products") {
    return pickOne(["顾问建议型", "对比说明型", "预算引导型"]);
  }

  if (plan.toolName === "manual_promo") {
    return "活动引导型";
  }

  if (plan.toolName === "compliance" && outcome.matchedEvidence.includes("risk:clarify_needed")) {
    return pickOne(["风险安抚型", "信息补充型", "谨慎说明型"]);
  }

  return null;
}

function resolveGenerationTemperature(plan: IntentPlan, outcome: EvaluatedOutcome): number {
  if (plan.toolName === "compliance" && outcome.matchedEvidence.includes("risk:clarify_needed")) {
    return 0.36;
  }

  if (outcome.needHuman) {
    return 0.12;
  }

  if (plan.toolName === "price" || plan.toolName === "promo") {
    return 0.08;
  }

  if (plan.toolName === "compliance" || plan.toolName === "authenticity") {
    return 0.16;
  }

  if (plan.toolName === "fulfillment" || plan.toolName === "product" || plan.toolName === "all_products") {
    return 0.42;
  }

  return 0.3;
}

function buildVariantFallbackReply({
  message,
  plan,
  toolResult,
  outcome,
  styleVariant,
}: {
  message: string;
  plan: IntentPlan;
  toolResult: Record<string, unknown> | null;
  outcome: EvaluatedOutcome;
  styleVariant: string | null;
}): string {
  if (!styleVariant || !toolResult) {
    return outcome.fallbackReply;
  }

  if (plan.toolName === "fulfillment") {
    if (plan.subIntent === "payment_methods") {
      return buildPaymentVariantReply(message, toolResult, styleVariant);
    }
    if (plan.subIntent === "shipping_origin") {
      return buildShippingOriginVariantReply(toolResult, styleVariant);
    }
    if (plan.subIntent === "delivery_time") {
      return buildDeliveryTimeVariantReply(toolResult, styleVariant);
    }
    if (plan.subIntent === "freight") {
      return buildFreightVariantReply(toolResult, styleVariant);
    }
  }

  if (plan.toolName === "product" || plan.toolName === "all_products") {
    return buildVersionVariantReply(plan, toolResult, styleVariant);
  }

  if (plan.toolName === "manual_promo") {
    return buildManualPromoVariantReply(styleVariant);
  }

  return outcome.fallbackReply;
}

function buildPaymentVariantReply(message: string, toolResult: Record<string, unknown>, styleVariant: string): string {
  const paymentMethods = asStringArray(toolResult.payment_methods).join("和");
  const unavailable = asString(toolResult.payment_unavailable) || "企微未开通转账收款功能";

  if (message.includes("红包")) {
    if (styleVariant === "解释原因型") {
      return `微信红包这种方式这边不支持哈，主要是 ${unavailable}。目前常规可以走微信和支付宝。`;
    }
    if (styleVariant === "下一步引导型") {
      return `微信红包这边不太方便安排哦，目前能走的是微信和支付宝。您确定下单的话，我再把付款方式发您，另外 ${unavailable}。`;
    }
    return `微信红包这种方式这边不支持哦，目前支持 ${paymentMethods}，另外 ${unavailable}。`;
  }

  if (message.includes("扫码")) {
    if (styleVariant === "口语说明型") {
      return `扫码这边暂时不太方便哈，目前常规是微信或支付宝，另外 ${unavailable}。`;
    }
    return `扫码这边不太方便安排哦，目前支持 ${paymentMethods}，另外 ${unavailable}。`;
  }

  if (message.includes("转账")) {
    if (styleVariant === "解释原因型") {
      return `转账这边暂时不支持，因为 ${unavailable}。目前常规能走微信和支付宝。`;
    }
    return `转账这边暂时不支持哦，目前支持 ${paymentMethods}，另外 ${unavailable}。`;
  }

  if (styleVariant === "解释原因型") {
    return `目前可以走微信和支付宝，企微这边因为 ${unavailable}，所以不支持转账类收款。`;
  }
  if (styleVariant === "下一步引导型") {
    return `目前支持微信和支付宝，您确定下单的话我把付款方式发您。补充一下，${unavailable}。`;
  }
  return `目前支持 ${paymentMethods}，另外 ${unavailable}。`;
}

function buildShippingOriginVariantReply(toolResult: Record<string, unknown>, styleVariant: string): string {
  const shippingOrigin = asString(toolResult.shipping_origin) || "一般深圳";
  const shipTime = asString(toolResult.ship_time) || "出单号后 48 小时内发出";
  if (styleVariant === "口语说明型") {
    return `一般是从${shippingOrigin}这边发哈，正常 ${shipTime}。`;
  }
  if (styleVariant === "轻引导型") {
    return `这边通常是 ${shippingOrigin} 发货，${shipTime}，您要是赶时间我也可以先帮您看下节奏。`;
  }
  return `${shippingOrigin}发货，${shipTime}。`;
}

function buildDeliveryTimeVariantReply(toolResult: Record<string, unknown>, styleVariant: string): string {
  const shipTime = asString(toolResult.ship_time) || "出单号后 48 小时内发出";
  const deliveryTime = asString(toolResult.delivery_time) || "揽收后 1-3 天到";
  if (styleVariant === "口语说明型") {
    return `正常是 ${shipTime}，发出后一般 ${deliveryTime}。`;
  }
  if (styleVariant === "轻引导型") {
    return `${shipTime}，顺利的话揽收后一般 ${deliveryTime}，您要是着急我也可以先帮您看发货节奏。`;
  }
  return `${shipTime}，${deliveryTime}。`;
}

function buildFreightVariantReply(toolResult: Record<string, unknown>, styleVariant: string): string {
  const freight = asString(toolResult.freight) || "顺丰冷链到付约 20 元";
  if (styleVariant === "口语说明型") {
    return `运费这边一般是 ${freight}。`;
  }
  if (styleVariant === "轻引导型") {
    return `运费通常按实际运单走，一般是 ${freight}，到时候我也会帮您一起确认。`;
  }
  return freight;
}

function buildVersionVariantReply(plan: IntentPlan, toolResult: Record<string, unknown>, styleVariant: string): string {
  if (plan.toolName === "all_products") {
    const versions = asRecordArray(toolResult.versions);
    if (versions.length >= 2 && plan.subIntent === "compare_versions") {
      const [first, second] = versions;
      if (styleVariant === "预算引导型") {
        return `${asString(first.name)}更偏${asString(first.product_form)}，${asString(second.name)}会更偏性价比一些。一个更适合追求便捷，一个更适合预算敏感，主要看您的使用习惯和预算。`;
      }
      if (styleVariant === "对比说明型") {
        return `${asString(first.name)}是${asString(first.product_form)}，${asString(first.package_desc)}；${asString(second.name)}是${asString(second.product_form)}，${asString(second.package_desc)}。两者成分口径一致，区别主要在剂型、包装和价格带。`;
      }
    }
    return `目前在售的是 ${versions.map((item) => asString(item.name)).filter(Boolean).join("、")}，您想先看哪一个？`;
  }

  if (styleVariant === "预算引导型") {
    return `${asString(toolResult.name)}这个版本是${asString(toolResult.product_form)}，${asString(toolResult.package_desc)}，如果您更在意预算或者操作方便程度，我也可以按这个方向帮您选。`;
  }
  if (styleVariant === "对比说明型") {
    return `${asString(toolResult.name)}是${asString(toolResult.product_form)}，${asString(toolResult.package_desc)}，常见档位有 ${asStringArray(toolResult.doses).join("/")}。`;
  }
  return `${asString(toolResult.name)}这个版本主打${asString(toolResult.product_form)}，${asString(toolResult.package_desc)}，可选档位有 ${asStringArray(toolResult.doses).join("/")}。`;
}

function buildManualPromoVariantReply(styleVariant: string): string {
  if (styleVariant === "活动引导型") {
    return "当前有效活动我可以按规则表帮您马上看，您告诉我想看哪个版本和档位，我这边直接给您对一下。";
  }
  return "当前有效活动我可以按规则表帮您看哦，您想看哪个版本和档位？";
}

function pickOne<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function getDirectReply(plan: IntentPlan, outcome: EvaluatedOutcome): string | null {
  if (plan.intent === "greeting" || plan.intent === "identity") {
    return outcome.fallbackReply;
  }
  if (plan.toolName === "compliance" && outcome.matchedEvidence.includes("compliance:miss_transfer")) {
    return outcome.fallbackReply;
  }
  return null;
}

function buildTrace(
  plan: IntentPlan,
  toolExecution: ToolExecution,
  outcome: EvaluatedOutcome,
  reply: string,
): PresalesTraceStep[] {
  return [
    {
      id: "trace-1",
      title: "LLM 语义意图识别",
      stage: "llm",
      content: `${plan.reasoning}\nintent=${plan.intent}\nconfidence=${plan.confidence.toFixed(2)}\nsubIntent=${plan.subIntent}`,
    },
    {
      id: "trace-2",
      title: "工具选择与调用",
      stage: "llm",
      content: toolExecution.toolName
        ? `tool=${toolExecution.toolName}\nargs=${toolExecution.toolArgs.join(" ")}`
        : "本轮无需调用工具，直接走固定口径。",
    },
    {
      id: "trace-3",
      title: "工具返回与边界判定",
      stage: "tool",
      content: [
        outcome.boundaryDecision,
        toolExecution.result ? `tool_result=${JSON.stringify(toolExecution.result, null, 2)}` : "tool_result=null",
        `matched_evidence=${outcome.matchedEvidence.join(" | ") || "none"}`,
      ].join("\n"),
    },
    {
      id: "trace-4",
      title: "最终对客话术",
      stage: "output",
      content: reply,
    },
  ];
}

async function callModelForJson(
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>,
  options?: { temperature?: number },
): Promise<Record<string, unknown>> {
  if (!(await isFoundationModelConfigured())) {
    throw new Error("未配置 FOUNDATION_MODEL_API_KEY，无法按 presales-qa-agent 的 LLM + 工具架构执行。");
  }

  const config = await getFoundationModelConfig();
  const response = await fetch(`${config.baseUrl}${config.chatCompletionsPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify({
      model: config.model,
      temperature: options?.temperature ?? 0.1,
      response_format: { type: "json_object" },
      messages,
    }),
  });

  if (!response.ok) {
    throw new Error(`模型接口调用失败：${response.status} ${await response.text()}`);
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const rawContent = payload.choices?.[0]?.message?.content;
  if (!rawContent) {
    throw new Error("模型未返回 JSON 内容");
  }

  return JSON.parse(extractJsonObject(rawContent)) as Record<string, unknown>;
}

function normalizeIntentPlan(payload: Record<string, unknown>): IntentPlan {
  const validIntents: PresalesIntent[] = [
    "greeting",
    "identity",
    "handoff",
    "risk",
    "fulfillment_payment",
    "pricing",
    "authenticity",
    "version",
    "unknown",
  ];

  const intentCandidate = typeof payload.intent === "string" ? (payload.intent.trim() as PresalesIntent) : "unknown";
  const intent = validIntents.includes(intentCandidate) ? intentCandidate : "unknown";
  const toolName = typeof payload.toolName === "string" && payload.toolName.trim() ? payload.toolName.trim() : null;
  const toolArgs = isPlainObject(payload.toolArgs) ? payload.toolArgs : {};
  const confidence = typeof payload.confidence === "number" ? Math.max(0, Math.min(1, payload.confidence)) : 0.35;

  return {
    intent,
    confidence,
    toolName,
    toolArgs: {
      version: asNullableString(toolArgs.version),
      dose: asNullableString(toolArgs.dose),
      quantity: typeof toolArgs.quantity === "number" ? toolArgs.quantity : 1,
      msg: asNullableString(toolArgs.msg),
    },
    subIntent: typeof payload.subIntent === "string" && payload.subIntent.trim() ? payload.subIntent.trim() : "general",
    reasoning: typeof payload.reasoning === "string" && payload.reasoning.trim() ? payload.reasoning.trim() : "按语义进行意图识别与工具选择。",
  };
}

function buildToolArgs(plan: IntentPlan): string[] {
  if (!plan.toolName) {
    return [];
  }

  const args = ["--tool", plan.toolName];
  if (plan.toolArgs.version) {
    args.push("--version", plan.toolArgs.version);
  }
  if (plan.toolArgs.dose) {
    args.push("--dose", plan.toolArgs.dose);
  }
  if (typeof plan.toolArgs.quantity === "number" && plan.toolName === "promo") {
    args.push("--quantity", String(plan.toolArgs.quantity));
  }
  if (plan.toolArgs.msg && (plan.toolName === "compliance" || plan.toolName === "manual_promo")) {
    args.push("--msg", plan.toolArgs.msg);
  }
  return args;
}

async function resolvePythonCommand(): Promise<{ command: string; prefixArgs: string[] }> {
  const candidates = [
    { command: "python", prefixArgs: [] as string[] },
    { command: "python3", prefixArgs: [] as string[] },
    { command: "py", prefixArgs: ["-3"] as string[] },
  ];

  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate.command, [...candidate.prefixArgs, "--version"], {
        cwd: PROJECT_ROOT,
        encoding: "utf8",
      });
      return candidate;
    } catch {
      continue;
    }
  }

  throw new Error("当前环境未找到可用的 Python 解释器，无法调用 answer_engine.py。");
}

async function getSkillPrompt(): Promise<string> {
  if (!cachedSkillPrompt) {
    cachedSkillPrompt = await readFile(SKILL_PROMPT_PATH, "utf8");
  }
  return cachedSkillPrompt;
}

async function getKnowledgeText(): Promise<string> {
  if (!cachedKnowledgeText) {
    cachedKnowledgeText = await readFile(KNOWLEDGE_BASE_PATH, "utf8");
  }
  return cachedKnowledgeText;
}

function extractJsonObject(rawText: string): string {
  const trimmed = rawText.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("模型未返回合法 JSON");
  }
  return trimmed.slice(start, end + 1);
}

function formatHistory(history: ConversationMessage[]): string {
  if (history.length === 0) {
    return "无";
  }
  return history.map((item) => `${item.role}: ${item.content}`).join("\n");
}

function buildHandoffSummary(customerFocus: string, answeredContent: string, unresolved: string): string {
  return [
    `【客户关注点】${customerFocus}`,
    `【已答内容】${answeredContent}`,
    `【未解决问题】${unresolved}`,
  ].join("\n");
}

function makeOutcome(
  needHuman: boolean,
  handoffTriggerType: HandoffTriggerType | null,
  boundaryDecision: string,
  matchedEvidence: string[],
  fallbackReply: string,
  handoffSummary: string,
): EvaluatedOutcome {
  return {
    needHuman,
    handoffTriggerType,
    boundaryDecision,
    matchedEvidence,
    fallbackReply,
    handoffSummary,
  };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asNullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => (typeof item === "string" ? item : "")).filter(Boolean);
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter(isPlainObject);
}

function mentionsUnsupportedMethodAsSupported(reply: string, keyword: string): boolean {
  if (!reply.includes(keyword)) {
    return false;
  }

  const negativePatterns = [
    new RegExp(`${keyword}.{0,8}(不支持|不能|不可以|不行|没法|无法|不太方便)`),
    new RegExp(`(不支持|不能|不可以|不行|没法|无法|不太方便).{0,8}${keyword}`),
  ];

  return !negativePatterns.some((pattern) => pattern.test(reply));
}

function validateGeneratedReply(
  plan: IntentPlan,
  toolResult: Record<string, unknown> | null,
  fallbackReply: string,
  outcome: EvaluatedOutcome,
  reply: string,
): string {
  if (!toolResult) {
    return fallbackReply;
  }

  if (plan.toolName === "fulfillment" && plan.subIntent === "payment_methods") {
    const paymentMethods = asStringArray(toolResult.payment_methods);
    const unavailable = asString(toolResult.payment_unavailable);
    const includesMethods = paymentMethods.every((item) => reply.includes(item));
    const includesUnavailable = unavailable ? reply.includes("未开通") || reply.includes("转账") || reply.includes(unavailable) : true;
    const invalidRedPacketMention = mentionsUnsupportedMethodAsSupported(reply, "红包");
    const invalidScanMention = mentionsUnsupportedMethodAsSupported(reply, "扫码");
    const invalidTransferMention = mentionsUnsupportedMethodAsSupported(reply, "转账");
    if (!includesMethods || !includesUnavailable || invalidRedPacketMention || invalidScanMention || invalidTransferMention) {
      return fallbackReply;
    }
  }

  if (plan.toolName === "price") {
    const listPrice = String(toolResult.list_price ?? "");
    if (listPrice && !reply.includes(listPrice)) {
      return fallbackReply;
    }
  }

  if (plan.toolName === "promo") {
    const finalPrice = String(toolResult.final_price ?? "");
    if (finalPrice && !reply.includes(finalPrice)) {
      return fallbackReply;
    }
  }

  if (plan.toolName === "compliance" && outcome.needHuman) {
    if (reply.includes("转人工") || reply.includes("AI") || reply.includes("机器人")) {
      return fallbackReply;
    }
  }

  if (plan.toolName === "authenticity") {
    const forbidden = asStringArray(toolResult.forbidden);
    if (forbidden.some((item) => item && reply.includes(item))) {
      return fallbackReply;
    }
  }

  if (outcome.needHuman && (reply.includes("收款成功") || reply.includes("订单已生效") || reply.includes("已发货"))) {
    return fallbackReply;
  }

  return reply;
}
