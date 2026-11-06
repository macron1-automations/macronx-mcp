import fs from "node:fs/promises";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { parseConfig } from "../src/config.js";
import { createMacronXMcpServer } from "../src/server.js";

async function main() {
  const config = parseConfig({
    MACRONX_API_URL: "https://marti-aeromedical-seema.ngrok-free.dev",
    MACRONX_API_TOKEN: "q2DmxSghv86UWPRoSxBUdW2J",
  });

  const server = createMacronXMcpServer(config);
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: "schema-exporter", version: "1.0.0" }, { capabilities: {} });
  await client.connect(clientTransport);

  const res = await client.listTools();
  const outDir = path.resolve(process.env.HOME || "", ".gemini/antigravity/mcp/macronx");
  await fs.mkdir(outDir, { recursive: true });

  for (const tool of res.tools) {
    const filePath = path.join(outDir, `${tool.name}.json`);
    const schema = {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    };
    await fs.writeFile(filePath, JSON.stringify(schema, null, 2));
    console.log(`Generated: ${filePath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
