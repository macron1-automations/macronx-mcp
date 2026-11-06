import { promises as fs } from "node:fs";
import * as path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { isImageMime, isTextMime } from "../attachments.js";
import { MacronXClient } from "../client.js";

export function registerAttachmentTools(server: McpServer, client: MacronXClient): void {
  server.tool(
    "get_inbox_attachment",
    "Inspect, read, or download a file attachment from an inbox entry (e.g. IMINT imagery, audio intercept, PDF, or text). Returns native MCP image content for visual models, inline text for documents, or saves binary assets directly to disk.",
    {
      inbox_id: z.number().int().positive().describe("Numeric ID of the inbox entry"),
      attachment_id: z.number().int().positive().optional().describe("Numeric ID of the attachment"),
      filename: z.string().optional().describe("Filename to match if attachment_id is not specified"),
      save_to_path: z
        .string()
        .optional()
        .describe("Optional local file path to write the downloaded bytes to on disk"),
    },
    async (args) => {
      try {
        if (!args.attachment_id && !args.filename) {
          throw new Error("Must provide either attachment_id or filename to locate the attachment.");
        }

        const inbox = await client.getInbox(args.inbox_id);
        const attachments = inbox.attachments || [];

        if (attachments.length === 0) {
          throw new Error(`Inbox #${args.inbox_id} has no file attachments.`);
        }

        let target = attachments.find((a) => {
          if (args.attachment_id && a.id === args.attachment_id) return true;
          if (args.filename && a.filename.toLowerCase() === args.filename.toLowerCase()) return true;
          return false;
        });

        if (!target && args.filename) {
          target = attachments.find((a) =>
            a.filename.toLowerCase().includes(args.filename!.toLowerCase())
          );
        }

        if (!target) {
          const names = attachments.map((a) => `"${a.filename}" (id: ${a.id})`).join(", ");
          throw new Error(
            `Attachment not found in inbox #${args.inbox_id}. Available attachments: ${names}`
          );
        }

        const download = await client.downloadAttachment(target.url);
        const effectiveContentType = target.content_type || download.contentType;

        let savedPath: string | undefined;
        if (args.save_to_path) {
          const resolvedPath = path.resolve(args.save_to_path.trim());
          await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
          await fs.writeFile(resolvedPath, download.bytes);
          savedPath = resolvedPath;
        }

        const metadata = {
          attachment_id: target.id,
          filename: target.filename,
          content_type: effectiveContentType,
          byte_size: download.bytes.byteLength,
          download_url: target.url,
          inbox_id: inbox.id,
          saved_to_path: savedPath || null,
        };

        const contents: any[] = [];

        if (isImageMime(effectiveContentType, target.filename)) {
          const base64Data = Buffer.from(download.bytes).toString("base64");
          contents.push({
            type: "image",
            data: base64Data,
            mimeType: effectiveContentType.startsWith("image/") ? effectiveContentType : "image/jpeg",
          });
          contents.push({
            type: "text",
            text: JSON.stringify({ status: "success", metadata }, null, 2),
          });
        } else if (isTextMime(effectiveContentType, target.filename)) {
          const textContent = Buffer.from(download.bytes).toString("utf-8");
          contents.push({
            type: "text",
            text: textContent,
          });
          contents.push({
            type: "text",
            text: JSON.stringify({ status: "success", metadata }, null, 2),
          });
        } else {
          contents.push({
            type: "text",
            text: JSON.stringify(
              {
                status: "success",
                message: savedPath
                  ? `Binary attachment saved to disk at ${savedPath}`
                  : "Binary attachment downloaded successfully. Specify 'save_to_path' to write to disk.",
                metadata,
              },
              null,
              2
            ),
          });
        }

        return {
          content: contents,
        };
      } catch (err: any) {
        return {
          isError: true,
          content: [{ type: "text", text: `Failed to get attachment: ${err.message}` }],
        };
      }
    }
  );
}
