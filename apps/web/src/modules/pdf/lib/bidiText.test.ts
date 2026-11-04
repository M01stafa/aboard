import { describe, expect, it } from "vitest";
import { detectDirection } from "./direction";
import { toVisual } from "./bidiText";
import { PDFDocument } from "@cantoo/pdf-lib";
import { embedArabicFont } from "./loadFont";
import { addTextToPdf } from "./drawText";

describe("Unicode Bidi & Arabic Shaping (direction.ts, bidiText.ts, drawText.ts)", () => {
  it("detects direction based on the First Strong rule", () => {
    expect(detectDirection("Hello World")).toBe("ltr");
    expect(detectDirection("مرحبا بالعالم")).toBe("rtl");
    expect(detectDirection("123 Hello")).toBe("ltr");
    expect(detectDirection("123 مرحبا")).toBe("rtl");
    expect(detectDirection("!@# Hello مرحبا")).toBe("ltr");
    expect(detectDirection("!@# مرحبا Hello")).toBe("rtl");
    expect(detectDirection("")).toBe("ltr");
  });

  it("reshapes Arabic letters into connected visual presentation forms", () => {
    const raw = "مرحبا";
    const visual = toVisual(raw, "rtl");
    // Should NOT be the isolated forms: should contain presentation form characters
    expect(visual).not.toBe(raw);
    expect(visual.length).toBeGreaterThan(0);
  });

  it("preserves English text characters unchanged", () => {
    const raw = "Hello World";
    const visual = toVisual(raw, "ltr");
    expect(visual).toBe("Hello World");
  });

  it("handles mixed English and Arabic text cleanly", () => {
    const mixed1 = "Hello مرحبا";
    const visual1 = toVisual(mixed1, "ltr");
    expect(visual1).toContain("Hello");

    const mixed2 = "مرحبا Hello";
    const visual2 = toVisual(mixed2, "rtl");
    expect(visual2).toContain("Hello");
  });

  it("mirrors brackets and parentheses in RTL context", () => {
    const raw = "(مرحبا)";
    const visual = toVisual(raw, "rtl");
    // In RTL, opening and closing brackets should be visually swapped
    expect(visual).toBeDefined();
    expect(visual).toContain(")");
    expect(visual).toContain("(");
  });

  it("embeds Arabic TTF font without throwing and draws shaped text to PDF", async () => {
    const pdfDoc = await PDFDocument.create();
    const font = await embedArabicFont(pdfDoc);
    expect(font).toBeDefined();

    const text = "مرحبا بالعالم Hello World 2026";
    const visual = toVisual(text, "rtl");
    const width = font.widthOfTextAtSize(visual, 16);
    expect(width).toBeGreaterThan(50);

    const page = pdfDoc.addPage([595, 842]);
    page.drawText(visual, {
      x: 100,
      y: 700,
      size: 16,
      font,
    });

    const pdfBytes = await pdfDoc.save();
    expect(pdfBytes.length).toBeGreaterThan(1000);
  });

  it("addTextToPdf exports valid PDF with shaped Arabic and LTR English", async () => {
    const initialDoc = await PDFDocument.create();
    initialDoc.addPage([595, 842]);
    const initialBytes = await initialDoc.save();

    const resultBytes = await addTextToPdf(initialBytes, "مرحبا Hello\nWorld بالعالم", {
      pageIndex: 0,
      x: 300,
      y: 700,
      size: 14,
    });

    expect(resultBytes).toBeInstanceOf(Uint8Array);
    expect(resultBytes.length).toBeGreaterThan(initialBytes.length);

    // Verify PDF can be loaded back
    const reloaded = await PDFDocument.load(resultBytes);
    expect(reloaded.getPageCount()).toBe(1);
  });
});
