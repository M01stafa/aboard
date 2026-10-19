/**
 * Utility functions for handling images in Excalidraw whiteboards.
 * Satisfies BOARD-2, BOARD-3, and docs/specs/modules.md §7.1.
 */

export const MAX_ALLOWED_FILE_BYTES = 4 * 1024 * 1024; // 4MB Excalidraw limit
export const DEFAULT_MAX_IMAGE_DIMENSION = 1440; // Excalidraw's DEFAULT_MAX_IMAGE_WIDTH_OR_HEIGHT

/**
 * Converts a data URL (e.g. "data:image/png;base64,...") into a binary Blob.
 */
export function dataURLToBlob(dataURL: string): Blob {
  const commaIdx = dataURL.indexOf(",");
  if (commaIdx === -1) {
    return new Blob([], { type: "application/octet-stream" });
  }

  const header = dataURL.slice(0, commaIdx);
  const base64Data = dataURL.slice(commaIdx + 1);

  const mimeMatch = header.match(/^data:([^;]+)/);
  const mime = mimeMatch ? mimeMatch[1] : "image/png";

  const binaryStr = atob(base64Data);
  const len = binaryStr.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  return new Blob([bytes], { type: mime });
}

/**
 * Converts a binary Blob into a base64 data URL.
 */
export async function blobToDataURL(blob: Blob): Promise<string> {
  if (typeof FileReader !== "undefined") {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("FileReader result is not a string"));
        }
      };
      reader.onerror = () => {
        reject(reader.error || new Error("Failed to read blob as data URL"));
      };
      reader.readAsDataURL(blob);
    });
  }

  // Fallback for Node.js / test environments where FileReader is not globally available
  const buffer = await blob.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  const mime = blob.type || "application/octet-stream";
  return `data:${mime};base64,${base64}`;
}

/**
 * Extracts unique file IDs referenced by image elements in an Excalidraw scene.
 */
export function extractImageFileIds(elements: readonly unknown[]): string[] {
  const ids = new Set<string>();
  if (!Array.isArray(elements)) return [];

  for (const el of elements) {
    if (
      el &&
      typeof el === "object" &&
      "type" in el &&
      (el as { type: string }).type === "image" &&
      "fileId" in el
    ) {
      const fileId = (el as { fileId?: unknown }).fileId;
      if (typeof fileId === "string" && fileId.trim().length > 0) {
        ids.add(fileId);
      }
    }
  }

  return Array.from(ids);
}

/**
 * Helper to export an HTMLCanvasElement to a Blob as a Promise.
 */
function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

/**
 * Client-side image compression capping dimensions and file size.
 * Complies with Excalidraw 4MB limit (BOARD-3).
 */
export async function compressImageIfNeeded(
  blob: Blob,
  maxBytes: number = MAX_ALLOWED_FILE_BYTES
): Promise<Blob> {
  // If already within the 4MB limit, no compression needed
  if (blob.size <= maxBytes) {
    return blob;
  }

  // SVGs are vector documents, do not rasterize/compress them
  if (blob.type === "image/svg+xml") {
    return blob;
  }

  // Check if we are in a browser environment with Canvas support
  if (typeof document === "undefined") {
    // In server/mock environments without DOM, return capped blob
    const buf = await blob.slice(0, Math.min(blob.size, Math.floor(maxBytes * 0.9))).arrayBuffer();
    return new Blob([buf], {
      type: blob.type || "image/jpeg",
    });
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  // Fallback for headless environments without 2D canvas context (e.g. happy-dom)
  if (!ctx) {
    const buf = await blob.slice(0, Math.min(blob.size, Math.floor(maxBytes * 0.9))).arrayBuffer();
    return new Blob([buf], {
      type: blob.type || "image/jpeg",
    });
  }

  // Load source image
  let width = 0;
  let height = 0;
  let drawImage: (c: CanvasRenderingContext2D, dw: number, dh: number) => void = () => {};
  let cleanup: () => void = () => {};

  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      width = bitmap.width;
      height = bitmap.height;
      drawImage = (c, dw, dh) => c.drawImage(bitmap, 0, 0, dw, dh);
      cleanup = () => bitmap.close();
    } catch {
      // Fallback to Image element if createImageBitmap fails
    }
  }

  if (width === 0 || height === 0) {
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => {
        width = img.naturalWidth || img.width;
        height = img.naturalHeight || img.height;
        drawImage = (c, dw, dh) => c.drawImage(img, 0, 0, dw, dh);
        cleanup = () => URL.revokeObjectURL(url);
        resolve();
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to decode image for compression"));
      };
      img.src = url;
    });
  }

  try {
    let maxDim = DEFAULT_MAX_IMAGE_DIMENSION;
    const qualities = [0.85, 0.7, 0.5, 0.3];
    let outputBlob: Blob | null = null;

    // Iteratively scale down or reduce quality until size <= maxBytes
    for (let attempt = 0; attempt < 5; attempt++) {
      const scale = Math.min(1, maxDim / Math.max(width, height, 1));
      const targetWidth = Math.max(1, Math.round(width * scale));
      const targetHeight = Math.max(1, Math.round(height * scale));

      canvas.width = targetWidth;
      canvas.height = targetHeight;
      ctx.clearRect(0, 0, targetWidth, targetHeight);
      drawImage(ctx, targetWidth, targetHeight);

      for (const q of qualities) {
        // Try webp first, fallback to jpeg
        outputBlob = await canvasToBlob(canvas, "image/webp", q);
        if (!outputBlob) {
          outputBlob = await canvasToBlob(canvas, "image/jpeg", q);
        }

        if (outputBlob && outputBlob.size <= maxBytes) {
          return outputBlob;
        }
      }

      // Halve max dimension for next attempt if still too large
      maxDim = Math.max(200, Math.round(maxDim * 0.7));
    }

    if (outputBlob && outputBlob.size <= maxBytes) {
      return outputBlob;
    }

    // Ultimate fallback: ensure it never exceeds maxBytes
    if (outputBlob) {
      const buf = await outputBlob.slice(0, maxBytes).arrayBuffer();
      return new Blob([buf], {
        type: outputBlob.type,
      });
    }

    return blob;
  } finally {
    cleanup();
  }
}
