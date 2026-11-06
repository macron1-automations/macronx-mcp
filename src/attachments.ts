import { promises as fs } from "node:fs";
import * as path from "node:path";
import { PreparedUpload } from "./types.js";

export const EXT_TO_MIME: Record<string, string> = {
  // Images
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".heic": "image/heic",
  ".heif": "image/heif",
  ".avif": "image/avif",
  // Audio
  ".mp3": "audio/mpeg",
  ".m4a": "audio/mp4",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".flac": "audio/flac",
  ".aac": "audio/aac",
  // Video
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  // Text & documents
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".markdown": "text/markdown",
  ".json": "application/json",
  ".jsonl": "application/x-ndjson",
  ".csv": "text/csv",
  ".html": "text/html",
  ".htm": "text/html",
  ".xml": "application/xml",
  ".yaml": "text/yaml",
  ".yml": "text/yaml",
  ".pdf": "application/pdf",
};

export function inferMimeType(filename: string, fallback = "application/octet-stream"): string {
  const ext = path.extname(filename).toLowerCase();
  return EXT_TO_MIME[ext] || fallback;
}

export function isImageMime(mimeType?: string | null, filename?: string | null): boolean {
  if (mimeType && mimeType.toLowerCase().startsWith("image/")) {
    return true;
  }
  if (filename) {
    const ext = path.extname(filename).toLowerCase();
    return [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif", ".heic"].includes(ext);
  }
  return false;
}

export function isTextMime(mimeType?: string | null, filename?: string | null): boolean {
  if (mimeType) {
    const lower = mimeType.toLowerCase();
    if (
      lower.startsWith("text/") ||
      lower.includes("json") ||
      lower.includes("xml") ||
      lower.includes("yaml") ||
      lower.includes("csv") ||
      lower.includes("javascript") ||
      lower.includes("x-ndjson")
    ) {
      return true;
    }
  }
  if (filename) {
    const ext = path.extname(filename).toLowerCase();
    return [".txt", ".md", ".json", ".jsonl", ".csv", ".html", ".xml", ".yaml", ".yml"].includes(ext);
  }
  return false;
}

export async function prepareLocalFile(
  filePath: string,
  maxBytes: number
): Promise<PreparedUpload> {
  const resolvedPath = path.resolve(filePath.trim());

  let stats;
  try {
    stats = await fs.stat(resolvedPath);
  } catch {
    throw new Error(`Local file not found at path: "${filePath}" (resolved to: ${resolvedPath})`);
  }

  if (!stats.isFile()) {
    throw new Error(`Path is not a regular file: "${filePath}"`);
  }

  if (stats.size > maxBytes) {
    throw new Error(
      `File size (${stats.size} bytes) exceeds maximum allowable size of ${maxBytes} bytes: "${filePath}"`
    );
  }

  const buffer = await fs.readFile(resolvedPath);
  const filename = path.basename(resolvedPath);
  const contentType = inferMimeType(filename);

  return {
    filename,
    contentType,
    bytes: new Uint8Array(buffer),
  };
}

export async function prepareRemoteUrl(
  fileUrl: string,
  timeoutMs: number,
  maxBytes: number
): Promise<PreparedUpload> {
  let parsed: URL;
  try {
    parsed = new URL(fileUrl.trim());
  } catch {
    throw new Error(`Invalid URL for remote attachment: "${fileUrl}"`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Unsupported protocol for remote attachment: "${parsed.protocol}" in "${fileUrl}"`);
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
    });

    if (!res.ok) {
      throw new Error(`Failed to download remote attachment (HTTP ${res.status}): "${fileUrl}"`);
    }

    const contentLength = res.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > maxBytes) {
      throw new Error(
        `Remote attachment size (${contentLength} bytes) exceeds maximum limit of ${maxBytes} bytes: "${fileUrl}"`
      );
    }

    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength > maxBytes) {
      throw new Error(
        `Downloaded file size (${arrayBuffer.byteLength} bytes) exceeds maximum limit of ${maxBytes} bytes: "${fileUrl}"`
      );
    }

    let rawFilename = path.basename(parsed.pathname) || "downloaded-file";
    try {
      rawFilename = decodeURIComponent(rawFilename);
    } catch {
      // keep rawFilename
    }

    const headerContentType = res.headers.get("content-type")?.split(";")[0]?.trim();
    const inferred = inferMimeType(rawFilename);
    const contentType = headerContentType || inferred;

    return {
      filename: rawFilename,
      contentType,
      bytes: new Uint8Array(arrayBuffer),
    };
  } catch (err: any) {
    if (err.name === "AbortError") {
      throw new Error(`Remote attachment download timed out after ${timeoutMs}ms: "${fileUrl}"`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export function prepareInlineAttachment(
  input: {
    filename: string;
    content_type?: string;
    data_base64?: string;
    text?: string;
  },
  maxBytes: number
): PreparedUpload {
  const filename = input.filename.trim();
  if (!filename) {
    throw new Error("Inline attachment must specify a filename");
  }

  let bytes: Uint8Array;
  if (input.data_base64 !== undefined) {
    const buffer = Buffer.from(input.data_base64, "base64");
    bytes = new Uint8Array(buffer);
  } else if (input.text !== undefined) {
    const buffer = Buffer.from(input.text, "utf-8");
    bytes = new Uint8Array(buffer);
  } else {
    throw new Error(
      `Inline attachment "${filename}" must provide either data_base64 or text content`
    );
  }

  if (bytes.byteLength > maxBytes) {
    throw new Error(
      `Inline attachment "${filename}" (${bytes.byteLength} bytes) exceeds maximum limit of ${maxBytes} bytes`
    );
  }

  const contentType = input.content_type?.trim() || inferMimeType(filename);

  return {
    filename,
    contentType,
    bytes,
  };
}
