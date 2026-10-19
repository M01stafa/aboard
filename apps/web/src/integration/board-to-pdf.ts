import { PDFDocument } from "@cantoo/pdf-lib";
import { projectService as defaultProjectService, type ProjectService } from "@/core/storage";
import { computeBlobSha256 } from "@/core/storage/sha256";
import type { PdfItemPayload } from "@/modules/pdf/types";
import { bus } from "@/core/bus";

export interface AppendBoardToPdfOptions {
  projectId: string;
  targetPdfItemId?: string;
  imageBlob: Blob;
  projectServiceOverride?: ProjectService;
}

export interface AppendBoardToPdfResult {
  targetPdfItemId: string;
  newFileKey: string;
  pageCount: number;
}

/**
 * Appends a whiteboard canvas image as a new page in a target PDF document (INT-3).
 * If target PDF exists, loads existing bytes, embeds image, appends page matching image
 * dimensions, and saves as a new version with content-addressed SHA-256 hash.
 * If no PDF exists in project, creates a new PDF document.
 */
export async function appendBoardToPdf(
  options: AppendBoardToPdfOptions
): Promise<AppendBoardToPdfResult> {
  const { projectId, imageBlob, projectServiceOverride } = options;
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

  // 3. Embed image into PDF matching dimensions
  const imageBytes = await imageBlob.arrayBuffer();
  const embeddedImage =
    imageBlob.type === "image/jpeg" || imageBlob.type === "image/jpg"
      ? await pdfDoc.embedJpg(imageBytes)
      : await pdfDoc.embedPng(imageBytes);

  const { width, height } = embeddedImage.scale(1);
  const newPage = pdfDoc.addPage([width, height]);
  newPage.drawImage(embeddedImage, {
    x: 0,
    y: 0,
    width,
    height,
  });

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
    lastPage: pageCount,
  };

  await ps.savePdf(
    projectId,
    resolvedTargetPdfItemId,
    JSON.stringify(updatedPayload),
    docName
  );

  // Notify any open viewer to refresh/navigate to the appended page
  bus.emit("pdf:item-updated", {
    itemId: resolvedTargetPdfItemId,
  });
  bus.emit("pdf:navigate-page", {
    itemId: resolvedTargetPdfItemId,
    page: pageCount,
  });

  return {
    targetPdfItemId: resolvedTargetPdfItemId,
    newFileKey: newHash,
    pageCount,
  };
}
