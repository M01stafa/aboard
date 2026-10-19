import type { BinaryFileData, ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { projectService as defaultProjectService, type ProjectService } from "@/core/storage";
import { computeBlobSha256 } from "@/core/storage/sha256";
import { blobToDataURL } from "@/modules/board/image-utils";
import { boardRegistry } from "@/modules/board/board-registry";

type FileId = string & { _brand: "FileId" };

export interface InsertImageOptions {
  projectId: string;
  tabId: string;
  blob: Blob;
  mimeType: string;
  width: number;
  height: number;
  locked?: boolean;
  projectServiceOverride?: ProjectService;
  apiOverride?: ExcalidrawImperativeAPI;
}

export interface InsertCircuitSvgOptions {
  projectId: string;
  tabId: string;
  svg: string;
  projectServiceOverride?: ProjectService;
  apiOverride?: ExcalidrawImperativeAPI;
}

/**
 * Parses SVG dimensions safely without DOM insertion (SEC-7).
 */
export function parseSvgDimensions(svgString: string): { width: number; height: number } {
  const widthMatch = svgString.match(/width=["']([\d.]+)p?x?["']/i);
  const heightMatch = svgString.match(/height=["']([\d.]+)p?x?["']/i);
  const viewBoxMatch = svgString.match(
    /viewBox=["']\s*([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s*["']/i
  );

  let width = widthMatch
    ? parseFloat(widthMatch[1])
    : viewBoxMatch
    ? parseFloat(viewBoxMatch[3])
    : 800;
  let height = heightMatch
    ? parseFloat(heightMatch[1])
    : viewBoxMatch
    ? parseFloat(viewBoxMatch[4])
    : 600;

  if (!width || isNaN(width) || width <= 0) width = 800;
  if (!height || isNaN(height) || height <= 0) height = 600;

  return { width, height };
}

/**
 * Extracts natural image dimensions from a Blob across browser and test environments.
 */
export async function getImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      const dimensions = { width: bitmap.width, height: bitmap.height };
      bitmap.close?.();
      if (dimensions.width > 0 && dimensions.height > 0) {
        return dimensions;
      }
    } catch {
      // Fallback below
    }
  }

  if (typeof Image !== "undefined") {
    try {
      return await new Promise<{ width: number; height: number }>((resolve) => {
        const url = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => {
          URL.revokeObjectURL(url);
          resolve({
            width: img.naturalWidth || 800,
            height: img.naturalHeight || 1100,
          });
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          resolve({ width: 800, height: 1100 });
        };
        img.src = url;
      });
    } catch {
      // Fallback below
    }
  }

  return { width: 800, height: 1100 };
}

/**
 * Inserts an image Blob into the target whiteboard scene.
 * Satisfies INT-1, INT-2, and docs/specs/modules.md §8:
 * - Content-addressed binary storage via ProjectService.putFile.
 * - Added to Excalidraw binary files via addFiles.
 * - Created as a locked element so student can write over it without moving it.
 * - Automatically scrolls Excalidraw view to the newly inserted content.
 */
export async function insertImageIntoBoard({
  projectId,
  tabId,
  blob,
  mimeType,
  width,
  height,
  locked = true,
  projectServiceOverride,
  apiOverride,
}: InsertImageOptions): Promise<string> {
  const ps = projectServiceOverride ?? defaultProjectService;

  // 1. Content-addressed storage (SHA-256 hash)
  const fileId = await computeBlobSha256(blob);
  await ps.putFile(projectId, blob, { mime: mimeType, name: fileId }, fileId);

  // 2. Data URL generation for Excalidraw boundary
  const dataURL = await blobToDataURL(blob);

  // 3. Acquire active Excalidraw API
  const api = apiOverride ?? (await boardRegistry.waitFor(tabId, 5000));

  // 4. Register file with Excalidraw
  if (typeof api.addFiles === "function") {
    api.addFiles([
      {
        id: fileId,
        dataURL,
        mimeType,
        created: Date.now(),
      } as BinaryFileData,
    ]);
  }

  // 5. Position below existing content (or at (100, 100))
  const existing = typeof api.getSceneElements === "function" ? api.getSceneElements() : [];
  let x = 100;
  let y = 100;

  if (existing.length > 0) {
    let maxY = -Infinity;
    let minX = Infinity;
    for (const el of existing) {
      if (!el.isDeleted) {
        maxY = Math.max(maxY, el.y + (el.height || 0));
        minX = Math.min(minX, el.x);
      }
    }
    if (maxY !== -Infinity && isFinite(maxY)) {
      y = maxY + 40;
      x = isFinite(minX) ? minX : 100;
    }
  }

  // 6. Dynamically import convertToExcalidrawElements to protect SSR
  const { convertToExcalidrawElements } = await import("@excalidraw/excalidraw");

  const [imgElement] = convertToExcalidrawElements([
    {
      type: "image",
      fileId: fileId as FileId,
      x,
      y,
      width,
      height,
      locked,
    },
  ]);

  // 7. Update Excalidraw scene
  if (typeof api.updateScene === "function") {
    api.updateScene({ elements: [...existing, imgElement] });
  }

  // 8. Scroll to newly inserted content
  if (typeof api.scrollToContent === "function") {
    api.scrollToContent(imgElement, { fitToContent: true });
  }

  return fileId;
}

/**
 * Inserts a Circuit SVG into the target whiteboard scene (INT-2).
 * Strictly complies with SEC-7: treats SVG as a binary Blob, never inlining into the DOM.
 */
export async function insertCircuitSvgIntoBoard({
  projectId,
  tabId,
  svg,
  projectServiceOverride,
  apiOverride,
}: InsertCircuitSvgOptions): Promise<string> {
  const { width, height } = parseSvgDimensions(svg);
  const blob = new Blob([svg], { type: "image/svg+xml" });

  return insertImageIntoBoard({
    projectId,
    tabId,
    blob,
    mimeType: "image/svg+xml",
    width,
    height,
    locked: true,
    projectServiceOverride,
    apiOverride,
  });
}

export interface InsertTextNoteOptions {
  projectId: string;
  tabId: string;
  text: string;
  link?: string;
  apiOverride?: ExcalidrawImperativeAPI;
}

/**
 * Inserts a text note element onto the target whiteboard with an optional internal link (INT-4).
 */
export async function insertTextNoteIntoBoard({
  tabId,
  text,
  link,
  apiOverride,
}: InsertTextNoteOptions): Promise<string> {
  const api = apiOverride ?? (await boardRegistry.waitFor(tabId, 5000));
  const existing = typeof api.getSceneElements === "function" ? api.getSceneElements() : [];

  let x = 100;
  let y = 100;

  if (existing.length > 0) {
    let maxY = -Infinity;
    let minX = Infinity;
    for (const el of existing) {
      if (!el.isDeleted) {
        maxY = Math.max(maxY, el.y + (el.height || 0));
        minX = Math.min(minX, el.x);
      }
    }
    if (maxY !== -Infinity && isFinite(maxY)) {
      y = maxY + 40;
      x = isFinite(minX) ? minX : 100;
    }
  }

  const { convertToExcalidrawElements } = await import("@excalidraw/excalidraw");

  const [textElement] = convertToExcalidrawElements([
    {
      type: "text",
      text,
      x,
      y,
      fontSize: 20,
      link: link || null,
    },
  ]);

  if (typeof api.updateScene === "function") {
    api.updateScene({ elements: [...existing, textElement] });
  }

  if (typeof api.scrollToContent === "function") {
    api.scrollToContent(textElement, { fitToContent: true });
  }

  return textElement.id;
}

