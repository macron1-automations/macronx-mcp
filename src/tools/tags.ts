import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MacronXClient } from "../client.js";

export function registerTagTools(server: McpServer, client: MacronXClient): void {
  server.tool(
    "list_tags",
    "List all MacronX intelligence tags available for inbox classification and workflow routing.",
    {
      refresh: z
        .boolean()
        .optional()
        .describe("Whether to bypass the in-memory cache and fetch fresh tags from MacronX"),
    },
    async (args) => {
      try {
        const tags = await client.listTags({ refresh: args.refresh });
        return {
          content: [{ type: "text", text: JSON.stringify({ tags }, null, 2) }],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to list tags: ${err.message}` }],
        };
      }
    }
  );
}
