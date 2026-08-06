'use client';

import { useEffect, useRef } from 'react';
import Script from 'next/script';

declare global {
  interface Window {
    mermaid?: {
      initialize: (config: Record<string, unknown>) => void;
      run: (opts?: { nodes?: Element[] }) => Promise<void>;
    };
  }
}

interface DocRendererProps {
  styles: string;
  body: string;
  hasMermaid: boolean;
}

function runMermaid() {
  const mermaid = window.mermaid;
  if (!mermaid) return;
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>('pre.mermaid:not([data-processed="true"])')
  );
  if (nodes.length === 0) return;
  nodes.forEach((n) => {
    n.textContent = n.textContent?.trim() ?? '';
  });
  mermaid.initialize({
    startOnLoad: false,
    theme: 'base',
    securityLevel: 'loose',
    fontFamily:
      '"PingFang SC","Hiragino Sans GB","Microsoft YaHei",system-ui,sans-serif',
    flowchart: {
      useMaxWidth: false,
      htmlLabels: true,
      curve: 'basis',
      diagramPadding: 20,
      rankSpacing: 65,
      nodeSpacing: 40,
    },
    themeVariables: {
      primaryColor: '#dbeafe',
      primaryTextColor: '#1e3a8a',
      primaryBorderColor: '#3b82f6',
      lineColor: '#9ca3af',
      secondaryColor: '#dcfce7',
      tertiaryColor: '#f3e8ff',
      clusterBkg: '#f9fafb',
      clusterBorder: '#e5e7eb',
      edgeLabelBackground: '#ffffff',
      fontSize: '14px',
    },
  });
  mermaid.run({ nodes });
}

export default function DocRenderer({ styles, body, hasMermaid }: DocRendererProps) {
  const styleRef = useRef<HTMLStyleElement | null>(null);

  useEffect(() => {
    if (!styles) return;
    const el = document.createElement('style');
    el.setAttribute('data-doc-renderer', 'true');
    el.textContent = styles;
    document.head.appendChild(el);
    styleRef.current = el;
    return () => {
      if (styleRef.current && document.head.contains(styleRef.current)) {
        document.head.removeChild(styleRef.current);
        styleRef.current = null;
      }
    };
  }, [styles]);

  useEffect(() => {
    if (!hasMermaid) return;
    const timer = setTimeout(() => {
      if (window.mermaid) {
        runMermaid();
      }
    }, 50);
    return () => clearTimeout(timer);
  }, [body, hasMermaid]);

  return (
    <>
      <div
        className="doc-renderer-body"
        dangerouslySetInnerHTML={{ __html: body }}
      />

      {hasMermaid && (
        <Script
          id="mermaid-cdn"
          src="https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.min.js"
          strategy="afterInteractive"
          onLoad={runMermaid}
        />
      )}
    </>
  );
}
