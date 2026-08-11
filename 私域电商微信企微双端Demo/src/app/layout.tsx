import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "私域售前双端演示",
  description: "客户微信与客服企业微信协同演示",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
