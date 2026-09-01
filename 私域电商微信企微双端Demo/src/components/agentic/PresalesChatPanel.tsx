"use client";

import type { FormEvent } from "react";
import styles from "./agentic.module.css";

export interface DemoChatMessage {
  id: string;
  sender: "user" | "assistant" | "system";
  text: string;
}

const bubbleStyle: Record<DemoChatMessage["sender"], string> = {
  user: styles.bubbleUser,
  assistant: styles.bubbleAssistant,
  system: styles.bubbleSystem,
};

const roleLabel: Record<DemoChatMessage["sender"], string> = {
  user: "客户",
  assistant: "专属顾问",
  system: "系统",
};

interface PresalesChatPanelProps {
  messages: DemoChatMessage[];
  chatInput: string;
  chatLoading: boolean;
  chatStatusLabel: string;
  chatHelperText: string;
  chatError: string;
  quickQuestions: Array<{ label: string; text: string }>;
  onInputChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onQuickQuestion: (text: string) => void;
}

export function PresalesChatPanel({
  messages,
  chatInput,
  chatLoading,
  chatStatusLabel,
  chatHelperText,
  chatError,
  quickQuestions,
  onInputChange,
  onSubmit,
  onQuickQuestion,
}: PresalesChatPanelProps) {
  return (
    <section className={styles.panelCard}>
      <div className={styles.panelHeader}>
        <div>
          <p className={styles.eyebrow}>客户会话</p>
          <h2>保健品咨询</h2>
          <p className={styles.helperCopy}>{chatHelperText}</p>
        </div>
        <span className={styles.statusPill}>{chatStatusLabel}</span>
      </div>

      {chatError ? <div className={styles.errorBanner}>{chatError}</div> : null}

      <div className={styles.chatThread}>
        {messages.map((message) => (
          <article key={message.id} className={`${styles.chatBubble} ${bubbleStyle[message.sender]}`}>
            <span className={styles.bubbleRole}>{roleLabel[message.sender]}</span>
            <p>{message.text}</p>
          </article>
        ))}
        {chatLoading ? <div className={styles.typingIndicator}>专属顾问正在整理回复...</div> : null}
      </div>

      <div className={styles.quickQuestionList}>
        {quickQuestions.map((item) => (
          <button
            key={item.label}
            className={styles.chipButton}
            onClick={() => onQuickQuestion(item.text)}
            type="button"
            disabled={chatLoading}
          >
            {item.label}
          </button>
        ))}
      </div>

      <form className={styles.chatForm} onSubmit={onSubmit}>
        <input
          value={chatInput}
          onChange={(event) => onInputChange(event.target.value)}
          placeholder="输入客户消息，例如：这个产品能治疗高血压吗？"
          disabled={chatLoading}
        />
        <button type="submit" disabled={chatLoading}>
          发送
        </button>
      </form>
    </section>
  );
}
