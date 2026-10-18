import { describe, it, expect, vi } from "vitest";
import {
  serializeAnnotations,
  deserializeAnnotations,
} from "./annotation-storage";
import type { ProjectService } from "@/core/storage/project-service";
import { PdfAnnotationSubtype, type PdfAnnotationObject } from "@embedpdf/models";
import type { AnnotationTransferItem } from "@embedpdf/plugin-annotation";

describe("annotation-storage (PDF-4)", () => {
  const projectId = "test-project-123";
  const pdfHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  it("serializes text and ink annotations without modifying their structure", async () => {
    const mockProjectService = {
      putFile: vi.fn(),
      getFile: vi.fn(),
    } as unknown as ProjectService;

    const items: AnnotationTransferItem[] = [
      {
        annotation: {
          id: "anno-hl-1",
          pageIndex: 0,
          type: PdfAnnotationSubtype.HIGHLIGHT,
          color: "#ffe066",
        } as unknown as PdfAnnotationObject,
      },
      {
        annotation: {
          id: "anno-ink-1",
          pageIndex: 1,
          type: PdfAnnotationSubtype.INK,
          strokeColor: "#dc2626",
          strokeWidth: 3,
        } as unknown as PdfAnnotationObject,
      },
    ];

    const json = await serializeAnnotations(
      projectId,
      pdfHash,
      items,
      mockProjectService
    );

    expect(mockProjectService.putFile).not.toHaveBeenCalled();
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].annotation.id).toBe("anno-hl-1");
    expect(parsed[1].annotation.id).toBe("anno-ink-1");
  });

  it("extracts binary data from stamps, saves via putFile, and stores only references (zero base64)", async () => {
    const storedFiles = new Map<string, Blob>();
    const mockProjectService = {
      putFile: vi.fn().mockImplementation(async (_pid, blob, _meta, key) => {
        storedFiles.set(key, blob);
        return { key };
      }),
      getFile: vi.fn().mockImplementation(async (_pid, key) => {
        const found = storedFiles.get(key);
        if (!found) throw new Error("File not found");
        return found;
      }),
    } as unknown as ProjectService;

    // Create simulated stamp image binary bytes (e.g. 100 bytes)
    const stampBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
    const stampBuffer = stampBytes.buffer;

    const items: AnnotationTransferItem[] = [
      {
        annotation: {
          id: "stamp-anno-1",
          pageIndex: 0,
          type: PdfAnnotationSubtype.STAMP,
          name: "ApprovedStamp",
          rect: { origin: { x: 50, y: 50 }, size: { width: 100, height: 60 } },
        } as unknown as PdfAnnotationObject,
        ctx: {
          data: stampBuffer,
          mimeType: "image/png",
        },
      },
    ];

    const json = await serializeAnnotations(
      projectId,
      pdfHash,
      items,
      mockProjectService
    );

    // 1. Verify putFile was called once
    expect(mockProjectService.putFile).toHaveBeenCalledTimes(1);

    // 2. Verify JSON does NOT contain raw base64 or buffer representation
    expect(json).not.toContain("base64");
    expect(json).not.toContain("ArrayBuffer");
    expect(json).not.toContain("Uint8Array");

    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].ctx.fileId).toBeDefined();
    expect(parsed[0].ctx.fileKey).toBe(parsed[0].ctx.fileId);
    expect(parsed[0].ctx.data).toBeUndefined(); // Binary stripped

    const stampHash = parsed[0].ctx.fileId;
    expect(typeof stampHash).toBe("string");
    expect(stampHash.length).toBe(64); // SHA-256 hex string

    // 3. Deserialize: reverses the process and fetches via getFile
    const restored = await deserializeAnnotations(
      projectId,
      json,
      mockProjectService
    );

    expect(mockProjectService.getFile).toHaveBeenCalledWith(projectId, stampHash);
    expect(restored).toHaveLength(1);
    expect(restored[0].annotation.id).toBe("stamp-anno-1");
    expect(restored[0].ctx?.data).toBeInstanceOf(ArrayBuffer);

    const restoredBytes = new Uint8Array(restored[0].ctx!.data as ArrayBuffer);
    expect(restoredBytes).toEqual(stampBytes);
  });

  it("handles empty or invalid JSON gracefully", async () => {
    const mockProjectService = {
      getFile: vi.fn(),
    } as unknown as ProjectService;

    expect(await deserializeAnnotations(projectId, "", mockProjectService)).toEqual([]);
    expect(await deserializeAnnotations(projectId, "{}", mockProjectService)).toEqual([]);
    expect(await deserializeAnnotations(projectId, "invalid-json", mockProjectService)).toEqual([]);
  });
});
