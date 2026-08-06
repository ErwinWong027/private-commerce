import { NextRequest, NextResponse } from "next/server";
import { calculateStandardRefund } from "@/lib/rulesEngine";

interface CalculationRequestBody {
  price?: number;
  hours?: number;
  ticketType?: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CalculationRequestBody;
    const price = Number(body.price);
    const hours = Number(body.hours);

    if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(hours)) {
      return NextResponse.json({ success: false, message: "请输入有效的票价和发车前小时数。" }, { status: 400 });
    }

    const result = calculateStandardRefund(price, hours, false);
    if (hours < 0) {
      return NextResponse.json({ success: true, resultText: "发车后【不可办理退票】。" });
    }

    return NextResponse.json({
      success: true,
      resultText: `计算结果：退票费率：${result.rate * 100}%，应扣退票费：${result.fee.toFixed(1)} 元，实际退回：${(price - result.fee).toFixed(1)} 元。`,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "费率测算失败";
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
