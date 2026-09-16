import { getFoundationModelConfig, isFoundationModelConfigured } from "./foundationModelConfig";
import {
  buildStateContext,
  OrderReplyPlan,
  StateContext,
  POLICY_FACTS,
  AnswerPrecision,
  AskedDimension,
  validateOrderPlan,
} from "./stateContext";
import { DealStage } from "@/types";

interface GraphMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

// 订单/发货类回复：plan(维度+证据) → 推导精度 → 校验(引用-only+钳制) → 按精度 render。
// 精度由证据决定（最大合理精度），措辞自由但语义骨架受控。任何硬失败回退旧确定性话术。

function extractJsonObject(rawText: string): string {
  const trimmed = rawText.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("模型未返回合法 JSON");
  return trimmed.slice(start, end + 1);
}

async function callModelJson(
  messages: Array<{ role: string; content: string }>,
  temperature: number,
): Promise<Record<string, unknown>> {
  const config = await getFoundationModelConfig();
  const response = await fetch(`${config.baseUrl}${config.chatCompletionsPath}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
    body: JSON.stringify({
      model: config.model,
      temperature,
      response_format: { type: "json_object" },
      messages,
    }),
  });
  if (!response.ok) throw new Error(`模型调用失败: ${response.status}`);
  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const raw = payload.choices?.[0]?.message?.content;
  if (!raw) throw new Error("模型未返回 JSON");
  return JSON.parse(extractJsonObject(raw)) as Record<string, unknown>;
}

function formatHistory(history: GraphMessage[]): string {
  return history.length === 0 ? "无" : history.map((item) => `${item.role}: ${item.content}`).join("\n");
}

function describeContext(ctx: StateContext): string {
  const policyLines = ctx.policy.map((id) => {
    const p = POLICY_FACTS[id];
    return `  - ${id} [${p.kind}${p.window ? ", " + p.window : ""}] = ${p.statement}${p.note ? "；" + p.note : ""}`;
  });
  const orderIds = [...ctx.confirmed, ...ctx.unknown];
  return [
    `当前阶段: ${ctx.stageLabel} (${ctx.stage})`,
    `运单号: ${ctx.trackingNo ?? "无"}`,
    `confirmed 订单事实（本单已发生，可断言）: ${ctx.confirmed.length ? ctx.confirmed.join(", ") : "（无）"}`,
    `unknown 订单事实（尚未确认，只能表述为「还没确定」）: ${ctx.unknown.join(", ")}`,
    `可用业务口径 POLICY（通用规则/SLA，可引用）:`,
    ...policyLines,
    "",
    "【订单事实 id 含义】",
    ...orderIds.map((id) => `- ${id} = ${ctx.factsMeaning[id] ?? ""}`),
  ].join("\n");
}

function parsePlan(raw: Record<string, unknown>): OrderReplyPlan {
  const dimension = (["ship_time", "arrival_time", "shipped_status", "flow"] as string[]).includes(String(raw.asked_dimension))
    ? (String(raw.asked_dimension) as AskedDimension)
    : "ship_time";
  const basisRaw = Array.isArray(raw.basis) ? raw.basis : [];
  const basis = basisRaw.filter((item): item is string => typeof item === "string").filter(Boolean);
  const mode = (["EXACT", "BOUNDED", "CONDITIONAL", "NON_COMMITTAL"] as string[]).includes(String(raw.answer_mode))
    ? (String(raw.answer_mode) as AnswerPrecision)
    : "NON_COMMITTAL";
  const commitmentsRaw = Array.isArray(raw.commitments) ? raw.commitments : [];
  const commitments = commitmentsRaw
    .filter((item): item is string => typeof item === "string")
    .filter((item) => item === "will_update");
  const disputedRaw = raw.disputed_premise;
  const disputed_premise =
    disputedRaw === "stock" || disputedRaw === "order_volume" || disputedRaw === "other" ? disputedRaw : null;
  return {
    asked_dimension: dimension,
    basis,
    answer_mode: mode,
    commitments,
    action: typeof raw.action === "string" ? raw.action : "answer",
    disputed_premise,
  };
}

// 按精度给出渲染指令。
function precisionDirective(precision: AnswerPrecision): string {
  switch (precision) {
    case "EXACT":
      return "本单已有确认事实：直接陈述该现状（例如「已经揽收了/运输中」）。不要用一般 SLA 替代本单已确认的事实。";
    case "BOUNDED":
      return "用业务 SLA 的窗口给范围答案（例如「付款后 48 小时内安排发出」「揽收后一般 1-3 天」），并带上口径的限定（例如「具体是否当天，看付款后的订单排号」）。不要承诺比窗口更细的时间。";
    case "CONDITIONAL":
      return "只用引用到的一般规则/条件表述（例如「一般付款后 48 小时内」「如果赶上当天的安排就可能…」）。不得超出所引用的规则。";
    case "NON_COMMITTAL":
    default:
      return "没有可靠依据：不做时间承诺，也不确认客户断言的原因（例如客户说「是不是没货/单太多」，不要附和，因为没有对应事实）。表达为：这个我这边不好直接确认，发货安排还是要看付款后的实际排单，有进展我第一时间同步您。";
  }
}

function premiseZh(topic: string): string {
  return topic === "stock" ? "库存/缺货" : topic === "order_volume" ? "订单量/单太多" : "某个原因";
}

const FORBIDDEN_RULES = [
  "四条硬规则（违反即失败）：",
  "1) 不评价库存/订单量：系统没有库存、订单量事实，所以对「没货/缺货/单太多」这类说法既不肯定也不否定（不要说「是缺货」「和库存无关」「最近单多」）；只就客户问的发货时间/状态本身作答。",
  "2) 不编造更精确的时间：精度不是 EXACT 时，不得出现比 SLA 窗口更细的确定性时间（今天一定能发/几点/明天/下午X点）。",
  "3) 不把一般规则说成本单：POLICY/SLA 事实要用「一般/通常/正常」表述；只有 ORDER 确认事实才可以说「您这单已经…」。",
  "4) 不向客户暴露系统缺数据：不得说「我没有/缺少…信息/数据」；不确定性一律表达为「以实际排单为准/我帮您确认下」。",
  "此外：1-2 句自然口语；不出现「转人工/AI/机器人」。",
].join("\n");

export interface OrderReplyResult {
  reply: string;
  mode: "plan_render" | "fallback";
  plan: OrderReplyPlan | null;
  precision: AnswerPrecision | null;
  violations: string[];
  redlineHit: string | null;
}

export async function planAndRenderOrderReply(opts: {
  message: string;
  history: GraphMessage[];
  stage: DealStage;
  trackingNo: string | null;
  fallbackReply: string;
  redlineCheck: (reply: string) => string | null;
}): Promise<OrderReplyResult> {
  const { message, history, stage, trackingNo, fallbackReply, redlineCheck } = opts;
  if (!(await isFoundationModelConfigured())) {
    return { reply: fallbackReply, mode: "fallback", plan: null, precision: null, violations: [], redlineHit: null };
  }
  const ctx = buildStateContext(stage, trackingNo);
  try {
    const planRaw = await callModelJson(
      [
        {
          role: "system",
          content: [
            "你是售前客服的回复规划器。只判断两件事，不写对客话术：",
            "(1) 客户真正在问哪个维度 asked_dimension：ship_time(何时/能否发出) | arrival_time(何时送达) | shipped_status(是否已发/到哪了) | flow(整个流程)。",
            "(2) 回答它该引用哪些证据 basis：只能从下方 State Context 的 id 里选，不能发明。",
            "证据规则：",
            "- 订单事实：只有 confirmed 列表里的才能引用（作为本单已发生）；unknown 的订单事实不要引用。",
            "- 业务口径 POLICY：是通用规则/SLA，可引用（SHIP_AFTER_PAYMENT=付款后48h、ETA_AFTER_PICKUP=揽收后1-3天、NOT_IMMEDIATE_AFTER_PAY=付款后不立即发、SHIP_FLOW=流程）。",
            "- 付款不是发货的充分条件：只有付款相关事实时，回答「何时发」要用 SHIP_AFTER_PAYMENT 给范围，不能断言今天能发。",
            "- 若客户在问一个你没有证据支撑的原因（比如是不是没货/单太多），basis 就不要放任何能佐证该原因的事实——本系统没有库存/订单量事实。",
            "answer_mode 按证据给「最多能答到的精度」：EXACT(本单确认事实可直接陈述现状) | BOUNDED(有SLA给范围) | CONDITIONAL(只有一般规则/条件) | NON_COMMITTAL(无可靠依据，仍要答但不承诺)。拿不准就往低给，宁低勿高。",
            "disputed_premise：判断客户是否在归因于一个系统没有事实可佐证的的原因——「没货/缺货」→stock、「单太多/订单多」→order_volume、其他内部原因→other；否则填 null。",
            'commitments 只能为 [] 或 ["will_update"]。',
            '只返回 JSON：{"asked_dimension": string, "basis": string[], "answer_mode": "EXACT"|"BOUNDED"|"CONDITIONAL"|"NON_COMMITTAL", "commitments": string[], "action": string, "disputed_premise": "stock"|"order_volume"|"other"|null}',
          ].join("\n"),
        },
        {
          role: "user",
          content: ["【客户消息】", message, "", "【最近历史】", formatHistory(history), "", "【State Context】", describeContext(ctx)].join("\n"),
        },
      ],
      0.05,
    );
    const plan = parsePlan(planRaw);
    const validation = validateOrderPlan(plan, ctx);

    const basisMeaning = validation.basis.map((id) => {
      const isPolicy = (ctx.policy as string[]).includes(id);
      const p = POLICY_FACTS[id];
      const scope = isPolicy ? `POLICY/${p?.kind ?? "?"}` : "ORDER/CONFIRMED";
      return `- ${id} (${scope}) = ${isPolicy ? p.statement : ctx.factsMeaning[id] ?? ""}${p?.note ? "；" + p.note : ""}`;
    });

    const renderRaw = await callModelJson(
      [
        {
          role: "system",
          content: [
            "你是售前客服。只根据【回复规划】把它说成 1-2 句自然口语，直接发给客户。",
            `本次回答精度 = ${validation.answer_mode}。`,
            precisionDirective(validation.answer_mode),
            validation.disputed_premise
              ? `【归因前提】客户在归因于「${premiseZh(validation.disputed_premise)}」，但系统没有对应事实。不要确认、否认或解释这个归因（不要出现「是的/不是/和这个无关/确实/可能/没有关系」），只就发货时间或状态本身作答。`
              : "",
            FORBIDDEN_RULES,
            '只返回 JSON：{"customer_reply": string}',
          ].filter(Boolean).join("\n"),
        },
        {
          role: "user",
          content: [
            "【客户消息】",
            message,
            "",
            "【回复规划（已校验）】",
            JSON.stringify({ asked_dimension: plan.asked_dimension, basis: validation.basis, answer_mode: validation.answer_mode, commitments: plan.commitments }, null, 2),
            "",
            "【证据含义】",
            ...(basisMeaning.length ? basisMeaning : "（本次无可引用的本单确认事实或业务口径）"),
            "",
            `当前阶段: ${ctx.stageLabel}（运单号 ${ctx.trackingNo ?? "无"}）`,
          ].join("\n"),
        },
      ],
      0.4,
    );
    const reply = typeof renderRaw.customer_reply === "string" ? renderRaw.customer_reply.trim() : "";
    if (!reply) {
      return { reply: fallbackReply, mode: "fallback", plan, precision: validation.answer_mode, violations: validation.violations, redlineHit: null };
    }

    const redlineHit = redlineCheck(reply);
    if (redlineHit) {
      return { reply: fallbackReply, mode: "fallback", plan, precision: validation.answer_mode, violations: validation.violations, redlineHit };
    }
    return { reply, mode: "plan_render", plan, precision: validation.answer_mode, violations: validation.violations, redlineHit: null };
  } catch {
    return { reply: fallbackReply, mode: "fallback", plan: null, precision: null, violations: [], redlineHit: null };
  }
}
