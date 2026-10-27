import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";
import { mockSignIn } from "./helpers/auth";

test.describe("PDF Ink Alignment & Image Stamp Aspect Ratio", () => {
  const testUserId = "test-pdf-ink-stamp-user";
  const projectId = "pdf-ink-stamp-project";

  test.beforeEach(async ({ page }) => {
    await mockSignIn(page, {
      id: testUserId,
      email: "pdf.ink.stamp@example.com",
    });
    // Set Arabic RTL mode to test RTL coordinate stability
    await page.addInitScript(() => {
      localStorage.setItem("aboard:language", "ar");
    });
  });

  test("draws ink stroke with 1:1 alignment and inserts stamp preserving aspect ratio", async ({ page }) => {
    // 1. Generate test PDF
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const p1 = pdfDoc.addPage([595.28, 841.89]);
    p1.drawText("Ink Alignment & Aspect Ratio Verification", {
      x: 50,
      y: 750,
      size: 20,
      font,
      color: rgb(0, 0, 0),
    });
    const pdfBytes = await pdfDoc.save();

    await page.goto(`/workspace?p=${projectId}&kind=pdf`);
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();

    const primaryPane = page.locator('.pane[data-slot="primary"]');
    const fileInput = primaryPane.locator('input[data-testid="pdf-file-input"]');
    await expect(fileInput).toBeAttached();

    await fileInput.setInputFiles({
      name: "test-alignment.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBytes),
    });

    const page1 = primaryPane.locator('[data-testid="pdf-page-1"]');
    await expect(page1).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(600);

    const page1Box = await page1.boundingBox();
    expect(page1Box).not.toBeNull();
    if (!page1Box) return;

    // 2. Test Draw (Ink) tool
    await primaryPane.locator('[data-testid="pdf-tool-ink"]').click();
    await page.waitForTimeout(200);

    const drawStartX = page1Box.x + 180;
    const drawStartY = page1Box.y + 200;
    const drawEndX = page1Box.x + 280;
    const drawEndY = page1Box.y + 300;

    await page.mouse.move(drawStartX, drawStartY);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(
        drawStartX + ((drawEndX - drawStartX) * i) / 10,
        drawStartY + ((drawEndY - drawStartY) * i) / 10
      );
    }
    await page.mouse.up();

    // Verify SVG path preview renders aligned
    await expect.poll(async () => {
      return await page.evaluate(() => {
        return Boolean(document.querySelector('[data-testid="pdf-page-1"] svg path'));
      });
    }, { timeout: 5000 }).toBe(true);

    // Wait for ink commitDelay (800ms)
    await page.waitForTimeout(1000);

    // Verify committed path rect on screen
    const inkRect = await page.evaluate(() => {
      const paths = Array.from(document.querySelectorAll('[data-testid="pdf-page-1"] svg path'));
      // The ink stroke path is the one with visible stroke color or round linecap
      const inkPath = paths.find((p) => {
        const d = p.getAttribute("d") || "";
        return d.length > 20 && !d.includes("M21");
      });
      const r = inkPath?.getBoundingClientRect();
      return r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
    });
    expect(inkRect).not.toBeNull();
    expect(Math.abs(inkRect!.left - drawStartX)).toBeLessThanOrEqual(8);
    expect(Math.abs(inkRect!.top - drawStartY)).toBeLessThanOrEqual(8);

    // 3. Test Stamp tool preserving aspect ratio
    // Create a 200x100 (2:1 aspect ratio) test PNG
    // Using a 1x1 image or small data buffer
    // A 1x1 square PNG:
    const squarePngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const stampInput = primaryPane.locator('input[data-testid="pdf-stamp-input"]');
    await stampInput.setInputFiles({
      name: "square-logo.png",
      mimeType: "image/png",
      buffer: Buffer.from(squarePngBase64, "base64"),
    });

    // Verify stamp is created and check its aspect ratio (1:1 -> width === height)
    await expect.poll(async () => {
      return await page.evaluate(() => {
        const scope = (window as unknown as {
          __aboard_pdfAnnotations?: {
            scope?: { getAnnotations: () => unknown };
          };
        }).__aboard_pdfAnnotations?.scope;
        const res = scope?.getAnnotations();
        const list = Array.isArray(res)
          ? res
          : Object.values((res as Record<string, Array<{ object?: { type: number; rect?: { size: { width: number; height: number } } } }>>) || {}).flat();
        const stamp = list.find((a) => a.object?.type === 13);
        return stamp ? stamp.object?.rect?.size : null;
      });
    }, { timeout: 10000 }).not.toBeNull();

    const stampSize = await page.evaluate(() => {
      const scope = (window as unknown as {
        __aboard_pdfAnnotations?: {
          scope?: { getAnnotations: () => unknown };
        };
      }).__aboard_pdfAnnotations?.scope;
      const res = scope?.getAnnotations();
      const list = Array.isArray(res)
        ? res
        : Object.values((res as Record<string, Array<{ object?: { type: number; rect?: { size: { width: number; height: number } } } }>>) || {}).flat();
      const stamp = list.find((a) => a.object?.type === 13);
      return stamp?.object?.rect?.size ?? null;
    });

    expect(stampSize).not.toBeNull();
    // A 1x1 square image must have width === height (NOT the hardcoded 144x96 ratio!)
    expect(stampSize!.width).toBe(stampSize!.height);
  });
});
