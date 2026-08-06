import "./globals.css";

export const metadata = {
  title: "私域电商售前客服演示中心",
  description: "围绕版本、价格、正品、风险与物流支付场景构建的私域售前客服演示系统。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
