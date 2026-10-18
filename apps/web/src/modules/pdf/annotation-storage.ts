import { computeBlobSha256 } from "@/core/storage/sha256";
import type { ProjectService } from "@/core/storage/project-service";
import type { PdfAnnotationObject } from "@embedpdf/models";
import type { AnnotationTransferItem } from "@embedpdf/plugin-annotation";

export interface SerializedAnnotationItem {
  annotation: PdfAnnotationObject;
  ctx?: {
    fileId?: string;
    fileKey?: string;
    mimeType?: string;
    data?: unknown;
    [key: string]: unknown;
  };
}

/**
 * Serializes exported EmbedPDF transfer items into clean, lightweight JSON.
 * Stored separately from the original PDF (PDF-4).
 *
 * For stamps and any annotations carrying binary image data:
 * - Extracts binary bytes (ArrayBuffer or Uint8Array)
 * - Computes content-addressed SHA-256 hash
 * - Saves binary bytes via ProjectService.putFile
 * - Replaces binary data with lightweight reference { fileId: hash, fileKey: hash }
 * - Zero Base64 strings or binary buffers in output JSON
 */
export async function serializeAnnotations(
  projectId: string,
  _pdfHash: string,
  items: AnnotationTransferItem[],
  projectService: ProjectService
): Promise<string> {
  const serializedItems: SerializedAnnotationItem[] = [];

  for (const item of items) {
    const clonedAnnotation: PdfAnnotationObject = { ...item.annotation };

    let clonedCtx: SerializedAnnotationItem["ctx"] = item.ctx
      ? { ...item.ctx }
      : undefined;

    // Check for binary data in ctx.data (standard EmbedPDF stamp export format)
    if (clonedCtx?.data) {
      let rawBuffer: ArrayBuffer | null = null;
      if (clonedCtx.data instanceof ArrayBuffer) {
        rawBuffer = clonedCtx.data;
      } else if (ArrayBuffer.isView(clonedCtx.data)) {
        const view = clonedCtx.data as ArrayBufferView;
        rawBuffer = view.buffer.slice(
          view.byteOffset,
          view.byteOffset + view.byteLength
        ) as ArrayBuffer;
      }

      if (rawBuffer) {
        const mimeType = clonedCtx.mimeType || "application/pdf";
        const blob = new Blob([rawBuffer], { type: mimeType });
        const hash = await computeBlobSha256(blob);

        await projectService.putFile(
          projectId,
          blob,
          { name: `stamp-${hash}`, mime: mimeType },
          hash
        );

        clonedCtx = {
          ...clonedCtx,
          fileId: hash,
          fileKey: hash,
          mimeType,
        };
        delete clonedCtx.data;
      }
    }

    // Strip any raw data URLs from annotation properties to guarantee zero inline base64
    const anyAnno = clonedAnnotation as unknown as Record<string, unknown>;
    if (typeof anyAnno.imageSrc === "string" && anyAnno.imageSrc.startsWith("data:")) {
      delete anyAnno.imageSrc;
    }

    serializedItems.push({
      annotation: clonedAnnotation,
      ctx: clonedCtx,
    });
  }

  return JSON.stringify(serializedItems);
}

/**
 * Reconstructs portable AnnotationTransferItems from serialized JSON.
 * Fetches referenced binary stamp files via ProjectService.getFile(hash),
 * converts them back to ArrayBuffers, and prepares items for importAnnotations().
 */
export async function deserializeAnnotations(
  projectId: string,
  json: string,
  projectService: ProjectService
): Promise<AnnotationTransferItem[]> {
  if (!json || json.trim() === "") {
    return [];
  }

  let parsed: SerializedAnnotationItem[];
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    console.error("[annotation-storage] Failed to parse annotations JSON:", err);
    return [];
  }

  if (!Array.isArray(parsed)) {
    return [];
  }

  const restoredItems: AnnotationTransferItem[] = [];

  for (const item of parsed) {
    const annotation = { ...item.annotation };
    let ctx = item.ctx ? { ...item.ctx } : undefined;

    const fileHash = (ctx?.fileId || ctx?.fileKey) as string | undefined;
    if (fileHash) {
      try {
        const blob = await projectService.getFile(projectId, fileHash);
        const arrayBuffer = await blob.arrayBuffer();
        ctx = {
          ...ctx,
          data: arrayBuffer,
          mimeType: ctx?.mimeType || blob.type || "application/pdf",
        };
      } catch (err) {
        console.error(
          `[annotation-storage] Failed to restore stamp binary for hash ${fileHash}:`,
          err
        );
      }
    }

    const anyAnno = annotation as unknown as Record<string, unknown>;
    if (anyAnno.type === 9 && !anyAnno.segmentRects && Array.isArray(anyAnno.rects)) {
      anyAnno.segmentRects = anyAnno.rects;
    }

    restoredItems.push({
      annotation,
      ctx: ctx as AnnotationTransferItem["ctx"],
    });
  }

  return restoredItems;
}
