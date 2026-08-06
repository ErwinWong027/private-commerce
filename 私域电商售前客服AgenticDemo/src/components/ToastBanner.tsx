"use client";

import { CheckIcon, CloseIcon, InfoIcon } from "@/components/Icons";

export interface ToastState {
  show: boolean;
  text: string;
  type: "success" | "danger" | "info";
}

interface ToastBannerProps {
  toast: ToastState;
}

export function ToastBanner({ toast }: ToastBannerProps) {
  if (!toast.show) {
    return null;
  }

  const IconComponent = 
    toast.type === "success" ? CheckIcon : 
    toast.type === "danger" ? CloseIcon : 
    InfoIcon;

  return (
    <div className={`toast-banner ${toast.type}`}>
      <span className="toast-banner-icon">
        <IconComponent size={14} strokeWidth={3} />
      </span>
      <span>{toast.text}</span>
    </div>
  );
}
