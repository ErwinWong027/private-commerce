import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { DealStage, DealState, DEAL_STAGE_LABELS, PresalesDecision } from "@/types";
import { joinReplySegments } from "./replyConstraints";
import { runPresalesSkillOrchestrator } from "./presalesOrchestrator";
import {
  buildStageAwareShippingReply,
  detectRedlineViolation,
  enforceReplyDiscipline,
  isShippingQuestion,
  nextStageFromCustomer,
  StageDecisionInput,
} from "./dealStage";
import { planAndRenderOrderReply } from "./presalesPlan";

// 真实的 TypeScript LangGraph 编排：把现有售前编排作为一个可复用节点，
// 再新增「读取演示进度 → 阶段校验 → 正常回复 / 人工分支」的状态图。

export interface GraphConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface PresalesGraphInput {
  message: string;
  history?: GraphConversationMessage[];
  dealState: DealState;
}

export interface PresalesGraphResult {
  decision: PresalesDecision;
  nextStage: DealStage;
  stageNote: string | null;
}

const lastWrite = <T,>() => ({ reducer: (_prev: T, next: T) => next });

const GraphState = Annotation.Root({
  message: Annotation<string>(lastWrite<string>()),
  history: Annotation<GraphConversationMessage[]>({
    reducer: (_prev, next) => next,
    default: () => [],
  }),
  dealState: Annotation<DealState>(lastWrite<DealState>()),
  decision: Annotation<PresalesDecision | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
  nextStage: Annotation<DealStage>({
    reducer: (_prev, next) => next,
    default: () => "consulting" as DealStage,
  }),
  stageNote: Annotation<string | null>({
    reducer: (_prev, next) => next,
    default: () => null,
  }),
});

type GraphStateType = typeof GraphState.State;

function toStageInput(decision: PresalesDecision): StageDecisionInput {
  return {
    toolName: decision.toolName,
    subIntent: decision.subIntent,
    needHuman: decision.needHuman,
    reply: joinReplySegments(decision.reply),
  };
}

// 节点①：调用现有售前编排，直接复用其完整输出，不拆解内部意图与工具。
async function orchestrateNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  const decision = await runPresalesSkillOrchestrator({
    message: state.message,
    history: state.history,
    // 发货/时效由本图 plan→render 出话术，编排器跳过会被丢弃的那次对客生成。
    delegateOrderReply: true,
  });
  return { decision };
}

// 路由：人工诉求走人工分支，其余走阶段校验分支。
function routeAfterOrchestrate(state: GraphStateType): "humanBranch" | "stageGate" {
  return state.decision?.needHuman ? "humanBranch" : "stageGate";
}

// 节点②：阶段校验。发货/时效走 plan→校验→render（状态约束语义空间，取代「每阶段一句死模板」），
// 再用红线做最后兜底；其余路径保持既有红线校验；并计算客户侧的确定性进度推进。
async function stageGateNode(state: GraphStateType): Promise<Partial<GraphStateType>> {
  const decision = state.decision;
  if (!decision) {
    return {};
  }
  const stageInput = toStageInput(decision);
  const nextStage = nextStageFromCustomer(state.dealState.stage, stageInput);

  // 发货/时效问题：把当前阶段翻译为 State Context，让 LLM 在「引用-only 的封闭事实空间」里规划 + 表达。
  if (isShippingQuestion(stageInput)) {
    const fallbackReply = buildStageAwareShippingReply(state.dealState);
    const result = await planAndRenderOrderReply({
      message: state.message,
      history: state.history,
      stage: state.dealState.stage,
      trackingNo: state.dealState.trackingNo,
      fallbackReply,
      redlineCheck: (reply) => detectRedlineViolation(reply, state.dealState.stage),
    });
    const traceStep: PresalesDecision["trace"][number] = {
      id: "trace-stage-plan",
      title: "成交阶段：Plan→校验→渲染",
      stage: "output" as const,
      content: [
        `当前进度=${state.dealState.stage}（${DEAL_STAGE_LABELS[state.dealState.stage as DealStage]}）`,
        `mode=${result.mode}  precision=${result.precision ?? "n/a"}`,
        result.plan ? `dim=${result.plan.asked_dimension}  plan_basis=${JSON.stringify(result.plan.basis)}` : "plan=无（回退确定性话术）",
        result.violations.length ? `violations=${result.violations.join(" | ")}` : "violations=none",
        result.redlineHit ? `redline_hit=${result.redlineHit}` : "redline=clear",
      ].join("\n"),
    };
    return {
      decision: {
        ...decision,
        reply: [result.reply],
        trace: [...decision.trace, traceStep],
      },
      nextStage,
      stageNote:
        result.mode === "plan_render"
          ? "stage_plan_render"
          : result.redlineHit
            ? result.redlineHit
            : "stage_plan_fallback",
    };
  }

  // 其余路径：保持既有阶段校验（非发货问题只走红线检测 + 安全兜底）。
  const discipline = enforceReplyDiscipline(joinReplySegments(decision.reply), state.dealState, stageInput);
  const guardedDecision: PresalesDecision = discipline.corrected
    ? {
        ...decision,
        reply: [discipline.reply],
        trace: [
          ...decision.trace,
          {
            id: "trace-stage-guard",
            title: "成交阶段校验",
            stage: "output" as const,
            content: `当前进度=${state.dealState.stage}，命中校验=${discipline.violation}，已用阶段安全话术覆盖。`,
          },
        ],
      }
    : decision;
  return {
    decision: guardedDecision,
    nextStage,
    stageNote: discipline.corrected ? discipline.violation : null,
  };
}

// 节点③：人工分支。保留原有人工接管语义（不改写话术），但进度推进不与人工路由耦合：
// 仍按客户消息的确定性规则推进（例如"已付款"应进入「待核对」再由人工承接核对），
// 其余人工场景（敏感功效/知识盲区/点名人工等）toolName 非 fulfillment，nextStageFromCustomer 不会推进。
function humanBranchNode(state: GraphStateType): Partial<GraphStateType> {
  const decision = state.decision;
  const nextStage = decision
    ? nextStageFromCustomer(state.dealState.stage, toStageInput(decision))
    : state.dealState.stage;
  return { nextStage, stageNote: "human_handoff" };
}

const compiledGraph = new StateGraph(GraphState)
  .addNode("orchestrate", orchestrateNode)
  .addNode("stageGate", stageGateNode)
  .addNode("humanBranch", humanBranchNode)
  .addEdge(START, "orchestrate")
  .addConditionalEdges("orchestrate", routeAfterOrchestrate, {
    humanBranch: "humanBranch",
    stageGate: "stageGate",
  })
  .addEdge("stageGate", END)
  .addEdge("humanBranch", END)
  .compile();

export async function runPresalesGraph({
  message,
  history = [],
  dealState,
}: PresalesGraphInput): Promise<PresalesGraphResult> {
  const finalState = await compiledGraph.invoke({ message, history, dealState });
  if (!finalState.decision) {
    throw new Error("LangGraph 未产出售前决策");
  }
  return {
    decision: finalState.decision,
    nextStage: finalState.nextStage,
    stageNote: finalState.stageNote,
  };
}
