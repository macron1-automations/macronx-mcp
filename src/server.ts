import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MacronXClient } from "./client.js";
import { MacronXConfig } from "./config.js";
import { registerPrompts } from "./prompts.js";
import { registerResources } from "./resources.js";
import { registerAttachmentTools } from "./tools/attachments.js";
import { registerInboxTools } from "./tools/inboxes.js";
import { registerTagTools } from "./tools/tags.js";

export function createMacronXMcpServer(config: MacronXConfig): McpServer {
  const client = new MacronXClient(config);

  const server = new McpServer({
    name: "macronx-mcp",
    version: "1.0.0",
  });

  registerInboxTools(server, client);
  registerTagTools(server, client);
  registerAttachmentTools(server, client);
  registerResources(server, client);
  registerPrompts(server, client);

  return server;
}
