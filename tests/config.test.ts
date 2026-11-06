import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.js";

describe("parseConfig", () => {
  it("parses valid config with defaults", () => {
    const config = parseConfig({
      MACRONX_API_TOKEN: "secret-token",
    });

    expect(config.originUrl).toBe("http://localhost:5000");
    expect(config.apiBaseUrl).toBe("http://localhost:5000/api/v1");
    expect(config.apiToken).toBe("secret-token");
    expect(config.readOnly).toBe(false);
    expect(config.defaultSource).toBe("macronx-mcp");
    expect(config.cacheTtlMs).toBe(10000);
    expect(config.timeoutMs).toBe(30000);
    expect(config.maxAttachmentBytes).toBe(25 * 1024 * 1024);
  });

  it("normalizes custom URLs correctly", () => {
    const config1 = parseConfig({
      MACRONX_API_URL: "https://osint.example.com/",
      MACRONX_API_TOKEN: "tok",
    });
    expect(config1.originUrl).toBe("https://osint.example.com");
    expect(config1.apiBaseUrl).toBe("https://osint.example.com/api/v1");

    const config2 = parseConfig({
      MACRONX_API_URL: "https://osint.example.com/api/v1",
      MACRONX_API_TOKEN: "tok",
    });
    expect(config2.apiBaseUrl).toBe("https://osint.example.com/api/v1");

    const config3 = parseConfig({
      MACRONX_URL: "http://127.0.0.1:3000",
      MACRONX_API_TOKEN: "tok",
    });
    expect(config3.originUrl).toBe("http://127.0.0.1:3000");
    expect(config3.apiBaseUrl).toBe("http://127.0.0.1:3000/api/v1");
  });

  it("throws when MACRONX_API_TOKEN is missing", () => {
    expect(() => parseConfig({})).toThrow(/Missing required environment variable: MACRONX_API_TOKEN/);
  });

  it("parses read-only flags and numeric options", () => {
    const config = parseConfig({
      MACRONX_API_TOKEN: "tok",
      MACRONX_READ_ONLY: "true",
      MACRONX_DEFAULT_SOURCE: "agent-pipeline",
      MACRONX_CACHE_TTL_MS: "5000",
      MACRONX_TIMEOUT_MS: "15000",
      MACRONX_MAX_ATTACHMENT_BYTES: "10485760",
    });

    expect(config.readOnly).toBe(true);
    expect(config.defaultSource).toBe("agent-pipeline");
    expect(config.cacheTtlMs).toBe(5000);
    expect(config.timeoutMs).toBe(15000);
    expect(config.maxAttachmentBytes).toBe(10485760);
  });

  it("throws on malformed URL", () => {
    expect(() =>
      parseConfig({
        MACRONX_API_URL: "not a valid url",
        MACRONX_API_TOKEN: "tok",
      })
    ).toThrow(/Invalid URL format/);
  });
});
