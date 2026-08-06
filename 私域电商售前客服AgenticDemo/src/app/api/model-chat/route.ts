import { NextRequest, NextResponse } from "next/server";
import { createModelChatStream, ModelChatMessage, normalizeModelServiceError } from "@/lib/modelChatClient";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const history = Array.isArray(body?.messages) ? body.messages : [];
    const messages = history.filter(isValidModelChatMessage) as ModelChatMessage[];

    const { response, configLabel } = await createModelChatStream(messages);
    const upstreamReader = response.body?.getReader();
    if (!upstreamReader) {
      return NextResponse.json({ success: false, message: "无法读取上游流式响应。" }, { status: 502 });
    }

    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "meta", model: configLabel })}\n\n`));
        let buffer = "";

        try {
          while (true) {
            const { value, done } = await upstreamReader.read();
            if (done) {
              break;
            }

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || !trimmed.startsWith("data:")) {
                continue;
              }
              const payload = trimmed.slice(5).trim();
              if (payload === "[DONE]") {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
                controller.close();
                return;
              }

              try {
                const parsed = JSON.parse(payload) as {
                  choices?: Array<{ delta?: { content?: string } }>;
                };
                const chunk = parsed.choices?.[0]?.delta?.content;
                if (chunk) {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "chunk", text: chunk })}\n\n`));
                }
              } catch {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "error", message: "上游返回了无法解析的流式数据。", code: "STREAM_PARSE_ERROR" })}\n\n`,
                  ),
                );
              }
            }
          }

          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
          controller.close();
        } catch (error) {
          const mapped = normalizeModelServiceError(error);
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", ...mapped })}\n\n`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    const mapped = normalizeModelServiceError(error);
    return NextResponse.json({ success: false, ...mapped }, { status: mapped.status });
  }
}

function isValidModelChatMessage(value: unknown): value is ModelChatMessage {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.role === "system" || candidate.role === "user" || candidate.role === "assistant") &&
    typeof candidate.content === "string"
  );
}
