import { PDFDocument, degrees, rgb, StandardFonts, type PDFImage } from "@cantoo/pdf-lib";
import { PdfAnnotationSubtype } from "@embedpdf/models";
import type { ProjectService } from "@/core/storage/project-service";
import { deserializeAnnotations, extractCustomInkStrokes } from "./annotation-storage";
import type { CustomInkStroke } from "./pdf-custom-ink-layer";

function parseStrokeColor(hex?: string): { r: number; g: number; b: number } {
  if (hex && hex.startsWith("#")) {
    const h = hex.slice(1);
    if (h.length === 6) {
      return {
        r: parseInt(h.slice(0, 2), 16) / 255,
        g: parseInt(h.slice(2, 4), 16) / 255,
        b: parseInt(h.slice(4, 6), 16) / 255,
      };
    }
  }
  return { r: 0.89, g: 0.26, b: 0.20 };
}

export function drawCustomInkStrokesOnDoc(
  pdfDoc: PDFDocument,
  customInkStrokes: Record<number, CustomInkStroke[]>
): void {
  const pages = pdfDoc.getPages();
  for (const [pageIdxStr, strokes] of Object.entries(customInkStrokes)) {
    const pageIdx = parseInt(pageIdxStr, 10);
    if (pageIdx < 0 || pageIdx >= pages.length) continue;
    const page = pages[pageIdx];
    const pageHeight = page.getHeight();

    for (const stroke of strokes) {
      if (!stroke.points || stroke.points.length < 2) continue;
      const c = parseStrokeColor(stroke.color);
      const ox = stroke.transform?.x ?? 0;
      const oy = stroke.transform?.y ?? 0;
      for (let i = 0; i < stroke.points.length - 1; i++) {
        const p1 = stroke.points[i];
        const p2 = stroke.points[i + 1];
        page.drawLine({
          start: { x: p1.x + ox, y: pageHeight - (p1.y + oy) },
          end: { x: p2.x + ox, y: pageHeight - (p2.y + oy) },
          thickness: stroke.width || 2,
          color: rgb(c.r, c.g, c.b),
          opacity: stroke.opacity ?? 1,
        });
      }
    }
  }
}

export function isPng(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 4 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  );
}

export function isJpg(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8;
}

/**
 * Detects actual image MIME type from binary magic bytes.
 * Prevents treating stamp images as "application/pdf".
 */
export function detectImageMime(bytes: Uint8Array): string {
  if (isPng(bytes)) return "image/png";
  if (isJpg(bytes)) return "image/jpeg";
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }
  if (bytes.length >= 3 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return "image/gif";
  }
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return "image/bmp";
  }
  if (bytes.length >= 1 && bytes[0] === 0x3c) {
    return "image/svg+xml";
  }
  return "image/png";
}

/**
 * Safely embeds an image into a PDFDocument.
 * If the image is PNG, uses embedPng.
 * If the image is JPEG (starts with SOI marker 0xFFD8), uses embedJpg.
 * If the image is another format (e.g. WebP, GIF, SVG, BMP) and in a browser context,
 * dynamically converts it to PNG via an offscreen canvas and embeds it.
 * If the image format is unsupported or unconvertible, logs a warning and returns null
 * to prevent breaking the overall PDF export.
 */
export async function embedImageSafely(
  pdfDoc: PDFDocument,
  imageBytes: Uint8Array | ArrayBuffer,
  mimeType?: string
): Promise<PDFImage | null> {
  const u8 = imageBytes instanceof Uint8Array ? imageBytes : new Uint8Array(imageBytes);

  // 1. Direct PNG embed
  if (isPng(u8)) {
    try {
      return await pdfDoc.embedPng(u8);
    } catch {
      // Fall through to conversion
    }
  }

  // 2. Direct JPEG embed
  if (isJpg(u8)) {
    try {
      return await pdfDoc.embedJpg(u8);
    } catch {
      // Fall through to conversion
    }
  }

  // Resolve true image MIME type, ignoring non-image fallback strings like application/pdf
  const actualMime =
    mimeType && mimeType.startsWith("image/") ? mimeType : detectImageMime(u8);

  // 3. In browser, convert any format (WebP, GIF, SVG, BMP, or non-standard JPEG) to PNG via Canvas
  if (typeof document !== "undefined" && typeof Image !== "undefined") {
    try {
      const blob = new Blob([u8 as BlobPart], { type: actualMime });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error(`Failed to decode image as ${actualMime}`));
        img.src = url;
      });
      URL.revokeObjectURL(url);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth || img.width || 100;
      canvas.height = img.naturalHeight || img.height || 100;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        const pngBlob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, "image/png")
        );
        if (pngBlob) {
          const ab = await pngBlob.arrayBuffer();
          return await pdfDoc.embedPng(new Uint8Array(ab));
        }
      }
    } catch (e) {
      console.warn("[page-operations] Canvas fallback conversion failed:", e);
    }
  }

  // 4. Fallback checks: only call embed if byte signatures actually match
  if (isPng(u8)) {
    try {
      return await pdfDoc.embedPng(u8);
    } catch {
      // return null below
    }
  }
  if (isJpg(u8)) {
    try {
      return await pdfDoc.embedJpg(u8);
    } catch {
      // return null below
    }
  }

  console.warn(
    `[page-operations] Unsupported stamp image format (${actualMime}), skipping embed without failing document.`
  );
  return null;
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

  const embeddedImage = await embedImageSafely(pdfDoc, u8Image, mimeType);
  if (!embeddedImage) {
    throw new Error(`Failed to decode image for page insertion: unsupported format`);
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
          const embeddedImg = await embedImageSafely(pdfDoc, u8, ctx?.mimeType);
          if (!embeddedImg) {
            continue;
          }

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

  // 4. CUSTOM INK: Burn custom ink strokes into page content streams
  const customInkStrokes = extractCustomInkStrokes(annotationsJson);
  drawCustomInkStrokesOnDoc(pdfDoc, customInkStrokes);

  return await pdfDoc.save();
}

/**
 * Burns custom ink strokes directly onto an existing PDF byte array.
 * Used after live exportScope.saveAsCopy() to merge custom strokes seamlessly.
 */
export async function burnCustomInkOnPdfBytes(
  pdfBytes: Uint8Array,
  customInkStrokes: Record<number, CustomInkStroke[]>
): Promise<Uint8Array> {
  const hasStrokes = Object.values(customInkStrokes).some((arr) => arr && arr.length > 0);
  if (!hasStrokes) return pdfBytes;

  const pdfDoc = await PDFDocument.load(pdfBytes);
  drawCustomInkStrokesOnDoc(pdfDoc, customInkStrokes);
  return await pdfDoc.save();
}
