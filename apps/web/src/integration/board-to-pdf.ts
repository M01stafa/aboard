import { PDFDocument } from "@cantoo/pdf-lib";
import { projectService as defaultProjectService, type ProjectService } from "@/core/storage";
import { computeBlobSha256 } from "@/core/storage/sha256";
import type { PdfItemPayload } from "@/modules/pdf/types";
import { bus } from "@/core/bus";

export interface AppendBoardToPdfOptions {
  projectId: string;
  targetPdfItemId?: string;
  imageBlob: Blob;
  mode?: "append" | "overlay";
  targetPage?: number;
  projectServiceOverride?: ProjectService;
}

export interface AppendBoardToPdfResult {
  targetPdfItemId: string;
  newFileKey: string;
  pageCount: number;
}

/**
 * Appends a whiteboard canvas image as a new page or overlays it on the current page in a target PDF (INT-3).
 * If target PDF exists, loads existing bytes, embeds image, and either appends a new page or overlays
 * on the current page appropriately scaled, then saves as a new version with content-addressed SHA-256 hash.
 * If no PDF exists in project, creates a new PDF document.
 */
export async function appendBoardToPdf(
  options: AppendBoardToPdfOptions
): Promise<AppendBoardToPdfResult> {
  const { projectId, imageBlob, projectServiceOverride, mode = "append" } = options;
  let targetPdfItemId = options.targetPdfItemId;
  const ps = projectServiceOverride ?? defaultProjectService;

  let pdfDoc: PDFDocument;
  let payload: PdfItemPayload = {
    type: "alpha-pdf",
    version: 1,
    fileKey: "",
    name: "Whiteboard.pdf",
    lastPage: 1,
  };

  // 1. Resolve target PDF item
  let resolvedTargetPdfItemId: string = targetPdfItemId || "";
  if (!resolvedTargetPdfItemId) {
    try {
      const manifest = await ps.openProject(projectId);
      const existingPdf = manifest?.items?.find((i) => i.kind === "pdf");
      if (existingPdf) {
        resolvedTargetPdfItemId = existingPdf.id;
      } else {
        resolvedTargetPdfItemId = `pdf-${Date.now()}`;
      }
    } catch {
      resolvedTargetPdfItemId = `pdf-${Date.now()}`;
    }
  }

  // 2. Load existing PDF bytes or create a new document
  try {
    const raw = await ps.readItem(projectId, resolvedTargetPdfItemId);
    if (raw && raw.trim().length > 0) {
      const parsed = JSON.parse(raw) as PdfItemPayload;
      if (parsed && parsed.fileKey) {
        payload = parsed;
        const fileBlob = await ps.getFile(projectId, parsed.fileKey);
        const arrayBuf = await fileBlob.arrayBuffer();
        pdfDoc = await PDFDocument.load(arrayBuf);
      } else {
        pdfDoc = await PDFDocument.create();
      }
    } else {
      pdfDoc = await PDFDocument.create();
    }
  } catch {
    pdfDoc = await PDFDocument.create();
  }

  // 3. Embed image into PDF
  const imageBytes = await imageBlob.arrayBuffer();
  const embeddedImage =
    imageBlob.type === "image/jpeg" || imageBlob.type === "image/jpg"
      ? await pdfDoc.embedJpg(imageBytes)
      : await pdfDoc.embedPng(imageBytes);

  let targetPageNum = 1;

  if (mode === "overlay" && pdfDoc.getPageCount() > 0) {
    const totalPages = pdfDoc.getPageCount();
    targetPageNum = options.targetPage ?? payload.lastPage ?? 1;
    if (targetPageNum < 1) targetPageNum = 1;
    if (targetPageNum > totalPages) targetPageNum = totalPages;

    const page = pdfDoc.getPage(targetPageNum - 1);
    const { width: pageWidth, height: pageHeight } = page.getSize();

    // Scale appropriately to fit on the current page while preserving aspect ratio
    const scale = Math.min(pageWidth / embeddedImage.width, pageHeight / embeddedImage.height, 1);
    const drawWidth = embeddedImage.width * scale;
    const drawHeight = embeddedImage.height * scale;
    const x = (pageWidth - drawWidth) / 2;
    const y = (pageHeight - drawHeight) / 2;

    page.drawImage(embeddedImage, {
      x,
      y,
      width: drawWidth,
      height: drawHeight,
    });
  } else {
    // Append as a new page
    const { width, height } = embeddedImage.scale(1);
    const newPage = pdfDoc.addPage([width, height]);
    newPage.drawImage(embeddedImage, {
      x: 0,
      y: 0,
      width,
      height,
    });
    targetPageNum = pdfDoc.getPageCount();
  }

  const pageCount = pdfDoc.getPageCount();

  // 4. Save and compute new SHA-256 hash (new immutable version per PDF-6 / INT-3)
  const newPdfBytes = await pdfDoc.save();
  const newPdfBlob = new Blob([newPdfBytes], { type: "application/pdf" });
  const newHash = await computeBlobSha256(newPdfBlob);

  const docName = payload.name || "document.pdf";

  // 5. Save new file and update PDF item descriptor
  await ps.putFile(
    projectId,
    newPdfBlob,
    { name: docName, mime: "application/pdf" },
    newHash
  );

  const updatedPayload: PdfItemPayload = {
    ...payload,
    fileKey: newHash,
    lastPage: targetPageNum,
  };

  await ps.savePdf(
    projectId,
    resolvedTargetPdfItemId,
    JSON.stringify(updatedPayload),
    docName
  );

  // Notify any open viewer to refresh/navigate to the updated page
  bus.emit("pdf:item-updated", {
    itemId: resolvedTargetPdfItemId,
  });
  bus.emit("pdf:navigate-page", {
    itemId: resolvedTargetPdfItemId,
    page: targetPageNum,
  });

  return {
    targetPdfItemId: resolvedTargetPdfItemId,
    newFileKey: newHash,
    pageCount,
  };
}
