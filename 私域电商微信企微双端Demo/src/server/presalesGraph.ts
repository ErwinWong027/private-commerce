import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import { DealStage, DealState, PresalesDecision } from "@/types";
import { joinReplySegments } from "./replyConstraints";
import { runPresalesSkillOrchestrator } from "./presalesOrchestrator";
import { enforceReplyDiscipline, nextStageFromCustomer, StageDecisionInput } from "./dealStage";

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
  });
  return { decision };
}

// 路由：人工诉求走人工分支，其余走阶段校验分支。
function routeAfterOrchestrate(state: GraphStateType): "humanBranch" | "stageGate" {
  return state.decision?.needHuman ? "humanBranch" : "stageGate";
}

// 节点②：阶段校验。按当前真实进度改写发货话术、拦截话术红线，并计算客户侧的确定性进度推进。
function stageGateNode(state: GraphStateType): Partial<GraphStateType> {
  const decision = state.decision;
  if (!decision) {
    return {};
  }
  const stageInput = toStageInput(decision);
  const discipline = enforceReplyDiscipline(joinReplySegments(decision.reply), state.dealState, stageInput);
  const nextStage = nextStageFromCustomer(state.dealState.stage, stageInput);
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
