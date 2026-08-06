"use client";

import React from "react";

interface IconProps {
  size?: number;
  className?: string;
  strokeWidth?: number;
}

export const TrainIcon: React.FC<IconProps> = ({ 
  size = 24, 
  className = "",
  strokeWidth = 2 
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M4 16v-6a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v6" />
    <path d="M6 6h12" />
    <path d="M8 10h8v4H8z" />
    <circle cx="7" cy="14" r="1" fill="currentColor" />
    <circle cx="17" cy="14" r="1" fill="currentColor" />
    <path d="M3 18h18" />
    <path d="M5 21h14" />
  </svg>
);

export const ChatIcon: React.FC<IconProps> = ({ 
  size = 24, 
  className = "",
  strokeWidth = 2 
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    <circle cx="9" cy="12" r="1" fill="currentColor" />
    <circle cx="13" cy="12" r="1" fill="currentColor" />
    <circle cx="17" cy="12" r="1" fill="currentColor" />
  </svg>
);

export const TicketIcon: React.FC<IconProps> = ({ 
  size = 24, 
  className = "",
  strokeWidth = 2 
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M3 7v10a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V7" />
    <path d="M3 7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" />
    <path d="M15 7a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2" />
    <path d="M8 7v10" strokeDasharray="4 2" />
    <path d="M16 7v10" strokeDasharray="4 2" />
    <path d="M5 10h2" />
    <path d="M5 14h2" />
  </svg>
);

export const RefreshIcon: React.FC<IconProps> = ({ 
  size = 24, 
  className = "",
  strokeWidth = 2 
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 12" />
    <path d="M3 3v9h9" />
  </svg>
);

export const CloseIcon: React.FC<IconProps> = ({ 
  size = 24, 
  className = "",
  strokeWidth = 2 
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

export const SendIcon: React.FC<IconProps> = ({ 
  size = 24, 
  className = "",
  strokeWidth = 2 
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="m22 2-7 20-4-9-9-4 20-7z" />
    <path d="M22 2 11 13" />
  </svg>
);

export const AlertIcon: React.FC<IconProps> = ({ 
  size = 24, 
  className = "",
  strokeWidth = 2 
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </svg>
);

export const ClockIcon: React.FC<IconProps> = ({ 
  size = 24, 
  className = "",
  strokeWidth = 2 
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

export const UserIcon: React.FC<IconProps> = ({ 
  size = 24, 
  className = "",
  strokeWidth = 2 
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

export const SeatIcon: React.FC<IconProps> = ({ 
  size = 24, 
  className = "",
  strokeWidth = 2 
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M7 13v-3a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v3" />
    <path d="M5 13h14v4H5z" />
    <path d="M7 17v3" />
    <path d="M17 17v3" />
    <path d="M12 5V9" />
  </svg>
);

export const CheckIcon: React.FC<IconProps> = ({ 
  size = 24, 
  className = "",
  strokeWidth = 2 
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const InfoIcon: React.FC<IconProps> = ({ 
  size = 24, 
  className = "",
  strokeWidth = 2 
}) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

export const PandaAvatar: React.FC<IconProps> = ({ size = 36, className = "" }) => (
  <svg viewBox="0 0 100 100" width={size} height={size} className={`animated-panda-avatar ${className}`}>
    <defs>
      <style>
        {`
          .panda-eye {
            transform-origin: 50% 55%;
            animation: pandaBlink 4s infinite;
          }
          .panda-headset-mic {
            transform-origin: 25% 75%;
            animation: micWobble 2s ease-in-out infinite;
          }
          @keyframes pandaBlink {
            0%, 90%, 100% { transform: scaleY(1); }
            55% { transform: scaleY(0.1); }
          }
          @keyframes micWobble {
            0%, 100% { transform: rotate(0deg); }
            50% { transform: rotate(3deg); }
          }
        `}
      </style>
    </defs>
    <circle cx="28" cy="32" r="12" fill="#1e293b" />
    <circle cx="72" cy="32" r="12" fill="#1e293b" />
    <circle cx="50" cy="55" r="32" fill="#ffffff" />
    <ellipse cx="36" cy="54" rx="9" ry="12" fill="#1e293b" transform="rotate(-15 36 54)" />
    <ellipse cx="64" cy="54" rx="9" ry="12" fill="#1e293b" transform="rotate(15 64 54)" />
    <g className="panda-eye">
      <circle cx="36" cy="52" r="4" fill="#ffffff" />
      <circle cx="37" cy="51" r="1.5" fill="#1e293b" />
      <circle cx="64" cy="52" r="4" fill="#ffffff" />
      <circle cx="63" cy="51" r="1.5" fill="#1e293b" />
    </g>
    <ellipse cx="50" cy="62" rx="4.5" ry="3" fill="#1e293b" />
    <ellipse cx="23" cy="62" rx="5" ry="3.5" fill="#fca5a5" opacity="0.6" />
    <ellipse cx="77" cy="62" rx="5" ry="3.5" fill="#fca5a5" opacity="0.6" />
    <path d="M47 66c1 1.5 2 2 3 2s2-.5 3-2" stroke="#1e293b" strokeWidth="1.5" fill="none" strokeLinecap="round" />
    <path d="M26 30c5-5 12-7 24-7s19 2 24 7l-4 8H30l-4-8z" fill="#1e3a8a" />
    <path d="M24 38c10-2 22-2 32 0l-3 4H27l-3-4z" fill="#1e293b" />
    <circle cx="50" cy="30" r="4" fill="#f59e0b" />
    <path d="M48 30h4v2h-4z" fill="#d97706" />
    <path d="M18 55c0-18 12-30 32-30s32 12 32 30" fill="none" stroke="#475569" strokeWidth="2.5" />
    <rect x="15" y="48" width="5" height="14" rx="2" fill="#0f172a" />
    <rect x="80" y="48" width="5" height="14" rx="2" fill="#0f172a" />
    <g className="panda-headset-mic">
      <path d="M18 58c5 10 15 12 22 10" fill="none" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" />
      <circle cx="41" cy="68" r="2.5" fill="#3b82f6" />
    </g>
  </svg>
);

export default {
  TrainIcon,
  ChatIcon,
  TicketIcon,
  RefreshIcon,
  CloseIcon,
  SendIcon,
  AlertIcon,
  ClockIcon,
  UserIcon,
  SeatIcon,
  CheckIcon,
  InfoIcon,
  PandaAvatar,
};
