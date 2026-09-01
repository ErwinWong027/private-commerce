import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";
import { IDENTITY_HEADER, issueIdentityToken, signMediaName } from "../src/server/identity";

const dir = mkdtempSync(path.join(tmpdir(), "presales-media-"));
before(() => { process.env.PRESALES_UPLOAD_DIR = path.join(dir, "uploads"); });
after(() => rmSync(dir, { recursive: true, force: true }));

const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const CUSTOMER_TOKEN = issueIdentityToken({ userId: "U-CUSTOMER-001", role: "customer" });

function upload(body: FormData, token: string | null = CUSTOMER_TOKEN) {
  const headers = token ? { [IDENTITY_HEADER]: token } : undefined;
  return new Request("http://localhost/api/uploads", { method: "POST", headers, body });
}

describe("图片上传与媒体读取", () => {
  it("未登录上传返回 401", async () => {
    const { POST } = await import("../src/app/api/uploads/route");
    const form = new FormData();
    form.append("file", new File([PNG_1X1], "photo.png", { type: "image/png" }));
    const response = await POST(upload(form, null));
    assert.equal(response.status, 401);
  });

  it("按魔数判定类型：伪装成 text/plain 的真实 PNG 仍可上传", async () => {
    const { POST } = await import("../src/app/api/uploads/route");
    const form = new FormData();
    form.append("file", new File([PNG_1X1], "note.txt", { type: "text/plain" }));
    const response = await POST(upload(form));
    assert.equal(response.status, 200);
    const { url } = await response.json() as { url: string };
    assert.match(url, /\.png\?sig=/);
  });

  it("拒绝伪装成 image/png 的非图片内容", async () => {
    const { POST } = await import("../src/app/api/uploads/route");
    const form = new FormData();
    form.append("file", new File([Buffer.from("plain text content")], "photo.png", { type: "image/png" }));
    const response = await POST(upload(form));
    assert.equal(response.status, 415);
  });

  it("拒绝缺少文件的请求", async () => {
    const { POST } = await import("../src/app/api/uploads/route");
    const response = await POST(upload(new FormData()));
    assert.equal(response.status, 400);
  });

  it("上传语音后可按原字节读取，Content-Type 正确", async () => {
    const { POST } = await import("../src/app/api/uploads/route");
    const form = new FormData();
    form.append("file", new File([Buffer.from("ID3demo-audio")], "voice.mp3", { type: "audio/mpeg" }));
    const uploadResponse = await POST(upload(form));
    assert.equal(uploadResponse.status, 200);
    const { url } = await uploadResponse.json() as { url: string };
    assert.match(url, /^\/api\/media\/[\w-]+\.mp3\?sig=[\w-]+$/);
    const { GET } = await import("../src/app/api/media/[name]/route");
    const name = url.slice(url.lastIndexOf("/") + 1, url.indexOf("?"));
    const mediaResponse = await GET(new Request(`http://localhost${url}`), { params: Promise.resolve({ name }) });
    assert.equal(mediaResponse.status, 200);
    assert.equal(mediaResponse.headers.get("content-type"), "audio/mpeg");
    assert.deepEqual(new Uint8Array(await mediaResponse.arrayBuffer()), new Uint8Array(Buffer.from("ID3demo-audio")));
  });

  it("拦截路径穿越，不存在的图片返回 404", async () => {
    const { GET } = await import("../src/app/api/media/[name]/route");
    const traversalSig = signMediaName("../x.png");
    const traversal = await GET(new Request(`http://localhost/api/media/../x.png?sig=${traversalSig}`), { params: Promise.resolve({ name: "../x.png" }) });
    assert.equal(traversal.status, 400);
    const missingSig = signMediaName("nope.png");
    const missing = await GET(new Request(`http://localhost/api/media/nope.png?sig=${missingSig}`), { params: Promise.resolve({ name: "nope.png" }) });
    assert.equal(missing.status, 404);
  });
});
