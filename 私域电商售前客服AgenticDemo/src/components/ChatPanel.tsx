"use client";

import { useEffect, type SyntheticEvent, useMemo } from "react";
import { CalculatorPanel } from "@/components/CalculatorPanel";
import { formatTicketAmountWithEquivalent, getTicketBaseAmount, isPointsTicket } from "@/lib/ticketPricing";
import { Ticket } from "@/types";
import { SendIcon, PandaAvatar, UserIcon, AlertIcon } from "@/components/Icons";

export interface ChatMessage {
  id: string;
  sender: "agent" | "user" | "system";
  text: string;
  matchingTickets?: Ticket[];
}

export interface ActiveActionPayload {
  action: "REFUND" | "REBOOK" | "NONE";
  ticketId: string;
  phase?: "PREVIEW" | "CONFIGURE" | "CONFIRM";
  hintText?: string;
  confirmLabel?: string;
}

interface RebookConfigurator {
  ticket: Ticket | null;
  newPrice: number;
  targetDate: string;
  onNewPriceChange: (value: number) => void;
  onTargetDateChange: (value: string) => void;
}

interface ScenarioCalculatorConfig {
  calcType: string;
  calcPrice: number;
  calcHours: number;
  calcResult: string;
  onTypeChange: (value: string) => void;
  onPriceChange: (value: number) => void;
  onHoursChange: (value: number) => void;
  onRun: () => void;
}

interface ChatPanelProps {
  messages: ChatMessage[];
  chatInput: string;
  chatLoading: boolean;
  activeAction: ActiveActionPayload | null;
  guideMode: "guide" | "calculator" | "hidden";
  scenarioCalculator: ScenarioCalculatorConfig;
  rebookConfigurator?: RebookConfigurator | null;
  onInputChange: (value: string) => void;
  onSubmit: (event: SyntheticEvent<HTMLFormElement>) => void;
  onDismissAction: () => void;
  onConfirmAction: () => void;
  onChooseExistingTicket: () => void;
  onChooseScenarioConsultation: () => void;
  bottomRef: React.RefObject<HTMLDivElement | null>;
  onSelectTicket?: (ticket: Ticket) => void;
}

function renderTextWithHighlights(text: string) {
  if (!text) return null;
  const regex = /(¥\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*元|[\d.]+%|[\d.]+ 积分|手续费|费率|差额|处理结果|退票费|改签费|补收)/g;
  const parts = text.split(regex);
  
  return parts.map((part, i) => {
    if (part && part.match(regex)) {
      const cleanPart = part.trim().replace(/\s+/, "\u00A0");
      return <span key={i} className="highlight-text">{cleanPart}</span>;
    }
    return part;
  });
}

function FormattedMessage({ text }: { text: string }) {
  const lines = useMemo(() => text.split("\n"), [text]);
  const isAlert = text.includes("【规则拦截】") || text.includes("【安全拦截】") || text.includes("【合规红线】");
  
  const cleanLines = lines.map(line => 
    line.replace(/【(规则拦截|安全拦截|合规红线|政策咨询|紧急通知 & 安全关怀|线下窗口引导|业务域外拦截)】/g, "").trim()
  ).filter(line => line.length > 0);

  const groups = useMemo(() => {
    const result: Array<{ type: "paragraph" | "bullets"; lines: string[] }> = [];
    for (const line of cleanLines) {
      const isBullet = line.trim().startsWith("-") || line.trim().startsWith("•");
      if (isBullet) {
        if (result.length > 0 && result[result.length - 1].type === "bullets") {
          result[result.length - 1].lines.push(line);
        } else {
          result.push({ type: "bullets", lines: [line] });
        }
      } else {
        result.push({ type: "paragraph", lines: [line] });
      }
    }
    return result;
  }, [cleanLines]);

  return (
    <div className={`message-content-formatted ${isAlert ? "alert-content" : ""}`}>
      {isAlert && (
        <div className="alert-header">
          <AlertIcon size={18} className="alert-icon" />
          <span className="alert-title">业务安全提醒</span>
        </div>
      )}
      {groups.map((group, groupIdx) => {
        if (group.type === "bullets") {
          return (
            <div key={groupIdx} className="policy-details-card">
              {group.lines.map((line, idx) => {
                const cleanLine = line.replace(/^[\s-•]+/, "");
                const colonIndex = cleanLine.indexOf("：");
                if (colonIndex !== -1) {
                  const label = cleanLine.substring(0, colonIndex);
                  const value = cleanLine.substring(colonIndex + 1);
                  const isHighlightRow = /手续费|金额|差额|处理结果/.test(label);

                  return (
                    <div key={idx} className={`policy-detail-row ${isHighlightRow ? "highlight" : ""}`}>
                      <span className="detail-label">{renderTextWithHighlights(label)}</span>
                      <span className="detail-value">{renderTextWithHighlights(value)}</span>
                    </div>
                  );
                }
                
                return (
                  <div key={idx} className="policy-detail-bullet">
                    <span className="bullet-dot">•</span>
                    <span className="bullet-text">{renderTextWithHighlights(cleanLine)}</span>
                  </div>
                );
              })}
            </div>
          );
        } else {
          return group.lines.map((line, idx) => {
            return (
              <p key={`${groupIdx}-${idx}`} className={groupIdx === 0 && idx === 0 ? "first-line" : ""}>
                {renderTextWithHighlights(line)}
              </p>
            );
          });
        }
      })}
    </div>
  );
}

export function ChatPanel({
  messages,
  chatInput,
  chatLoading,
  activeAction,
  guideMode,
  scenarioCalculator,
  rebookConfigurator,
  onInputChange,
  onSubmit,
  onDismissAction,
  onConfirmAction,
  onChooseExistingTicket,
  onChooseScenarioConsultation,
  bottomRef,
  onSelectTicket,
}: ChatPanelProps) {
  const showRebookConfigurator = Boolean(
    activeAction?.action === "REBOOK" &&
      activeAction.phase === "CONFIGURE" &&
      rebookConfigurator?.ticket
  );
  const showGuideCard = !activeAction && guideMode === "guide";
  const showScenarioCalculator = !activeAction && guideMode === "calculator";
  const rebookTicket = rebookConfigurator?.ticket ?? null;
  const rebookBaseAmount = rebookTicket ? getTicketBaseAmount(rebookTicket) : 0;
  const isPointsRebook = rebookTicket ? isPointsTicket(rebookTicket) : false;
  const higherTargetAmount = isPointsRebook ? rebookBaseAmount + 2000 : rebookBaseAmount + 100;
  const lowerTargetAmount = Math.max(isPointsRebook ? 1000 : 1, isPointsRebook ? rebookBaseAmount - 800 : rebookBaseAmount - 80);

  const lastAgentMessageIndex = messages.reduce((acc, msg, idx) => (msg.sender === "agent" ? idx : acc), -1);

  useEffect(() => {
    if (bottomRef.current) {
      const timer = setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [messages, chatLoading, guideMode, activeAction, bottomRef]);

  return (
    <section className="panel-card">
      <div className="chat-header">
        <div className="chat-avatar" style={{ backgroundColor: "transparent" }}>
          <PandaAvatar size={36} />
        </div>
        <div className="chat-status">
          <h3>智能客服服务助手</h3>
          <div className="chat-subtitle">
            <span className="online-indicator"></span>
            已就绪，帮您查看服务规则并办理业务。
          </div>
        </div>
      </div>

      <div className="chat-messages">
        {messages.map((message, index) => {
          const isInitialAgentMessage = index === 0 && message.sender === "agent";
          const isLatestAgentMessage = index === lastAgentMessageIndex;
          
          const hasDetails = (() => {
            const hasBulletsWithColon = message.text.split("\n").some(line => {
              const isBullet = line.trim().startsWith("-") || line.trim().startsWith("•");
              return isBullet && line.includes("：");
            });
            const hasMatchingTickets = !!(message.matchingTickets && message.matchingTickets.length > 0);
            const isLastAgentMsg = index === lastAgentMessageIndex;
            const hasInlineActions = isLastAgentMsg && (showGuideCard || showScenarioCalculator || showRebookConfigurator || activeAction);
            return hasBulletsWithColon || hasMatchingTickets || hasInlineActions;
          })();

          return (
            <div key={message.id} className={`message-wrapper ${message.sender} ${hasDetails ? "has-card" : ""}`}>
              <div className="message-avatar-container">
                {message.sender === "agent" ? (
                  <PandaAvatar size={32} />
                ) : message.sender === "user" ? (
                  <div className="user-avatar-circle">
                    <UserIcon size={18} />
                  </div>
                ) : null}
              </div>
              <div className={`message-bubble ${message.sender} ${hasDetails ? "has-card" : ""}`}>
                <FormattedMessage text={message.text} />
                
                {message.matchingTickets && message.matchingTickets.length > 0 && (
                  <div className="matching-tickets-container">
                    {message.matchingTickets.map((ticket) => (
                      <div key={ticket.id} className="matching-ticket-card">
                        <div className="matching-ticket-header">
                          <span className="train-badge">{ticket.trainNo}</span>
                          <span className="ticket-status-badge">{ticket.status}</span>
                        </div>
                        <div className="matching-ticket-route">
                          <div className="station-info">
                            <span className="station-name">{ticket.from}</span>
                            <span className="station-time">
                              {ticket.departureTime.includes("T") ? ticket.departureTime.split("T")[1].substring(0, 5) : ""} 开
                            </span>
                          </div>
                          <div className="route-arrow">➔</div>
                          <div className="station-info">
                            <span className="station-name">{ticket.to}</span>
                            <span className="station-time">
                              {ticket.arrivalTime ? ticket.arrivalTime.split("T")[1].substring(0, 5) : ""} 到
                            </span>
                          </div>
                        </div>
                        <div className="matching-ticket-footer">
                          <span className="ticket-price">
                            {isPointsTicket(ticket)
                              ? `${ticket.pointsPrice} 积分`
                              : `¥${ticket.price}`}
                          </span>
                          <button
                            className="btn-select-ticket"
                            onClick={() => onSelectTicket?.(ticket)}
                          >
                            选择此记录
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                
                {isInitialAgentMessage && showGuideCard && (
                  <div className="chat-guide-inline">
                    <div className="chat-guide-copy">
                      <h4>您是想处理现有记录，还是先咨询一下规则？</h4>
                    </div>
                    <div className="chat-guide-actions">
                      <button className="btn-sm secondary" onClick={onChooseExistingTicket}>
                        我有记录要处理
                      </button>
                      <button className="btn-sm primary" onClick={onChooseScenarioConsultation}>
                        我想先咨询
                      </button>
                    </div>
                  </div>
                )}

                {isLatestAgentMessage && showScenarioCalculator && (
                  <div className="chat-action-inline chat-calculator-inline">
                    <div className="chat-calculator-header">
                      <div>
                        <span className="chat-guide-eyebrow">规则咨询</span>
                        <h4>快速测算工具</h4>
                      </div>
                    </div>
                    <CalculatorPanel
                      calcType={scenarioCalculator.calcType}
                      calcPrice={scenarioCalculator.calcPrice}
                      calcHours={scenarioCalculator.calcHours}
                      calcResult={scenarioCalculator.calcResult}
                      title="费用快速测算"
                      description="快速测算您的退票/修改费用比例及应退款项。"
                      className="calc-panel-inline"
                      submitLabel="帮我算算"
                      onTypeChange={scenarioCalculator.onTypeChange}
                      onPriceChange={scenarioCalculator.onPriceChange}
                      onHoursChange={scenarioCalculator.onHoursChange}
                      onRun={scenarioCalculator.onRun}
                    />
                  </div>
                )}

                {isLatestAgentMessage && showRebookConfigurator && rebookConfigurator?.ticket && (
                  <div className="chat-action-inline chat-action-form-inline">
                    <span className="chat-action-hint">
                      {activeAction?.hintText ?? "请选改签后的参数，我为您测算。"}
                    </span>

                    <div className="chat-action-form-grid">
                      <div className="form-group">
                        <label>{isPointsRebook ? "目标积分面值" : "目标票价"}</label>
                        <select
                          value={rebookConfigurator.newPrice}
                          onChange={(event) => rebookConfigurator.onNewPriceChange(Number(event.target.value))}
                        >
                          <option value={rebookBaseAmount}>
                            面值一致: {formatTicketAmountWithEquivalent(rebookConfigurator.ticket, rebookBaseAmount)}
                          </option>
                          <option value={higherTargetAmount}>
                            更高面值: {formatTicketAmountWithEquivalent(rebookConfigurator.ticket, higherTargetAmount)} (需补收)
                          </option>
                          <option value={lowerTargetAmount}>
                            更低面值: {formatTicketAmountWithEquivalent(rebookConfigurator.ticket, lowerTargetAmount)}
                          </option>
                        </select>
                      </div>

                      <div className="form-group">
                        <label>变更日期</label>
                        <input
                          type="date"
                          value={rebookConfigurator.targetDate}
                          onChange={(event) =>
                            rebookConfigurator.onTargetDateChange(event.target.value)
                          }
                          className="rebook-date-input"
                          required
                        />
                      </div>
                    </div>

                    <div className="chat-action-buttons">
                      <button className="btn-sm secondary" onClick={onDismissAction}>
                        取消
                      </button>
                      <button className="btn-sm primary" onClick={onConfirmAction}>
                        {activeAction?.confirmLabel ?? "测算改签结果"}
                      </button>
                    </div>
                  </div>
                )}

                {isLatestAgentMessage && activeAction && !showRebookConfigurator && (
                  <div className="chat-action-inline">
                    <span className="chat-action-hint">
                      {activeAction.hintText ?? "已成功定位记录。是否需要继续核实并确认办理？"}
                    </span>
                    <div className="chat-action-buttons">
                      <button className="btn-sm secondary" onClick={onDismissAction}>
                        取消
                      </button>
                      <button className="btn-sm primary" onClick={onConfirmAction}>
                        {activeAction.confirmLabel ?? "继续办理"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {chatLoading && (
          <div className="message-bubble agent typing-bubble">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <form onSubmit={onSubmit} className="chat-input-form">
        <label htmlFor="chat-message-input">智能客服对话输入框</label>
        <input
          id="chat-message-input"
          type="text"
          placeholder="请输入您的问题或选择车票办理操作..."
          value={chatInput}
          onChange={(event) => onInputChange(event.target.value)}
          disabled={chatLoading}
        />
        <button type="submit" disabled={chatLoading}>
          <SendIcon size={14} />
          <span>发送提问</span>
        </button>
      </form>
    </section>
  );
}
