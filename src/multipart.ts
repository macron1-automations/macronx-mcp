import { PreparedUpload } from "./types.js";

function appendNestedParam(formData: FormData, prefix: string, value: unknown): void {
  if (value === null || value === undefined) {
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      appendNestedParam(formData, `${prefix}[]`, item);
    }
  } else if (typeof value === "object" && !(value instanceof Blob)) {
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      appendNestedParam(formData, `${prefix}[${key}]`, val);
    }
  } else {
    formData.append(prefix, String(value));
  }
}

export interface InboxFormFields {
  name?: string;
  source?: string;
  summary?: string;
  body?: string;
  tag_id?: number;
  payload?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export function buildInboxFormData(
  fields: InboxFormFields,
  attachments: PreparedUpload[]
): FormData {
  const formData = new FormData();

  if (fields.name !== undefined && fields.name !== null && fields.name !== "") {
    formData.append("inbox[name]", fields.name);
  }
  if (fields.source !== undefined && fields.source !== null && fields.source !== "") {
    formData.append("inbox[source]", fields.source);
  }
  if (fields.summary !== undefined && fields.summary !== null && fields.summary !== "") {
    formData.append("inbox[summary]", fields.summary);
  }
  if (fields.body !== undefined && fields.body !== null && fields.body !== "") {
    formData.append("inbox[body]", fields.body);
  }
  if (fields.tag_id !== undefined && fields.tag_id !== null) {
    formData.append("inbox[tag_id]", String(fields.tag_id));
  }

  if (fields.payload && typeof fields.payload === "object") {
    appendNestedParam(formData, "inbox[payload]", fields.payload);
  }

  if (fields.metadata && typeof fields.metadata === "object") {
    appendNestedParam(formData, "inbox[metadata]", fields.metadata);
  }

  for (const upload of attachments) {
    const blob = new Blob([upload.bytes], { type: upload.contentType });
    formData.append("inbox[attachments][]", blob, upload.filename);
  }

  return formData;
}
