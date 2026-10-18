import { PDFDocument, degrees, rgb, StandardFonts } from "@cantoo/pdf-lib";
import { PdfAnnotationSubtype } from "@embedpdf/models";
import type { ProjectService } from "@/core/storage/project-service";
import { deserializeAnnotations } from "./annotation-storage";

export function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

/**
 * Rotates a specified page by the given angle clockwise (default 90°).
 * Retains original PDF immutability by returning a newly serialized document byte array.
 */
export async function rotatePage(
  pdfBytes: Uint8Array | ArrayBuffer,
  pageIndex: number,
  degreesAngle: number = 90
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();

  if (pageIndex < 0 || pageIndex >= pages.length) {
    throw new Error(`Invalid page index: ${pageIndex}. Document has ${pages.length} pages.`);
  }

  const page = pages[pageIndex];
  const currentRotation = page.getRotation().angle;
  page.setRotation(degrees((currentRotation + degreesAngle) % 360));

  return await pdfDoc.save();
}

/**
 * Deletes a page from the document.
 * Requires at least 2 pages; throws an error if attempting to delete the only remaining page.
 */
export async function deletePage(
  pdfBytes: Uint8Array | ArrayBuffer,
  pageIndex: number
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pageCount = pdfDoc.getPageCount();

  if (pageCount <= 1) {
    throw new Error("Cannot delete the only page in the document.");
  }

  if (pageIndex < 0 || pageIndex >= pageCount) {
    throw new Error(`Invalid page index: ${pageIndex}. Document has ${pageCount} pages.`);
  }

  pdfDoc.removePage(pageIndex);
  return await pdfDoc.save();
}

/**
 * Reorders pages according to a new index permutation array.
 * e.g., [1, 0] swaps the first two pages of a 2-page document.
 */
export async function reorderPages(
  pdfBytes: Uint8Array | ArrayBuffer,
  newOrder: number[]
): Promise<Uint8Array> {
  const srcDoc = await PDFDocument.load(pdfBytes);
  const totalPages = srcDoc.getPageCount();

  if (newOrder.length !== totalPages) {
    throw new Error(
      `Invalid reorder array length: expected ${totalPages}, received ${newOrder.length}.`
    );
  }

  const destDoc = await PDFDocument.create();
  const copiedPages = await destDoc.copyPages(srcDoc, newOrder);

  for (const page of copiedPages) {
    destDoc.addPage(page);
  }

  return await destDoc.save();
}

/**
 * Inserts an image (PNG or JPEG) as a brand new page in the document.
 * If insertAtIndex is provided, inserts at that position; otherwise appends to the end.
 */
export async function insertImagePage(
  pdfBytes: Uint8Array | ArrayBuffer,
  imageBytes: Uint8Array | ArrayBuffer,
  mimeType?: string,
  insertAtIndex?: number
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const u8Image = imageBytes instanceof Uint8Array ? imageBytes : new Uint8Array(imageBytes);

  let embeddedImage;
  if (mimeType === "image/png" || isPng(u8Image)) {
    embeddedImage = await pdfDoc.embedPng(u8Image);
  } else {
    // Default to JPEG
    embeddedImage = await pdfDoc.embedJpg(u8Image);
  }

  const { width, height } = embeddedImage.scale(1);
  const totalPages = pdfDoc.getPageCount();

  const newPage =
    insertAtIndex !== undefined && insertAtIndex >= 0 && insertAtIndex <= totalPages
      ? pdfDoc.insertPage(insertAtIndex, [width, height])
      : pdfDoc.addPage([width, height]);

  newPage.drawImage(embeddedImage, {
    x: 0,
    y: 0,
    width,
    height,
  });

  return await pdfDoc.save();
}

/**
 * Standalone annotation burning engine using @cantoo/pdf-lib.
 * Reads base PDF bytes, deserializes annotation JSON (re-injecting stamps via ProjectService.getFile),
 * and burns annotations directly into the PDF content streams.
 *
 * Adheres strictly to Enum Safety: checks `type === PdfAnnotationSubtype.STAMP` (never numeric literals).
 */
export async function burnAnnotationsWithPdfLib(
  pdfBytes: Uint8Array | ArrayBuffer,
  annotationsJson: string,
  projectId: string,
  projectService: ProjectService
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pages = pdfDoc.getPages();

  if (!annotationsJson || annotationsJson.trim() === "" || annotationsJson === "[]") {
    return await pdfDoc.save();
  }

  const items = await deserializeAnnotations(projectId, annotationsJson, projectService);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

  for (const item of items) {
    const { annotation, ctx } = item;
    const pageIdx = annotation.pageIndex ?? 0;
    if (pageIdx < 0 || pageIdx >= pages.length) continue;

    const page = pages[pageIdx];
    const pageHeight = page.getHeight();

    // 1. STAMP: Re-inject image bytes and draw onto the page
    if (annotation.type === PdfAnnotationSubtype.STAMP) {
      const rawData = ctx?.data;
      if (rawData) {
        const u8 = rawData instanceof Uint8Array ? rawData : new Uint8Array(rawData as ArrayBuffer);
        try {
          const embeddedImg =
            ctx?.mimeType === "image/png" || isPng(u8)
              ? await pdfDoc.embedPng(u8)
              : await pdfDoc.embedJpg(u8);

          const rect = annotation.rect;
          const x = rect?.origin?.x ?? 72;
          const rectY = rect?.origin?.y ?? 72;
          const w = rect?.size?.width ?? 144;
          const h = rect?.size?.height ?? 96;

          // Convert EmbedPDF top-origin coordinates to PDF bottom-origin coordinates if needed
          const y = pageHeight > rectY + h ? pageHeight - rectY - h : rectY;

          page.drawImage(embeddedImg, {
            x,
            y,
            width: w,
            height: h,
          });
        } catch (err) {
          console.error("[page-operations] Failed to embed stamp image:", err);
        }
      }
    }

    // 2. HIGHLIGHT: Draw translucent highlight rectangles
    if (annotation.type === PdfAnnotationSubtype.HIGHLIGHT) {
      const rects = (annotation as unknown as { rects?: Array<{ origin: { x: number; y: number }; size: { width: number; height: number } }> }).rects ??
        (annotation.rect ? [annotation.rect] : []);

      for (const r of rects) {
        const x = r.origin.x;
        const h = r.size.height;
        const w = r.size.width;
        const y = pageHeight > r.origin.y + h ? pageHeight - r.origin.y - h : r.origin.y;

        page.drawRectangle({
          x,
          y,
          width: w,
          height: h,
          color: rgb(1, 0.9, 0.2), // Yellow highlight
          opacity: 0.4,
        });
      }
    }

    // 3. FREETEXT: Draw text annotations
    if (annotation.type === PdfAnnotationSubtype.FREETEXT) {
      const anyAnno = annotation as unknown as { contents?: string; fontSize?: number };
      const text = anyAnno.contents ?? "";
      if (text) {
        const rect = annotation.rect;
        const x = rect?.origin?.x ?? 50;
        const rectY = rect?.origin?.y ?? 50;
        const h = rect?.size?.height ?? 16;
        const y = pageHeight > rectY + h ? pageHeight - rectY - h : rectY;
        const fontSize = anyAnno.fontSize ?? 12;

        page.drawText(text, {
          x,
          y,
          size: fontSize,
          font,
          color: rgb(0.1, 0.1, 0.1),
        });
      }
    }
  }

  return await pdfDoc.save();
}
