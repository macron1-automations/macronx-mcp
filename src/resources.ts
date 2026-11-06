import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MacronXClient } from "./client.js";

export function registerResources(server: McpServer, client: MacronXClient): void {
  // 1. Tags dictionary
  server.resource(
    "tags",
    "macronx://tags",
    {
      description: "Live list of all MacronX intelligence tags and classifications.",
      mimeType: "application/json",
    },
    async (uri) => {
      const tags = await client.listTags();
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify({ tags }, null, 2),
          },
        ],
      };
    }
  );

  // 2. Active inboxes feed
  server.resource(
    "inboxes",
    "macronx://inboxes",
    {
      description: "Active (unarchived) MacronX inbox items summary feed and status counts.",
      mimeType: "application/json",
    },
    async (uri) => {
      const result = await client.queryInboxes({ status: "active", limit: 50 });
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  // 3. Unprocessed raw artifacts feed
  server.resource(
    "unprocessed-inboxes",
    "macronx://inboxes/unprocessed",
    {
      description: "Unprocessed, unarchived raw OSINT signals awaiting analyst triage or workflow execution.",
      mimeType: "application/json",
    },
    async (uri) => {
      const result = await client.queryInboxes({ status: "unprocessed", limit: 50 });
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  // 4. Processed intelligence briefs feed
  server.resource(
    "processed-inboxes",
    "macronx://inboxes/processed",
    {
      description: "AI-processed intelligence reports, narrative assessments, and transcripts awaiting review.",
      mimeType: "application/json",
    },
    async (uri) => {
      const result = await client.queryInboxes({ status: "processed", limit: 50 });
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    }
  );

  // 5. Single inbox item template by ID
  server.resource(
    "inbox-by-id",
    new ResourceTemplate("macronx://inboxes/{id}", { list: undefined }),
    {
      description: "Complete MacronX inbox record including full body, metadata, and attachment download links.",
      mimeType: "application/json",
    },
    async (uri, { id }) => {
      const rawId = Array.isArray(id) ? id[0] : id;
      const numId = parseInt(String(rawId), 10);
      if (isNaN(numId) || numId <= 0) {
        throw new Error(`Invalid inbox ID in resource URI: "${rawId}"`);
      }

      const inbox = await client.getInbox(numId);
      return {
        contents: [
          {
            uri: uri.href,
            mimeType: "application/json",
            text: JSON.stringify(inbox, null, 2),
          },
        ],
      };
    }
  );
}
