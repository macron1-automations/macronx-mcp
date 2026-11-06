import { describe, expect, it } from "vitest";
import { buildInboxFormData } from "../src/multipart.js";

describe("buildInboxFormData", () => {
  it("builds FormData with scalar and nested bracket parameters", async () => {
    const formData = buildInboxFormData(
      {
        name: "Test Ingest",
        source: "agent",
        summary: "A test summary",
        body: "Detailed intel body",
        tag_id: 42,
        payload: {
          event: "satellite_pass",
          coordinates: { lat: 37.77, lon: -122.41 },
          targets: ["node-a", "node-b"],
        },
        metadata: {
          analyst: "leo",
          version: 2,
        },
      },
      [
        {
          filename: "telemetry.json",
          contentType: "application/json",
          bytes: new TextEncoder().encode('{"ping":true}'),
        },
      ]
    );

    expect(formData.get("inbox[name]")).toBe("Test Ingest");
    expect(formData.get("inbox[source]")).toBe("agent");
    expect(formData.get("inbox[summary]")).toBe("A test summary");
    expect(formData.get("inbox[body]")).toBe("Detailed intel body");
    expect(formData.get("inbox[tag_id]")).toBe("42");

    expect(formData.get("inbox[payload][event]")).toBe("satellite_pass");
    expect(formData.get("inbox[payload][coordinates][lat]")).toBe("37.77");
    expect(formData.get("inbox[payload][coordinates][lon]")).toBe("-122.41");
    expect(formData.getAll("inbox[payload][targets][]")).toEqual(["node-a", "node-b"]);

    expect(formData.get("inbox[metadata][analyst]")).toBe("leo");
    expect(formData.get("inbox[metadata][version]")).toBe("2");

    const attachments = formData.getAll("inbox[attachments][]");
    expect(attachments.length).toBe(1);
    const blob = attachments[0] as Blob;
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("application/json");
    expect(await blob.text()).toBe('{"ping":true}');
  });
});
