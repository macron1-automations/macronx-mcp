# MacronX MCP

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)

Official [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server for [MacronX](https://github.com/macron1-automations/macronx) (`v1.0.0`), the personal Open-Source Intelligence (OSINT) intake and analysis pipeline.

`macronx-mcp` connects AI assistants (such as Antigravity, Claude Desktop, Cursor, and custom agent swarms) to MacronX's authenticated `/api/v1` REST interface over `stdio`. It allows models to ingest raw signals, classify intelligence with tags, inspect attachments (IMINT imagery, audio intercepts, transcripts, PDFs), triage inboxes, and synthesize Executive Intelligence Briefs (EIB).

---

## Features

- 📥 **Full Intake Ingestion**: Ingest raw intelligence via `create_inbox` with source attribution, summary, full body, metadata, and automated tag resolution that routes items directly into MacronX background LLM workflows.
- 🖼️ **Multimodal Attachment Support**: Upload attachments from local disk (`file_paths`), remote HTTP/S URLs (`file_urls`), or inline text/base64 (`inline_attachments`). Inspect attachments via `get_inbox_attachment` returning native MCP image blocks for vision models, inline text for transcripts/data, or saving binary media to disk.
- ⚡ **Context-Window Protection & Short-TTL Caching**: MacronX `v1.0.0` returns all user inboxes unpaginated with full bodies. `macronx-mcp` protects LLM token budgets with client-side status filtering (`active`, `unprocessed`, `processed`, `archived`, `all`), search query matching, pagination, and compact body previews by default (`include_body: false`). A short-TTL cache (10s default) minimizes unnecessary database round-trips while automatically invalidating on mutating actions.
- 🏷️ **Tag Resolution**: Assign tags by human-readable name (e.g. `tag: "news-analysis"`); the client resolves it against live MacronX tags to supply the required numeric `tag_id`.
- 📚 **MCP Resources & Prompts**: Live `macronx://` feeds (`macronx://tags`, `macronx://inboxes`, `macronx://inboxes/unprocessed`, `macronx://inboxes/processed`, `macronx://inboxes/{id}`) and built-in OSINT analyst workflows (`synthesize_intelligence_brief`, `triage_inbox`).
- 🔒 **Read-Only Safety Guard**: Set `MACRONX_READ_ONLY=true` to block all mutating tools when connecting to sensitive environments.

---

## Installation & Quick Start

You can build and run `macronx-mcp` locally:

```bash
cd /path/to/macronx-mcp
npm install
npm run build
node dist/index.js
```

Or run via `npm start`.

---

## Environment Configuration

Configure the server using environment variables matching `macronx-tui`:

| Variable | Required | Default | Description |
|---|---|---|---|
| `MACRONX_API_URL` (or `MACRONX_URL`) | No | `http://localhost:5000` | Base URL of your MacronX Rails host app. |
| `MACRONX_API_TOKEN` | **Yes** | — | Bearer API token obtained from `/settings/api_token` in MacronX. |
| `MACRONX_DEFAULT_SOURCE` | No | `macronx-mcp` | Default origin identifier for items created without an explicit `source`. |
| `MACRONX_READ_ONLY` | No | `false` | When `true`, disables `create_inbox`, `archive_inbox`, and `unarchive_inbox`. |
| `MACRONX_CACHE_TTL_MS` | No | `10000` | In-memory cache duration in milliseconds (`0` disables caching). |
| `MACRONX_TIMEOUT_MS` | No | `30000` | HTTP request and attachment download timeout in milliseconds. |
| `MACRONX_MAX_ATTACHMENT_BYTES` | No | `26214400` (25 MB) | Maximum allowed size for attachment uploads and downloads. |

---

## MCP Client Configuration

### 1. Antigravity IDE / Claude Desktop

Add to your MCP server configuration:

```json
{
  "mcpServers": {
    "macronx": {
      "command": "node",
      "args": ["/Users/leonid/src/macronx-mcp/dist/index.js"],
      "env": {
        "MACRONX_API_URL": "http://localhost:5000",
        "MACRONX_API_TOKEN": "<your-macronx-api-token>"
      }
    }
  }
}
```

---

## Tools Reference

| Tool | Parameters | Description |
|---|---|---|
| `list_inboxes` | `status`, `tag`, `source`, `query`, `has_attachments`, `since`, `until`, `sort`, `direction`, `limit`, `offset`, `include_body`, `preview_length`, `refresh` | Query, filter, and paginate inbox items. Defaults to active (`!archived`) items with compact body previews. |
| `get_inbox` | `id` | Retrieve full inbox item details including full body, metadata, and attachment download links. |
| `create_inbox` | `name`, `source`, `summary`, `body`, `tag`, `tag_id`, `payload`, `metadata`, `file_paths`, `file_urls`, `inline_attachments` | Ingest a new raw intelligence artifact or note. Automatically resolves tag names and triggers associated background workflows. |
| `archive_inbox` | `id` | Archive a reviewed or processed inbox entry. |
| `unarchive_inbox` | `id` | Restore an archived entry back to the active inbox. |
| `list_tags` | `refresh` | List all available classification tags and their IDs/colors. |
| `get_inbox_attachment` | `inbox_id`, `attachment_id`, `filename`, `save_to_path` | Inspect or download an attachment. Returns native image blocks for vision models or inline text for transcripts/data. |

---

## Resources Reference

| URI | MIME Type | Description |
|---|---|---|
| `macronx://tags` | `application/json` | Live list of classification tags. |
| `macronx://inboxes` | `application/json` | Active (unarchived) inbox items summary and overall counts. |
| `macronx://inboxes/unprocessed` | `application/json` | Unprocessed raw OSINT signals awaiting triage. |
| `macronx://inboxes/processed` | `application/json` | AI-processed intelligence briefs awaiting review. |
| `macronx://inboxes/{id}` | `application/json` | Full record and attachment links for a specific inbox ID. |

---

## Prompts Reference

- `synthesize_intelligence_brief`: Pre-fetches recent inbox items and guides the model in generating a structured OSINT Executive Intelligence Brief (EIB) with BLUF, cross-sector synthesis, threat posture, and cited source IDs.
- `triage_inbox`: Pre-fetches active items and live tags to guide an analyst in surfacing high-priority signals, recommending tags for untagged items, and identifying entries ready to archive.

---

## License

MIT
