import { NextResponse } from "next/server";
import { ForbiddenError, requireIdentity, UnauthorizedError } from "@/server/identity";
import { getRepository } from "@/server/repository";

// 重置会清空全部演示数据，属不可逆操作，因此三重保护：
// 1) 生产环境直接当作路由不存在；2) 必须是客服身份；3) 请求体需显式带确认字段。
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "Not Found" }, { status: 404 });
  try {
    requireIdentity(request, { role: "agent" });
    const body = await request.json() as { confirm?: unknown };
    if (body.confirm !== "RESET_DEMO") {
      return NextResponse.json({ error: "需提交 confirm=\"RESET_DEMO\" 以确认重置演示数据" }, { status: 400 });
    }
    return NextResponse.json({ conversation: getRepository().reset() });
  } catch (error) {
    if (error instanceof UnauthorizedError) return NextResponse.json({ error: error.message }, { status: 401 });
    if (error instanceof ForbiddenError) return NextResponse.json({ error: error.message }, { status: 403 });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "请求体必须是 JSON" }, { status: 400 });
    return NextResponse.json({ error: "重置失败" }, { status: 500 });
  }
}
