import type { PDFDocument, PDFFont } from "@cantoo/pdf-lib";
import fontkit from "@pdf-lib/fontkit";

let cachedFontBytes: ArrayBuffer | null = null;

/**
 * Loads font bytes from public/fonts in browser or filesystem in Node.
 */
export async function loadNotoArabicFontBytes(): Promise<ArrayBuffer> {
  if (cachedFontBytes) {
    return cachedFontBytes;
  }

  // 1. Browser fetch
  if (typeof window !== "undefined" && typeof fetch === "function") {
    const res = await fetch("/fonts/NotoNaskhArabic-Regular.ttf");
    if (!res.ok) {
      throw new Error(`Failed to fetch Noto font: ${res.statusText}`);
    }
    const ab = await res.arrayBuffer();
    cachedFontBytes = ab;
    return ab;
  }

  // 2. Node / test environment fallback
  try {
    const fs = await import("fs/promises");
    const path = await import("path");
    const candidates = [
      path.resolve(process.cwd(), "public/fonts/NotoNaskhArabic-Regular.ttf"),
      path.resolve(process.cwd(), "apps/web/public/fonts/NotoNaskhArabic-Regular.ttf"),
      path.resolve(process.cwd(), "../public/fonts/NotoNaskhArabic-Regular.ttf"),
      path.resolve(process.cwd(), "../../apps/web/public/fonts/NotoNaskhArabic-Regular.ttf"),
    ];

    for (const c of candidates) {
      try {
        const buf = await fs.readFile(c);
        const u8 = new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
        const ab = new ArrayBuffer(u8.byteLength);
        new Uint8Array(ab).set(u8);
        cachedFontBytes = ab;
        return ab;
      } catch {}
    }
  } catch {}

  throw new Error("NotoNaskhArabic-Regular.ttf could not be loaded");
}

/**
 * Registers fontkit with the PDFDocument and embeds NotoNaskhArabic font.
 */
export async function embedArabicFont(pdfDoc: PDFDocument): Promise<PDFFont> {
  // Register fontkit before embedding TTF font
  if (typeof (pdfDoc as unknown as { registerFontkit?: (fk: unknown) => void }).registerFontkit === "function") {
    pdfDoc.registerFontkit(fontkit);
  }

  const bytes = await loadNotoArabicFontBytes();
  // Do NOT pass { subset: true } as TTFSubset encoder throws on Arabic presentation tables
  return await pdfDoc.embedFont(bytes);
}
