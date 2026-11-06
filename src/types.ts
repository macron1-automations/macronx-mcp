export interface MacronXAttachment {
  id: number;
  filename: string;
  content_type: string;
  byte_size: number;
  url: string;
}

export interface MacronXInbox {
  id: number;
  name: string;
  source: string | null;
  summary: string | null;
  body: string | null;
  tag: string | null;
  metadata: Record<string, unknown> | null;
  attachments: MacronXAttachment[];
  processed: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface MacronXInboxSummary {
  id: number;
  name: string;
  source: string | null;
  summary: string | null;
  body_preview: string | null;
  body_length: number;
  tag: string | null;
  metadata: Record<string, unknown> | null;
  attachments: MacronXAttachment[];
  processed: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface MacronXTag {
  id: number;
  name: string;
  color: string | null;
  created_at: string;
  updated_at: string;
}

export interface PreparedUpload {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
}

export type InboxStatusFilter = "active" | "unprocessed" | "processed" | "archived" | "all";

export interface InboxQueryOptions {
  status?: InboxStatusFilter;
  tag?: string;
  source?: string;
  query?: string;
  has_attachments?: boolean;
  since?: string;
  until?: string;
  sort?: "created_at" | "updated_at" | "name" | "source";
  direction?: "asc" | "desc";
  limit?: number;
  offset?: number;
  include_body?: boolean;
  preview_length?: number;
  refresh?: boolean;
}

export interface InboxQueryResult {
  counts: {
    unprocessed: number;
    processed: number;
    archived: number;
    total: number;
  };
  total_matched: number;
  limit: number;
  offset: number;
  has_more: boolean;
  inboxes: Array<MacronXInbox | MacronXInboxSummary>;
}

export interface CreateInboxInput {
  name?: string;
  source?: string;
  summary?: string;
  body?: string;
  tag?: string;
  tag_id?: number;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  file_paths?: string[];
  file_urls?: string[];
  inline_attachments?: Array<{
    filename: string;
    content_type?: string;
    data_base64?: string;
    text?: string;
  }>;
}
