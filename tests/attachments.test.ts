import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  inferMimeType,
  isImageMime,
  isTextMime,
  prepareInlineAttachment,
  prepareLocalFile,
  prepareRemoteUrl,
} from "../src/attachments.js";

describe("attachments helper", () => {
  let tmpDir: string;
  let fetchSpy: any;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "macronx-mcp-test-"));
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(async () => {
    fetchSpy.mockRestore();
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("infers MIME types and classifications correctly", () => {
    expect(inferMimeType("photo.png")).toBe("image/png");
    expect(inferMimeType("signal.m4a")).toBe("audio/mp4");
    expect(inferMimeType("data.csv")).toBe("text/csv");
    expect(inferMimeType("unknown.xyz")).toBe("application/octet-stream");

    expect(isImageMime("image/png", "file.bin")).toBe(true);
    expect(isImageMime(null, "photo.jpg")).toBe(true);
    expect(isImageMime("application/pdf", "file.pdf")).toBe(false);

    expect(isTextMime("application/json", "file.bin")).toBe(true);
    expect(isTextMime(null, "report.md")).toBe(true);
    expect(isTextMime("audio/mp4", "audio.m4a")).toBe(false);
  });

  it("prepares local file upload", async () => {
    const filePath = path.join(tmpDir, "report.txt");
    await fs.writeFile(filePath, "Top Secret Report");

    const upload = await prepareLocalFile(filePath, 1024 * 1024);
    expect(upload.filename).toBe("report.txt");
    expect(upload.contentType).toBe("text/plain");
    expect(new TextDecoder().decode(upload.bytes)).toBe("Top Secret Report");
  });

  it("throws when local file exceeds max bytes", async () => {
    const filePath = path.join(tmpDir, "large.bin");
    await fs.writeFile(filePath, Buffer.alloc(100));

    await expect(prepareLocalFile(filePath, 50)).rejects.toThrow(/exceeds maximum allowable size/);
  });

  it("prepares inline attachments from text and base64", () => {
    const fromText = prepareInlineAttachment(
      { filename: "notes.md", text: "# Notes" },
      1000
    );
    expect(fromText.filename).toBe("notes.md");
    expect(fromText.contentType).toBe("text/markdown");
    expect(new TextDecoder().decode(fromText.bytes)).toBe("# Notes");

    const base64Str = Buffer.from("data bytes").toString("base64");
    const fromB64 = prepareInlineAttachment(
      { filename: "blob.bin", data_base64: base64Str, content_type: "application/octet-stream" },
      1000
    );
    expect(fromB64.filename).toBe("blob.bin");
    expect(fromB64.contentType).toBe("application/octet-stream");
    expect(new TextDecoder().decode(fromB64.bytes)).toBe("data bytes");
  });

  it("prepares remote URL upload", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(new TextEncoder().encode("remote content"), {
        status: 200,
        headers: {
          "Content-Type": "text/plain",
          "Content-Length": "14",
        },
      })
    );

    const upload = await prepareRemoteUrl("https://example.com/brief.txt", 5000, 1000);
    expect(upload.filename).toBe("brief.txt");
    expect(upload.contentType).toBe("text/plain");
    expect(new TextDecoder().decode(upload.bytes)).toBe("remote content");
  });
});
