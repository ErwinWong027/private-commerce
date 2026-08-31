import assert from "node:assert/strict";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { PAYMENT_CODE_ASSET, QUOTE_SHEET_ASSET } from "../src/server/imageAssets";
import { selectTriggeredImageAsset } from "../src/server/imageTriggers";
import { PresalesRepository } from "../src/server/repository";

const dirs: string[] = [];
before(() => {
  process.env.FOUNDATION_MODEL_API_KEY = "";
  process.env.FOUNDATION_MODEL_VISION_NAME = "";
  process.env.PRESALES_UPLOAD_DIR = path.join(mkdtempSync(path.join(tmpdir(), "presales-imgflow-")), "uploads");
  dirs.push(path.dirname(process.env.PRESALES_UPLOAD_DIR!));
});
after(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

describe("客服发图物料", () => {
  it("报价表与收款码素材存在", () => {
    assert.ok(existsSync(path.join(process.cwd(), "public", "assets", "quote-sheet.png")));
    assert.ok(existsSync(path.join(process.cwd(), "public", "assets", "payment-code.png")));
    assert.equal(QUOTE_SHEET_ASSET, "/assets/quote-sheet.png");
    assert.equal(PAYMENT_CODE_ASSET, "/assets/payment-code.png");
  });
});

describe("发图触发规则(基于真实聊天记录归纳)", () => {
  it("首次问价格发送报价表,已发过则不再发", () => {
    assert.equal(
      selectTriggeredImageAsset({ intent: "pricing", subIntent: "general", sentMediaPaths: [] }),
      QUOTE_SHEET_ASSET,
    );
    assert.equal(
      selectTriggeredImageAsset({ intent: "pricing", subIntent: "general", sentMediaPaths: [QUOTE_SHEET_ASSET] }),
      null,
    );
  });

  it("首次进入付款环节(询问支付方式)发送收款码", () => {
    assert.equal(
      selectTriggeredImageAsset({ intent: "fulfillment_payment", subIntent: "payment_methods", sentMediaPaths: [] }),
      PAYMENT_CODE_ASSET,
    );
    assert.equal(
      selectTriggeredImageAsset({
        intent: "fulfillment_payment", subIntent: "payment_methods", sentMediaPaths: [PAYMENT_CODE_ASSET],
      }),
      null,
    );
  });

  it("物流子意图、其他意图不触发", () => {
    assert.equal(
      selectTriggeredImageAsset({ intent: "fulfillment_payment", subIntent: "delivery_time", sentMediaPaths: [] }),
      null,
    );
    assert.equal(
      selectTriggeredImageAsset({ intent: "authenticity", subIntent: "verify", sentMediaPaths: [] }),
      null,
    );
    assert.equal(
      selectTriggeredImageAsset({ intent: "unknown", subIntent: "general", sentMediaPaths: [] }),
      null,
    );
  });

  it("价格触发优先于付款触发", () => {
    assert.equal(
      selectTriggeredImageAsset({ intent: "pricing", subIntent: "payment_methods", sentMediaPaths: [] }),
      QUOTE_SHEET_ASSET,
    );
  });
});

describe("图片描述接入文本链路", () => {
  it("历史消息映射:有描述用描述,无描述回退 [图片] 标记", async () => {
    const { describeMessageForLlm } = await import("../src/server/conversationService");
    const base = {
      id: "M-1", sessionId: "S-1", sequence: 1, actor: "customer" as const, senderId: null, createdAt: "t",
    };
    assert.equal(describeMessageForLlm({ ...base, content: "这个正品吗", contentType: "text", mediaPath: null, imageDescription: null }), "这个正品吗");
    assert.equal(describeMessageForLlm({ ...base, content: "", contentType: "image", mediaPath: "/api/media/a.png", imageDescription: null }), "[图片]");
    assert.equal(
      describeMessageForLlm({ ...base, content: "", contentType: "image", mediaPath: "/api/media/a.png", imageDescription: "微信支付成功截图,金额 280 元" }),
      "[图片] 微信支付成功截图,金额 280 元",
    );
    assert.equal(
      describeMessageForLlm({ ...base, content: "这个正品吗", contentType: "image", mediaPath: "/api/media/a.png", imageDescription: "孟版杰西卡 7.5mg 包装盒" }),
      "这个正品吗（图片内容：孟版杰西卡 7.5mg 包装盒）",
    );
  });

  it("视觉模型未配置或文件缺失时安全回退", async () => {
    const { describeCustomerImage } = await import("../src/server/imageVision");
    assert.equal(await describeCustomerImage("/api/media/missing.png"), null);
    const { getVisionModelConfig } = await import("../src/server/imageVision");
    assert.equal(await getVisionModelConfig(), null);
  });

  it("图片识别描述可持久化并在消息中返回", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "presales-imgflow-repo-"));
    dirs.push(dir);
    const repo = new PresalesRepository(path.join(dir, "test.db"));
    const message = repo.appendMessage("S-001", "customer", "U-CUSTOMER-001", "", "/api/media/x.png");
    assert.equal(message.imageDescription, null);
    repo.setMessageImageDescription(message.id, "微信支付成功截图,金额 280 元");
    const reloaded = repo.getConversation("S-001")!.messages.at(-1)!;
    assert.equal(reloaded.imageDescription, "微信支付成功截图,金额 280 元");
    repo.close();
  });
});
