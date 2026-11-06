import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMacronXMcpServer } from "../src/server.js";

describe("MacronXMcpServer", () => {
  let client: Client;
  let fetchSpy: any;

  beforeEach(async () => {
    fetchSpy = vi.spyOn(globalThis, "fetch");

    const server = createMacronXMcpServer({
      originUrl: "http://localhost:5000",
      apiBaseUrl: "http://localhost:5000/api/v1",
      apiToken: "test-token",
      readOnly: false,
      defaultSource: "macronx-mcp",
      cacheTtlMs: 10000,
      timeoutMs: 5000,
      maxAttachmentBytes: 10485760,
    });

    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);

    client = new Client({ name: "test-client", version: "1.0.0" }, { capabilities: {} });
    await client.connect(clientTransport);
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  it("registers all expected tools, resources, and prompts", async () => {
    const toolsRes = await client.listTools();
    const toolNames = toolsRes.tools.map((t) => t.name);
    expect(toolNames).toContain("list_inboxes");
    expect(toolNames).toContain("get_inbox");
    expect(toolNames).toContain("create_inbox");
    expect(toolNames).toContain("archive_inbox");
    expect(toolNames).toContain("unarchive_inbox");
    expect(toolNames).toContain("list_tags");
    expect(toolNames).toContain("get_inbox_attachment");
    expect(toolNames.length).toBe(7);

    const resList = await client.listResources();
    const uris = resList.resources.map((r) => r.uri);
    expect(uris).toContain("macronx://tags");
    expect(uris).toContain("macronx://inboxes");
    expect(uris).toContain("macronx://inboxes/unprocessed");
    expect(uris).toContain("macronx://inboxes/processed");

    const promptsList = await client.listPrompts();
    const promptNames = promptsList.prompts.map((p) => p.name);
    expect(promptNames).toContain("synthesize_intelligence_brief");
    expect(promptNames).toContain("triage_inbox");
    expect(promptNames.length).toBe(2);
  });

  it("calls list_tags tool", async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          { id: 1, name: "OSINT", color: "#00f", created_at: "2026-01-01", updated_at: "2026-01-01" },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const result: any = await client.callTool({
      name: "list_tags",
      arguments: {},
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.tags).toHaveLength(1);
    expect(parsed.tags[0].name).toBe("OSINT");
  });

  it("calls create_inbox with tag name resolution", async () => {
    // 1st fetch: listTags for tag resolution
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify([
          { id: 7, name: "Cyber", color: "#f00", created_at: "", updated_at: "" },
        ]),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    // 2nd fetch: POST /api/v1/inboxes
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 101,
          name: "IOC Intel",
          source: "macronx-mcp",
          summary: "C2 servers discovered",
          body: "IP list...",
          tag: "Cyber",
          metadata: { severity: "high" },
          attachments: [],
          processed: false,
          archived: false,
          created_at: "2026-11-05T00:00:00Z",
          updated_at: "2026-11-05T00:00:00Z",
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      )
    );

    const result: any = await client.callTool({
      name: "create_inbox",
      arguments: {
        summary: "C2 servers discovered",
        body: "IP list...",
        tag: "Cyber",
        metadata: { severity: "high" },
      },
    });

    expect(result.isError).toBeFalsy();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.id).toBe(101);
    expect(parsed.tag).toBe("Cyber");

    // Inspect fetch call body
    const postCall = fetchSpy.mock.calls[1];
    expect(postCall[0]).toBe("http://localhost:5000/api/v1/inboxes");
    const sentBody = JSON.parse(postCall[1].body);
    expect(sentBody.inbox.tag_id).toBe(7);
    expect(sentBody.inbox.source).toBe("macronx-mcp");
  });

  it("calls get_inbox_attachment for an image and returns native MCP image content", async () => {
    // 1st fetch: GET /api/v1/inboxes/10
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 10,
          name: "Drone Imagery",
          attachments: [
            {
              id: 99,
              filename: "target.jpg",
              content_type: "image/jpeg",
              byte_size: 4,
              url: "/rails/active_storage/blobs/99/target.jpg",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    // 2nd fetch: blob download
    const rawImageBytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    fetchSpy.mockResolvedValueOnce(
      new Response(rawImageBytes, {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      })
    );

    const result: any = await client.callTool({
      name: "get_inbox_attachment",
      arguments: {
        inbox_id: 10,
        attachment_id: 99,
      },
    });

    expect(result.isError).toBeFalsy();
    expect(result.content[0].type).toBe("image");
    expect(result.content[0].mimeType).toBe("image/jpeg");
    expect(result.content[0].data).toBe(Buffer.from(rawImageBytes).toString("base64"));
  });

  it("enforces read-only mode on mutating tools", async () => {
    const readOnlyServer = createMacronXMcpServer({
      originUrl: "http://localhost:5000",
      apiBaseUrl: "http://localhost:5000/api/v1",
      apiToken: "test-token",
      readOnly: true,
      defaultSource: "macronx-mcp",
      cacheTtlMs: 10000,
      timeoutMs: 5000,
      maxAttachmentBytes: 10485760,
    });

    const [roClientTransport, roServerTransport] = InMemoryTransport.createLinkedPair();
    await readOnlyServer.connect(roServerTransport);

    const roClient = new Client({ name: "ro-client", version: "1.0.0" }, { capabilities: {} });
    await roClient.connect(roClientTransport);

    const createRes: any = await roClient.callTool({
      name: "create_inbox",
      arguments: { summary: "Blocked test" },
    });
    expect(createRes.isError).toBe(true);
    expect(createRes.content[0].text).toContain("read-only mode");

    const archiveRes: any = await roClient.callTool({
      name: "archive_inbox",
      arguments: { id: 1 },
    });
    expect(archiveRes.isError).toBe(true);
    expect(archiveRes.content[0].text).toContain("read-only mode");
  });
});
