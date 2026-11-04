import { PDFDocument, rgb, type PDFFont } from "@cantoo/pdf-lib";
import { detectDirection, type Dir } from "./direction";
import { toVisual } from "./bidiText";
import { embedArabicFont } from "./loadFont";

export interface TextOptions {
  pageIndex: number;
  x: number;           // click / origin position (PDF points)
  y: number;
  size: number;
  color?: [number, number, number];
  maxWidth?: number;
  lineHeight?: number;
  dir?: "auto" | "rtl" | "ltr";
}

/**
 * Adds text to an existing PDF buffer using Noto Naskh Arabic TTF font,
 * applying Arabic shaping and Unicode Bidi reordering per line.
 */
export async function addTextToPdf(
  pdfBytes: ArrayBuffer | Uint8Array,
  text: string,
  opt: TextOptions
): Promise<Uint8Array> {
  const pdf = await PDFDocument.load(pdfBytes);
  const font = await embedArabicFont(pdf);
  const page = pdf.getPage(opt.pageIndex);
  const [r, g, b] = opt.color ?? [0, 0, 0];
  const lh = opt.lineHeight ?? opt.size * 1.4;

  const lines = text.split("\n");
  lines.forEach((line, i) => {
    const dir: Dir = opt.dir && opt.dir !== "auto" ? opt.dir : detectDirection(line);
    const visual = toVisual(line, dir);
    const w = font.widthOfTextAtSize(visual, opt.size);

    // RTL: x point is right edge; LTR: left edge
    const x = dir === "rtl" ? opt.x - w : opt.x;
    const y = opt.y - i * lh;

    page.drawText(visual, { x, y, size: opt.size, font, color: rgb(r, g, b) });
  });

  return await pdf.save();
}
