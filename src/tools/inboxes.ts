import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MacronXClient } from "../client.js";

const InlineAttachmentSchema = z.object({
  filename: z.string().describe("Attachment filename with extension (e.g. notes.txt, capture.json)"),
  content_type: z.string().optional().describe("Optional MIME type. Inferred from filename if omitted."),
  data_base64: z.string().optional().describe("Base64-encoded raw file content"),
  text: z.string().optional().describe("Plain text or JSON string content to upload as a file"),
});

export function registerInboxTools(server: McpServer, client: MacronXClient): void {
  // 1. list_inboxes
  server.tool(
    "list_inboxes",
    "List, search, filter, and paginate MacronX inbox items. By default returns active (unarchived) items with compact body previews to conserve context window.",
    {
      status: z
        .enum(["active", "unprocessed", "processed", "archived", "all"])
        .optional()
        .describe("Status filter: 'active' (default, unarchived), 'unprocessed', 'processed', 'archived', or 'all'"),
      tag: z.string().optional().describe("Case-insensitive tag name filter (e.g. 'news-analysis')"),
      source: z.string().optional().describe("Origin identifier substring filter (e.g. 'ios-shortcut', 'ratatui')"),
      query: z.string().optional().describe("Search substring across name, source, summary, and body"),
      has_attachments: z.boolean().optional().describe("Filter items with (true) or without (false) file attachments"),
      since: z.string().optional().describe("ISO 8601 creation timestamp lower bound (e.g. '2026-11-01T00:00:00Z')"),
      until: z.string().optional().describe("ISO 8601 creation timestamp upper bound"),
      sort: z
        .enum(["created_at", "updated_at", "name", "source"])
        .optional()
        .describe("Sort column (default: 'created_at')"),
      direction: z.enum(["asc", "desc"]).optional().describe("Sort direction (default: 'desc')"),
      limit: z
        .number()
        .int()
        .positive()
        .max(100)
        .optional()
        .describe("Max number of items to return (default: 20, max: 100)"),
      offset: z.number().int().min(0).optional().describe("Offset for pagination (default: 0)"),
      include_body: z
        .boolean()
        .optional()
        .describe("Whether to include full body text in list items (default: false, returns body_preview and body_length)"),
      preview_length: z
        .number()
        .int()
        .positive()
        .max(2000)
        .optional()
        .describe("Character length for body_preview when include_body is false (default: 300)"),
      refresh: z
        .boolean()
        .optional()
        .describe("Whether to bypass the in-memory cache and fetch fresh items from MacronX"),
    },
    async (args) => {
      try {
        const result = await client.queryInboxes({
          status: args.status,
          tag: args.tag,
          source: args.source,
          query: args.query,
          has_attachments: args.has_attachments,
          since: args.since,
          until: args.until,
          sort: args.sort,
          direction: args.direction,
          limit: args.limit,
          offset: args.offset,
          include_body: args.include_body,
          preview_length: args.preview_length,
          refresh: args.refresh,
        });

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to list inboxes: ${err.message}` }],
        };
      }
    }
  );

  // 2. get_inbox
  server.tool(
    "get_inbox",
    "Retrieve complete details for a single MacronX inbox entry by numeric ID, including full body, metadata, and attachment download links.",
    {
      id: z.number().int().positive().describe("Numeric ID of the inbox entry"),
    },
    async (args) => {
      try {
        const inbox = await client.getInbox(args.id);
        return {
          content: [{ type: "text", text: JSON.stringify(inbox, null, 2) }],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to get inbox #${args.id}: ${err.message}` }],
        };
      }
    }
  );

  // 3. create_inbox
  server.tool(
    "create_inbox",
    "Ingest a new raw intelligence artifact or note into MacronX. Supports tags, JSON metadata, and file uploads (local files, remote URLs, or inline data). Assigning a tag linked to a MacronX workflow triggers automatic background analysis.",
    {
      name: z.string().optional().describe("Optional display name (auto-generated if omitted)"),
      source: z
        .string()
        .optional()
        .describe("Origin identifier (e.g. 'ios-shortcut', 'agent-scraper'). Defaults to 'macronx-mcp'."),
      summary: z.string().optional().describe("Short human-readable summary of the artifact"),
      body: z.string().optional().describe("Full text content, article body, raw notes, or transcript"),
      tag: z
        .string()
        .optional()
        .describe("Tag name to assign (case-insensitive, e.g. 'news-analysis'). Automatically resolved to tag_id."),
      tag_id: z.number().int().positive().optional().describe("Numeric tag ID to assign directly"),
      payload: z.record(z.unknown()).optional().describe("Arbitrary JSON payload for workflows"),
      metadata: z.record(z.unknown()).optional().describe("Arbitrary JSON metadata for tracking"),
      file_paths: z
        .array(z.string())
        .optional()
        .describe("Array of local file paths on disk to upload as attachments (e.g. ['/path/to/photo.jpg'])"),
      file_urls: z
        .array(z.string().url())
        .optional()
        .describe("Array of remote URLs to download and upload as attachments"),
      inline_attachments: z
        .array(InlineAttachmentSchema)
        .optional()
        .describe("Array of inline attachments with text or base64 data"),
    },
    async (args) => {
      if (client.config.readOnly) {
        return {
          isError: true,
          content: [{ type: "text", text: "Operation rejected: MacronX MCP server is running in read-only mode." }],
        };
      }

      try {
        const created = await client.createInbox({
          name: args.name,
          source: args.source,
          summary: args.summary,
          body: args.body,
          tag: args.tag,
          tag_id: args.tag_id,
          payload: args.payload,
          metadata: args.metadata,
          file_paths: args.file_paths,
          file_urls: args.file_urls,
          inline_attachments: args.inline_attachments,
        });

        return {
          content: [{ type: "text", text: JSON.stringify(created, null, 2) }],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to create inbox entry: ${err.message}` }],
        };
      }
    }
  );

  // 4. archive_inbox
  server.tool(
    "archive_inbox",
    "Archive a processed or reviewed MacronX inbox entry by numeric ID.",
    {
      id: z.number().int().positive().describe("Numeric ID of the inbox entry to archive"),
    },
    async (args) => {
      if (client.config.readOnly) {
        return {
          isError: true,
          content: [{ type: "text", text: "Operation rejected: MacronX MCP server is running in read-only mode." }],
        };
      }

      try {
        const archived = await client.archiveInbox(args.id);
        return {
          content: [{ type: "text", text: JSON.stringify(archived, null, 2) }],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to archive inbox #${args.id}: ${err.message}` }],
        };
      }
    }
  );

  // 5. unarchive_inbox
  server.tool(
    "unarchive_inbox",
    "Restore an archived MacronX inbox entry back to the active inbox by numeric ID.",
    {
      id: z.number().int().positive().describe("Numeric ID of the inbox entry to restore"),
    },
    async (args) => {
      if (client.config.readOnly) {
        return {
          isError: true,
          content: [{ type: "text", text: "Operation rejected: MacronX MCP server is running in read-only mode." }],
        };
      }

      try {
        const restored = await client.unarchiveInbox(args.id);
        return {
          content: [{ type: "text", text: JSON.stringify(restored, null, 2) }],
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to unarchive inbox #${args.id}: ${err.message}` }],
        };
      }
    }
  );
}
