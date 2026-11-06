export interface MacronXConfig {
  originUrl: string;
  apiBaseUrl: string;
  apiToken: string;
  readOnly: boolean;
  defaultSource: string;
  cacheTtlMs: number;
  timeoutMs: number;
  maxAttachmentBytes: number;
}

const DEFAULT_MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024; // 25 MB
const DEFAULT_TIMEOUT_MS = 30000;
const DEFAULT_CACHE_TTL_MS = 10000;
const DEFAULT_SOURCE = "macronx-mcp";
const DEFAULT_URL = "http://localhost:5000";

export function parseConfig(env: NodeJS.ProcessEnv = process.env): MacronXConfig {
  const rawUrl = (env.MACRONX_API_URL || env.MACRONX_URL || DEFAULT_URL).trim();

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`Invalid URL format in MACRONX_API_URL: "${rawUrl}"`);
  }

  const originUrl = parsed.origin;
  let pathname = parsed.pathname.replace(/\/+$/, "");
  if (!pathname.endsWith("/api/v1")) {
    pathname = `${pathname}/api/v1`.replace(/\/+/g, "/");
  }
  const apiBaseUrl = `${originUrl}${pathname}`;

  const apiToken = env.MACRONX_API_TOKEN?.trim();
  if (!apiToken) {
    throw new Error(
      "Missing required environment variable: MACRONX_API_TOKEN. Generate or copy your API token from MacronX (/settings/api_token)."
    );
  }

  const readOnly = env.MACRONX_READ_ONLY === "true" || env.MACRONX_READ_ONLY === "1";
  const defaultSource = env.MACRONX_DEFAULT_SOURCE?.trim() || DEFAULT_SOURCE;

  const rawTimeout = env.MACRONX_TIMEOUT_MS ? parseInt(env.MACRONX_TIMEOUT_MS, 10) : NaN;
  const timeoutMs = isNaN(rawTimeout) || rawTimeout <= 0 ? DEFAULT_TIMEOUT_MS : rawTimeout;

  const rawTtl = env.MACRONX_CACHE_TTL_MS ? parseInt(env.MACRONX_CACHE_TTL_MS, 10) : NaN;
  const cacheTtlMs = isNaN(rawTtl) || rawTtl < 0 ? DEFAULT_CACHE_TTL_MS : rawTtl;

  const rawMaxBytes = env.MACRONX_MAX_ATTACHMENT_BYTES ? parseInt(env.MACRONX_MAX_ATTACHMENT_BYTES, 10) : NaN;
  const maxAttachmentBytes = isNaN(rawMaxBytes) || rawMaxBytes <= 0 ? DEFAULT_MAX_ATTACHMENT_BYTES : rawMaxBytes;

  return {
    originUrl,
    apiBaseUrl,
    apiToken,
    readOnly,
    defaultSource,
    cacheTtlMs,
    timeoutMs,
    maxAttachmentBytes,
  };
}
