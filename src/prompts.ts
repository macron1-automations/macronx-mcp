import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { MacronXClient } from "./client.js";
import { InboxStatusFilter } from "./types.js";

export function registerPrompts(server: McpServer, client: MacronXClient): void {
  // 1. synthesize_intelligence_brief
  server.prompt(
    "synthesize_intelligence_brief",
    "Synthesize recent MacronX intelligence inbox items into an Executive Intelligence Brief (EIB) with BLUF, cross-sector analysis, and actionable takeaways.",
    {
      tag: z.string().optional().describe("Optional tag filter (e.g. 'news-analysis', 'x-trends')"),
      status: z
        .enum(["active", "unprocessed", "processed", "archived", "all"])
        .optional()
        .describe("Status filter (default: 'processed')"),
      since: z.string().optional().describe("ISO 8601 creation date lower bound"),
      limit: z.string().optional().describe("Maximum items to include (default: '15')"),
    },
    async (args) => {
      const numLimit = args.limit ? parseInt(args.limit, 10) : 15;
      const status = (args.status as InboxStatusFilter) || "processed";

      let itemsText = "";
      try {
        const queryRes = await client.queryInboxes({
          status,
          tag: args.tag,
          since: args.since,
          limit: isNaN(numLimit) ? 15 : numLimit,
          include_body: true,
        });

        itemsText = queryRes.inboxes
          .map((item: any) => {
            const bodyPreview = item.body
              ? item.body.length > 2000
                ? `${item.body.slice(0, 2000)}... [truncated]`
                : item.body
              : "(No body text)";
            return `### [Inbox #${item.id}] ${item.name}
- **Source**: ${item.source || "unknown"}
- **Tag**: ${item.tag || "untagged"}
- **Created**: ${item.created_at}
- **Summary**: ${item.summary || "none"}
- **Attachments**: ${item.attachments?.length || 0}
- **Body**:
${bodyPreview}`;
          })
          .join("\n\n---\n\n");
      } catch (err: any) {
        itemsText = `(Failed to pre-fetch inbox items: ${err.message}. Please use list_inboxes to query directly.)`;
      }

      const promptText = `You are a Senior Open-Source Intelligence (OSINT) Analyst.
Your mandate is to synthesize the provided MacronX intelligence items into a strategic Executive Intelligence Brief (EIB) for high-level decision makers.

### Operating Guidelines:
1. Do not merely list or summarize individual articles or items.
2. Synthesize trends across multiple signals, noting cross-sector intersections (e.g., geopolitics x critical tech, cyber threats x supply chain).
3. Always cite specific sources using their item identifier (e.g., "[Inbox #12]").
4. Never use nested or multi-level bullet points. Keep each point self-contained and scannable.

### Intel Payload:
${itemsText}

### Output Structure:
# EXECUTIVE INTELLIGENCE BRIEF (EIB)

## 1. BLUF (Bottom Line Up Front)
- Provide 4-5 concise, high-impact bullet points summarizing immediate situational awareness.

## 2. Cross-Sector Synthesis
- Write 2-3 analytical paragraphs explaining how disparate data points connect and affect strategic posture.

## 3. Emerging Threats & Strategic Opportunities
- Bulleted observations detailing cyber, geopolitical, technical, or economic developments.

## 4. Recommended Inquiries & Follow-up Actions
- Concrete next steps for collection, monitoring, or further OSINT investigation.`;

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: promptText,
            },
          },
        ],
      };
    }
  );

  // 2. triage_inbox
  server.prompt(
    "triage_inbox",
    "Review active MacronX inbox items, surface high-priority signals, recommend tag classifications, and suggest items ready for archiving.",
    {
      tag: z.string().optional().describe("Optional tag filter to narrow triage"),
      limit: z.string().optional().describe("Maximum active items to inspect (default: '25')"),
    },
    async (args) => {
      const numLimit = args.limit ? parseInt(args.limit, 10) : 25;

      let itemsSummary = "";
      let tagsList = "";

      try {
        const [queryRes, tags] = await Promise.all([
          client.queryInboxes({
            status: "active",
            tag: args.tag,
            limit: isNaN(numLimit) ? 25 : numLimit,
            include_body: false,
          }),
          client.listTags(),
        ]);

        tagsList = tags.map((t) => `- "${t.name}" (id: ${t.id})`).join("\n");

        itemsSummary = `Total matched active items: ${queryRes.total_matched} (Showing ${queryRes.inboxes.length})\n\n` +
          queryRes.inboxes
            .map((item: any) => {
              return `* [ID #${item.id}] "${item.name}" | Tag: ${item.tag || "NONE"} | Source: ${
                item.source || "n/a"
              } | Processed: ${item.processed} | Attachments: ${item.attachments?.length || 0}
  Summary: ${item.summary || "no summary"}
  Preview: ${item.body_preview || "no body"}`;
            })
            .join("\n\n");
      } catch (err: any) {
        itemsSummary = `(Failed to pre-fetch inbox items: ${err.message})`;
      }

      const promptText = `You are an OSINT Intelligence Operations Officer triaging the MacronX inbox.

### Available MacronX Classification Tags:
${tagsList || "(none)"}

### Active Inbox Items Under Review:
${itemsSummary}

### Triage Mandate:
1. **Critical Signals**: Identify items that contain urgent, high-value, or time-sensitive intelligence requiring immediate attention.
2. **Workflow Classification**: For untagged items, recommend the best matching tag from the available tags list.
3. **Archive Candidates**: Identify items that have already been fully processed, reviewed, or are low-signal noise, and explicitly list their numeric IDs for archiving using \`archive_inbox\`.
4. **Summary**: Provide a crisp 3-sentence summary of overall inbox health and posture.`;

      return {
        messages: [
          {
            role: "user",
            content: {
              type: "text",
              text: promptText,
            },
          },
        ],
      };
    }
  );
}
