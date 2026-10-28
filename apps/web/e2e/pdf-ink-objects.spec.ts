import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";
import { mockSignIn } from "./helpers/auth";

test.describe("PDF custom ink: no text selection while drawing, strokes are movable objects", () => {
  const projectId = "pdf-ink-objects-project";

  test.beforeEach(async ({ page }) => {
    await mockSignIn(page, { id: "test-pdf-ink-objects-user", email: "pdf.ink.objects@example.com" });
  });

  test("drawing over text selects nothing; Select tool drags the stroke", async ({ page }) => {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const p1 = pdfDoc.addPage([595.28, 841.89]);
    for (let i = 0; i < 6; i++) {
      p1.drawText("Selectable text line under the ink stroke for verification", {
        x: 50,
        y: 750 - i * 24,
        size: 16,
        font,
        color: rgb(0, 0, 0),
      });
    }
    const pdfBytes = await pdfDoc.save();

    await page.goto(`/workspace?p=${projectId}&kind=pdf`);
    const primaryPane = page.locator('.pane[data-slot="primary"]');
    const fileInput = primaryPane.locator('input[data-testid="pdf-file-input"]');
    await expect(fileInput).toBeAttached();
    await fileInput.setInputFiles({
      name: "ink-objects.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBytes),
    });

    const page1 = primaryPane.locator('[data-testid="pdf-page-1"]');
    await expect(page1).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(800);
    const box = await page1.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    // Draw across the text block
    await primaryPane.locator('[data-testid="pdf-tool-ink"]').click();
    const sx = box.x + 60;
    const sy = box.y + 100;
    const ex = box.x + 360;
    const ey = box.y + 180;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    for (let i = 1; i <= 20; i++) {
      await page.mouse.move(sx + ((ex - sx) * i) / 20, sy + ((ey - sy) * i) / 20);
    }
    await page.mouse.up();

    const strokePath = primaryPane.locator('[data-testid="pdf-custom-ink-layer-1"] path');
    await expect(strokePath).toHaveCount(1);

    // No native selection and no EmbedPDF selection rectangles
    const selectionState = await page.evaluate(() => ({
      native: window.getSelection()?.toString() ?? "",
      rects: Array.from(
        document.querySelectorAll('[data-testid="pdf-page-1"] [style*="mix-blend-mode"]')
      ).filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      }).length,
    }));
    expect(selectionState.native).toBe("");
    expect(selectionState.rects).toBe(0);

    // Select tool: click selects (bounding box), drag moves
    await primaryPane.locator('[data-testid="pdf-tool-select"]').click();
    await page.waitForTimeout(200);
    const before = await strokePath.evaluate((el: SVGElement) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width };
    });

    const mx = (sx + ex) / 2;
    const my = (sy + ey) / 2;
    await page.mouse.move(mx, my);
    await page.mouse.down();
    await expect(primaryPane.locator('[data-testid="pdf-custom-ink-bbox"]')).toBeVisible();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(mx + (80 * i) / 10, my + (120 * i) / 10);
    }
    await page.mouse.up();

    const after = await strokePath.evaluate((el: SVGElement) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width };
    });
    expect(Math.abs(after.left - before.left - 80)).toBeLessThanOrEqual(2);
    expect(Math.abs(after.top - before.top - 120)).toBeLessThanOrEqual(2);
    expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1);

    // Still no text selected after the drag
    const nativeAfter = await page.evaluate(() => window.getSelection()?.toString() ?? "");
    expect(nativeAfter).toBe("");

    // Undo returns the stroke to its original position
    await primaryPane.locator('[data-testid="pdf-undo-button"]').click();
    await expect
      .poll(async () =>
        strokePath.evaluate((el: SVGElement) => Math.round(el.getBoundingClientRect().left))
      )
      .toBe(Math.round(before.left));

    // Redo, then zoom: stroke and bounding box scale together
    await primaryPane.locator('[data-testid="pdf-redo-button"]').click();
    await primaryPane.locator('[data-testid="pdf-zoom-in"]').click();
    await page.waitForTimeout(500);
    const zoomed = await page.evaluate(() => {
      const path = document.querySelector('[data-testid="pdf-custom-ink-layer-1"] path');
      const g = document.querySelector('[data-testid="pdf-custom-ink-stroke"]');
      const poly = g?.querySelector("polyline");
      const pr = path?.getBoundingClientRect();
      const hr = poly?.getBoundingClientRect();
      return pr && hr ? { pathW: pr.width, hitW: hr.width } : null;
    });
    expect(zoomed).not.toBeNull();
    expect(zoomed!.pathW).toBeGreaterThan(before.width);
  });

  test("marquee selection selects custom stroke and Delete/Backspace removes it, Ctrl+Z restores it", async ({ page }) => {
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const p1 = pdfDoc.addPage([595.28, 841.89]);
    p1.drawText("Marquee selection & Delete shortcut verification", {
      x: 50,
      y: 750,
      size: 16,
      font,
      color: rgb(0, 0, 0),
    });
    const pdfBytes = await pdfDoc.save();

    await page.goto(`/workspace?p=${projectId}&kind=pdf`);
    const primaryPane = page.locator('.pane[data-slot="primary"]');
    const fileInput = primaryPane.locator('input[data-testid="pdf-file-input"]');
    await expect(fileInput).toBeAttached();
    await fileInput.setInputFiles({
      name: "marquee-test.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBytes),
    });

    const page1 = primaryPane.locator('[data-testid="pdf-page-1"]');
    await expect(page1).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(600);
    const box = await page1.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    // Draw a stroke in the middle of page1
    await primaryPane.locator('[data-testid="pdf-tool-ink"]').click();
    const sx = box.x + 100;
    const sy = box.y + 200;
    const ex = box.x + 220;
    const ey = box.y + 260;
    await page.mouse.move(sx, sy);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(sx + ((ex - sx) * i) / 10, sy + ((ey - sy) * i) / 10);
    }
    await page.mouse.up();

    const strokePath = primaryPane.locator('[data-testid="pdf-custom-ink-layer-1"] path');
    await expect(strokePath).toHaveCount(1);

    // Switch to Select tool
    await primaryPane.locator('[data-testid="pdf-tool-select"]').click();
    await page.waitForTimeout(200);

    // Drag a marquee box over the stroke starting from empty space
    const marqueeStartX = box.x + 20;
    const marqueeStartY = box.y + 150;
    const marqueeEndX = box.x + 350;
    const marqueeEndY = box.y + 350;

    await page.mouse.move(marqueeStartX, marqueeStartY);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(
        marqueeStartX + ((marqueeEndX - marqueeStartX) * i) / 10,
        marqueeStartY + ((marqueeEndY - marqueeStartY) * i) / 10
      );
    }

    // Verify marquee selection visual box is displayed while dragging
    const marqueeVisual = primaryPane.locator('[data-testid="pdf-marquee-selection"]');
    await expect(marqueeVisual).toBeVisible();

    await page.mouse.up();
    // After pointer up, marquee box hides and stroke shows its selection bounding box
    await expect(primaryPane.locator('[data-testid="pdf-custom-ink-bbox"]')).toBeVisible();

    // Press Delete key to delete selected annotation
    await page.keyboard.press("Delete");
    await expect(strokePath).toHaveCount(0);

    // Press Ctrl+Z to undo deletion and verify stroke reappears
    await page.keyboard.press("Control+z");
    await expect(strokePath).toHaveCount(1);

    // Click on the stroke to select it, then press Backspace to test Backspace deletion
    await page.mouse.click((sx + ex) / 2, (sy + ey) / 2);
    await expect(primaryPane.locator('[data-testid="pdf-custom-ink-bbox"]')).toBeVisible();

    await page.keyboard.press("Backspace");
    await expect(strokePath).toHaveCount(0);

    // Click Undo button to bring it back again
    await primaryPane.locator('[data-testid="pdf-undo-button"]').click();
    await expect(strokePath).toHaveCount(1);
  });
});

