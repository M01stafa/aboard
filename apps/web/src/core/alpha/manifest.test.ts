import { describe, expect, it } from "vitest";
import {
  ALPHA_MIME,
  CURRENT_FORMAT_VERSION,
  validateAlphaManifest,
  isSafePath,
  type AlphaManifest,
} from "./manifest";

describe("AlphaManifest Schema & Validation (Task 31 / ALPHA-1, ALPHA-5, §12.1-12.3)", () => {
  const validManifest: AlphaManifest = {
    format: "alpha-project",
    formatVersion: CURRENT_FORMAT_VERSION,
    app: { name: "Aboard", version: "0.1.0" },
    exportedAt: "2026-10-18T05:00:00.000Z",
    project: {
      id: "proj-123",
      title: "Neurology 101",
      subject: "Medicine",
      createdAt: "2026-10-18T04:00:00.000Z",
      updatedAt: "2026-10-18T05:00:00.000Z",
    },
    items: [
      { id: "b1", kind: "board", title: "Synapse Diagram", path: "boards/b1.json" },
      { id: "c1", kind: "circuit", title: "Action Potential", path: "circuits/c1.txt" },
      {
        id: "p1",
        kind: "pdf",
        title: "Lecture Notes",
        path: "pdfs/p1.json",
        fileKey: "a".repeat(64),
        annotationsPath: "annotations/p1.json",
      },
      { id: "a1", kind: "annotations", title: "Lecture Notes Annotations", path: "annotations/a1.json" },
    ],
    files: [
      {
        key: "a".repeat(64),
        path: `files/${"a".repeat(64)}.pdf`,
        name: "lecture.pdf",
        mime: "application/pdf",
        size: 1048576,
        sha256: "a".repeat(64),
      },
    ],
    layout: {
      tabs: ["b1", "p1"],
      split: "vertical",
    },
  };

  it("exports correct container constants", () => {
    expect(ALPHA_MIME).toBe("application/x-alpha-project");
    expect(CURRENT_FORMAT_VERSION).toBe(1);
  });

  it("validates a well-formed manifest successfully", () => {
    const result = validateAlphaManifest(validManifest);
    expect(result.format).toBe("alpha-project");
    expect(result.formatVersion).toBe(1);
    expect(result.project.title).toBe("Neurology 101");
    expect(result.items).toHaveLength(4);
    expect(result.files).toHaveLength(1);
  });

  it("rejects manifest with unsupported formatVersion", () => {
    const invalid = { ...validManifest, formatVersion: 2 };
    expect(() => validateAlphaManifest(invalid)).toThrow();
  });

  it("rejects manifest with invalid format identifier", () => {
    const invalid = { ...validManifest, format: "zip-project" };
    expect(() => validateAlphaManifest(invalid)).toThrow();
  });

  it("rejects manifest with unsafe file path traversal", () => {
    const malicious = {
      ...validManifest,
      files: [
        {
          key: "bad",
          path: "files/../../secret.txt",
          mime: "text/plain",
          size: 10,
          sha256: "bad",
        },
      ],
    };
    expect(() => validateAlphaManifest(malicious)).toThrow();
  });

  it("rejects manifest with absolute paths", () => {
    const malicious = {
      ...validManifest,
      items: [
        { id: "b1", kind: "board" as const, title: "Bad", path: "/boards/b1.json" },
      ],
    };
    expect(() => validateAlphaManifest(malicious)).toThrow();
  });

  it("validates isSafePath utility against traversal attacks", () => {
    expect(isSafePath("boards/board-1.json")).toBe(true);
    expect(isSafePath("circuits/circuit-1.txt")).toBe(true);
    expect(isSafePath("pdfs/pdf-1.json")).toBe(true);
    expect(isSafePath("annotations/anno-1.json")).toBe(true);
    expect(isSafePath("files/abc123def456.pdf")).toBe(true);
    expect(isSafePath("files/stamp_1.png")).toBe(true);

    expect(isSafePath("../boards/board-1.json")).toBe(false);
    expect(isSafePath("boards/../../etc/passwd")).toBe(false);
    expect(isSafePath("/files/test.pdf")).toBe(false);
    expect(isSafePath("\\files\\test.pdf")).toBe(false);
    expect(isSafePath("files/nested/subfolder/test.pdf")).toBe(false);
  });
});
