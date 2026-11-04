import { computeBlobSha256 } from "@/core/storage/sha256";
import type { ProjectService } from "@/core/storage/project-service";
import type { PdfAnnotationObject } from "@embedpdf/models";
import type { AnnotationTransferItem } from "@embedpdf/plugin-annotation";
import type { CustomInkStroke } from "./pdf-custom-ink-layer";
import { detectImageMime } from "./page-operations";

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

export interface CustomStickyNote {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  color?: string;
  transform?: { x: number; y: number };
  rotation?: number;
}

export interface CustomTextBox {
  id: string;
  pageIndex: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
  text: string;
  fontSize: number;
  color: string;
}

export interface SerializedAnnotationsPayload {
  version?: number;
  items: SerializedAnnotationItem[];
  customInkStrokes?: Record<number, CustomInkStroke[]>;
  customStickyNotes?: Record<number, CustomStickyNote[]>;
  customTextBoxes?: Record<number, CustomTextBox[]>;
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
  projectService: ProjectService,
  customInkStrokes?: Record<number, CustomInkStroke[]>,
  customStickyNotes?: Record<number, CustomStickyNote[]>,
  customTextBoxes?: Record<number, CustomTextBox[]>
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
        let mimeType = clonedCtx.mimeType;
        if (!mimeType || mimeType === "application/pdf" || !mimeType.startsWith("image/")) {
          mimeType = detectImageMime(new Uint8Array(rawBuffer));
        }
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

  const hasInk = customInkStrokes && Object.values(customInkStrokes).some((arr) => arr.length > 0);
  const hasSticky = customStickyNotes && Object.values(customStickyNotes).some((arr) => arr.length > 0);

  const hasText = customTextBoxes && Object.values(customTextBoxes).some((arr) => arr.length > 0);

  if (hasInk || hasSticky || hasText) {
    const payload: SerializedAnnotationsPayload = {
      version: 2,
      items: serializedItems,
      customInkStrokes: customInkStrokes || {},
      customStickyNotes: customStickyNotes || {},
      customTextBoxes: customTextBoxes || {},
    };
    return JSON.stringify(payload);
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

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    console.error("[annotation-storage] Failed to parse annotations JSON:", err);
    return [];
  }

  let rawItems: SerializedAnnotationItem[] = [];
  if (Array.isArray(parsed)) {
    rawItems = parsed;
  } else if (
    parsed &&
    typeof parsed === "object" &&
    "items" in parsed &&
    Array.isArray((parsed as SerializedAnnotationsPayload).items)
  ) {
    rawItems = (parsed as SerializedAnnotationsPayload).items;
  } else {
    return [];
  }

  const restoredItems: AnnotationTransferItem[] = [];

  for (const item of rawItems) {
    const annotation = { ...item.annotation };
    let ctx = item.ctx ? { ...item.ctx } : undefined;

    const fileHash = (ctx?.fileId || ctx?.fileKey) as string | undefined;
    if (fileHash) {
      try {
        const blob = await projectService.getFile(projectId, fileHash);
        const arrayBuffer = await blob.arrayBuffer();
        const rawU8 = new Uint8Array(arrayBuffer);
        const detectedMime = detectImageMime(rawU8);
        ctx = {
          ...ctx,
          data: arrayBuffer,
          mimeType:
            ctx?.mimeType && ctx.mimeType.startsWith("image/")
              ? ctx.mimeType
              : blob.type && blob.type.startsWith("image/")
              ? blob.type
              : detectedMime,
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

/**
 * Extracts custom ink strokes from serialized JSON, returning an empty map if none found.
 */
export function extractCustomInkStrokes(json: string): Record<number, CustomInkStroke[]> {
  if (!json || json.trim() === "") return {};
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object" && "customInkStrokes" in parsed) {
      return (parsed as SerializedAnnotationsPayload).customInkStrokes || {};
    }
  } catch {}
  return {};
}

/**
 * Extracts custom sticky notes from serialized JSON, returning an empty map if none found.
 */
export function extractCustomStickyNotes(json: string): Record<number, CustomStickyNote[]> {
  if (!json || json.trim() === "") return {};
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object" && "customStickyNotes" in parsed) {
      return (parsed as SerializedAnnotationsPayload).customStickyNotes || {};
    }
  } catch {}
  return {};
}


/**
 * Extracts custom text boxes from serialized JSON, returning an empty map if none found.
 */
export function extractCustomTextBoxes(json: string): Record<number, CustomTextBox[]> {
  if (!json || json.trim() === "") return {};
  try {
    const parsed = JSON.parse(json);
    if (parsed && typeof parsed === "object" && "customTextBoxes" in parsed) {
      const raw = (parsed as SerializedAnnotationsPayload).customTextBoxes || {};
      const result: Record<number, CustomTextBox[]> = {};
      for (const [k, list] of Object.entries(raw)) {
        const pageIdx = parseInt(k, 10);
        if (Number.isNaN(pageIdx) || !Array.isArray(list)) continue;
        result[pageIdx] = list.map((b) => ({
          ...b,
          width: typeof b.width === "number" && !Number.isNaN(b.width) ? b.width : undefined,
          height: typeof b.height === "number" && !Number.isNaN(b.height) ? b.height : undefined,
        }));
      }
      return result;
    }
  } catch {}
  return {};
}
