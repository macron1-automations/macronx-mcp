import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { parseConfig } from "../src/config.js";
import { createMacronXMcpServer } from "../src/server.js";

async function main() {
  const config = parseConfig(process.env);
  const server = createMacronXMcpServer(config);

  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);

  const client = new Client({ name: "live-tester", version: "1.0.0" }, { capabilities: {} });
  await client.connect(clientTransport);

  console.log("=== Testing list_tags ===");
  const tagsRes = await client.callTool({ name: "list_tags", arguments: {} });
  console.log(tagsRes.content[0].text);

  console.log("=== Testing list_inboxes (limit 2) ===");
  const inboxesRes = await client.callTool({ name: "list_inboxes", arguments: { limit: 2 } });
  console.log(inboxesRes.content[0].text);

  console.log("=== Testing resource macronx://tags ===");
  const resTags = await client.readResource({ uri: "macronx://tags" });
  console.log(resTags.contents[0].text);
}

main().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
