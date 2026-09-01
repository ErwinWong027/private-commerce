"use client";

import { AlertIcon, CheckIcon, InfoIcon } from "./Icons";
import styles from "./agentic.module.css";

export type ToastTone = "info" | "success" | "error";

const toneStyle: Record<ToastTone, string> = {
  info: styles.toastInfo,
  success: styles.toastSuccess,
  error: styles.toastError,
};

const toneIcon: Record<ToastTone, React.ComponentType<{ className?: string }>> = {
  info: InfoIcon,
  success: CheckIcon,
  error: AlertIcon,
};

interface ToastBannerProps {
  tone: ToastTone;
  message: string;
  onDismiss: () => void;
}

export function ToastBanner({ tone, message, onDismiss }: ToastBannerProps) {
  const Icon = toneIcon[tone];
  return (
    <div className={`${styles.toast} ${toneStyle[tone]}`} role="status">
      <Icon />
      <span> {message}</span>
      <button type="button" onClick={onDismiss} aria-label="关闭提示">
        ×
      </button>
    </div>
  );
}
