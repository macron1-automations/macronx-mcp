import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MacronXClient } from "../src/client.js";
import { parseConfig } from "../src/config.js";

describe("MacronXClient", () => {
  let client: MacronXClient;
  let fetchSpy: any;

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, "fetch");
    const config = parseConfig({
      MACRONX_API_URL: "http://localhost:5000",
      MACRONX_API_TOKEN: "test-token",
      MACRONX_CACHE_TTL_MS: "5000",
    });
    client = new MacronXClient(config);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("normalizes attachment relative URLs", () => {
    expect(client.resolveUrl("/rails/active_storage/blobs/123/file.jpg")).toBe(
      "http://localhost:5000/rails/active_storage/blobs/123/file.jpg"
    );
    expect(client.resolveUrl("https://s3.amazonaws.com/bucket/file.jpg")).toBe(
      "https://s3.amazonaws.com/bucket/file.jpg"
    );
  });

  it("caches inboxes and respects TTL and refresh option", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            id: 1,
            name: "Item 1",
            source: "api",
            summary: "Sum 1",
            body: "Body 1",
            tag: "News",
            metadata: {},
            attachments: [],
            processed: false,
            archived: false,
            created_at: "2026-11-01T00:00:00Z",
            updated_at: "2026-11-01T00:00:00Z",
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const first = await client.listInboxes();
    expect(first.length).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Second call without refresh should use cache
    const second = await client.listInboxes();
    expect(second.length).toBe(1);
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Third call with refresh should hit fetch
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify([]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    const third = await client.listInboxes({ refresh: true });
    expect(third.length).toBe(0);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("resolves tag names to IDs with cache and refresh on miss", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          { id: 10, name: "OSINT", color: "#blue", created_at: "", updated_at: "" },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const id1 = await client.resolveTagId("osint");
    expect(id1).toBe(10);

    // Test miss triggering refresh
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          { id: 10, name: "OSINT", color: "#blue", created_at: "", updated_at: "" },
          { id: 20, name: "Cyber", color: "#red", created_at: "", updated_at: "" },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const id2 = await client.resolveTagId("cyber");
    expect(id2).toBe(20);
  });

  it("filters and paginates in queryInboxes with body previews", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          {
            id: 1,
            name: "Satellite Recon",
            source: "imint-feed",
            summary: "New airfield",
            body: "Long body text describing runway construction in detail.",
            tag: "IMINT",
            metadata: {},
            attachments: [{ id: 1, filename: "pass.jpg", content_type: "image/jpeg", byte_size: 100, url: "/pass.jpg" }],
            processed: false,
            archived: false,
            created_at: "2026-11-02T10:00:00Z",
            updated_at: "2026-11-02T10:00:00Z",
          },
          {
            id: 2,
            name: "News Digest",
            source: "rss",
            summary: "Energy sector",
            body: "Short body",
            tag: "News",
            metadata: {},
            attachments: [],
            processed: true,
            archived: false,
            created_at: "2026-11-01T10:00:00Z",
            updated_at: "2026-11-01T10:00:00Z",
          },
          {
            id: 3,
            name: "Old Note",
            source: "phone",
            summary: "Old",
            body: "Archived content",
            tag: "Notes",
            metadata: {},
            attachments: [],
            processed: true,
            archived: true,
            created_at: "2026-10-31T10:00:00Z",
            updated_at: "2026-10-31T10:00:00Z",
          },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    // Active items (default: not archived)
    const resActive = await client.queryInboxes();
    expect(resActive.counts.unprocessed).toBe(1);
    expect(resActive.counts.processed).toBe(1);
    expect(resActive.counts.archived).toBe(1);
    expect(resActive.counts.total).toBe(3);
    expect(resActive.total_matched).toBe(2);
    expect(resActive.inboxes.length).toBe(2);
    // Body should be truncated to body_preview by default
    expect((resActive.inboxes[0] as any).body_preview).toBeDefined();
    expect((resActive.inboxes[0] as any).body).toBeUndefined();

    // Query filter for tag
    const resTag = await client.queryInboxes({ tag: "imint" });
    expect(resTag.total_matched).toBe(1);
    expect(resTag.inboxes[0].id).toBe(1);

    // Full body include
    const resFull = await client.queryInboxes({ status: "all", include_body: true });
    expect(resFull.total_matched).toBe(3);
    expect((resFull.inboxes[0] as any).body).toBeDefined();
  });

  it("handles origin-safe download redirects", async () => {
    // 1st request to MacronX origin returns redirect to S3
    fetchSpy.mockImplementation(async (url: string, opts: any) => {
      if (url.includes("localhost:5000/rails/active_storage")) {
        expect(opts.headers["Authorization"]).toBe("Bearer test-token");
        return new Response(null, {
          status: 302,
          headers: { Location: "https://s3.amazonaws.com/bucket/intel.pdf" },
        });
      } else if (url.includes("s3.amazonaws.com")) {
        // Critical security check: Authorization header MUST NOT be sent to s3
        expect(opts.headers["Authorization"]).toBeUndefined();
        return new Response(new TextEncoder().encode("PDF content"), {
          status: 200,
          headers: { "Content-Type": "application/pdf" },
        });
      }
      throw new Error(`Unexpected URL: ${url}`);
    });

    const res = await client.downloadAttachment("/rails/active_storage/blob/123");
    expect(res.contentType).toBe("application/pdf");
    expect(new TextDecoder().decode(res.bytes)).toBe("PDF content");
  });
});
