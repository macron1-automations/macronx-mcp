import {
  prepareInlineAttachment,
  prepareLocalFile,
  prepareRemoteUrl,
} from "./attachments.js";
import { MacronXConfig } from "./config.js";
import { buildInboxFormData } from "./multipart.js";
import {
  CreateInboxInput,
  InboxQueryOptions,
  InboxQueryResult,
  MacronXAttachment,
  MacronXInbox,
  MacronXInboxSummary,
  MacronXTag,
  PreparedUpload,
} from "./types.js";

export class MacronXClient {
  private inboxesCache: { data: MacronXInbox[]; expiresAt: number } | null = null;
  private tagsCache: { data: MacronXTag[]; expiresAt: number } | null = null;

  constructor(public readonly config: MacronXConfig) {}

  public resolveUrl(relativeOrAbsoluteUrl?: string | null): string | undefined {
    if (!relativeOrAbsoluteUrl) return undefined;
    if (relativeOrAbsoluteUrl.startsWith("http://") || relativeOrAbsoluteUrl.startsWith("https://")) {
      return relativeOrAbsoluteUrl;
    }
    const cleanOrigin = this.config.originUrl.replace(/\/+$/, "");
    const cleanPath = relativeOrAbsoluteUrl.startsWith("/")
      ? relativeOrAbsoluteUrl
      : `/${relativeOrAbsoluteUrl}`;
    return `${cleanOrigin}${cleanPath}`;
  }

  private normalizeAttachment(att: MacronXAttachment): MacronXAttachment {
    return {
      ...att,
      url: this.resolveUrl(att.url) || att.url,
    };
  }

  private normalizeInbox(inbox: MacronXInbox): MacronXInbox {
    return {
      ...inbox,
      attachments: (inbox.attachments || []).map((a) => this.normalizeAttachment(a)),
    };
  }

  public invalidateInboxCache(): void {
    this.inboxesCache = null;
  }

  public invalidateTagsCache(): void {
    this.tagsCache = null;
  }

  async request<T>(endpointPath: string, options: RequestInit = {}): Promise<T> {
    const url = endpointPath.startsWith("http://") || endpointPath.startsWith("https://")
      ? endpointPath
      : `${this.config.apiBaseUrl}${endpointPath.startsWith("/") ? "" : "/"}${endpointPath}`;

    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${this.config.apiToken}`,
      ...((options.headers as Record<string, string>) || {}),
    };

    if (options.body && !(options.body instanceof FormData) && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      const text = await response.text();
      let data: any;
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { raw: text };
      }

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error(
            `Authentication failed (401 Unauthorized): ${
              data.error || "Invalid API token. Verify MACRONX_API_TOKEN matches /settings/api_token in MacronX."
            }`
          );
        }
        if (response.status === 404) {
          throw new Error(`Resource not found (404): ${data.error || "The requested item was not found."}`);
        }
        if (response.status === 422) {
          const errList = data.errors
            ? typeof data.errors === "object"
              ? Object.entries(data.errors)
                  .map(([field, errs]) => `${field}: ${Array.isArray(errs) ? errs.join(", ") : errs}`)
                  .join("; ")
              : JSON.stringify(data.errors)
            : data.error || JSON.stringify(data);
          throw new Error(`Validation failed (422 Unprocessable Content): ${errList}`);
        }
        throw new Error(
          `MacronX API request failed with status ${response.status}: ${
            data.error || text || response.statusText
          }`
        );
      }

      return data as T;
    } catch (err: any) {
      if (err.name === "AbortError") {
        throw new Error(`MacronX API request timed out after ${this.config.timeoutMs}ms: ${url}`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async listInboxes(options?: { refresh?: boolean }): Promise<MacronXInbox[]> {
    const now = Date.now();
    if (!options?.refresh && this.inboxesCache && this.inboxesCache.expiresAt > now) {
      return this.inboxesCache.data;
    }

    const res = await this.request<MacronXInbox[]>("/inboxes");
    const normalized = (res || []).map((i) => this.normalizeInbox(i));

    if (this.config.cacheTtlMs > 0) {
      this.inboxesCache = {
        data: normalized,
        expiresAt: now + this.config.cacheTtlMs,
      };
    }

    return normalized;
  }

  async getInbox(id: number): Promise<MacronXInbox> {
    const res = await this.request<MacronXInbox>(`/inboxes/${id}`);
    const normalized = this.normalizeInbox(res);

    // Update entry in cache if cache exists
    if (this.inboxesCache) {
      const idx = this.inboxesCache.data.findIndex((item) => item.id === id);
      if (idx !== -1) {
        this.inboxesCache.data[idx] = normalized;
      }
    }

    return normalized;
  }

  async listTags(options?: { refresh?: boolean }): Promise<MacronXTag[]> {
    const now = Date.now();
    if (!options?.refresh && this.tagsCache && this.tagsCache.expiresAt > now) {
      return this.tagsCache.data;
    }

    const res = await this.request<MacronXTag[]>("/tags");
    const tags = res || [];

    if (this.config.cacheTtlMs > 0) {
      this.tagsCache = {
        data: tags,
        expiresAt: now + this.config.cacheTtlMs,
      };
    }

    return tags;
  }

  async resolveTagId(tagOrId: string | number): Promise<number> {
    if (typeof tagOrId === "number") {
      return tagOrId;
    }

    const trimmed = tagOrId.trim();
    if (/^\d+$/.test(trimmed)) {
      return parseInt(trimmed, 10);
    }

    let tags = await this.listTags();
    let found = tags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());

    if (!found) {
      // Refresh cache once in case tag was recently added
      tags = await this.listTags({ refresh: true });
      found = tags.find((t) => t.name.toLowerCase() === trimmed.toLowerCase());
    }

    if (!found) {
      const available = tags.map((t) => `"${t.name}" (id: ${t.id})`).join(", ") || "none";
      throw new Error(`Tag "${trimmed}" not found in MacronX. Available tags: ${available}`);
    }

    return found.id;
  }

  async createInbox(input: CreateInboxInput): Promise<MacronXInbox> {
    let tagId: number | undefined = input.tag_id;
    if (tagId === undefined && input.tag) {
      tagId = await this.resolveTagId(input.tag);
    }

    const source = input.source?.trim() || this.config.defaultSource;

    // Collect attachments from local files, remote URLs, and inline payloads
    const uploads: PreparedUpload[] = [];

    if (input.file_paths && input.file_paths.length > 0) {
      for (const filePath of input.file_paths) {
        const upload = await prepareLocalFile(filePath, this.config.maxAttachmentBytes);
        uploads.push(upload);
      }
    }

    if (input.file_urls && input.file_urls.length > 0) {
      for (const fileUrl of input.file_urls) {
        const upload = await prepareRemoteUrl(
          fileUrl,
          this.config.timeoutMs,
          this.config.maxAttachmentBytes
        );
        uploads.push(upload);
      }
    }

    if (input.inline_attachments && input.inline_attachments.length > 0) {
      for (const inline of input.inline_attachments) {
        const upload = prepareInlineAttachment(inline, this.config.maxAttachmentBytes);
        uploads.push(upload);
      }
    }

    let created: MacronXInbox;

    if (uploads.length === 0) {
      const body: Record<string, unknown> = {
        inbox: {
          name: input.name,
          source,
          summary: input.summary,
          body: input.body,
          tag_id: tagId,
          payload: input.payload || {},
          metadata: input.metadata || {},
        },
      };

      created = await this.request<MacronXInbox>("/inboxes", {
        method: "POST",
        body: JSON.stringify(body),
      });
    } else {
      const formData = buildInboxFormData(
        {
          name: input.name,
          source,
          summary: input.summary,
          body: input.body,
          tag_id: tagId,
          payload: input.payload,
          metadata: input.metadata,
        },
        uploads
      );

      created = await this.request<MacronXInbox>("/inboxes", {
        method: "POST",
        body: formData,
      });
    }

    this.invalidateInboxCache();
    return this.normalizeInbox(created);
  }

  async archiveInbox(id: number): Promise<MacronXInbox> {
    const res = await this.request<MacronXInbox>(`/inboxes/${id}/archive`, {
      method: "PATCH",
    });
    this.invalidateInboxCache();
    return this.normalizeInbox(res);
  }

  async unarchiveInbox(id: number): Promise<MacronXInbox> {
    const res = await this.request<MacronXInbox>(`/inboxes/${id}/unarchive`, {
      method: "PATCH",
    });
    this.invalidateInboxCache();
    return this.normalizeInbox(res);
  }

  async downloadAttachment(
    attachmentUrl: string
  ): Promise<{ bytes: Uint8Array; contentType: string }> {
    const resolved = this.resolveUrl(attachmentUrl);
    if (!resolved) {
      throw new Error(`Invalid attachment URL: "${attachmentUrl}"`);
    }

    let targetUrl: URL;
    try {
      targetUrl = new URL(resolved);
    } catch {
      throw new Error(`Cannot parse attachment URL: "${resolved}"`);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      let currentUrl = targetUrl.toString();
      let response: Response;

      // Handle redirect chain with origin-safety
      while (true) {
        const u = new URL(currentUrl);
        const headers: Record<string, string> = {};
        if (u.origin === this.config.originUrl) {
          headers["Authorization"] = `Bearer ${this.config.apiToken}`;
        }

        response = await fetch(currentUrl, {
          headers,
          redirect: "manual",
          signal: controller.signal,
        });

        if (response.status >= 300 && response.status < 400) {
          const loc = response.headers.get("location");
          if (!loc) {
            throw new Error(`HTTP ${response.status} redirect without Location header from ${currentUrl}`);
          }
          currentUrl = new URL(loc, currentUrl).toString();
          continue;
        }
        break;
      }

      if (!response.ok) {
        throw new Error(`Failed to download attachment (HTTP ${response.status}): ${currentUrl}`);
      }

      const contentLength = response.headers.get("content-length");
      if (contentLength && parseInt(contentLength, 10) > this.config.maxAttachmentBytes) {
        throw new Error(
          `Attachment exceeds size limit (${contentLength} bytes > ${this.config.maxAttachmentBytes} bytes)`
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      if (arrayBuffer.byteLength > this.config.maxAttachmentBytes) {
        throw new Error(
          `Attachment exceeds size limit (${arrayBuffer.byteLength} bytes > ${this.config.maxAttachmentBytes} bytes)`
        );
      }

      const contentType =
        response.headers.get("content-type")?.split(";")[0]?.trim() || "application/octet-stream";

      return {
        bytes: new Uint8Array(arrayBuffer),
        contentType,
      };
    } catch (err: any) {
      if (err.name === "AbortError") {
        throw new Error(
          `Attachment download timed out after ${this.config.timeoutMs}ms: "${resolved}"`
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  async queryInboxes(options: InboxQueryOptions = {}): Promise<InboxQueryResult> {
    const all = await this.listInboxes({ refresh: options.refresh });

    const counts = {
      unprocessed: all.filter((i) => !i.processed && !i.archived).length,
      processed: all.filter((i) => i.processed && !i.archived).length,
      archived: all.filter((i) => i.archived).length,
      total: all.length,
    };

    const statusFilter = options.status || "active";
    let filtered = all.filter((i) => {
      switch (statusFilter) {
        case "active":
          return !i.archived;
        case "unprocessed":
          return !i.processed && !i.archived;
        case "processed":
          return i.processed && !i.archived;
        case "archived":
          return i.archived;
        case "all":
          return true;
      }
    });

    if (options.tag) {
      const targetTag = options.tag.trim().toLowerCase();
      filtered = filtered.filter((i) => i.tag && i.tag.toLowerCase() === targetTag);
    }

    if (options.source) {
      const targetSource = options.source.trim().toLowerCase();
      filtered = filtered.filter((i) => i.source && i.source.toLowerCase().includes(targetSource));
    }

    if (options.has_attachments !== undefined) {
      filtered = filtered.filter((i) =>
        options.has_attachments
          ? (i.attachments && i.attachments.length > 0)
          : (!i.attachments || i.attachments.length === 0)
      );
    }

    if (options.query) {
      const q = options.query.trim().toLowerCase();
      filtered = filtered.filter((i) => {
        const nameMatch = i.name && i.name.toLowerCase().includes(q);
        const sourceMatch = i.source && i.source.toLowerCase().includes(q);
        const summaryMatch = i.summary && i.summary.toLowerCase().includes(q);
        const bodyMatch = i.body && i.body.toLowerCase().includes(q);
        return Boolean(nameMatch || sourceMatch || summaryMatch || bodyMatch);
      });
    }

    if (options.since) {
      const sinceDate = new Date(options.since).getTime();
      if (!isNaN(sinceDate)) {
        filtered = filtered.filter((i) => new Date(i.created_at).getTime() >= sinceDate);
      }
    }

    if (options.until) {
      const untilDate = new Date(options.until).getTime();
      if (!isNaN(untilDate)) {
        filtered = filtered.filter((i) => new Date(i.created_at).getTime() <= untilDate);
      }
    }

    const sortCol = options.sort || "created_at";
    const direction = options.direction || "desc";

    filtered.sort((a, b) => {
      let valA: string | number = a[sortCol] ?? "";
      let valB: string | number = b[sortCol] ?? "";

      if (sortCol === "created_at" || sortCol === "updated_at") {
        valA = new Date(valA as string).getTime();
        valB = new Date(valB as string).getTime();
      } else {
        valA = String(valA).toLowerCase();
        valB = String(valB).toLowerCase();
      }

      if (valA < valB) return direction === "asc" ? -1 : 1;
      if (valA > valB) return direction === "asc" ? 1 : -1;
      return 0;
    });

    const totalMatched = filtered.length;
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const offset = Math.max(options.offset ?? 0, 0);
    const paged = filtered.slice(offset, offset + limit);
    const hasMore = offset + limit < totalMatched;

    const previewLength = options.preview_length ?? 300;
    const includeBody = Boolean(options.include_body);

    const projected: Array<MacronXInbox | MacronXInboxSummary> = paged.map((i) => {
      if (includeBody) {
        return i;
      }

      const bodyStr = i.body || "";
      const bodyPreview =
        bodyStr.length <= previewLength
          ? bodyStr || null
          : `${bodyStr.slice(0, previewLength)}...`;

      const summary: MacronXInboxSummary = {
        id: i.id,
        name: i.name,
        source: i.source,
        summary: i.summary,
        body_preview: bodyPreview,
        body_length: bodyStr.length,
        tag: i.tag,
        metadata: i.metadata,
        attachments: i.attachments,
        processed: i.processed,
        archived: i.archived,
        created_at: i.created_at,
        updated_at: i.updated_at,
      };
      return summary;
    });

    return {
      counts,
      total_matched: totalMatched,
      limit,
      offset,
      has_more: hasMore,
      inboxes: projected,
    };
  }
}
