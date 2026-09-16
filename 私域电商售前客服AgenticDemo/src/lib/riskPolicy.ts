// ─────────────────────────────────────────────────────────────────────────
// Risk Policy Engine
//
// 职责：接收 LLM 提取的结构化语义标签，输出每个意图维度的策略决策。
// 原则：
//   - LLM 判断"用户在问什么"（语义提取）
//   - Policy Engine 判断"这个问题允许怎么处理"（纯规则）
//   - 知识库只负责"有哪些经过批准的事实"
//   - 三者不互相越权。Policy Engine 里没有疾病名、没有正则、没有关键词。
// ─────────────────────────────────────────────────────────────────────────

/** LLM 语义提取输出的结构化风险标签 */
export interface RiskSemanticTags {
  /** 客户在问"我（某特定状况）能不能用/想用" */
  asks_personal_suitability: boolean;
  /** 客户在问产品通用副作用/不良反应 */
  asks_side_effects: boolean;
  /** 客户在问能否治疗某疾病/替代某药物 */
  asks_treatment_claim: boolean;
  /** 客户在问减重效果承诺（能瘦多少/多久见效/保证有效） */
  asks_effect_promise: boolean;
  /** 客户提到了个人健康状况（疾病/用药/手术/年龄/身体异常等） */
  has_personal_health_context: boolean;
  /** LLM 提取到的个人健康上下文（如 ["糖尿病"]），无则空数组 */
  personal_health_context: string[];
  /** 语义提取置信度 0-1 */
  confidence: number;
}

export type PolicyAction = "answer_from_kb" | "handoff";

export type RiskAspect =
  | "personal_suitability"
  | "side_effects"
  | "treatment_claim"
  | "effect_promise";

export interface AspectPolicy {
  aspect: RiskAspect;
  action: PolicyAction;
  reason: string;
  /** 从知识库提取的已批准事实（仅 answer_from_kb 时有值） */
  kbFacts: string[];
}

export interface RiskPolicyResult {
  policies: AspectPolicy[];
  needsHandoff: boolean;
  handoffReasons: string[];
  /** 可以回答的部分的已批准事实 */
  answerableFacts: string[];
}

const CONFIDENCE_THRESHOLD = 0.6;

/**
 * 核心策略函数。纯规则，无疾病名、无正则、无关键词匹配。
 *
 * @param tags 结构化语义标签（来自 LLM 或 fallback 提取）
 * @param kbFacts 知识库中已批准的事实，按维度索引
 */
export interface KbFacts {
  sideEffects: string | null;
  effectPromise: string | null;
}

export function runRiskPolicy(
  tags: RiskSemanticTags,
  kbFacts: KbFacts,
): RiskPolicyResult {
  if (tags.confidence < CONFIDENCE_THRESHOLD) {
    return {
      policies: [],
      needsHandoff: true,
      handoffReasons: ["语义置信度不足，保守转人工"],
      answerableFacts: [],
    };
  }

  const policies: AspectPolicy[] = [];
  const answerableFacts: string[] = [];

  // ── 维度 1：个体适配 → 一律 handoff ──
  // 只要客户在问"我能不能用/我想用"，AI 就不做用药安全判断。
  // 这是医疗安全底线，不是"白名单里有没有这个病"的问题。
  if (tags.asks_personal_suitability) {
    const contextDesc = tags.has_personal_health_context
      ? `（${tags.personal_health_context.join("、")}）`
      : "";
    policies.push({
      aspect: "personal_suitability",
      action: "handoff",
      reason: `个人健康适配${contextDesc}，AI 不做用药安全判断`,
      kbFacts: [],
    });
  }

  // ── 维度 2：治疗声明 → 一律 handoff ──
  if (tags.asks_treatment_claim) {
    policies.push({
      aspect: "treatment_claim",
      action: "handoff",
      reason: "疾病治疗/用药替代问题，AI 不做医学判断",
      kbFacts: [],
    });
  }

  // ── 维度 3：通用副作用 → KB 有数据则回答 ──
  if (tags.asks_side_effects) {
    if (kbFacts.sideEffects) {
      policies.push({
        aspect: "side_effects",
        action: "answer_from_kb",
        reason: "通用产品不良反应信息，知识库有已批准事实",
        kbFacts: [kbFacts.sideEffects],
      });
      answerableFacts.push(kbFacts.sideEffects);
    } else {
      policies.push({
        aspect: "side_effects",
        action: "handoff",
        reason: "副作用信息在知识库中缺失，不即兴作答",
        kbFacts: [],
      });
    }
  }

  // ── 维度 4：效果承诺 → KB 有预设话术则回答 ──
  if (tags.asks_effect_promise) {
    if (kbFacts.effectPromise) {
      policies.push({
        aspect: "effect_promise",
        action: "answer_from_kb",
        reason: "效果承诺，用预设保守话术（效果因人而异）",
        kbFacts: [kbFacts.effectPromise],
      });
      answerableFacts.push(kbFacts.effectPromise);
    } else {
      policies.push({
        aspect: "effect_promise",
        action: "handoff",
        reason: "效果承诺话术在知识库中缺失",
        kbFacts: [],
      });
    }
  }

  const handoffPolicies = policies.filter((p) => p.action === "handoff");

  return {
    policies,
    needsHandoff: handoffPolicies.length > 0,
    handoffReasons: handoffPolicies.map((p) => p.reason),
    answerableFacts,
  };
}

// ─────────────────────────────────────────────────────────────────────────
// 回复组合（Demo 1 无 LLM 时用模板；Demo 2 有 LLM 时由 LLM 基于 policy 生成）
// ─────────────────────────────────────────────────────────────────────────

const ASPECT_REPLY_TEMPLATES: Record<RiskAspect, (p: AspectPolicy) => string> = {
  personal_suitability: () =>
    "关于您个人情况是否适合使用，我没办法仅凭聊天信息判断，需要结合具体病情和正在使用的药物确认。",
  treatment_claim: () =>
    "涉及疾病治疗和用药替代的问题，我没办法直接给结论，建议遵医嘱。",
  side_effects: (p) =>
    p.kbFacts.length > 0
      ? `产品已知的常见反应包括${p.kbFacts[0]}。如有明显不适请停用并咨询医生。`
      : "关于副作用的具体情况我帮您确认一下。",
  effect_promise: (p) =>
    p.kbFacts.length > 0 ? p.kbFacts[0] : "效果因人而异，具体以个人使用情况为准哦。",
};

/**
 * 基于策略决策组合多意图回复。
 * 每个维度独立生成回复片段，按"需人工的在前、可回答的在后、收尾兜底"排序。
 */
export function composeRiskReply(result: RiskPolicyResult): string {
  if (result.policies.length === 0) {
    return "这个问题我帮您确认一下，稍等哦～";
  }

  const handoffParts: string[] = [];
  const answerParts: string[] = [];

  for (const policy of result.policies) {
    const text = ASPECT_REPLY_TEMPLATES[policy.aspect](policy);
    if (policy.action === "handoff") {
      handoffParts.push(text);
    } else {
      answerParts.push(text);
    }
  }

  const parts: string[] = [];
  parts.push(...handoffParts);
  parts.push(...answerParts);

  if (result.needsHandoff) {
    parts.push("具体情况我帮您安排专人进一步核实，稍等哦～");
  }

  return parts.join("");
}

// ─────────────────────────────────────────────────────────────────────────
// 降级提取（LLM 不可用时，从原始消息做粗粒度结构化提取）
// 注意：这是 fallback，不是主路径。主路径是 LLM 语义提取。
// 宁可多转人工（false positive），不可漏转（false negative）。
// ─────────────────────────────────────────────────────────────────────────

const FIT_QUERY_PATTERN =
  /(?:能用|可以用|能不能|适合|安全吗|行不行|可不可以|有没有风险|能吃吗|可以打吗|可以注射|想用|也想用|打算用|在用|正在用)/;

const HEALTH_CONTEXT_PATTERN =
  /(?:病|症|药|医|诊|治|检查|手术|过敏|孕|哺乳|肾|肝|心|糖|压|吃|服用|注射|打(?:了|针)|切除|术后|指标|体质|慢性)/;

const INDIVIDUAL_REF_PATTERN =
  /(?:我|自己|本人|家人|老人|小孩|孩子|宝宝|朋友|老公|老婆|爸爸|妈妈|爷爷|奶奶|母亲|父亲)/;

const PATIENT_PATTERN = /\S{1,8}(?:患者|病人)/;
const DISEASE_PATTERN = /\S{2,6}病/;

/**
 * 降级提取：当 LLM 不可用时，从原始消息做粗粒度标签提取。
 *
 * Contract（此函数的行为边界）：
 * - 能明确识别出维度 → 输出对应标签 + confidence 0.85
 * - 不能明确识别 → confidence 0.5（低于阈值）→ Policy Engine 保守转人工
 * - 不追求覆盖率：省略主语、隐含语境、口语变体等由 LLM 主路径负责
 * - 不通过扩充 regex 来提高覆盖率：模式列表是"够用就停"，不是"穷举"
 * - 安全兜底：即使 fallback 漏判（意图分类归为 unknown），
 *   编排层的 unknown→知识盲区→转人工 也会保证 needHuman=true
 *
 * 测试 contract：
 * - 测试验证的是"识别得了的正确走 Policy Engine，识别不了的安全转人工"
 * - 不要求 fallback 覆盖所有语义变体（那是 LLM 的职责）
 */
export function extractRiskTagsFallback(message: string): RiskSemanticTags {
  const hasFitQuery = FIT_QUERY_PATTERN.test(message);
  const hasHealthContext = HEALTH_CONTEXT_PATTERN.test(message);
  const hasIndividualRef = INDIVIDUAL_REF_PATTERN.test(message);
  const hasPatientOrDisease = PATIENT_PATTERN.test(message) || DISEASE_PATTERN.test(message);
  const hasPersonalHealthContext = hasHealthContext && (hasIndividualRef || hasPatientOrDisease);

  const asks_personal_suitability = hasFitQuery && hasPersonalHealthContext;
  const asks_side_effects = /(?:副作用|不良反应|恶心|呕吐|便秘|嗜睡|口渴|发热)/.test(message);
  const asks_treatment_claim = /(?:治病|治疗|降血糖|血糖|代替药|替代药|代替.{0,4}药|能不能治)/.test(message);
  const asks_effect_promise = /(?:瘦多少|瘦几斤|多久见效|保证有效|有没有用|效果)/.test(message);

  const matchedDimensions = [
    asks_personal_suitability,
    asks_side_effects,
    asks_treatment_claim,
    asks_effect_promise,
  ].filter(Boolean).length;

  // 有明确维度匹配 → 高置信度；无任何匹配 → 低置信度（保守转人工）
  const confidence = matchedDimensions > 0 ? 0.85 : 0.5;

  return {
    asks_personal_suitability,
    asks_side_effects,
    asks_treatment_claim,
    asks_effect_promise,
    has_personal_health_context: hasPersonalHealthContext,
    personal_health_context: [],
    confidence,
  };
}
