"use client";

import type { FormEvent } from "react";

export interface DemoChatMessage {
  id: string;
  sender: "user" | "assistant" | "system";
  text: string;
}

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
    <section className="panel-card panel-card--chat">
      <div className="panel-card__header">
        <div>
          <p className="eyebrow">客户会话</p>
          <h2>保健品咨询</h2>
          <p className="helper-copy">{chatHelperText}</p>
        </div>
        <span className="status-pill">{chatStatusLabel}</span>
      </div>

      {chatError ? <div className="error-banner">{chatError}</div> : null}

      <div className="chat-thread">
        {messages.map((message) => (
          <article key={message.id} className={`chat-bubble chat-bubble--${message.sender}`}>
            <span className="chat-bubble__role">
              {message.sender === "user" ? "客户" : message.sender === "system" ? "系统" : "专属顾问"}
            </span>
            <p>{message.text}</p>
          </article>
        ))}
        {chatLoading ? <div className="typing-indicator">专属顾问正在整理回复...</div> : null}
      </div>

      <div className="quick-question-list">
        {quickQuestions.map((item) => (
          <button key={item.label} className="chip-button" onClick={() => onQuickQuestion(item.text)} type="button">
            {item.label}
          </button>
        ))}
      </div>

      <form className="chat-form" onSubmit={onSubmit}>
        <input
          value={chatInput}
          onChange={(event) => onInputChange(event.target.value)}
          disabled={chatLoading}
        />
        <button type="submit" disabled={chatLoading}>
          发送
        </button>
      </form>
    </section>
  );
}
