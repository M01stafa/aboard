import { describe, it, expect, vi } from "vitest";
import { appendBoardToPdf } from "./board-to-pdf";
import type { ProjectService } from "@/core/storage";
import { PDFDocument } from "@cantoo/pdf-lib";

// 1x1 valid PNG base64
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

function getTinyPngBlob(): Blob {
  const binaryString = atob(TINY_PNG_BASE64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return new Blob([bytes], { type: "image/png" });
}

describe("board-to-pdf", () => {
  it("creates a new PDF with board image if target PDF does not exist", async () => {
    const pngBlob = getTinyPngBlob();
    const mockPutFile = vi.fn().mockResolvedValue({ key: "new-pdf-hash" });
    const mockSavePdf = vi.fn().mockResolvedValue(undefined);
    const mockOpenProject = vi.fn().mockResolvedValue({ items: [] });
    const mockReadItem = vi.fn().mockResolvedValue(null);

    const mockPs = {
      openProject: mockOpenProject,
      readItem: mockReadItem,
      putFile: mockPutFile,
      savePdf: mockSavePdf,
      getFile: vi.fn(),
    } as unknown as ProjectService;

    const result = await appendBoardToPdf({
      projectId: "proj-1",
      imageBlob: pngBlob,
      projectServiceOverride: mockPs,
    });

    expect(result.pageCount).toBe(1);
    expect(result.newFileKey).toBeDefined();
    expect(mockPutFile).toHaveBeenCalledWith(
      "proj-1",
      expect.any(Blob),
      expect.objectContaining({ mime: "application/pdf" }),
      result.newFileKey
    );
    expect(mockSavePdf).toHaveBeenCalledWith(
      "proj-1",
      result.targetPdfItemId,
      expect.stringContaining(result.newFileKey),
      expect.any(String)
    );
  });

  it("appends board image as a new page to an existing PDF", async () => {
    // Create an initial PDF with 1 page
    const existingDoc = await PDFDocument.create();
    existingDoc.addPage([200, 200]);
    const existingBytes = await existingDoc.save();
    const existingBlob = new Blob([existingBytes], { type: "application/pdf" });

    const pngBlob = getTinyPngBlob();
    const mockPutFile = vi.fn().mockResolvedValue({ key: "updated-pdf-hash" });
    const mockSavePdf = vi.fn().mockResolvedValue(undefined);
    const mockOpenProject = vi.fn().mockResolvedValue({
      items: [{ id: "pdf-item-1", kind: "pdf", title: "Doc.pdf" }],
    });
    const mockReadItem = vi.fn().mockResolvedValue(
      JSON.stringify({
        type: "alpha-pdf",
        version: 1,
        fileKey: "existing-file-key",
        name: "Doc.pdf",
        lastPage: 1,
      })
    );
    const mockGetFile = vi.fn().mockResolvedValue(existingBlob);

    const mockPs = {
      openProject: mockOpenProject,
      readItem: mockReadItem,
      getFile: mockGetFile,
      putFile: mockPutFile,
      savePdf: mockSavePdf,
    } as unknown as ProjectService;

    const result = await appendBoardToPdf({
      projectId: "proj-1",
      targetPdfItemId: "pdf-item-1",
      imageBlob: pngBlob,
      projectServiceOverride: mockPs,
    });

    expect(result.targetPdfItemId).toBe("pdf-item-1");
    expect(result.pageCount).toBe(2);
    expect(mockPutFile).toHaveBeenCalledTimes(1);
    expect(mockSavePdf).toHaveBeenCalledWith(
      "proj-1",
      "pdf-item-1",
      expect.stringContaining(`"lastPage":2`),
      "Doc.pdf"
    );
  });

  it("overlays board image on current page of existing PDF without increasing page count", async () => {
    // Create an initial PDF with 2 pages
    const existingDoc = await PDFDocument.create();
    existingDoc.addPage([200, 200]);
    existingDoc.addPage([200, 200]);
    const existingBytes = await existingDoc.save();
    const existingBlob = new Blob([existingBytes], { type: "application/pdf" });

    const pngBlob = getTinyPngBlob();
    const mockPutFile = vi.fn().mockResolvedValue({ key: "overlaid-pdf-hash" });
    const mockSavePdf = vi.fn().mockResolvedValue(undefined);
    const mockOpenProject = vi.fn().mockResolvedValue({
      items: [{ id: "pdf-item-1", kind: "pdf", title: "Doc.pdf" }],
    });
    const mockReadItem = vi.fn().mockResolvedValue(
      JSON.stringify({
        type: "alpha-pdf",
        version: 1,
        fileKey: "existing-file-key",
        name: "Doc.pdf",
        lastPage: 2,
      })
    );
    const mockGetFile = vi.fn().mockResolvedValue(existingBlob);

    const mockPs = {
      openProject: mockOpenProject,
      readItem: mockReadItem,
      getFile: mockGetFile,
      putFile: mockPutFile,
      savePdf: mockSavePdf,
    } as unknown as ProjectService;

    const result = await appendBoardToPdf({
      projectId: "proj-1",
      targetPdfItemId: "pdf-item-1",
      imageBlob: pngBlob,
      mode: "overlay",
      projectServiceOverride: mockPs,
    });

    expect(result.targetPdfItemId).toBe("pdf-item-1");
    expect(result.pageCount).toBe(2); // Page count unchanged on overlay
    expect(mockPutFile).toHaveBeenCalledTimes(1);
    expect(mockSavePdf).toHaveBeenCalledWith(
      "proj-1",
      "pdf-item-1",
      expect.stringContaining(`"lastPage":2`),
      "Doc.pdf"
    );
  });
});
