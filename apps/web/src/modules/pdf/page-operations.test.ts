import { describe, it, expect, vi } from "vitest";
import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";
import { PdfAnnotationSubtype } from "@embedpdf/models";
import {
  rotatePage,
  deletePage,
  reorderPages,
  insertImagePage,
  burnAnnotationsWithPdfLib,
  detectImageMime,
  isPng,
  isJpg,
} from "./page-operations";
import type { ProjectService } from "@/core/storage/project-service";

async function createTestPdf(pageCount: number = 2): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (let i = 1; i <= pageCount; i++) {
    const page = pdfDoc.addPage([400, 600]);
    page.drawText(`Page ${i}`, {
      x: 50,
      y: 550,
      size: 24,
      font,
      color: rgb(0, 0, 0),
    });
  }

  return await pdfDoc.save();
}

describe("page-operations (@cantoo/pdf-lib)", () => {
  it("rotatePage rotates page by 90 degrees clockwise", async () => {
    const originalPdf = await createTestPdf(2);
    const rotatedBytes = await rotatePage(originalPdf, 0, 90);

    const doc = await PDFDocument.load(rotatedBytes);
    expect(doc.getPageCount()).toBe(2);
    expect(doc.getPage(0).getRotation().angle).toBe(90);
    expect(doc.getPage(1).getRotation().angle).toBe(0);

    // Rotate again by 90 -> 180
    const rotated180 = await rotatePage(rotatedBytes, 0, 90);
    const doc180 = await PDFDocument.load(rotated180);
    expect(doc180.getPage(0).getRotation().angle).toBe(180);
  });

  it("deletePage removes a page from a multi-page PDF", async () => {
    const originalPdf = await createTestPdf(3);
    const deletedBytes = await deletePage(originalPdf, 1);

    const doc = await PDFDocument.load(deletedBytes);
    expect(doc.getPageCount()).toBe(2);
  });

  it("deletePage throws when trying to delete the only page in the document", async () => {
    const singlePagePdf = await createTestPdf(1);
    await expect(deletePage(singlePagePdf, 0)).rejects.toThrow(
      "Cannot delete the only page in the document."
    );
  });

  it("reorderPages permutes pages correctly", async () => {
    const originalPdf = await createTestPdf(3);
    // Reverse pages [0, 1, 2] -> [2, 1, 0]
    const reorderedBytes = await reorderPages(originalPdf, [2, 1, 0]);

    const doc = await PDFDocument.load(reorderedBytes);
    expect(doc.getPageCount()).toBe(3);
  });

  it("insertImagePage adds a new page with the image dimensions", async () => {
    const originalPdf = await createTestPdf(1);

    // 1x1 transparent PNG
    const pngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const pngBytes = Uint8Array.from(atob(pngBase64), (c) => c.charCodeAt(0));

    const withImageBytes = await insertImagePage(originalPdf, pngBytes, "image/png");
    const doc = await PDFDocument.load(withImageBytes);
    expect(doc.getPageCount()).toBe(2);

    const newPage = doc.getPage(1);
    expect(newPage.getWidth()).toBe(1);
    expect(newPage.getHeight()).toBe(1);
  });

  it("burnAnnotationsWithPdfLib re-injects stamp images and highlights into the PDF", async () => {
    const originalPdf = await createTestPdf(2);

    const stampBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const stampBytes = Uint8Array.from(atob(stampBase64), (c) => c.charCodeAt(0));
    const stampHash = "mock-stamp-sha256-hash";

    const mockProjectService = {
      getFile: vi.fn().mockResolvedValue(new Blob([stampBytes], { type: "image/png" })),
    } as unknown as ProjectService;

    // Serialized annotations JSON referencing stamp file by SHA-256 hash
    const annotationsJson = JSON.stringify([
      {
        annotation: {
          id: "test-stamp-1",
          pageIndex: 0,
          type: PdfAnnotationSubtype.STAMP,
          rect: { origin: { x: 50, y: 50 }, size: { width: 100, height: 80 } },
        },
        ctx: {
          fileId: stampHash,
          fileKey: stampHash,
          mimeType: "image/png",
        },
      },
      {
        annotation: {
          id: "test-hl-1",
          pageIndex: 0,
          type: PdfAnnotationSubtype.HIGHLIGHT,
          rect: { origin: { x: 50, y: 150 }, size: { width: 200, height: 20 } },
        },
      },
      {
        annotation: {
          id: "test-text-1",
          pageIndex: 1,
          type: PdfAnnotationSubtype.FREETEXT,
          contents: "Verified Circuit Output",
          rect: { origin: { x: 40, y: 200 }, size: { width: 150, height: 16 } },
        },
      },
    ]);

    const burnedBytes = await burnAnnotationsWithPdfLib(
      originalPdf,
      annotationsJson,
      "proj-1",
      mockProjectService
    );

    expect(mockProjectService.getFile).toHaveBeenCalledWith("proj-1", stampHash);

    const doc = await PDFDocument.load(burnedBytes);
    expect(doc.getPageCount()).toBe(2);
    expect(burnedBytes.byteLength).toBeGreaterThan(0);
  });

  it("detectImageMime accurately detects mime types from magic bytes", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(detectImageMime(png)).toBe("image/png");
    expect(isPng(png)).toBe(true);

    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    expect(detectImageMime(jpg)).toBe("image/jpeg");
    expect(isJpg(jpg)).toBe(true);

    const webp = new Uint8Array([
      0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50,
    ]);
    expect(detectImageMime(webp)).toBe("image/webp");

    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38]);
    expect(detectImageMime(gif)).toBe("image/gif");
  });

  it("burnAnnotationsWithPdfLib gracefully skips corrupt/unsupported stamp without failing document", async () => {
    const originalPdf = await createTestPdf(1);
    const corruptStampHash = "corrupt-stamp-hash";
    const corruptBytes = new Uint8Array([1, 2, 3, 4, 5]);

    const mockProjectService = {
      getFile: vi.fn().mockResolvedValue(new Blob([corruptBytes], { type: "application/pdf" })),
    } as unknown as ProjectService;

    const annotationsJson = JSON.stringify([
      {
        annotation: {
          id: "corrupt-stamp",
          pageIndex: 0,
          type: PdfAnnotationSubtype.STAMP,
          rect: { origin: { x: 50, y: 50 }, size: { width: 100, height: 80 } },
        },
        ctx: {
          fileId: corruptStampHash,
          fileKey: corruptStampHash,
          mimeType: "application/pdf",
        },
      },
    ]);

    const burnedBytes = await burnAnnotationsWithPdfLib(
      originalPdf,
      annotationsJson,
      "proj-corrupt",
      mockProjectService
    );

    const doc = await PDFDocument.load(burnedBytes);
    expect(doc.getPageCount()).toBe(1);
    expect(burnedBytes.byteLength).toBeGreaterThan(0);
  });
});
