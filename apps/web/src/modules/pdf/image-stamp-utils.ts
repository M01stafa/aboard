/**
 * Utility for processing and compressing PDF stamp images.
 * Preserves intrinsic aspect ratio and compresses large images
 * before insertion into the PDF annotation system (PDF-3).
 */

export interface ProcessedStampImage {
  buffer: ArrayBuffer;
  width: number;
  height: number;
  mimeType: string;
}

const MAX_STAMP_DIMENSION = 1200;
const COMPRESSION_BYTE_THRESHOLD = 300 * 1024; // 300KB
const BASE_STAMP_POINTS = 160; // Base size in PDF points (72 pt = 1 inch)

export async function processStampImage(file: File): Promise<ProcessedStampImage> {
  // If not in a browser environment with Canvas/DOM (e.g. Node tests), return raw file
  if (typeof document === "undefined" || typeof Image === "undefined") {
    const buffer = await file.arrayBuffer();
    return {
      buffer,
      width: 144,
      height: 96,
      mimeType: file.type || "image/png",
    };
  }

  // 1. Read image to obtain intrinsic width & height
  let naturalWidth = 0;
  let naturalHeight = 0;
  let sourceImage: CanvasImageSource | null = null;
  let cleanup = () => {};

  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      naturalWidth = bitmap.width;
      naturalHeight = bitmap.height;
      sourceImage = bitmap;
      cleanup = () => bitmap.close();
    } catch {
      // Fallback to Image element
    }
  }

  if (!sourceImage || naturalWidth === 0 || naturalHeight === 0) {
    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        naturalWidth = img.naturalWidth || img.width;
        naturalHeight = img.naturalHeight || img.height;
        sourceImage = img;
        cleanup = () => URL.revokeObjectURL(url);
        resolve();
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("Failed to decode image file"));
      };
      img.src = url;
    });
  }

  try {
    const origWidth = naturalWidth || 144;
    const origHeight = naturalHeight || 96;
    const aspectRatio = origWidth / origHeight;

    // 2. Compute proportional stamp dimensions on the PDF page (in points)
    let stampWidth: number;
    let stampHeight: number;
    if (aspectRatio >= 1) {
      stampWidth = BASE_STAMP_POINTS;
      stampHeight = Math.max(24, Math.round(BASE_STAMP_POINTS / aspectRatio));
    } else {
      stampHeight = BASE_STAMP_POINTS;
      stampWidth = Math.max(24, Math.round(BASE_STAMP_POINTS * aspectRatio));
    }

    // 3. Compress / downscale if image is large
    const isLarge =
      origWidth > MAX_STAMP_DIMENSION ||
      origHeight > MAX_STAMP_DIMENSION ||
      file.size > COMPRESSION_BYTE_THRESHOLD;

    if (!isLarge) {
      const buffer = await file.arrayBuffer();
      return {
        buffer,
        width: stampWidth,
        height: stampHeight,
        mimeType: file.type || "image/png",
      };
    }

    // Canvas downscaling
    const scaleFactor = Math.min(1, MAX_STAMP_DIMENSION / Math.max(origWidth, origHeight));
    const targetCanvasWidth = Math.max(1, Math.round(origWidth * scaleFactor));
    const targetCanvasHeight = Math.max(1, Math.round(origHeight * scaleFactor));

    const canvas = document.createElement("canvas");
    canvas.width = targetCanvasWidth;
    canvas.height = targetCanvasHeight;
    const ctx = canvas.getContext("2d");

    if (!ctx || !sourceImage) {
      const buffer = await file.arrayBuffer();
      return {
        buffer,
        width: stampWidth,
        height: stampHeight,
        mimeType: file.type || "image/png",
      };
    }

    ctx.drawImage(sourceImage, 0, 0, targetCanvasWidth, targetCanvasHeight);

    // Prefer image/webp for transparency + high compression, fallback to image/png or image/jpeg
    const targetMime =
      file.type === "image/png" || file.type === "image/webp"
        ? "image/webp"
        : "image/jpeg";

    const compressedBlob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((b) => resolve(b), targetMime, 0.85);
    });

    if (!compressedBlob) {
      const buffer = await file.arrayBuffer();
      return {
        buffer,
        width: stampWidth,
        height: stampHeight,
        mimeType: file.type || "image/png",
      };
    }

    const buffer = await compressedBlob.arrayBuffer();
    return {
      buffer,
      width: stampWidth,
      height: stampHeight,
      mimeType: compressedBlob.type || targetMime,
    };
  } finally {
    cleanup();
  }
}
