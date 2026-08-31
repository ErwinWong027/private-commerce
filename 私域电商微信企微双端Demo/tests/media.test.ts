import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, describe, it } from "node:test";

const dir = mkdtempSync(path.join(tmpdir(), "presales-media-"));
before(() => { process.env.PRESALES_UPLOAD_DIR = path.join(dir, "uploads"); });
after(() => rmSync(dir, { recursive: true, force: true }));

const PNG_1X1 = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

describe("图片上传与媒体读取", () => {
  it("拒绝非图片上传", async () => {
    const { POST } = await import("../src/app/api/uploads/route");
    const form = new FormData();
    form.append("file", new File([PNG_1X1], "note.txt", { type: "text/plain" }));
    const response = await POST(new Request("http://localhost/api/uploads", { method: "POST", body: form }));
    assert.equal(response.status, 415);
  });

  it("拒绝缺少文件的请求", async () => {
    const { POST } = await import("../src/app/api/uploads/route");
    const response = await POST(new Request("http://localhost/api/uploads", { method: "POST", body: new FormData() }));
    assert.equal(response.status, 400);
  });

  it("上传成功后可按原字节读取，Content-Type 正确", async () => {
    const { POST } = await import("../src/app/api/uploads/route");
    const form = new FormData();
    form.append("file", new File([PNG_1X1], "photo.png", { type: "image/png" }));
    const uploadResponse = await POST(new Request("http://localhost/api/uploads", { method: "POST", body: form }));
    assert.equal(uploadResponse.status, 200);
    const { url } = await uploadResponse.json() as { url: string };
    assert.match(url, /^\/api\/media\/[\w-]+\.png$/);
    const { GET } = await import("../src/app/api/media/[name]/route");
    const name = url.slice(url.lastIndexOf("/") + 1);
    const mediaResponse = await GET(new Request(`http://localhost${url}`), { params: Promise.resolve({ name }) });
    assert.equal(mediaResponse.status, 200);
    assert.equal(mediaResponse.headers.get("content-type"), "image/png");
    assert.deepEqual(new Uint8Array(await mediaResponse.arrayBuffer()), new Uint8Array(PNG_1X1));
  });

  it("拦截路径穿越，不存在的图片返回 404", async () => {
    const { GET } = await import("../src/app/api/media/[name]/route");
    const traversal = await GET(new Request("http://localhost/api/media/../x.png"), { params: Promise.resolve({ name: "../x.png" }) });
    assert.equal(traversal.status, 400);
    const missing = await GET(new Request("http://localhost/api/media/nope.png"), { params: Promise.resolve({ name: "nope.png" }) });
    assert.equal(missing.status, 404);
  });
});
