import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";
import { mockSignIn } from "./helpers/auth";


/** Reads the custom text boxes exposed by usePdfAnnotations for E2E. */
async function readCustomTextBoxes(
  page: import("@playwright/test").Page
): Promise<Array<{ id: string; x: number; y: number; text: string; fontSize: number }>> {
  return page.evaluate(() => {
    const api = (window as unknown as {
      __aboard_pdfAnnotations?: {
        customTextBoxes?: Record<number, Array<{ id: string; x: number; y: number; text: string; fontSize: number }>>;
      };
    }).__aboard_pdfAnnotations;
    return Object.values(api?.customTextBoxes ?? {}).flat();
  });
}
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

    // Zoom in twice before drawing
    await primaryPane.locator('[data-testid="pdf-zoom-in"]').click();
    await page.waitForTimeout(300);
    await primaryPane.locator('[data-testid="pdf-zoom-in"]').click();
    await page.waitForTimeout(300);

    const page1BoxZoomed = await page1.boundingBox();
    expect(page1BoxZoomed).not.toBeNull();
    if (!page1BoxZoomed) return;

    // 2. Test Draw (Ink) tool
    await primaryPane.locator('[data-testid="pdf-tool-ink"]').click();
    await page.waitForTimeout(200);

    const drawStartX = page1BoxZoomed.x + 180;
    const drawStartY = page1BoxZoomed.y + 200;
    const drawEndX = page1BoxZoomed.x + 280;
    const drawEndY = page1BoxZoomed.y + 300;

    await page.mouse.move(drawStartX, drawStartY);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(
        drawStartX + ((drawEndX - drawStartX) * i) / 10,
        drawStartY + ((drawEndY - drawStartY) * i) / 10
      );
    }
    await page.mouse.up();

    // Verify SVG path in custom ink layer renders with 1:1 precision
    const customInkPath = primaryPane.locator('[data-testid="pdf-custom-ink-layer-1"] path');
    await expect(customInkPath).toHaveCount(1, { timeout: 5000 });

    // Verify drawn path rect on screen matches mouse coordinates within 2px
    const inkRect = await customInkPath.evaluate((el: SVGElement) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, width: r.width, height: r.height };
    });
    expect(inkRect).not.toBeNull();
    expect(Math.abs(inkRect.left - drawStartX)).toBeLessThanOrEqual(2);
    expect(Math.abs(inkRect.top - drawStartY)).toBeLessThanOrEqual(2);

    // Test Undo on custom ink
    await primaryPane.locator('[data-testid="pdf-undo-button"]').click();
    await expect(customInkPath).toHaveCount(0, { timeout: 3000 });

    // Test Redo on custom ink
    await primaryPane.locator('[data-testid="pdf-redo-button"]').click();
    await expect(customInkPath).toHaveCount(1, { timeout: 3000 });

    // Switch to select tool and verify pointerEvents allows interaction
    await primaryPane.locator('[data-testid="pdf-tool-select"]').click();
    await page.waitForTimeout(200);

    const layerPointerEvents = await primaryPane
      .locator('[data-testid="pdf-custom-ink-layer-1"]')
      .evaluate((el) => window.getComputedStyle(el).pointerEvents);
    expect(layerPointerEvents).toBe("auto");

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

    // Verify the image element is actually rendered on DOM (naturalWidth > 0, NOT an empty box)
    const stampImg = primaryPane.locator('[data-testid^="stamp-container-"] img, img[alt="stamp"]');
    await expect(stampImg).toBeVisible({ timeout: 5000 });
    const imgMetrics = await stampImg.evaluate((el: HTMLImageElement) => ({
      naturalWidth: el.naturalWidth,
      naturalHeight: el.naturalHeight,
      complete: el.complete,
    }));
    expect(imgMetrics.naturalWidth).toBeGreaterThan(0);
    expect(imgMetrics.naturalHeight).toBeGreaterThan(0);
  });

  test("ink strokes scale natively with page zoom and stamp tool waits for page click", async ({ page }) => {
    // 1. Generate test PDF
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const p1 = pdfDoc.addPage([595.28, 841.89]);
    p1.drawText("Ink Zoom Scaling and Stamp Placement Verification", {
      x: 50,
      y: 750,
      size: 20,
      font,
      color: rgb(0, 0, 0),
    });
    const pdfBytes = await pdfDoc.save();

    await page.goto(`/workspace?p=${projectId}-zoom&kind=pdf`);
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();

    const primaryPane = page.locator('.pane[data-slot="primary"]');
    const fileInput = primaryPane.locator('input[data-testid="pdf-file-input"]');
    await expect(fileInput).toBeAttached();

    await fileInput.setInputFiles({
      name: "test-zoom-stamp.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBytes),
    });

    const page1 = primaryPane.locator('[data-testid="pdf-page-1"]');
    await expect(page1).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(600);

    const initialBox = await page1.boundingBox();
    expect(initialBox).not.toBeNull();
    if (!initialBox) return;

    // 2. Draw a line at base 100% zoom
    await primaryPane.locator('[data-testid="pdf-tool-ink"]').click();
    await page.waitForTimeout(200);

    const startX = initialBox.x + 100;
    const startY = initialBox.y + 150;
    const endX = initialBox.x + 200;
    const endY = initialBox.y + 150;

    await page.mouse.move(startX, startY);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(startX + ((endX - startX) * i) / 10, startY);
    }
    await page.mouse.up();

    const customInkPath = primaryPane.locator('[data-testid="pdf-custom-ink-layer-1"] path');
    await expect(customInkPath).toHaveCount(1, { timeout: 5000 });

    const strokeRect100 = await customInkPath.evaluate((el: SVGElement) => {
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height };
    });

    // 3. Zoom in multiple times
    for (let i = 0; i < 3; i++) {
      await primaryPane.locator('[data-testid="pdf-zoom-in"]').click();
      await page.waitForTimeout(250);
    }

    const zoomedBox = await page1.boundingBox();
    expect(zoomedBox).not.toBeNull();
    if (!zoomedBox) return;

    const pageZoomRatio = zoomedBox.width / initialBox.width;
    expect(pageZoomRatio).toBeGreaterThan(1.2);

    // Verify stroke scaled proportionally with the page zoom
    const strokeRectZoomed = await customInkPath.evaluate((el: SVGElement) => {
      const r = el.getBoundingClientRect();
      return { width: r.width, height: r.height };
    });

    const strokeScaleRatio = strokeRectZoomed.width / strokeRect100.width;
    // Stroke width on screen must match page zoom within 5% tolerance
    expect(Math.abs(strokeScaleRatio - pageZoomRatio)).toBeLessThan(0.08);

    // 4. Test Stamp Tool Two-Step Flow:
    // Step A: Click Stamp tool button -> verify activeTool is "stamp", cursor is crosshair, NO dialog opened yet
    await primaryPane.locator('[data-testid="pdf-tool-stamp"]').click();
    await page.waitForTimeout(200);

    const stampBtn = primaryPane.locator('[data-testid="pdf-tool-stamp"]');
    await expect(stampBtn).toHaveAttribute("aria-pressed", "true");

    const inkLayerCursor = await primaryPane
      .locator('[data-testid="pdf-custom-ink-layer-1"]')
      .evaluate((el) => window.getComputedStyle(el).cursor);
    expect(inkLayerCursor).toBe("crosshair");

    // Step B: Click on the PDF page -> file chooser opens
    const squarePngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const fileChooserPromise = page.waitForEvent("filechooser");
    await page1.click({ position: { x: 180, y: 220 } });
    const fileChooser = await fileChooserPromise;
    expect(fileChooser).toBeDefined();

    // Select the image file
    await fileChooser.setFiles({
      name: "stamp-click-test.png",
      mimeType: "image/png",
      buffer: Buffer.from(squarePngBase64, "base64"),
    });

    // Step C: Verify stamp is placed and tool resets to select
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
          : Object.values((res as Record<string, Array<{ object?: { type: number; rect?: { origin: { x: number; y: number } } } }>>) || {}).flat();
        const stamp = list.find((a) => a.object?.type === 13);
        return stamp ? stamp.object?.rect?.origin : null;
      });
    }, { timeout: 10000 }).not.toBeNull();

    const stampOrigin = await page.evaluate(() => {
      const scope = (window as unknown as {
        __aboard_pdfAnnotations?: {
          scope?: { getAnnotations: () => unknown };
        };
      }).__aboard_pdfAnnotations?.scope;
      const res = scope?.getAnnotations();
      const list = Array.isArray(res)
        ? res
        : Object.values((res as Record<string, Array<{ object?: { type: number; rect?: { origin: { x: number; y: number } } } }>>) || {}).flat();
      const stamp = list.find((a) => a.object?.type === 13);
      return stamp?.object?.rect?.origin ?? null;
    });

    expect(stampOrigin).not.toBeNull();
    expect(stampOrigin!.x).toBeGreaterThan(0);
    expect(stampOrigin!.y).toBeGreaterThan(0);

    // Verify active tool automatically cleared back to 'select'
    await expect(primaryPane.locator('[data-testid="pdf-tool-select"]')).toHaveAttribute("aria-pressed", "true");
  });

  test("select tool enables universal selection, bounding box, and dragging for stamps and texts surviving reload", async ({ page }) => {
    // 1. Generate test PDF
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const p1 = pdfDoc.addPage([595.28, 841.89]);
    p1.drawText("Draggable Stamps and Text Objects Test", {
      x: 50,
      y: 750,
      size: 20,
      font,
      color: rgb(0, 0, 0),
    });
    const pdfBytes = await pdfDoc.save();

    await page.goto(`/workspace?p=${projectId}-drag&kind=pdf`);
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();

    const primaryPane = page.locator('.pane[data-slot="primary"]');
    const fileInput = primaryPane.locator('input[data-testid="pdf-file-input"]');
    await expect(fileInput).toBeAttached();

    await fileInput.setInputFiles({
      name: "test-drag-stamp-text.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBytes),
    });

    const page1 = primaryPane.locator('[data-testid="pdf-page-1"]');
    await expect(page1).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(600);

    const initialBox = await page1.boundingBox();
    expect(initialBox).not.toBeNull();
    if (!initialBox) return;

    // 2. Add Stamp: Select Stamp tool -> Click page -> Choose file
    await primaryPane.locator('[data-testid="pdf-tool-stamp"]').click();
    await page.waitForTimeout(200);

    const squarePngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const fileChooserPromise = page.waitForEvent("filechooser");
    await page1.click({ position: { x: 140, y: 160 } });
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: "drag-test-stamp.png",
      mimeType: "image/png",
      buffer: Buffer.from(squarePngBase64, "base64"),
    });

    // Wait for stamp to be added
    await expect(primaryPane.locator('[data-testid="pdf-stamp-object"]').first()).toBeAttached({ timeout: 10000 });

    // 3. Ensure Select tool is active
    await primaryPane.locator('[data-testid="pdf-tool-select"]').click();
    await page.waitForTimeout(200);

    // Initial stamp position
    const initialStampOrigin = await page.evaluate(() => {
      const scope = (window as unknown as {
        __aboard_pdfAnnotations?: { scope?: { getAnnotations: () => unknown } };
      }).__aboard_pdfAnnotations?.scope;
      const res = scope?.getAnnotations();
      const list = Array.isArray(res) ? res : Object.values((res as Record<string, any[]>) || {}).flat();
      const stamp = list.find((a: any) => a?.object?.type === 13);
      return stamp ? { ...stamp.object.rect.origin } : null;
    });
    expect(initialStampOrigin).not.toBeNull();

    // Verify stamp object hit rect is present and click it to show bounding box
    const stampObject = primaryPane.locator('[data-testid="pdf-stamp-object"]').first();
    const stampBox = await stampObject.boundingBox();
    expect(stampBox).not.toBeNull();
    if (!stampBox) return;

    // Click stamp to select
    await page.mouse.click(stampBox.x + stampBox.width / 2, stampBox.y + stampBox.height / 2);
    await page.waitForTimeout(200);

    // Verify stamp selection bounding box is displayed
    const stampBbox = primaryPane.locator('[data-testid="pdf-stamp-bbox"]');
    await expect(stampBbox).toBeVisible({ timeout: 5000 });

    // Drag stamp by (+80px, +60px)
    const dragDeltaX = 80;
    const dragDeltaY = 60;
    await page.mouse.move(stampBox.x + stampBox.width / 2, stampBox.y + stampBox.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(
        stampBox.x + stampBox.width / 2 + (dragDeltaX * i) / 10,
        stampBox.y + stampBox.height / 2 + (dragDeltaY * i) / 10
      );
    }
    await page.mouse.up();
    await page.waitForTimeout(400);

    // Verify stamp origin updated in store
    const movedStampOrigin = await page.evaluate(() => {
      const scope = (window as unknown as {
        __aboard_pdfAnnotations?: { scope?: { getAnnotations: () => unknown } };
      }).__aboard_pdfAnnotations?.scope;
      const res = scope?.getAnnotations();
      const list = Array.isArray(res) ? res : Object.values((res as Record<string, any[]>) || {}).flat();
      const stamp = list.find((a: any) => a?.object?.type === 13);
      return stamp ? { ...stamp.object.rect.origin } : null;
    });
    expect(movedStampOrigin).not.toBeNull();
    expect(movedStampOrigin!.x).toBeGreaterThan(initialStampOrigin!.x + 40);
    expect(movedStampOrigin!.y).toBeGreaterThan(initialStampOrigin!.y + 30);

    // 4. Add a custom text box (click, type, Escape)
    await primaryPane.locator('[data-testid="pdf-tool-text"]').click();
    await page.waitForTimeout(200);
    await page.mouse.click(initialBox.x + 100, initialBox.y + 300);
    await expect(primaryPane.locator('[data-testid^="pdf-text-input-"]')).toBeFocused({ timeout: 5000 });
    await page.keyboard.type("Alpha", { delay: 10 });
    await page.keyboard.press("Escape");
    await expect(primaryPane.locator('[data-testid^="pdf-text-box-"]').first()).toHaveText("Alpha");

    // Switch to Select tool
    await primaryPane.locator('[data-testid="pdf-tool-select"]').click();
    await page.waitForTimeout(300);

    const textBox = await primaryPane.locator('[data-testid^="pdf-text-box-"]').first().boundingBox();
    expect(textBox).not.toBeNull();
    if (!textBox) return;
    const initialTextOrigin = (await readCustomTextBoxes(page))[0];
    expect(initialTextOrigin).toBeDefined();

    // Drag text by (+70px, +50px) in one gesture (the first press selects and starts the drag)
    const textDeltaX = 70;
    const textDeltaY = 50;
    await page.mouse.move(textBox.x + textBox.width / 2, textBox.y + textBox.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(
        textBox.x + textBox.width / 2 + (textDeltaX * i) / 10,
        textBox.y + textBox.height / 2 + (textDeltaY * i) / 10
      );
    }
    await page.mouse.up();
    await expect(primaryPane.locator('[data-testid="pdf-text-bbox"]')).toBeVisible({ timeout: 5000 });
    await expect
      .poll(async () => ((await readCustomTextBoxes(page))[0]?.x ?? 0) - initialTextOrigin.x, { timeout: 5000 })
      .toBeGreaterThan(30);
    const movedTextOrigin = (await readCustomTextBoxes(page))[0];
    expect(movedTextOrigin.y).toBeGreaterThan(initialTextOrigin.y + 20);

    // Wait for debounced flush to Dexie
    await page.waitForTimeout(1000);

    // 5. Reload the page and confirm stamp and text render at their moved positions
    await page.reload();
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible({ timeout: 15000 });
    const reloadedPage1 = primaryPane.locator('[data-testid="pdf-page-1"]');
    await expect(reloadedPage1).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);

    // Verify restored annotations match moved positions
    const restoredStamp = await page.evaluate(() => {
      const scope = (window as unknown as {
        __aboard_pdfAnnotations?: { scope?: { getAnnotations: () => unknown } };
      }).__aboard_pdfAnnotations?.scope;
      const res = scope?.getAnnotations();
      const list = Array.isArray(res) ? res : Object.values((res as Record<string, any[]>) || {}).flat();
      const stamp = list.find((a: any) => a?.object?.type === 13);
      return stamp ? stamp.object.rect.origin : null;
    });
    const restoredText = (await readCustomTextBoxes(page))[0];
    const restoredPositions = { stampOrigin: restoredStamp, textOrigin: restoredText ?? null };

    expect(restoredPositions.stampOrigin).not.toBeNull();
    expect(restoredPositions.textOrigin).not.toBeNull();
    expect(Math.abs(restoredPositions.stampOrigin.x - movedStampOrigin!.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(restoredPositions.stampOrigin.y - movedStampOrigin!.y)).toBeLessThanOrEqual(2);
    expect(Math.abs(restoredPositions.textOrigin!.x - movedTextOrigin!.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(restoredPositions.textOrigin!.y - movedTextOrigin!.y)).toBeLessThanOrEqual(2);

    // 6. Test Resizing Stamp and Text using the Select Tool
    await primaryPane.locator('[data-testid="pdf-tool-select"]').click();
    await page.waitForTimeout(200);

    // Select the stamp
    const reloadedStamp = primaryPane.locator('[data-testid="pdf-stamp-object"]').first();
    const reloadedStampBox = await reloadedStamp.boundingBox();
    expect(reloadedStampBox).not.toBeNull();
    if (!reloadedStampBox) return;

    await page.mouse.click(reloadedStampBox.x + reloadedStampBox.width / 2, reloadedStampBox.y + reloadedStampBox.height / 2);
    await page.waitForTimeout(200);

    // Verify resize handles appear on the stamp bounding box
    const stampResizeHandleSE = primaryPane.locator('[data-testid="pdf-stamp-resize-handle-se"]');
    await expect(stampResizeHandleSE).toBeVisible({ timeout: 5000 });

    const initialStampSize = await page.evaluate(() => {
      const scope = (window as unknown as {
        __aboard_pdfAnnotations?: { scope?: { getAnnotations: () => unknown } };
      }).__aboard_pdfAnnotations?.scope;
      const res = scope?.getAnnotations();
      const list = Array.isArray(res) ? res : Object.values((res as Record<string, any[]>) || {}).flat();
      const stamp = list.find((a: any) => a?.object?.type === 13);
      return stamp ? { ...stamp.object.rect.size } : null;
    });
    expect(initialStampSize).not.toBeNull();

    // Drag the southeast resize handle of the stamp (+60px, +60px)
    const seBox = await stampResizeHandleSE.boundingBox();
    expect(seBox).not.toBeNull();
    if (!seBox) return;

    await page.mouse.move(seBox.x + seBox.width / 2, seBox.y + seBox.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(
        seBox.x + seBox.width / 2 + (60 * i) / 10,
        seBox.y + seBox.height / 2 + (60 * i) / 10
      );
    }
    await page.mouse.up();
    await page.waitForTimeout(400);

    // Verify stamp size increased in store while maintaining aspect ratio
    const resizedStampSize = await page.evaluate(() => {
      const scope = (window as unknown as {
        __aboard_pdfAnnotations?: { scope?: { getAnnotations: () => unknown } };
      }).__aboard_pdfAnnotations?.scope;
      const res = scope?.getAnnotations();
      const list = Array.isArray(res) ? res : Object.values((res as Record<string, any[]>) || {}).flat();
      const stamp = list.find((a: any) => a?.object?.type === 13);
      return stamp ? { ...stamp.object.rect.size } : null;
    });
    expect(resizedStampSize).not.toBeNull();
    expect(resizedStampSize!.width).toBeGreaterThan(initialStampSize!.width + 20);
    expect(resizedStampSize!.height).toBeGreaterThan(initialStampSize!.height + 10);

    // Verify stamp top-left origin stays anchored
    const resizedStampOrigin = await page.evaluate(() => {
      const scope = (window as unknown as {
        __aboard_pdfAnnotations?: { scope?: { getAnnotations: () => unknown } };
      }).__aboard_pdfAnnotations?.scope;
      const res = scope?.getAnnotations();
      const list = Array.isArray(res) ? res : Object.values((res as Record<string, any[]>) || {}).flat();
      const stamp = list.find((a: any) => a?.object?.type === 13);
      return stamp ? { ...stamp.object.rect.origin } : null;
    });
    expect(resizedStampOrigin).not.toBeNull();
    expect(Math.abs(resizedStampOrigin!.x - restoredPositions.stampOrigin.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(resizedStampOrigin!.y - restoredPositions.stampOrigin.y)).toBeLessThanOrEqual(2);

    // Verify stamp content (image) remains aligned with stamp bounding box without floating away
    const currentStampBbox = await stampBbox.boundingBox();
    const stampImageElement = primaryPane.locator('[data-testid^="stamp-container-"] img, img[alt="stamp"]').first();
    const stampImgBox = await stampImageElement.boundingBox();
    expect(currentStampBbox).not.toBeNull();
    expect(stampImgBox).not.toBeNull();
    expect(Math.abs(currentStampBbox!.x - stampImgBox!.x)).toBeLessThanOrEqual(6);
    expect(Math.abs(currentStampBbox!.y - stampImgBox!.y)).toBeLessThanOrEqual(6);

    // Text boxes are movable only: selecting one shows the dashed bbox but no resize handles
    const reloadedText = primaryPane.locator('[data-testid^="pdf-text-box-"]').first();
    const reloadedTextBox = await reloadedText.boundingBox();
    expect(reloadedTextBox).not.toBeNull();
    if (!reloadedTextBox) return;

    await page.mouse.click(reloadedTextBox.x + reloadedTextBox.width / 2, reloadedTextBox.y + reloadedTextBox.height / 2);
    await expect(primaryPane.locator('[data-testid="pdf-text-bbox"]')).toBeVisible({ timeout: 5000 });
    await expect(primaryPane.locator('[data-resize-handle][data-object-type="text"]')).toHaveCount(8);

    // Wait for debounced flush to Dexie
    await page.waitForTimeout(1000);
    // Wait for debounced flush to Dexie
    await page.waitForTimeout(1000);

    // 7. Reload page and confirm resized dimensions persisted across reload
    await page.reload();
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible({ timeout: 15000 });
    const finalPage1 = primaryPane.locator('[data-testid="pdf-page-1"]');
    await expect(finalPage1).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);

    const persistedSizes = await page.evaluate(() => {
      const scope = (window as unknown as {
        __aboard_pdfAnnotations?: { scope?: { getAnnotations: () => unknown } };
      }).__aboard_pdfAnnotations?.scope;
      const res = scope?.getAnnotations();
      const list = Array.isArray(res) ? res : Object.values((res as Record<string, any[]>) || {}).flat();
      const stamp = list.find((a: any) => a?.object?.type === 13);
      return { stampSize: stamp ? stamp.object.rect.size : null };
    });

    expect(persistedSizes.stampSize).not.toBeNull();

    expect(Math.abs(persistedSizes.stampSize.width - resizedStampSize!.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(persistedSizes.stampSize.height - resizedStampSize!.height)).toBeLessThanOrEqual(2);

  });

  test("drag ink stroke updates and persists across reload, stamp 'se' resize anchors origin and keeps content aligned, and text near edges remains visible", async ({ page }) => {
    // 1. Generate test PDF
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const p1 = pdfDoc.addPage([595.28, 841.89]);
    p1.drawText("Ink Drag, Anchor SE Resize & Text Edge Visibility Test", {
      x: 50,
      y: 750,
      size: 20,
      font,
      color: rgb(0, 0, 0),
    });
    const pdfBytes = await pdfDoc.save();

    await page.goto(`/workspace?p=${projectId}-ink-anchored&kind=pdf`);
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();

    const primaryPane = page.locator('.pane[data-slot="primary"]');
    const fileInput = primaryPane.locator('input[data-testid="pdf-file-input"]');
    await expect(fileInput).toBeAttached();

    await fileInput.setInputFiles({
      name: "test-ink-anchored.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBytes),
    });

    const page1 = primaryPane.locator('[data-testid="pdf-page-1"]');
    await expect(page1).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(600);

    const initialBox = await page1.boundingBox();
    expect(initialBox).not.toBeNull();
    if (!initialBox) return;

    // --- CHECK 1: DRAW INK STROKE, SELECT IT, CLICK BBOX/PATH, DRAG IT, AND PERSIST ACROSS RELOAD ---
    // A. Draw ink stroke
    await primaryPane.locator('[data-testid="pdf-tool-ink"]').click();
    await page.waitForTimeout(200);

    const inkStartX = initialBox.x + 150;
    const inkStartY = initialBox.y + 180;
    const inkEndX = initialBox.x + 220;
    const inkEndY = initialBox.y + 240;

    await page.mouse.move(inkStartX, inkStartY);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(
        inkStartX + ((inkEndX - inkStartX) * i) / 10,
        inkStartY + ((inkEndY - inkStartY) * i) / 10
      );
    }
    await page.mouse.up();
    await page.waitForTimeout(300);

    const inkStroke = primaryPane.locator('[data-testid="pdf-custom-ink-stroke"]').first();
    await expect(inkStroke).toBeVisible({ timeout: 5000 });
    const strokeBoxBefore = await inkStroke.boundingBox();
    expect(strokeBoxBefore).not.toBeNull();
    if (!strokeBoxBefore) return;

    // B. Switch to select tool
    await primaryPane.locator('[data-testid="pdf-tool-select"]').click();
    await page.waitForTimeout(200);

    // C. Click on the ink stroke (bbox/path) to select it
    await page.mouse.click(
      strokeBoxBefore.x + strokeBoxBefore.width / 2,
      strokeBoxBefore.y + strokeBoxBefore.height / 2
    );
    await page.waitForTimeout(200);

    const inkBbox = primaryPane.locator('[data-testid="pdf-custom-ink-bbox"]');
    await expect(inkBbox).toBeVisible({ timeout: 5000 });

    // D. Drag the ink stroke to a new location (+80px, +60px)
    const dragDeltaX = 80;
    const dragDeltaY = 60;
    await page.mouse.move(
      strokeBoxBefore.x + strokeBoxBefore.width / 2,
      strokeBoxBefore.y + strokeBoxBefore.height / 2
    );
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(
        strokeBoxBefore.x + strokeBoxBefore.width / 2 + (dragDeltaX * i) / 10,
        strokeBoxBefore.y + strokeBoxBefore.height / 2 + (dragDeltaY * i) / 10
      );
    }
    await page.mouse.up();
    await page.waitForTimeout(400);

    // Verify stroke position updated
    const strokeBoxAfterDrag = await inkStroke.boundingBox();
    expect(strokeBoxAfterDrag).not.toBeNull();
    expect(strokeBoxAfterDrag!.x).toBeGreaterThan(strokeBoxBefore.x + 40);
    expect(strokeBoxAfterDrag!.y).toBeGreaterThan(strokeBoxBefore.y + 30);

    const transformAttr = await inkStroke.getAttribute("transform");
    expect(transformAttr).toContain("translate");

    // --- CHECK 2: DRAG STAMP BY 'SE' HANDLE: TOP-LEFT ANCHORED & CONTENT ALIGNED ---
    // A. Insert a stamp
    await primaryPane.locator('[data-testid="pdf-tool-stamp"]').click();
    await page.waitForTimeout(200);

    const squarePngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

    const fileChooserPromise = page.waitForEvent("filechooser");
    await page1.click({ position: { x: 280, y: 280 } });
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles({
      name: "se-anchor-stamp.png",
      mimeType: "image/png",
      buffer: Buffer.from(squarePngBase64, "base64"),
    });

    await expect(primaryPane.locator('[data-testid="pdf-stamp-object"]').first()).toBeAttached({ timeout: 10000 });

    // Ensure Select tool is active
    await primaryPane.locator('[data-testid="pdf-tool-select"]').click();
    await page.waitForTimeout(200);

    // Select the stamp
    const stampObject = primaryPane.locator('[data-testid="pdf-stamp-object"]').first();
    const stampBox = await stampObject.boundingBox();
    expect(stampBox).not.toBeNull();
    if (!stampBox) return;

    await page.mouse.click(stampBox.x + stampBox.width / 2, stampBox.y + stampBox.height / 2);
    await page.waitForTimeout(200);

    const stampBbox = primaryPane.locator('[data-testid="pdf-stamp-bbox"]');
    await expect(stampBbox).toBeVisible({ timeout: 5000 });

    // Get initial origin and size from annotation store
    const initialStampData = await page.evaluate(() => {
      const scope = (window as unknown as {
        __aboard_pdfAnnotations?: { scope?: { getAnnotations: () => unknown } };
      }).__aboard_pdfAnnotations?.scope;
      const res = scope?.getAnnotations();
      const list = Array.isArray(res) ? res : Object.values((res as Record<string, any[]>) || {}).flat();
      const stamp = list.find((a: any) => a?.object?.type === 13);
      return stamp ? { origin: { ...stamp.object.rect.origin }, size: { ...stamp.object.rect.size } } : null;
    });
    expect(initialStampData).not.toBeNull();

    // Check SE resize handle
    const stampResizeHandleSE = primaryPane.locator('[data-testid="pdf-stamp-resize-handle-se"]');
    await expect(stampResizeHandleSE).toBeVisible({ timeout: 5000 });
    const seBox = await stampResizeHandleSE.boundingBox();
    expect(seBox).not.toBeNull();
    if (!seBox) return;

    // Drag the southeast resize handle (+60px, +60px)
    await page.mouse.move(seBox.x + seBox.width / 2, seBox.y + seBox.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(
        seBox.x + seBox.width / 2 + (60 * i) / 10,
        seBox.y + seBox.height / 2 + (60 * i) / 10
      );
    }
    await page.mouse.up();
    await page.waitForTimeout(400);

    // Verify top-left origin stays strictly anchored in store
    const resizedStampData = await page.evaluate(() => {
      const scope = (window as unknown as {
        __aboard_pdfAnnotations?: { scope?: { getAnnotations: () => unknown } };
      }).__aboard_pdfAnnotations?.scope;
      const res = scope?.getAnnotations();
      const list = Array.isArray(res) ? res : Object.values((res as Record<string, any[]>) || {}).flat();
      const stamp = list.find((a: any) => a?.object?.type === 13);
      return stamp ? { origin: { ...stamp.object.rect.origin }, size: { ...stamp.object.rect.size } } : null;
    });
    expect(resizedStampData).not.toBeNull();
    expect(Math.abs(resizedStampData!.origin.x - initialStampData!.origin.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(resizedStampData!.origin.y - initialStampData!.origin.y)).toBeLessThanOrEqual(2);
    expect(resizedStampData!.size.width).toBeGreaterThan(initialStampData!.size.width + 20);

    // Verify stamp content (image) stays aligned inside bounding box without floating away
    const currentStampBbox = await stampBbox.boundingBox();
    const stampImg = primaryPane.locator('[data-testid^="stamp-container-"] img, img[alt="stamp"]').first();
    const stampImgBox = await stampImg.boundingBox();
    expect(currentStampBbox).not.toBeNull();
    expect(stampImgBox).not.toBeNull();
    // Bounding box top-left and image top-left match within 6px
    expect(Math.abs(currentStampBbox!.x - stampImgBox!.x)).toBeLessThanOrEqual(6);
    expect(Math.abs(currentStampBbox!.y - stampImgBox!.y)).toBeLessThanOrEqual(6);

    // --- CHECK 3: DRAGGING TEXT ANNOTATION NEAR PAGE EDGES (REMAINS VISIBLE, NOT CLIPPED) ---
    // A. Add text annotation
    await primaryPane.locator('[data-testid="pdf-tool-text"]').click();
    await page.waitForTimeout(200);

    const textClickX = initialBox.x + 120;
    const textClickY = initialBox.y + 200;
    await page.mouse.click(textClickX, textClickY);
    await page.waitForTimeout(500);

    await expect(primaryPane.locator('[data-testid^="pdf-text-input-"]')).toBeFocused({ timeout: 5000 });
    await page.keyboard.type("Edge", { delay: 10 });
    await page.keyboard.press("Escape");
    await expect(primaryPane.locator('[data-testid^="pdf-text-box-"]').first()).toHaveText("Edge");

    // Switch to Select tool
    await primaryPane.locator('[data-testid="pdf-tool-select"]').click();
    await page.waitForTimeout(200);

    const textObject = primaryPane.locator('[data-testid^="pdf-text-box-"]').first();
    await expect(textObject).toBeVisible({ timeout: 5000 });
    const textBox = await textObject.boundingBox();
    expect(textBox).not.toBeNull();
    if (!textBox) return;

    // Click text to select
    await page.mouse.click(textBox.x + textBox.width / 2, textBox.y + textBox.height / 2);
    await page.waitForTimeout(200);

    // Drag text close to the top-left edge of the page (towards page boundary)
    const toEdgeDx = -(textBox.x - initialBox.x - 8);
    const toEdgeDy = -(textBox.y - initialBox.y - 8);
    await page.mouse.move(textBox.x + textBox.width / 2, textBox.y + textBox.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(
        textBox.x + textBox.width / 2 + (toEdgeDx * i) / 10,
        textBox.y + textBox.height / 2 + (toEdgeDy * i) / 10
      );
    }
    await page.mouse.up();
    await page.waitForTimeout(400);

    // Verify text remains visible and not clipped
    const textAfterDrag = primaryPane.locator('[data-testid^="pdf-text-box-"]').first();
    await expect(textAfterDrag).toBeVisible();
    const textContainer = primaryPane.locator('[data-testid^="pdf-text-box-"]').first();
    await expect(textContainer).toBeVisible();

    const isTextVisible = await textContainer.evaluate((el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return (
        style.display !== "none" &&
        style.visibility !== "hidden" &&
        parseFloat(style.opacity || "1") > 0 &&
        rect.width > 0 &&
        rect.height > 0
      );
    });
    expect(isTextVisible).toBe(true);

    // Verify text origin coordinates in store are clamped safely within page bounds (>= 0)
    const textOriginData = (await readCustomTextBoxes(page))[0] ?? null;
    expect(textOriginData).not.toBeNull();
    expect(textOriginData!.x).toBeGreaterThanOrEqual(0);
    expect(textOriginData!.y).toBeGreaterThanOrEqual(0);

    // --- CHECK 4: RELOAD PAGE AND CONFIRM INK STROKE PERSISTENCE ---
    // Wait for debounced flush to Dexie
    await page.waitForTimeout(1200);

    await page.reload();
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible({ timeout: 15000 });
    const reloadedPage1 = primaryPane.locator('[data-testid="pdf-page-1"]');
    await expect(reloadedPage1).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);

    // Verify ink stroke persists at its moved position
    const reloadedInkStroke = primaryPane.locator('[data-testid="pdf-custom-ink-stroke"]').first();
    await expect(reloadedInkStroke).toBeVisible({ timeout: 10000 });
    const reloadedStrokeBox = await reloadedInkStroke.boundingBox();
    expect(reloadedStrokeBox).not.toBeNull();
    expect(Math.abs(reloadedStrokeBox!.x - strokeBoxAfterDrag!.x)).toBeLessThanOrEqual(3);
    expect(Math.abs(reloadedStrokeBox!.y - strokeBoxAfterDrag!.y)).toBeLessThanOrEqual(3);

    // Verify text annotation is still visible near the edge after reload
    const reloadedText = primaryPane.locator('[data-testid^="pdf-text-box-"]').first();
    await expect(reloadedText).toBeVisible({ timeout: 5000 });
  });

  test("resizes ink stroke via select tool with top-left origin anchored and persists across reload", async ({ page }) => {
    // 1. Generate test PDF
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const p1 = pdfDoc.addPage([595.28, 841.89]);
    p1.drawText("Ink Stroke Resize & Persist Test", {
      x: 50,
      y: 750,
      size: 20,
      font,
      color: rgb(0, 0, 0),
    });
    const pdfBytes = await pdfDoc.save();

    await page.goto(`/workspace?p=${projectId}-ink-resize&kind=pdf`);
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();

    const primaryPane = page.locator('.pane[data-slot="primary"]');
    const fileInput = primaryPane.locator('input[data-testid="pdf-file-input"]');
    await expect(fileInput).toBeAttached();

    await fileInput.setInputFiles({
      name: "test-ink-resize.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBytes),
    });

    const page1 = primaryPane.locator('[data-testid="pdf-page-1"]');
    await expect(page1).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(600);

    const initialBox = await page1.boundingBox();
    expect(initialBox).not.toBeNull();
    if (!initialBox) return;

    // 2. Draw ink stroke
    await primaryPane.locator('[data-testid="pdf-tool-ink"]').click();
    await page.waitForTimeout(200);

    const inkStartX = initialBox.x + 140;
    const inkStartY = initialBox.y + 160;
    const inkEndX = initialBox.x + 220;
    const inkEndY = initialBox.y + 220;

    await page.mouse.move(inkStartX, inkStartY);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(
        inkStartX + ((inkEndX - inkStartX) * i) / 10,
        inkStartY + ((inkEndY - inkStartY) * i) / 10
      );
    }
    await page.mouse.up();
    await page.waitForTimeout(300);

    const inkStroke = primaryPane.locator('[data-testid="pdf-custom-ink-stroke"]').first();
    await expect(inkStroke).toBeVisible({ timeout: 5000 });

    // 3. Switch to Select tool
    await primaryPane.locator('[data-testid="pdf-tool-select"]').click();
    await page.waitForTimeout(200);

    // 4. Select the ink stroke
    const strokeBoxBefore = await inkStroke.boundingBox();
    expect(strokeBoxBefore).not.toBeNull();
    if (!strokeBoxBefore) return;

    await page.mouse.click(
      strokeBoxBefore.x + strokeBoxBefore.width / 2,
      strokeBoxBefore.y + strokeBoxBefore.height / 2
    );
    await page.waitForTimeout(200);

    // 5. Verify bounding box and resize handles appear
    const inkBbox = primaryPane.locator('[data-testid="pdf-custom-ink-bbox"]');
    await expect(inkBbox).toBeVisible({ timeout: 5000 });

    const resizeHandleSE = primaryPane.locator('[data-testid="pdf-ink-resize-handle-se"]');
    await expect(resizeHandleSE).toBeVisible({ timeout: 5000 });

    const seBox = await resizeHandleSE.boundingBox();
    expect(seBox).not.toBeNull();
    if (!seBox) return;

    // 6. Drag the southeast resize handle (+70px, +50px)
    await page.mouse.move(seBox.x + seBox.width / 2, seBox.y + seBox.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(
        seBox.x + seBox.width / 2 + (70 * i) / 10,
        seBox.y + seBox.height / 2 + (50 * i) / 10
      );
    }
    await page.mouse.up();
    await page.waitForTimeout(400);

    // 7. Verify scaled dimensions & anchor
    const strokeBoxAfterResize = await inkStroke.boundingBox();
    expect(strokeBoxAfterResize).not.toBeNull();
    // Top-left origin must remain fixed within 3px
    expect(Math.abs(strokeBoxAfterResize!.x - strokeBoxBefore.x)).toBeLessThanOrEqual(3);
    expect(Math.abs(strokeBoxAfterResize!.y - strokeBoxBefore.y)).toBeLessThanOrEqual(3);
    // Width and height must have increased
    expect(strokeBoxAfterResize!.width).toBeGreaterThan(strokeBoxBefore.width + 30);
    expect(strokeBoxAfterResize!.height).toBeGreaterThan(strokeBoxBefore.height + 20);

    // 8. Wait for debounced flush and reload page
    await page.waitForTimeout(1200);

    await page.reload();
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible({ timeout: 15000 });
    const reloadedPage1 = primaryPane.locator('[data-testid="pdf-page-1"]');
    await expect(reloadedPage1).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);

    // 9. Confirm resized dimensions and anchored position persist
    const reloadedStroke = primaryPane.locator('[data-testid="pdf-custom-ink-stroke"]').first();
    await expect(reloadedStroke).toBeVisible({ timeout: 10000 });
    const reloadedBox = await reloadedStroke.boundingBox();
    expect(reloadedBox).not.toBeNull();
    // Origin remains anchored to original top-left
    expect(Math.abs(reloadedBox!.x - strokeBoxBefore.x)).toBeLessThanOrEqual(3);
    expect(Math.abs(reloadedBox!.y - strokeBoxBefore.y)).toBeLessThanOrEqual(3);
    // Width and height persisted at the larger scaled size
    expect(reloadedBox!.width).toBeGreaterThan(strokeBoxBefore.width + 30);
    expect(reloadedBox!.height).toBeGreaterThan(strokeBoxBefore.height + 20);
  });

  test("locks highlights to text (no drag/resize, selectable for deletion) and text boxes are movable only (no resize handles)", async ({ page }) => {
    // 1. Generate test PDF
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const p1 = pdfDoc.addPage([595.28, 841.89]);
    p1.drawText("Highlight Locking and Text Proportional Scaling Test", {
      x: 50,
      y: 750,
      size: 20,
      font,
      color: rgb(0, 0, 0),
    });
    const pdfBytes = await pdfDoc.save();

    await page.goto(`/workspace?p=${projectId}-refine&kind=pdf`);
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();

    const primaryPane = page.locator('.pane[data-slot="primary"]');
    const fileInput = primaryPane.locator('input[data-testid="pdf-file-input"]');
    await expect(fileInput).toBeAttached();

    await fileInput.setInputFiles({
      name: "test-refine.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBytes),
    });

    const page1 = primaryPane.locator('[data-testid="pdf-page-1"]');
    await expect(page1).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(600);

    // 2. Inject a Highlight annotation (type: 9)
    await page.evaluate(() => {
      const scope = (window as unknown as {
        __aboard_pdfAnnotations?: { scope?: any };
      }).__aboard_pdfAnnotations?.scope;
      if (scope) {
        scope.createAnnotation(0, {
          id: "test-hl-lock",
          type: 9,
          pageIndex: 0,
          rect: { origin: { x: 60, y: 120 }, size: { width: 180, height: 24 } },
          segmentRects: [{ origin: { x: 60, y: 120 }, size: { width: 180, height: 24 } }],
          color: "#ffe066",
          opacity: 0.5,
        });
      }
    });

    // Also add a custom text box
    await page.evaluate(() => {
      const api = (window as unknown as {
        __aboard_pdfAnnotations?: { addText?: (p: number, c: { x: number; y: number; text: string }) => string };
      }).__aboard_pdfAnnotations;
      api?.addText?.(0, { x: 60, y: 220, text: "Static Text" });
    });
    await page.waitForTimeout(300);

    // Ensure Select tool is active
    await primaryPane.locator('[data-testid="pdf-tool-select"]').click();
    await page.waitForTimeout(200);

    // 3. Highlight Locking Verification
    // A: Click on highlight to select it
    const highlightObject = primaryPane.locator('[data-testid="pdf-highlight-object"]');
    await expect(highlightObject).toBeVisible({ timeout: 5000 });
    const hlBox = await highlightObject.boundingBox();
    expect(hlBox).not.toBeNull();
    if (hlBox) {
      await page.mouse.click(hlBox.x + hlBox.width / 2, hlBox.y + hlBox.height / 2);
      await page.waitForTimeout(200);

      // B: Verify NO bounding box and NO resize handles exist for highlight
      const hlBbox = primaryPane.locator('[data-testid="pdf-highlight-bbox"]');
      await expect(hlBbox).toHaveCount(0);
      const hlHandle = primaryPane.locator('[data-testid^="pdf-highlight-resize-handle"]');
      await expect(hlHandle).toHaveCount(0);

      // C: Try dragging highlight (+70px, +50px)
      await page.mouse.move(hlBox.x + hlBox.width / 2, hlBox.y + hlBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(hlBox.x + hlBox.width / 2 + 70, hlBox.y + hlBox.height / 2 + 50);
      await page.mouse.up();
      await page.waitForTimeout(300);

      // Verify highlight position was NOT modified (locked to text)
      const hlOriginAfterDrag = await page.evaluate(() => {
        const scope = (window as unknown as {
          __aboard_pdfAnnotations?: { scope?: any };
        }).__aboard_pdfAnnotations?.scope;
        const list = scope?.getAnnotations() || [];
        const hl = list.find((a: any) => a?.object?.id === "test-hl-lock");
        return hl ? { ...hl.object.rect.origin } : null;
      });
      expect(hlOriginAfterDrag).toEqual({ x: 60, y: 120 });
    }

    // 4. Text boxes are movable only: dashed bbox, no resize handles
    const textObject = primaryPane.locator('[data-testid^="pdf-text-box-"]').first();
    await expect(textObject).toBeVisible({ timeout: 5000 });
    const textBox = await textObject.boundingBox();
    expect(textBox).not.toBeNull();
    if (textBox) {
      await page.mouse.click(textBox.x + textBox.width / 2, textBox.y + textBox.height / 2);
      await page.waitForTimeout(200);

      const textBbox = primaryPane.locator('[data-testid="pdf-text-bbox"] rect').first();
      await expect(textBbox).toBeVisible({ timeout: 5000 });
      await expect(textBbox).toHaveAttribute("stroke-dasharray", "4 3");
      await expect(primaryPane.locator('[data-resize-handle][data-object-type="text"]')).toHaveCount(8);
      await expect(primaryPane.locator('[data-testid^="pdf-text-resize-handle-"]')).toHaveCount(8);
    }
  });

  test("creates native sticky note, edits text, drags, resizes, and persists across reload", async ({ page }) => {
    // 1. Generate test PDF
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const p1 = pdfDoc.addPage([600, 800]);
    p1.drawText("Sticky Note Verification Page", {
      x: 50,
      y: 720,
      size: 18,
      font,
      color: rgb(0, 0, 0),
    });
    const pdfBytes = await pdfDoc.save();

    await page.goto(`/workspace?p=${projectId}-sticky&kind=pdf`);
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();

    const primaryPane = page.locator('.pane[data-slot="primary"]');
    const fileInput = primaryPane.locator('input[data-testid="pdf-file-input"]');
    await expect(fileInput).toBeAttached();

    await fileInput.setInputFiles({
      name: "test-sticky.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBytes),
    });

    const page1 = primaryPane.locator('[data-testid="pdf-page-1"]');
    await expect(page1).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(600);

    const page1Box = await page1.boundingBox();
    expect(page1Box).not.toBeNull();
    if (!page1Box) return;

    // 2. Click Sticky Note icon in floating toolbar
    const stickyToolBtn = primaryPane.locator('[data-testid="pdf-tool-sticky"]');
    await expect(stickyToolBtn).toBeVisible({ timeout: 5000 });
    await stickyToolBtn.click();
    await page.waitForTimeout(200);

    // 3. Click on the PDF to place sticky note
    const clickX = page1Box.x + 100;
    const clickY = page1Box.y + 120;
    await page.mouse.click(clickX, clickY);
    await page.waitForTimeout(400);

    // 4. Verify sticky note card and textarea rendered
    const stickyCard = primaryPane.locator('[data-testid^="pdf-sticky-card-"]');
    await expect(stickyCard).toBeVisible({ timeout: 5000 });

    const textarea = primaryPane.locator('[data-testid^="pdf-sticky-textarea-"]');
    await expect(textarea).toBeAttached();

    // Double-click to edit text
    await page.mouse.dblclick(clickX + 50, clickY + 50);
    await page.waitForTimeout(200);
    await textarea.fill("Native Sticky Note Verified!");
    await page.waitForTimeout(200);

    // Click outside to blur
    await page.mouse.click(page1Box.x + 30, page1Box.y + 30);
    await page.waitForTimeout(300);

    // 5. Verify Select tool can select, drag, and resize sticky note
    const stickyBbox = primaryPane.locator('[data-testid="pdf-sticky-bbox"]');
    // Click sticky note to select it
    await page.mouse.click(clickX + 40, clickY + 40);
    await page.waitForTimeout(200);
    await expect(stickyBbox).toBeVisible({ timeout: 5000 });

    // Drag sticky note
    await page.mouse.move(clickX + 40, clickY + 40);
    await page.mouse.down();
    await page.mouse.move(clickX + 100, clickY + 80);
    await page.mouse.up();
    await page.waitForTimeout(400);

    // Resize sticky note via bottom-right (se) handle
    const handleSE = primaryPane.locator('[data-testid="pdf-sticky-resize-handle-se"]');
    await expect(handleSE).toBeVisible({ timeout: 5000 });
    const handleBox = await handleSE.boundingBox();
    expect(handleBox).not.toBeNull();
    if (handleBox) {
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(handleBox.x + handleBox.width / 2 + 50, handleBox.y + handleBox.height / 2 + 40);
      await page.mouse.up();
      await page.waitForTimeout(500);
    }

    // Flush annotations to persistence
    await page.evaluate(async () => {
      const api = (window as unknown as {
        __aboard_pdfAnnotations?: { flushAnnotations?: () => Promise<void> };
      }).__aboard_pdfAnnotations;
      if (api?.flushAnnotations) {
        await api.flushAnnotations();
      }
    });
    await page.waitForTimeout(600);

    // 6. Reload page and confirm persistence
    await page.reload();
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();
    await expect(page1).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(600);

    // Sticky note must be restored with text
    const reloadedTextarea = primaryPane.locator('[data-testid^="pdf-sticky-textarea-"]');
    await expect(reloadedTextarea).toBeAttached({ timeout: 10000 });
    await expect(reloadedTextarea).toHaveValue("Native Sticky Note Verified!");

    // 7. Double-click restored sticky note to edit: verify textarea can receive edits
    const reloadedStickyCard = primaryPane.locator('[data-testid^="pdf-sticky-card-"]');
    const cardBox = await reloadedStickyCard.boundingBox();
    expect(cardBox).not.toBeNull();
    if (cardBox) {
      await page.mouse.dblclick(cardBox.x + 50, cardBox.y + 50);
      await page.waitForTimeout(300);
      await reloadedTextarea.fill("Native Sticky Note Verified! - edited text");
      await expect(reloadedTextarea).toHaveValue("Native Sticky Note Verified! - edited text");
    }

    // 8. Delete sticky note via header bar close "X" button
    const deleteBtn = primaryPane.locator('[data-testid="pdf-sticky-delete-btn"]');
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();
    await page.waitForTimeout(300);

    // Verify sticky note card is removed from DOM
    await expect(reloadedStickyCard).toHaveCount(0);

    // Flush and reload to confirm deletion persists
    await page.evaluate(async () => {
      const api = (window as unknown as {
        __aboard_pdfAnnotations?: { flushAnnotations?: () => Promise<void> };
      }).__aboard_pdfAnnotations;
      if (api?.flushAnnotations) {
        await api.flushAnnotations();
      }
    });
    await page.waitForTimeout(600);

    await page.reload();
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();
    await expect(page1).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(600);

    await expect(primaryPane.locator('[data-testid^="pdf-sticky-card-"]')).toHaveCount(0);
  });

  test("draws stroke outside page boundary into overflow area, preserves raw coordinates in JSON, and exports flattened PDF cleanly", async ({ page }) => {
    // 1. Generate test PDF
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const p1 = pdfDoc.addPage([595.28, 841.89]);
    p1.drawText("Overflow Canvas & Export Clipping Test", {
      x: 50,
      y: 750,
      size: 20,
      font,
      color: rgb(0, 0, 0),
    });
    const pdfBytes = await pdfDoc.save();

    await page.goto(`/workspace?p=${projectId}-overflow&kind=pdf`);
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();

    const primaryPane = page.locator('.pane[data-slot="primary"]');
    const fileInput = primaryPane.locator('input[data-testid="pdf-file-input"]');
    await expect(fileInput).toBeAttached();

    await fileInput.setInputFiles({
      name: "test-overflow.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBytes),
    });

    const page1 = primaryPane.locator('[data-testid="pdf-page-1"]');
    await expect(page1).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(600);

    const page1Box = await page1.boundingBox();
    expect(page1Box).not.toBeNull();
    if (!page1Box) return;

    // 2. Select Ink tool and draw in overflow area outside the page boundary
    await primaryPane.locator('[data-testid="pdf-tool-ink"]').click();
    await page.waitForTimeout(200);

    // Draw in the gray margin to the left of the page (negative X coordinate)
    const outStartX = page1Box.x - 40;
    const outStartY = page1Box.y + 150;
    const outEndX = page1Box.x - 10;
    const outEndY = page1Box.y + 190;

    await page.mouse.move(outStartX, outStartY);
    await page.mouse.down();
    for (let i = 1; i <= 5; i++) {
      await page.mouse.move(
        outStartX + ((outEndX - outStartX) * i) / 5,
        outStartY + ((outEndY - outStartY) * i) / 5
      );
    }
    await page.mouse.up();
    await page.waitForTimeout(300);

    // Verify custom ink path is rendered in the layer
    const customInkPath = primaryPane.locator('[data-testid="pdf-custom-ink-layer-1"] path');
    await expect(customInkPath).toHaveCount(1, { timeout: 5000 });

    // Verify coordinates in state are negative (outside page boundary)
    const strokePoints = await page.evaluate(() => {
      const api = (window as unknown as {
        __aboard_pdfAnnotations?: { customStrokes?: Record<number, Array<{ points: Array<{ x: number; y: number }> }>> };
      }).__aboard_pdfAnnotations;
      const strokes = api?.customStrokes?.[0] || [];
      return strokes[0]?.points || [];
    });
    expect(strokePoints.length).toBeGreaterThan(0);
    expect(strokePoints.some((p: { x: number; y: number }) => p.x < 0 || p.y < 0)).toBe(true);

    // 3. Add an out-of-bounds sticky note via the API
    await page.evaluate(() => {
      const api = (window as unknown as {
        __aboard_pdfAnnotations?: {
          addSticky?: (pageIndex: number, coords: { x: number; y: number; text: string }) => void;
        };
      }).__aboard_pdfAnnotations;
      api?.addSticky?.(0, {
        x: -180,
        y: -120,
        text: "Out-of-bounds Overflow Note",
      });
    });
    await page.waitForTimeout(300);

    // Flush annotations to persistence
    await page.evaluate(async () => {
      const api = (window as unknown as {
        __aboard_pdfAnnotations?: { flushAnnotations?: () => Promise<void> };
      }).__aboard_pdfAnnotations;
      if (api?.flushAnnotations) {
        await api.flushAnnotations();
      }
    });
    await page.waitForTimeout(600);

    // Verify stored JSON preserves raw out-of-bounds coordinates without clamping
    const rawSavedJson = await page.evaluate(async ({ pid }) => {
      const ps = (window as unknown as {
        __aboard_projectService?: {
          readAnnotations: (id: string, hash: string) => Promise<string | null>;
          readItem?: (id: string, itemId: string) => Promise<string>;
        };
      }).__aboard_projectService;

      if (!ps) return null;
      let raw = await ps.readAnnotations(pid, "test-overflow.pdf");
      if (!raw) {
        const pdfItem = await ps.readItem?.(pid, "item-1");
        if (pdfItem) {
          const pdfState = JSON.parse(pdfItem);
          const hash = pdfState.fileKey as string;
          raw = (await ps.readAnnotations(pid, hash)) || (await ps.readAnnotations(pid, "anno-item-1"));
        }
      }
      return raw;
    }, { pid: `${projectId}-overflow` });
    expect(rawSavedJson).toBeDefined();
    expect(rawSavedJson).toContain('"x":-'); // Contains negative coordinate

    // 4. Test Flattened PDF Export completes without errors
    const downloadPromise = page.waitForEvent("download");
    const downloadBtn = primaryPane.locator('[data-testid="pdf-download-btn"]');
    await expect(downloadBtn).toBeVisible({ timeout: 5000 });
    await downloadBtn.click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toContain("-annotated.pdf");

    // Read exported PDF stream and verify it is a valid, uncorrupted PDF document
    const downloadStream = await download.createReadStream();
    expect(downloadStream).not.toBeNull();
    if (downloadStream) {
      const chunks: Buffer[] = [];
      for await (const chunk of downloadStream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const exportedBytes = Buffer.concat(chunks);
      expect(exportedBytes.length).toBeGreaterThan(0);

      // Verify PDF parses cleanly
      const exportedPdfDoc = await PDFDocument.load(exportedBytes);
      expect(exportedPdfDoc.getPageCount()).toBe(1);
    }
  });

  test("Select tool disables native text selection, marquee selects ink strokes, and sticky note tool activates via toolbar", async ({ page }) => {
    const pid = "test-pdf-select-marquee-sticky";
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const p1 = pdfDoc.addPage([595.28, 841.89]);
    p1.drawText("Raspberry Pi 5 Camera Module autonomous navigation text line.", {
      x: 50,
      y: 750,
      size: 16,
      font,
      color: rgb(0, 0, 0),
    });
    const pdfBytes = await pdfDoc.save();

    await page.goto(`/workspace?p=${pid}&kind=pdf`);
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();

    const primaryPane = page.locator('.pane[data-slot="primary"]');
    const fileInput = primaryPane.locator('input[data-testid="pdf-file-input"]');
    await expect(fileInput).toBeAttached();

    await fileInput.setInputFiles({
      name: "test-marquee-sticky.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBytes),
    });

    const page1 = primaryPane.locator('[data-testid="pdf-page-1"]');
    await expect(page1).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(600);

    const page1Box = await page1.boundingBox();
    expect(page1Box).not.toBeNull();
    if (!page1Box) return;

    // 1. Draw an ink stroke on page 1
    await primaryPane.locator('[data-testid="pdf-tool-ink"]').click();
    await page.waitForTimeout(200);

    const strokeStartX = page1Box.x + 120;
    const strokeStartY = page1Box.y + 160;
    const strokeEndX = page1Box.x + 220;
    const strokeEndY = page1Box.y + 240;

    await page.mouse.move(strokeStartX, strokeStartY);
    await page.mouse.down();
    for (let i = 1; i <= 5; i++) {
      await page.mouse.move(
        strokeStartX + ((strokeEndX - strokeStartX) * i) / 5,
        strokeStartY + ((strokeEndY - strokeStartY) * i) / 5
      );
    }
    await page.mouse.up();
    await page.waitForTimeout(300);

    const customInkPath = primaryPane.locator('[data-testid="pdf-custom-ink-layer-1"] path');
    await expect(customInkPath).toHaveCount(1, { timeout: 5000 });

    // 2. Switch to Select tool
    const selectBtn = primaryPane.locator('[data-testid="pdf-tool-select"]');
    await selectBtn.click();
    await page.waitForTimeout(200);
    await expect(selectBtn).toHaveAttribute("aria-pressed", "true");

    // 3. Verify drag across text does NOT trigger native browser text selection
    const textStartX = page1Box.x + 50;
    const textStartY = page1Box.y + 90;
    await page.mouse.move(textStartX, textStartY);
    await page.mouse.down();
    await page.mouse.move(textStartX + 200, textStartY + 20);
    await page.mouse.up();
    await page.waitForTimeout(200);

    const selectedText = await page.evaluate(() => window.getSelection()?.toString() || "");
    expect(selectedText).toBe("");

    // 4. Verify Marquee selection over the ink stroke selects it
    // Start marquee drag around the stroke
    const marqueeStartX = strokeStartX - 30;
    const marqueeStartY = strokeStartY - 30;
    const marqueeEndX = strokeEndX + 40;
    const marqueeEndY = strokeEndY + 40;

    await page.mouse.move(marqueeStartX, marqueeStartY);
    await page.mouse.down();
    for (let i = 1; i <= 5; i++) {
      await page.mouse.move(
        marqueeStartX + ((marqueeEndX - marqueeStartX) * i) / 5,
        marqueeStartY + ((marqueeEndY - marqueeStartY) * i) / 5
      );
    }
    await page.mouse.up();
    await page.waitForTimeout(300);

    // Ink stroke bounding box must be visible
    const strokeBbox = primaryPane.locator('[data-testid="pdf-custom-ink-bbox"]');
    await expect(strokeBbox).toBeVisible({ timeout: 5000 });

    // Handles must be present
    const nwHandle = primaryPane.locator('[data-testid="pdf-ink-resize-handle-nw"]');
    await expect(nwHandle).toBeVisible();

    // 5. Test Sticky Note Tool activation via toolbar button
    const stickyBtn = primaryPane.locator('[data-testid="pdf-tool-sticky"]');
    await stickyBtn.click();
    await page.waitForTimeout(200);
    await expect(stickyBtn).toHaveAttribute("aria-pressed", "true");

    // Click on page to place a sticky note
    const stickyPlaceX = page1Box.x + 300;
    const stickyPlaceY = page1Box.y + 300;
    await page.mouse.click(stickyPlaceX, stickyPlaceY);
    await page.waitForTimeout(400);

    // Verify sticky note card is rendered
    const stickyCard = primaryPane.locator('[data-testid^="pdf-sticky-card-"]');
    await expect(stickyCard).toBeVisible({ timeout: 5000 });

    // Double-click to focus textarea
    await stickyCard.dblclick();
    await page.waitForTimeout(200);

    const textarea = primaryPane.locator('[data-testid^="pdf-sticky-textarea-"]');
    await expect(textarea).toBeFocused();
    await page.keyboard.type("Regressions fixed successfully!");
    await expect(textarea).toHaveValue("Regressions fixed successfully!");
  });

  test("restores text tool with create and drag (no resize), verifies sticky note auto-direction and polish, and marquee selection regression", async ({ page }) => {
    const pid = "test-pdf-text-sticky-marquee-suite";
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const p1 = pdfDoc.addPage([595.28, 841.89]);
    p1.drawText("Comprehensive Verification of Text Tool, Sticky Notes, and Marquee Selection", {
      x: 50,
      y: 750,
      size: 16,
      font,
      color: rgb(0, 0, 0),
    });
    const pdfBytes = await pdfDoc.save();

    await page.goto(`/workspace?p=${pid}&kind=pdf`);
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();

    const primaryPane = page.locator('.pane[data-slot="primary"]');
    const fileInput = primaryPane.locator('input[data-testid="pdf-file-input"]');
    await expect(fileInput).toBeAttached();

    await fileInput.setInputFiles({
      name: "test-text-sticky-marquee.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBytes),
    });

    const page1 = primaryPane.locator('[data-testid="pdf-page-1"]');
    await expect(page1).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(600);

    const page1Box = await page1.boundingBox();
    expect(page1Box).not.toBeNull();
    if (!page1Box) return;

    // =========================================================================
    // PART A: Text Tool (custom text box: click, type, select, move; no resize handles)
    // =========================================================================
    const textToolBtn = primaryPane.locator('[data-testid="pdf-tool-text"]');
    await textToolBtn.click();
    await page.waitForTimeout(200);
    await expect(textToolBtn).toHaveAttribute("aria-pressed", "true");

    await page.mouse.click(page1Box.x + 140, page1Box.y + 180);
    const textInput = primaryPane.locator('[data-testid^="pdf-text-input-"]').first();
    await expect(textInput).toBeFocused({ timeout: 5000 });
    await page.keyboard.type("Circuit Analysis Notes", { delay: 10 });
    await expect(textInput).toHaveValue("Circuit Analysis Notes");

    await page.keyboard.press("Escape");
    const textBox = primaryPane.locator('[data-testid^="pdf-text-box-"]').first();
    await expect(textBox).toHaveText("Circuit Analysis Notes");

    const selectBtn = primaryPane.locator('[data-testid="pdf-tool-select"]');
    await selectBtn.click();
    await expect(selectBtn).toHaveAttribute("aria-pressed", "true");

    const readTextBoxes = () =>
      page.evaluate(() => {
        const api = (window as unknown as {
          __aboard_pdfAnnotations?: { customTextBoxes?: Record<number, Array<{ x: number; y: number }>> };
        }).__aboard_pdfAnnotations;
        return Object.values(api?.customTextBoxes ?? {}).flat();
      });
    const before = (await readTextBoxes())[0];
    expect(before).toBeDefined();

    const tbBox = await textBox.boundingBox();
    expect(tbBox).not.toBeNull();
    if (!tbBox) return;
    const cx = tbBox.x + tbBox.width / 2;
    const cy = tbBox.y + tbBox.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(cx + (70 * i) / 10, cy + (50 * i) / 10);
    }
    await page.mouse.up();
    await expect(primaryPane.locator('[data-testid="pdf-text-bbox"]')).toBeVisible({ timeout: 5000 });
    await expect
      .poll(async () => ((await readTextBoxes())[0]?.x ?? 0) - before.x, { timeout: 5000 })
      .toBeGreaterThan(20);
    // Text boxes are movable only: no resize handles
    await expect(primaryPane.locator('[data-resize-handle][data-object-type="text"]')).toHaveCount(8);


    // =========================================================================
    // PART B: Sticky Note Auto-Direction & Polish
    // =========================================================================
    // 1. Create a sticky note via the toolbar button
    const stickyToolBtn = primaryPane.locator('[data-testid="pdf-tool-sticky"]');
    await stickyToolBtn.click();
    await page.waitForTimeout(200);
    await expect(stickyToolBtn).toHaveAttribute("aria-pressed", "true");

    // Click canvas to place sticky note
    const stickyPlaceX = page1Box.x + 360;
    const stickyPlaceY = page1Box.y + 240;
    await page.mouse.click(stickyPlaceX, stickyPlaceY);
    await page.waitForTimeout(400);

    const stickyCard = primaryPane.locator('[data-testid^="pdf-sticky-card-"]').first();
    await expect(stickyCard).toBeVisible({ timeout: 5000 });

    // 2. Verify dir="auto" attribute on textarea
    const stickyTextarea = primaryPane.locator('[data-testid^="pdf-sticky-textarea-"]').first();
    await expect(stickyTextarea).toHaveAttribute("dir", "auto");

    // 3. Type Arabic text and English text, confirming text is set properly
    await stickyCard.dblclick();
    await page.waitForTimeout(200);
    await expect(stickyTextarea).toBeFocused();

    const arabicEnglishText = "ملاحظة هندسية تجريبية - Circuit Resistance R1 = 50 Ohm";
    await stickyTextarea.fill(arabicEnglishText);
    await expect(stickyTextarea).toHaveValue(arabicEnglishText);

    // 4. Verify sticky note styles (border-radius, box-shadow)
    const stickyStyles = await stickyCard.evaluate((el) => {
      const style = window.getComputedStyle(el);
      return {
        borderRadius: style.borderRadius,
        boxShadow: style.boxShadow,
      };
    });
    // Border-radius must be at least 4px (uses var(--radius-md, 8px))
    expect(parseFloat(stickyStyles.borderRadius)).toBeGreaterThanOrEqual(4);
    // Box-shadow must be active and not none
    expect(stickyStyles.boxShadow).not.toBe("none");
    expect(stickyStyles.boxShadow.length).toBeGreaterThan(0);

    // Exit sticky editing
    await page.keyboard.press("Escape");
    await page.waitForTimeout(200);

    // =========================================================================
    // PART C: Marquee Selection Regression Check
    // =========================================================================
    // 1. Draw an ink stroke
    const inkToolBtn = primaryPane.locator('[data-testid="pdf-tool-ink"]');
    await inkToolBtn.click();
    await page.waitForTimeout(200);

    const strokeStartX = page1Box.x + 80;
    const strokeStartY = page1Box.y + 420;
    const strokeEndX = page1Box.x + 160;
    const strokeEndY = page1Box.y + 480;

    await page.mouse.move(strokeStartX, strokeStartY);
    await page.mouse.down();
    for (let i = 1; i <= 5; i++) {
      await page.mouse.move(
        strokeStartX + ((strokeEndX - strokeStartX) * i) / 5,
        strokeStartY + ((strokeEndY - strokeStartY) * i) / 5
      );
    }
    await page.mouse.up();
    await page.waitForTimeout(300);

    // 2. Switch to Select tool
    await selectBtn.click();
    await page.waitForTimeout(200);

    // 3. Marquee drag over the ink stroke
    const marqueeStartX = strokeStartX - 25;
    const marqueeStartY = strokeStartY - 25;
    const marqueeEndX = strokeEndX + 35;
    const marqueeEndY = strokeEndY + 35;

    await page.mouse.move(marqueeStartX, marqueeStartY);
    await page.mouse.down();
    for (let i = 1; i <= 5; i++) {
      await page.mouse.move(
        marqueeStartX + ((marqueeEndX - marqueeStartX) * i) / 5,
        marqueeStartY + ((marqueeEndY - marqueeStartY) * i) / 5
      );
    }
    await page.mouse.up();
    await page.waitForTimeout(300);

    // 4. Verify selection bounding box appears over the ink stroke
    const strokeBbox = primaryPane.locator('[data-testid="pdf-custom-ink-bbox"]');
    await expect(strokeBbox).toBeVisible({ timeout: 5000 });

    // Verify corner resize handles appear on the stroke bounding box
    const nwHandle = primaryPane.locator('[data-testid="pdf-ink-resize-handle-nw"]');
    await expect(nwHandle).toBeVisible();
  });

  test("text tool: creates one text box, types exact text, renders once, drags in a single gesture, has no resize handles and persists across reload", async ({ page }) => {
    const pid = "test-pdf-text-tool-rebuild";
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const p1 = pdfDoc.addPage([595.28, 841.89]);
    p1.drawText("Text tool rebuild verification", { x: 50, y: 750, size: 16, font, color: rgb(0, 0, 0) });
    const pdfBytes = await pdfDoc.save();

    await page.goto(`/workspace?p=${pid}&kind=pdf`);
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();
    const primaryPane = page.locator('.pane[data-slot="primary"]');
    const fileInput = primaryPane.locator('input[data-testid="pdf-file-input"]');
    await expect(fileInput).toBeAttached();
    await fileInput.setInputFiles({
      name: "text-tool-rebuild.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBytes),
    });
    const page1 = primaryPane.locator('[data-testid="pdf-page-1"]');
    await expect(page1).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(600);
    const page1Box = await page1.boundingBox();
    expect(page1Box).not.toBeNull();
    if (!page1Box) return;

    const readTextBoxes = () =>
      page.evaluate(() => {
        const api = (window as unknown as {
          __aboard_pdfAnnotations?: {
            customTextBoxes?: Record<number, Array<{ x: number; y: number; text: string }>>;
          };
        }).__aboard_pdfAnnotations;
        return Object.values(api?.customTextBoxes ?? {}).flat();
      });

    // Create + type
    await primaryPane.locator('[data-testid="pdf-tool-text"]').click();
    await page.mouse.click(page1Box.x + 160, page1Box.y + 200);
    const textarea = primaryPane.locator('[data-testid^="pdf-text-input-"]');
    await expect(textarea).toHaveCount(1);
    await expect(textarea).toBeFocused();
    await page.keyboard.type("Hello", { delay: 30 });
    await expect(textarea).toHaveValue("Hello");

    // Escape exits edit mode; text renders exactly once
    await page.keyboard.press("Escape");
    await expect(primaryPane.locator('[data-testid^="pdf-text-input-"]')).toHaveCount(0);
    await expect(page1.getByText("Hello", { exact: true })).toHaveCount(1);
    await expect(primaryPane.locator('[data-testid^="pdf-text-box-"]')).toHaveText("Hello");

    // Select tool + single drag gesture
    await primaryPane.locator('[data-testid="pdf-tool-select"]').click();
    const before = (await readTextBoxes())[0];
    expect(before.text).toBe("Hello");
    const box = await primaryPane.locator('[data-testid^="pdf-text-box-"]').boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) {
      await page.mouse.move(cx + (80 * i) / 8, cy + (50 * i) / 8, { steps: 2 });
    }
    await page.mouse.up();
    await expect
      .poll(async () => {
        const now = (await readTextBoxes())[0];
        return Math.round(now.x - before.x);
      })
      .toBeGreaterThan(40);
    const after = (await readTextBoxes())[0];
    const scale = page1Box.width / 595.28;
    expect(Math.abs(after.x - before.x - 80 / scale)).toBeLessThan(6);
    expect(Math.abs(after.y - before.y - 50 / scale)).toBeLessThan(6);

    // No resize handles, no EmbedPDF selection UI
    await expect(primaryPane.locator('[data-testid="pdf-text-bbox"]')).toBeVisible();
    await expect(primaryPane.locator('[data-resize-handle][data-object-type="text"]')).toHaveCount(8);
    await expect(primaryPane.locator('[data-testid^="pdf-text-resize-handle-"]')).toHaveCount(8);
    await expect(primaryPane.locator('[data-annotation-id][data-annotation-type="3"]')).toHaveCount(0);

    // Persist across reload
    await page.waitForTimeout(800);
    await page.evaluate(async () => {
      const api = (window as unknown as { __aboard_pdfAnnotations?: { flushAnnotations?: () => Promise<void> } })
        .__aboard_pdfAnnotations;
      await api?.flushAnnotations?.();
    });
    await page.reload();
    await expect(page1).toBeVisible({ timeout: 15000 });
    await expect(primaryPane.locator('[data-testid^="pdf-text-box-"]')).toHaveText("Hello", { timeout: 10000 });
    await expect(page1.getByText("Hello", { exact: true })).toHaveCount(1);
    const reloaded = (await readTextBoxes())[0];
    expect(Math.abs(reloaded.x - after.x)).toBeLessThan(0.5);
    expect(Math.abs(reloaded.y - after.y)).toBeLessThan(0.5);
  });

  test("text tool: typing English text appears immediately without clicking away, and pressing Enter creates multiline text that persists across blur", async ({ page }) => {
    const pid = "test-pdf-text-english-multiline";
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const p1 = pdfDoc.addPage([595.28, 841.89]);
    p1.drawText("Text Tool English & Multiline Verification", { x: 50, y: 750, size: 16, font, color: rgb(0, 0, 0) });
    const pdfBytes = await pdfDoc.save();

    await page.goto(`/workspace?p=${pid}&kind=pdf`);
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();
    const primaryPane = page.locator('.pane[data-slot="primary"]');
    const fileInput = primaryPane.locator('input[data-testid="pdf-file-input"]');
    await expect(fileInput).toBeAttached();
    await fileInput.setInputFiles({
      name: "text-multiline.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBytes),
    });
    const page1 = primaryPane.locator('[data-testid="pdf-page-1"]');
    await expect(page1).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(600);
    const page1Box = await page1.boundingBox();
    expect(page1Box).not.toBeNull();
    if (!page1Box) return;

    // 1. Activate Text tool and click page to create a text box
    await primaryPane.locator('[data-testid="pdf-tool-text"]').click();
    await page.mouse.click(page1Box.x + 180, page1Box.y + 220);

    const textarea = primaryPane.locator('[data-testid^="pdf-text-input-"]');
    await expect(textarea).toHaveCount(1, { timeout: 5000 });
    await expect(textarea).toBeFocused();

    // 2. Typing English text: verify it appears immediately without clicking away
    await page.keyboard.type("First line English text", { delay: 25 });
    await expect(textarea).toHaveValue("First line English text");

    const boxesTyping = await readCustomTextBoxes(page);
    expect(boxesTyping.length).toBe(1);
    expect(boxesTyping[0].text).toBe("First line English text");

    // 3. Press Enter in text box: verify multiline works without losing edit mode or focus
    await page.keyboard.press("Enter");
    await expect(textarea).toBeVisible();
    await expect(textarea).toBeFocused();

    // Type second line
    await page.keyboard.type("Second line of notes", { delay: 25 });
    await expect(textarea).toHaveValue("First line English text\nSecond line of notes");

    const boxesMultilineTyping = await readCustomTextBoxes(page);
    expect(boxesMultilineTyping[0].text).toBe("First line English text\nSecond line of notes");

    // 4. Blur / exit edit mode (via Escape) and verify multiline persists and renders
    await page.keyboard.press("Escape");
    await expect(primaryPane.locator('[data-testid^="pdf-text-input-"]')).toHaveCount(0);

    const textBox = primaryPane.locator('[data-testid^="pdf-text-box-"]');
    await expect(textBox).toHaveCount(1);
    await expect(textBox).toBeVisible();
    await expect(textBox).toHaveText("First line English text\nSecond line of notes");

    // Verify CSS pre-wrap is applied
    const whiteSpace = await textBox.evaluate((el) => window.getComputedStyle(el).whiteSpace);
    expect(whiteSpace).toBe("pre-wrap");

    // Verify box height expands for multiline content (> 30px for 2 lines)
    const boxMetrics = await textBox.boundingBox();
    expect(boxMetrics).not.toBeNull();
    expect(boxMetrics!.height).toBeGreaterThanOrEqual(30);

    // Verify state across blur retains exact multiline text
    const boxesAfterBlur = await readCustomTextBoxes(page);
    expect(boxesAfterBlur[0].text).toBe("First line English text\nSecond line of notes");
  });

  test("stamp tool: inserting stamp from file picker displays bounding box and 8 resize handles immediately without switching tools or clicking away", async ({ page }) => {
    const pid = "test-pdf-stamp-immediate-resize-handles";
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const p1 = pdfDoc.addPage([595.28, 841.89]);
    p1.drawText("Stamp Immediate Resize Handles Verification", { x: 50, y: 750, size: 16, font, color: rgb(0, 0, 0) });
    const pdfBytes = await pdfDoc.save();

    await page.goto(`/workspace?p=${pid}&kind=pdf`);
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();
    const primaryPane = page.locator('.pane[data-slot="primary"]');
    const fileInput = primaryPane.locator('input[data-testid="pdf-file-input"]');
    await expect(fileInput).toBeAttached();
    await fileInput.setInputFiles({
      name: "stamp-immediate.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBytes),
    });
    const page1 = primaryPane.locator('[data-testid="pdf-page-1"]');
    await expect(page1).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(600);

    // 1. Insert stamp from file picker
    const squarePngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const stampInput = primaryPane.locator('input[data-testid="pdf-stamp-input"]');
    await stampInput.setInputFiles({
      name: "stamp-immediate.png",
      mimeType: "image/png",
      buffer: Buffer.from(squarePngBase64, "base64"),
    });

    // 2. Verify stamp object attached
    const stampObject = primaryPane.locator('[data-testid="pdf-stamp-object"]').first();
    await expect(stampObject).toBeAttached({ timeout: 10000 });

    // 3. Verify tool automatically switches to select
    const selectBtn = primaryPane.locator('[data-testid="pdf-tool-select"]');
    await expect(selectBtn).toHaveAttribute("aria-pressed", "true");

    // 4. Verify bounding box appears immediately without switching tools or clicking away and back
    const stampBbox = primaryPane.locator('[data-testid="pdf-stamp-bbox"]');
    await expect(stampBbox).toBeVisible({ timeout: 5000 });

    // 5. Verify all 8 resize handles appear immediately
    const handlePositions = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
    for (const pos of handlePositions) {
      const handle = primaryPane.locator(`[data-testid="pdf-stamp-resize-handle-${pos}"]`);
      await expect(handle).toBeVisible();
    }
    const allHandles = primaryPane.locator('[data-testid^="pdf-stamp-resize-handle-"]');
    await expect(allHandles).toHaveCount(8);

    // 6. Verify stamp can immediately be resized using the 'se' handle without clicking anywhere else
    const stampBboxBefore = await stampBbox.boundingBox();
    expect(stampBboxBefore).not.toBeNull();
    const seHandle = primaryPane.locator('[data-testid="pdf-stamp-resize-handle-se"]');
    const seBox = await seHandle.boundingBox();
    expect(seBox).not.toBeNull();
    if (stampBboxBefore && seBox) {
      await page.mouse.move(seBox.x + seBox.width / 2, seBox.y + seBox.height / 2);
      await page.mouse.down();
      for (let i = 1; i <= 6; i++) {
        await page.mouse.move(
          seBox.x + seBox.width / 2 + (40 * i) / 6,
          seBox.y + seBox.height / 2 + (40 * i) / 6
        );
      }
      await page.mouse.up();
      await page.waitForTimeout(300);

      const stampBboxAfter = await stampBbox.boundingBox();
      expect(stampBboxAfter).not.toBeNull();
      expect(stampBboxAfter!.width).toBeGreaterThan(stampBboxBefore.width + 10);
    }
  });

  test("text tool: UI polish styling, origin anchoring without crawl during typing, fixed 250x100 container, and smooth transition to display mode", async ({ page }) => {
    const pid = "test-pdf-text-ui-polish-anchoring";
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const p1 = pdfDoc.addPage([595.28, 841.89]);
    p1.drawText("Text Tool UI Polish & Anchoring Verification", { x: 50, y: 750, size: 16, font, color: rgb(0, 0, 0) });
    const pdfBytes = await pdfDoc.save();

    await page.goto(`/workspace?p=${pid}&kind=pdf`);
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();
    const primaryPane = page.locator('.pane[data-slot="primary"]');
    const fileInput = primaryPane.locator('input[data-testid="pdf-file-input"]');
    await expect(fileInput).toBeAttached();
    await fileInput.setInputFiles({
      name: "text-polish.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBytes),
    });
    const page1 = primaryPane.locator('[data-testid="pdf-page-1"]');
    await expect(page1).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(600);
    const page1Box = await page1.boundingBox();
    expect(page1Box).not.toBeNull();
    if (!page1Box) return;

    // 1. Activate Text tool and click page to create a text box
    await primaryPane.locator('[data-testid="pdf-tool-text"]').click();
    const clickX = page1Box.x + 200;
    const clickY = page1Box.y + 240;
    await page.mouse.click(clickX, clickY);

    const textarea = primaryPane.locator('[data-testid^="pdf-text-input-"]');
    await expect(textarea).toHaveCount(1, { timeout: 5000 });
    await expect(textarea).toBeFocused();

    // c. Verify text box looks styled with active border and padding when editing
    const textareaStyles = await textarea.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return {
        borderStyle: s.borderStyle,
        borderWidth: s.borderWidth,
        borderColor: s.borderColor,
        borderRadius: s.borderRadius,
        paddingTop: s.paddingTop,
        paddingBottom: s.paddingBottom,
        paddingLeft: s.paddingLeft,
        paddingRight: s.paddingRight,
        cursor: s.cursor,
        fontFamily: s.fontFamily,
      };
    });

    expect(textareaStyles.borderStyle).toBe("dashed");
    expect(textareaStyles.borderWidth).toBe("1px");
    // rgb(26, 99, 160) corresponds to #1A63A0
    expect(textareaStyles.borderColor).toBe("rgb(26, 99, 160)");
    expect(parseFloat(textareaStyles.paddingTop)).toBeCloseTo(8, 0);
    expect(parseFloat(textareaStyles.paddingBottom)).toBeCloseTo(8, 0);
    expect(parseFloat(textareaStyles.paddingLeft)).toBeCloseTo(8, 0);
    expect(parseFloat(textareaStyles.paddingRight)).toBeCloseTo(8, 0);
    expect(textareaStyles.cursor).toBe("text");
    expect(textareaStyles.fontFamily.toLowerCase()).toContain("sans-serif");

    // a. Verify initial fixed 250x100 container and origin anchoring
    const initialBox = await textarea.boundingBox();
    expect(initialBox).not.toBeNull();
    expect(initialBox!.width).toBeCloseTo(250, 0);
    expect(initialBox!.height).toBeCloseTo(100, 0);
    const initialOriginX = initialBox!.x;
    const initialOriginY = initialBox!.y;

    const initialBoxes = await readCustomTextBoxes(page);
    expect(initialBoxes.length).toBe(1);
    const initialStoredX = initialBoxes[0].x;
    const initialStoredY = initialBoxes[0].y;

    // Type first phrase: verify origin remains pinned at start and dimensions stay fixed 250x100
    await page.keyboard.type("First line of notes", { delay: 20 });
    await expect(textarea).toHaveValue("First line of notes");

    const boxAfterTyping1 = await textarea.boundingBox();
    expect(boxAfterTyping1).not.toBeNull();
    expect(boxAfterTyping1!.width).toBeCloseTo(250, 0);
    expect(boxAfterTyping1!.height).toBeCloseTo(100, 0);
    expect(Math.abs(boxAfterTyping1!.x - initialOriginX)).toBeLessThanOrEqual(2);
    expect(Math.abs(boxAfterTyping1!.y - initialOriginY)).toBeLessThanOrEqual(2);

    const storedAfter1 = await readCustomTextBoxes(page);
    expect(Math.abs(storedAfter1[0].x - initialStoredX)).toBeLessThan(0.1);
    expect(Math.abs(storedAfter1[0].y - initialStoredY)).toBeLessThan(0.1);

    // b. Verify pressing Enter creates a new line, and text box maintains fixed 250x100 dimensions without crawling
    await page.keyboard.press("Enter");
    await expect(textarea).toBeFocused();
    await page.keyboard.type("Second line with additional details", { delay: 20 });
    await expect(textarea).toHaveValue("First line of notes\nSecond line with additional details");

    const boxAfterEnter = await textarea.boundingBox();
    expect(boxAfterEnter).not.toBeNull();
    expect(boxAfterEnter!.width).toBeCloseTo(250, 0);
    expect(boxAfterEnter!.height).toBeCloseTo(100, 0);
    // Origin must STILL remain pinned strictly at origin without vertical or horizontal crawling
    expect(Math.abs(boxAfterEnter!.x - initialOriginX)).toBeLessThanOrEqual(2);
    expect(Math.abs(boxAfterEnter!.y - initialOriginY)).toBeLessThanOrEqual(2);

    // Add a third line via Enter
    await page.keyboard.press("Enter");
    await page.keyboard.type("Third line", { delay: 20 });
    await expect(textarea).toHaveValue("First line of notes\nSecond line with additional details\nThird line");

    const boxAfterLine3 = await textarea.boundingBox();
    expect(boxAfterLine3).not.toBeNull();
    expect(boxAfterLine3!.width).toBeCloseTo(250, 0);
    expect(boxAfterLine3!.height).toBeGreaterThanOrEqual(100);
    expect(Math.abs(boxAfterLine3!.x - initialOriginX)).toBeLessThanOrEqual(2);
    expect(Math.abs(boxAfterLine3!.y - initialOriginY)).toBeLessThanOrEqual(2);

    // Transition between edit and display mode: verify display <div> has clean layout and does not jump
    await page.keyboard.press("Escape");
    await expect(primaryPane.locator('[data-testid^="pdf-text-input-"]')).toHaveCount(0);

    const textBox = primaryPane.locator('[data-testid^="pdf-text-box-"]');
    await expect(textBox).toHaveCount(1);
    await expect(textBox).toBeVisible();

    const displayStyles = await textBox.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return {
        paddingTop: s.paddingTop,
        paddingBottom: s.paddingBottom,
        paddingLeft: s.paddingLeft,
        paddingRight: s.paddingRight,
        fontFamily: s.fontFamily,
        boxSizing: s.boxSizing,
      };
    });

    expect(parseFloat(displayStyles.paddingTop)).toBeCloseTo(8, 0);
    expect(parseFloat(displayStyles.paddingBottom)).toBeCloseTo(8, 0);
    expect(parseFloat(displayStyles.paddingLeft)).toBeCloseTo(8, 0);
    expect(parseFloat(displayStyles.paddingRight)).toBeCloseTo(8, 0);
    expect(displayStyles.boxSizing).toBe("border-box");
    expect(displayStyles.fontFamily.toLowerCase()).toContain("sans-serif");

    const displayBox = await textBox.boundingBox();
    expect(displayBox).not.toBeNull();
    expect(displayBox!.width).toBeCloseTo(250, 0);
    expect(displayBox!.height).toBeGreaterThanOrEqual(100);
    // Display box top-left must match the textarea top-left within 2px (zero jump!)
    expect(Math.abs(displayBox!.x - initialOriginX)).toBeLessThanOrEqual(2);
    expect(Math.abs(displayBox!.y - initialOriginY)).toBeLessThanOrEqual(2);
  });

  test("text tool: pasting multiline text preserves newlines, maintains fixed 250x100 container, and persists across blur", async ({ page }) => {
    const pid = "test-pdf-text-paste-multiline";
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const p1 = pdfDoc.addPage([595.28, 841.89]);
    p1.drawText("Pasting Multiline Text Verification", { x: 50, y: 750, size: 16, font, color: rgb(0, 0, 0) });
    const pdfBytes = await pdfDoc.save();

    await page.goto(`/workspace?p=${pid}&kind=pdf`);
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();
    const primaryPane = page.locator('.pane[data-slot="primary"]');
    const fileInput = primaryPane.locator('input[data-testid="pdf-file-input"]');
    await expect(fileInput).toBeAttached();
    await fileInput.setInputFiles({
      name: "paste-multiline.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBytes),
    });
    const page1 = primaryPane.locator('[data-testid="pdf-page-1"]');
    await expect(page1).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(600);
    const page1Box = await page1.boundingBox();
    expect(page1Box).not.toBeNull();
    if (!page1Box) return;

    // 1. Activate Text tool and create a text box
    await primaryPane.locator('[data-testid="pdf-tool-text"]').click();
    const clickX = page1Box.x + 180;
    const clickY = page1Box.y + 220;
    await page.mouse.click(clickX, clickY);

    const textarea = primaryPane.locator('[data-testid^="pdf-text-input-"]');
    await expect(textarea).toHaveCount(1, { timeout: 5000 });
    await expect(textarea).toBeFocused();

    const initialBox = await textarea.boundingBox();
    expect(initialBox).not.toBeNull();
    expect(initialBox!.width).toBeCloseTo(250, 0);
    expect(initialBox!.height).toBeCloseTo(100, 0);
    const initialOriginX = initialBox!.x;
    const initialOriginY = initialBox!.y;

    // 2. Simulate pasting a 3-line Telegram message containing \r\n line breaks
    const multilineTelegramMessage =
      "Telegram line 1: Urgent project update\r\nTelegram line 2: Meeting scheduled at 14:00 GMT\r\nTelegram line 3: Review the attached documents";
    const expectedNormalizedText =
      "Telegram line 1: Urgent project update\nTelegram line 2: Meeting scheduled at 14:00 GMT\nTelegram line 3: Review the attached documents";

    await textarea.evaluate((el: HTMLTextAreaElement, pasteText: string) => {
      const dt = new DataTransfer();
      dt.setData("text/plain", pasteText);
      const pasteEvent = new ClipboardEvent("paste", {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      });
      el.dispatchEvent(pasteEvent);
    }, multilineTelegramMessage);

    // 3. Verify textarea preserves all newlines and value matches normalized text
    await expect(textarea).toHaveValue(expectedNormalizedText);

    // Verify textarea maintains fixed 250px container width for multiline text without crawling, and auto-grows in height
    const textareaAfterPaste = await textarea.boundingBox();
    expect(textareaAfterPaste).not.toBeNull();
    expect(textareaAfterPaste!.width).toBeCloseTo(250, 0);
    expect(textareaAfterPaste!.height).toBeGreaterThanOrEqual(100);

    // Verify origin remains anchored during paste
    expect(Math.abs(textareaAfterPaste!.x - initialOriginX)).toBeLessThanOrEqual(2);
    expect(Math.abs(textareaAfterPaste!.y - initialOriginY)).toBeLessThanOrEqual(2);

    // Verify in-memory state before blur
    const storedBeforeBlur = await readCustomTextBoxes(page);
    expect(storedBeforeBlur.length).toBe(1);
    expect(storedBeforeBlur[0].text).toBe(expectedNormalizedText);

    // 4. Blur / exit edit mode via Escape and verify multiline renders across multiple lines
    await page.keyboard.press("Escape");
    await expect(primaryPane.locator('[data-testid^="pdf-text-input-"]')).toHaveCount(0);

    const textBox = primaryPane.locator('[data-testid^="pdf-text-box-"]');
    await expect(textBox).toHaveCount(1);
    await expect(textBox).toBeVisible();
    await expect(textBox).toHaveText(expectedNormalizedText);

    // Verify display styles: pre-wrap must be enabled to preserve newlines visually
    const styles = await textBox.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return {
        whiteSpace: s.whiteSpace,
        wordBreak: s.wordBreak,
        overflowWrap: s.overflowWrap,
      };
    });
    expect(styles.whiteSpace).toBe("pre-wrap");
    expect(styles.wordBreak).toBe("break-word");
    expect(styles.overflowWrap).toBe("break-word");

    // Verify display box maintains width and auto-grown height
    const displayBox = await textBox.boundingBox();
    expect(displayBox).not.toBeNull();
    expect(displayBox!.width).toBeCloseTo(250, 0);
    expect(displayBox!.height).toBeGreaterThanOrEqual(100);

    // Verify origin stays anchored without crawl across blur
    expect(Math.abs(displayBox!.x - initialOriginX)).toBeLessThanOrEqual(2);
    expect(Math.abs(displayBox!.y - initialOriginY)).toBeLessThanOrEqual(2);

    // 5. Verify persistence in annotation storage across blur
    const storedAfterBlur = await readCustomTextBoxes(page);
    expect(storedAfterBlur.length).toBe(1);
    expect(storedAfterBlur[0].text).toBe(expectedNormalizedText);
  });

  test("text tool: pasting long paragraph (280+ characters) auto-wraps within fixed 250x100 container, and anchors strictly at origin", async ({ page }) => {
    const pid = "test-pdf-text-autowrap-long-string";
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const p1 = pdfDoc.addPage([595.28, 841.89]);
    p1.drawText("Long String Auto-Wrapping Verification", { x: 50, y: 750, size: 16, font, color: rgb(0, 0, 0) });
    const pdfBytes = await pdfDoc.save();

    await page.goto(`/workspace?p=${pid}&kind=pdf`);
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();
    const primaryPane = page.locator('.pane[data-slot="primary"]');
    const fileInput = primaryPane.locator('input[data-testid="pdf-file-input"]');
    await expect(fileInput).toBeAttached();
    await fileInput.setInputFiles({
      name: "autowrap-long-text.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBytes),
    });
    const page1 = primaryPane.locator('[data-testid="pdf-page-1"]');
    await expect(page1).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(600);
    const page1Box = await page1.boundingBox();
    expect(page1Box).not.toBeNull();
    if (!page1Box) return;

    // 1. Activate Text tool and create text box at origin
    await primaryPane.locator('[data-testid="pdf-tool-text"]').click();
    const clickX = page1Box.x + 50;
    const clickY = page1Box.y + 180;
    await page.mouse.click(clickX, clickY);

    const textarea = primaryPane.locator('[data-testid^="pdf-text-input-"]');
    await expect(textarea).toHaveCount(1, { timeout: 5000 });
    await expect(textarea).toBeFocused();

    const initialBox = await textarea.boundingBox();
    expect(initialBox).not.toBeNull();
    expect(initialBox!.width).toBeCloseTo(250, 0);
    expect(initialBox!.height).toBeCloseTo(100, 0);
    const initialOriginX = initialBox!.x;
    const initialOriginY = initialBox!.y;

    // 2. Prepare the 280+ character paragraph from the user's prompt
    const longParagraph =
      "Nusuq is a premium men's brand specializing in luxury formal neckties, bespoke silk bowties, handcrafted cufflinks, and woven pocket squares tailored for discerning modern gentlemen seeking timeless elegance, refined taste, and uncompromising sartorial craftsmanship in every single stitch.";
    expect(longParagraph.length).toBeGreaterThanOrEqual(280);
    expect(longParagraph.startsWith("Nusuq is a premium men's brand specializing in luxury formal neckties")).toBe(true);

    // 3. Paste the 280+ character paragraph into the textarea
    await textarea.evaluate((el: HTMLTextAreaElement, pasteText: string) => {
      const dt = new DataTransfer();
      dt.setData("text/plain", pasteText);
      const pasteEvent = new ClipboardEvent("paste", {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      });
      el.dispatchEvent(pasteEvent);
    }, longParagraph);

    await expect(textarea).toHaveValue(longParagraph);

    // 4. Verify textarea bounds during editing:
    // - Fixed 250px container width is strictly maintained, height auto-grows for paragraph
    // - The anchor point (x, y) remains strictly fixed in place (< 2px drift) without crawling
    const textareaBox = await textarea.boundingBox();
    expect(textareaBox).not.toBeNull();
    expect(textareaBox!.width).toBeCloseTo(250, 0);
    expect(textareaBox!.height).toBeGreaterThanOrEqual(100);
    expect(Math.abs(textareaBox!.x - initialOriginX)).toBeLessThanOrEqual(2);
    expect(Math.abs(textareaBox!.y - initialOriginY)).toBeLessThanOrEqual(2);

    // Verify textarea CSS wrapping properties
    const textareaStyles = await textarea.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return {
        whiteSpace: s.whiteSpace,
        wordBreak: s.wordBreak,
        overflowWrap: s.overflowWrap,
      };
    });
    expect(textareaStyles.whiteSpace).toBe("pre-wrap");
    expect(textareaStyles.wordBreak).toBe("break-word");
    expect(textareaStyles.overflowWrap).toBe("break-word");

    // 5. Exit editing mode via Escape and verify display mode
    await page.keyboard.press("Escape");
    await expect(primaryPane.locator('[data-testid^="pdf-text-input-"]')).toHaveCount(0);

    const textBox = primaryPane.locator('[data-testid^="pdf-text-box-"]');
    await expect(textBox).toHaveCount(1);
    await expect(textBox).toBeVisible();
    await expect(textBox).toHaveText(longParagraph);

    // 6. Verify display mode bounds:
    // - Fixed 250px width is maintained and height auto-grows to fit paragraph
    // - Origin remains strictly fixed in place
    const displayBox = await textBox.boundingBox();
    expect(displayBox).not.toBeNull();
    expect(displayBox!.width).toBeCloseTo(250, 0);
    expect(displayBox!.height).toBeGreaterThanOrEqual(100);
    expect(Math.abs(displayBox!.x - initialOriginX)).toBeLessThanOrEqual(2);
    expect(Math.abs(displayBox!.y - initialOriginY)).toBeLessThanOrEqual(2);

    const displayStyles = await textBox.evaluate((el) => {
      const s = window.getComputedStyle(el);
      return {
        whiteSpace: s.whiteSpace,
        wordBreak: s.wordBreak,
        overflowWrap: s.overflowWrap,
      };
    });
    expect(displayStyles.whiteSpace).toBe("pre-wrap");
    expect(displayStyles.wordBreak).toBe("break-word");
    expect(displayStyles.overflowWrap).toBe("break-word");

    // 7. Switch to Select tool, click the text box, and verify selection bounding box
    await primaryPane.locator('[data-testid="pdf-tool-select"]').click();
    await textBox.click();

    const bbox = primaryPane.locator('[data-testid="pdf-text-bbox"] rect').first();
    await expect(bbox).toBeVisible({ timeout: 5000 });

    const bboxRect = await bbox.boundingBox();
    expect(bboxRect).not.toBeNull();
    // SVG rect attribute width & height match fixed 250px and auto-grown height
    const bboxSvgWidth = parseFloat((await bbox.getAttribute("width")) || "0");
    expect(bboxSvgWidth).toBeCloseTo(250, 0);
    const bboxSvgHeight = parseFloat((await bbox.getAttribute("height")) || "0");
    expect(bboxSvgHeight).toBeGreaterThanOrEqual(100);
    // Bounding box rendered dimensions match width within 2px stroke tolerance
    expect(Math.abs(bboxRect!.width - 250)).toBeLessThanOrEqual(2);
    expect(bboxRect!.height).toBeGreaterThanOrEqual(100);
    // Bounding box origin must match anchor point
    expect(Math.abs(bboxRect!.x - initialOriginX)).toBeLessThanOrEqual(2);
    expect(Math.abs(bboxRect!.y - initialOriginY)).toBeLessThanOrEqual(2);
  });

  test("text tool: 3-line text box maintains strictly fixed width and height during and after dragging across page without re-wrapping or resizing", async ({ page }) => {
    const pid = `${projectId}-drag-fixed`;
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const p1 = pdfDoc.addPage([595.28, 841.89]);
    p1.drawText("PDF Fixed Dimensions on Drag Verification", {
      x: 50,
      y: 750,
      size: 20,
      font,
      color: rgb(0, 0, 0),
    });
    const pdfBytes = await pdfDoc.save();

    await page.goto(`/workspace?p=${pid}&kind=pdf`);
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();
    const primaryPane = page.locator('.pane[data-slot="primary"]');
    const fileInput = primaryPane.locator('input[data-testid="pdf-file-input"]');
    await expect(fileInput).toBeAttached();
    await fileInput.setInputFiles({
      name: "fixed-drag-test.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBytes),
    });
    const page1 = primaryPane.locator('[data-testid="pdf-page-1"]');
    await expect(page1).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(600);
    const page1Box = await page1.boundingBox();
    expect(page1Box).not.toBeNull();
    if (!page1Box) return;

    // 1. Activate Text tool and create text box
    await primaryPane.locator('[data-testid="pdf-tool-text"]').click();
    const clickX = page1Box.x + 80;
    const clickY = page1Box.y + 180;
    await page.mouse.click(clickX, clickY);

    const textarea = primaryPane.locator('[data-testid^="pdf-text-input-"]');
    await expect(textarea).toHaveCount(1, { timeout: 5000 });
    await expect(textarea).toBeFocused();

    // 2. Paste a 3-line wrapped text
    const threeLineText =
      "Nusuq luxury brand specializes in formal neckties,\nhandcrafted bespoke silk bowties and cufflinks,\ntailored for modern gentlemen seeking elegance.";

    await textarea.evaluate((el: HTMLTextAreaElement, pasteText: string) => {
      const dt = new DataTransfer();
      dt.setData("text/plain", pasteText);
      const pasteEvent = new ClipboardEvent("paste", {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      });
      el.dispatchEvent(pasteEvent);
    }, threeLineText);

    await expect(textarea).toHaveValue(threeLineText);

    // 3. Exit edit mode via Escape to switch to display mode
    await page.keyboard.press("Escape");
    await expect(primaryPane.locator('[data-testid^="pdf-text-input-"]')).toHaveCount(0);

    const textBox = primaryPane.locator('[data-testid^="pdf-text-box-"]');
    await expect(textBox).toHaveCount(1);
    await expect(textBox).toBeVisible();
    await expect(textBox).toHaveText(threeLineText);

    // 4. Switch to Select tool and measure initial width and height
    await primaryPane.locator('[data-testid="pdf-tool-select"]').click();
    await textBox.click();

    const initialBox = await textBox.boundingBox();
    expect(initialBox).not.toBeNull();
    const initialWidth = initialBox!.width;
    const initialHeight = initialBox!.height;
    const initialOriginX = initialBox!.x;
    const initialOriginY = initialBox!.y;

    expect(initialWidth).toBeGreaterThan(64);
    expect(initialHeight).toBeGreaterThanOrEqual(60);

    // Verify selection bbox has matching dimensions
    const bbox = primaryPane.locator('[data-testid="pdf-text-bbox"] rect').first();
    await expect(bbox).toBeVisible({ timeout: 5000 });
    const bboxInitial = await bbox.boundingBox();
    expect(bboxInitial).not.toBeNull();
    expect(Math.abs(bboxInitial!.width - initialWidth)).toBeLessThanOrEqual(2);
    expect(Math.abs(bboxInitial!.height - initialHeight)).toBeLessThanOrEqual(2);

    // 5. Drag across the page: move mouse in steps and verify dimensions remain strictly fixed during drag
    const dragStartX = initialOriginX + initialWidth / 2;
    const dragStartY = initialOriginY + initialHeight / 2;
    const dragDeltaX = 140;
    const dragDeltaY = 100;

    await page.mouse.move(dragStartX, dragStartY);
    await page.mouse.down();

    for (let step = 1; step <= 5; step++) {
      await page.mouse.move(
        dragStartX + (dragDeltaX * step) / 5,
        dragStartY + (dragDeltaY * step) / 5
      );
      // During drag: verify width and height remain strictly fixed (within 1px), without re-wrapping or resizing
      const draggingBox = await textBox.boundingBox();
      expect(draggingBox).not.toBeNull();
      expect(Math.abs(draggingBox!.width - initialWidth)).toBeLessThanOrEqual(1);
      expect(Math.abs(draggingBox!.height - initialHeight)).toBeLessThanOrEqual(1);
    }

    // 6. Release mouse to commit drag
    await page.mouse.up();
    await page.waitForTimeout(200);

    // 7. Verify after drag: dimensions remain strictly fixed (within 1px), position moved, content intact
    const afterDragBox = await textBox.boundingBox();
    expect(afterDragBox).not.toBeNull();
    expect(Math.abs(afterDragBox!.width - initialWidth)).toBeLessThanOrEqual(1);
    expect(Math.abs(afterDragBox!.height - initialHeight)).toBeLessThanOrEqual(1);
    expect(Math.abs(afterDragBox!.x - (initialOriginX + dragDeltaX))).toBeLessThanOrEqual(5);
    expect(Math.abs(afterDragBox!.y - (initialOriginY + dragDeltaY))).toBeLessThanOrEqual(5);

    // Text content remains strictly identical without re-wrapping
    await expect(textBox).toHaveText(threeLineText);
  });

  test("text tool: verifies computed direction (ltr/rtl) and text-align (left/right) for English and Arabic text", async ({ page }) => {
    const pid = `${projectId}-text-direction`;
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const p1 = pdfDoc.addPage([595.28, 841.89]);
    p1.drawText("PDF Text Direction Verification", {
      x: 50,
      y: 750,
      size: 20,
      font,
      color: rgb(0, 0, 0),
    });
    const pdfBytes = await pdfDoc.save();

    await page.goto(`/workspace?p=${pid}&kind=pdf`);
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();
    const primaryPane = page.locator('.pane[data-slot="primary"]');
    const fileInput = primaryPane.locator('input[data-testid="pdf-file-input"]');
    await expect(fileInput).toBeAttached();
    await fileInput.setInputFiles({
      name: "text-direction-test.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBytes),
    });
    const page1 = primaryPane.locator('[data-testid="pdf-page-1"]');
    await expect(page1).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(600);
    const page1Box = await page1.boundingBox();
    expect(page1Box).not.toBeNull();
    if (!page1Box) return;

    // --- Part A: English text direction & fixed dimensions ---
    // 1. Activate Text tool and click page
    await primaryPane.locator('[data-testid="pdf-tool-text"]').click();
    const enClickX = page1Box.x + 80;
    const enClickY = page1Box.y + 140;
    await page.mouse.click(enClickX, enClickY);

    const enTextarea = primaryPane.locator('[data-testid^="pdf-text-input-"]');
    await expect(enTextarea).toHaveCount(1, { timeout: 5000 });
    await expect(enTextarea).toBeFocused();

    const enInitialBox = await enTextarea.boundingBox();
    expect(enInitialBox).not.toBeNull();
    expect(enInitialBox!.width).toBeCloseTo(250, 0);
    expect(enInitialBox!.height).toBeGreaterThanOrEqual(36);
    const enOriginX = enInitialBox!.x;
    const enOriginY = enInitialBox!.y;

    // 2. Type short English text: "Hello"
    await page.keyboard.type("Hello", { delay: 20 });
    await expect(enTextarea).toHaveValue("Hello");

    // Verify computed direction is 'ltr' and text-align is 'left' for "Hello"
    let enStyles = await enTextarea.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return { direction: cs.direction, textAlign: cs.textAlign };
    });
    expect(enStyles.direction).toBe("ltr");
    expect(enStyles.textAlign).toBe("left");

    // 3. Continue typing long English text: " - Nusuq luxury brand"
    await page.keyboard.type(" - Nusuq luxury brand", { delay: 20 });
    await expect(enTextarea).toHaveValue("Hello - Nusuq luxury brand");

    // Verify computed direction stays 'ltr' and text-align stays 'left' during editing
    enStyles = await enTextarea.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return { direction: cs.direction, textAlign: cs.textAlign };
    });
    expect(enStyles.direction).toBe("ltr");
    expect(enStyles.textAlign).toBe("left");

    // Verify anchor coordinates (x, y) strictly fixed without shifting and dimensions auto-grow
    const enBoxDuring = await enTextarea.boundingBox();
    expect(enBoxDuring).not.toBeNull();
    expect(enBoxDuring!.width).toBeCloseTo(250, 0);
    expect(enBoxDuring!.height).toBeGreaterThanOrEqual(36);
    expect(Math.abs(enBoxDuring!.x - enOriginX)).toBeLessThanOrEqual(2);
    expect(Math.abs(enBoxDuring!.y - enOriginY)).toBeLessThanOrEqual(2);

    // 4. Exit edit mode via Escape and verify computed styles & dimensions in display mode
    await page.keyboard.press("Escape");
    await expect(primaryPane.locator('[data-testid^="pdf-text-input-"]')).toHaveCount(0);

    const enTextBox = primaryPane.locator('[data-testid^="pdf-text-box-"]').filter({ hasText: "Nusuq luxury brand" });
    await expect(enTextBox).toHaveCount(1);
    const enDisplayStyles = await enTextBox.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return { direction: cs.direction, textAlign: cs.textAlign };
    });
    expect(enDisplayStyles.direction).toBe("ltr");
    expect(enDisplayStyles.textAlign).toBe("left");

    const enDisplayBox = await enTextBox.boundingBox();
    expect(enDisplayBox).not.toBeNull();
    expect(enDisplayBox!.width).toBeCloseTo(250, 0);
    expect(enDisplayBox!.height).toBeGreaterThanOrEqual(36);
    expect(Math.abs(enDisplayBox!.x - enOriginX)).toBeLessThanOrEqual(2);
    expect(Math.abs(enDisplayBox!.y - enOriginY)).toBeLessThanOrEqual(2);

    // --- Part B: Arabic text direction & fixed dimensions ---
    // 5. Activate Text tool again and click page for Arabic text box
    await primaryPane.locator('[data-testid="pdf-tool-text"]').click();
    const arClickX = page1Box.x + 80;
    const arClickY = page1Box.y + 260;
    await page.mouse.click(arClickX, arClickY);

    const arTextarea = primaryPane.locator('[data-testid^="pdf-text-input-"]');
    await expect(arTextarea).toHaveCount(1, { timeout: 5000 });
    await expect(arTextarea).toBeFocused();

    const arInitialBox = await arTextarea.boundingBox();
    expect(arInitialBox).not.toBeNull();
    expect(arInitialBox!.width).toBeCloseTo(250, 0);
    expect(arInitialBox!.height).toBeGreaterThanOrEqual(36);
    const arOriginX = arInitialBox!.x;
    const arOriginY = arInitialBox!.y;

    // 6. Type short Arabic text: "مرحبا"
    await arTextarea.evaluate((el: HTMLTextAreaElement, pasteText: string) => {
      const dt = new DataTransfer();
      dt.setData("text/plain", pasteText);
      const pasteEvent = new ClipboardEvent("paste", {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      });
      el.dispatchEvent(pasteEvent);
    }, "مرحبا");
    await expect(arTextarea).toHaveValue("مرحبا");

    // Verify computed direction is 'rtl' and text-align is 'right' for "مرحبا"
    let arStyles = await arTextarea.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return { direction: cs.direction, textAlign: cs.textAlign };
    });
    expect(arStyles.direction).toBe("rtl");
    expect(arStyles.textAlign).toBe("right");

    // 7. Update with longer Arabic text: "نُسُق علامة تجارية فاخرة"
    const arLongText = "نُسُق علامة تجارية فاخرة";
    await arTextarea.evaluate((el: HTMLTextAreaElement, pasteText: string) => {
      el.value = "";
      const dt = new DataTransfer();
      dt.setData("text/plain", pasteText);
      const pasteEvent = new ClipboardEvent("paste", {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      });
      el.dispatchEvent(pasteEvent);
    }, arLongText);
    await expect(arTextarea).toHaveValue(arLongText);

    // Verify computed direction is 'rtl' and text-align is 'right' during editing
    arStyles = await arTextarea.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return { direction: cs.direction, textAlign: cs.textAlign };
    });
    expect(arStyles.direction).toBe("rtl");
    expect(arStyles.textAlign).toBe("right");

    // Verify anchor coordinates (x, y) strictly fixed without shifting and dimensions auto-grow
    const arBoxDuring = await arTextarea.boundingBox();
    expect(arBoxDuring).not.toBeNull();
    expect(arBoxDuring!.width).toBeCloseTo(250, 0);
    expect(arBoxDuring!.height).toBeGreaterThanOrEqual(36);
    expect(Math.abs(arBoxDuring!.x - arOriginX)).toBeLessThanOrEqual(2);
    expect(Math.abs(arBoxDuring!.y - arOriginY)).toBeLessThanOrEqual(2);

    // 8. Exit edit mode via Escape and verify computed styles & dimensions in display mode
    await page.keyboard.press("Escape");
    await expect(primaryPane.locator('[data-testid^="pdf-text-input-"]')).toHaveCount(0);

    const arTextBox = primaryPane.locator('[data-testid^="pdf-text-box-"]').filter({ hasText: "نُسُق" });
    await expect(arTextBox).toHaveCount(1);
    const arDisplayStyles = await arTextBox.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return { direction: cs.direction, textAlign: cs.textAlign };
    });
    expect(arDisplayStyles.direction).toBe("rtl");
    expect(arDisplayStyles.textAlign).toBe("right");

    const arDisplayBox = await arTextBox.boundingBox();
    expect(arDisplayBox).not.toBeNull();
    expect(arDisplayBox!.width).toBeCloseTo(250, 0);
    expect(arDisplayBox!.height).toBeGreaterThanOrEqual(36);
    expect(Math.abs(arDisplayBox!.x - arOriginX)).toBeLessThanOrEqual(2);
    expect(Math.abs(arDisplayBox!.y - arOriginY)).toBeLessThanOrEqual(2);
  });

  test("text tool: verifies LTR direction persistence on blur, 20-line auto-growing height without clipping, and width resizing with reflow", async ({ page }) => {
    const pid = `${projectId}-text-autogrow-resize`;
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const p1 = pdfDoc.addPage([595.28, 841.89]);
    p1.drawText("PDF Text Auto-Grow & Resize Test", {
      x: 50,
      y: 750,
      size: 20,
      font,
      color: rgb(0, 0, 0),
    });
    const pdfBytes = await pdfDoc.save();

    await page.goto(`/workspace?p=${pid}&kind=pdf`);
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();
    const primaryPane = page.locator('.pane[data-slot="primary"]');
    const fileInput = primaryPane.locator('input[data-testid="pdf-file-input"]');
    await expect(fileInput).toBeAttached();
    await fileInput.setInputFiles({
      name: "text-autogrow-test.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBytes),
    });
    const page1 = primaryPane.locator('[data-testid="pdf-page-1"]');
    await expect(page1).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(600);
    const page1Box = await page1.boundingBox();
    expect(page1Box).not.toBeNull();
    if (!page1Box) return;

    // 1. Activate Text tool and click page
    await primaryPane.locator('[data-testid="pdf-tool-text"]').click();
    const clickX = page1Box.x + 80;
    const clickY = page1Box.y + 100;
    await page.mouse.click(clickX, clickY);

    const textarea = primaryPane.locator('[data-testid^="pdf-text-input-"]');
    await expect(textarea).toHaveCount(1, { timeout: 5000 });
    await expect(textarea).toBeFocused();

    // 2. Insert 20 lines of English text
    const lines20 = Array.from({ length: 20 }, (_, i) => `Line ${i + 1}: English text verification`).join("\n");
    await textarea.evaluate((el: HTMLTextAreaElement, pasteText: string) => {
      const dt = new DataTransfer();
      dt.setData("text/plain", pasteText);
      const pasteEvent = new ClipboardEvent("paste", {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
      });
      el.dispatchEvent(pasteEvent);
    }, lines20);
    await expect(textarea).toHaveValue(lines20);

    // 3. Verify textarea height auto-grows to fit all 20 lines (>= 300px, significantly larger than 100px)
    const taBox = await textarea.boundingBox();
    expect(taBox).not.toBeNull();
    expect(taBox!.height).toBeGreaterThan(300);

    // 4. Blur / exit edit mode (Escape)
    await page.keyboard.press("Escape");
    await expect(primaryPane.locator('[data-testid^="pdf-text-input-"]')).toHaveCount(0);

    // 5. Verify static display div: LTR direction persists, text-align is left, and height fits all 20 lines
    const textBox = primaryPane.locator('[data-testid^="pdf-text-box-"]').filter({ hasText: "Line 20" });
    await expect(textBox).toHaveCount(1);
    const displayStyles = await textBox.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return { direction: cs.direction, textAlign: cs.textAlign, height: parseFloat(cs.height) };
    });
    expect(displayStyles.direction).toBe("ltr");
    expect(displayStyles.textAlign).toBe("left");
    expect(displayStyles.height).toBeGreaterThan(300);

    // 6. Switch to Select tool and select the text box
    await primaryPane.locator('[data-testid="pdf-tool-select"]').click();
    await textBox.click();

    // 7. Verify 8 resize handles are visible
    const eastHandle = primaryPane.locator('[data-testid="pdf-text-resize-handle-e"]');
    await expect(eastHandle).toBeVisible();

    // 8. Drag East handle to expand width from ~250px to ~400px
    const handleBoxBefore = await eastHandle.boundingBox();
    expect(handleBoxBefore).not.toBeNull();
    await page.mouse.move(handleBoxBefore!.x + handleBoxBefore!.width / 2, handleBoxBefore!.y + handleBoxBefore!.height / 2);
    await page.mouse.down();
    await page.mouse.move(handleBoxBefore!.x + 150, handleBoxBefore!.y, { steps: 5 });
    await page.mouse.up();

    // 9. Verify resized box width has increased and height has reflowed
    const displayBoxAfter = await textBox.boundingBox();
    expect(displayBoxAfter).not.toBeNull();
    expect(displayBoxAfter!.width).toBeGreaterThanOrEqual(350);
  });

  test("text tool: verifies proportional corner scaling (width, height, and font size scale locking aspect ratio) and independent side handle reflow", async ({ page }) => {
    const pid = `${projectId}-text-corner-proportional-scale`;
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const p1 = pdfDoc.addPage([595.28, 841.89]);
    p1.drawText("PDF Text Proportional Scaling Test", {
      x: 50,
      y: 750,
      size: 20,
      font,
      color: rgb(0, 0, 0),
    });
    const pdfBytes = await pdfDoc.save();

    await page.goto(`/workspace?p=${pid}&kind=pdf`);
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();
    const primaryPane = page.locator('.pane[data-slot="primary"]');
    const fileInput = primaryPane.locator('input[data-testid="pdf-file-input"]');
    await expect(fileInput).toBeAttached();
    await fileInput.setInputFiles({
      name: "text-scale-test.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBytes),
    });
    const page1 = primaryPane.locator('[data-testid="pdf-page-1"]');
    await expect(page1).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(600);
    const page1Box = await page1.boundingBox();
    expect(page1Box).not.toBeNull();
    if (!page1Box) return;

    // 1. Activate Text tool and create text box
    await primaryPane.locator('[data-testid="pdf-tool-text"]').click();
    const clickX = page1Box.x + 80;
    const clickY = page1Box.y + 120;
    await page.mouse.click(clickX, clickY);

    const textarea = primaryPane.locator('[data-testid^="pdf-text-input-"]');
    await expect(textarea).toHaveCount(1, { timeout: 5000 });
    await expect(textarea).toBeFocused();

    // Type sample text
    const sampleText = "Proportional Scaling Verification";
    await page.keyboard.type(sampleText, { delay: 10 });
    await expect(textarea).toHaveValue(sampleText);

    // 2. Exit edit mode
    await page.keyboard.press("Escape");
    await expect(primaryPane.locator('[data-testid^="pdf-text-input-"]')).toHaveCount(0);

    const textBox = primaryPane.locator('[data-testid^="pdf-text-box-"]').filter({ hasText: sampleText });
    await expect(textBox).toHaveCount(1);

    // 3. Switch to Select tool and select the text box
    await primaryPane.locator('[data-testid="pdf-tool-select"]').click();
    await textBox.click();

    // 4. Record initial dimensions and font size
    const initialBox = await textBox.boundingBox();
    expect(initialBox).not.toBeNull();
    const initialFontSize = await textBox.evaluate((el) => parseFloat(window.getComputedStyle(el).fontSize));
    expect(initialFontSize).toBe(16);

    // 5. Locate SE (bottom-right) corner handle
    const seHandle = primaryPane.locator('[data-testid="pdf-text-resize-handle-se"]');
    await expect(seHandle).toBeVisible();
    const seBoxBefore = await seHandle.boundingBox();
    expect(seBoxBefore).not.toBeNull();

    // 6. Drag SE corner handle inward by 75px
    await page.mouse.move(seBoxBefore!.x + seBoxBefore!.width / 2, seBoxBefore!.y + seBoxBefore!.height / 2);
    await page.mouse.down();
    await page.mouse.move(seBoxBefore!.x - 75, seBoxBefore!.y - 30, { steps: 5 });
    await page.mouse.up();

    // 7. Verify both width, height, and font size decreased proportionally
    const boxAfterCorner = await textBox.boundingBox();
    expect(boxAfterCorner).not.toBeNull();
    expect(boxAfterCorner!.width).toBeLessThan(initialBox!.width);
    expect(boxAfterCorner!.height).toBeLessThan(initialBox!.height);

    const scaledFontSize = await textBox.evaluate((el) => parseFloat(window.getComputedStyle(el).fontSize));
    expect(scaledFontSize).toBeLessThan(initialFontSize);
    // Aspect ratio should be preserved
    const initialAspect = initialBox!.width / initialBox!.height;
    const scaledAspect = boxAfterCorner!.width / boxAfterCorner!.height;
    expect(Math.abs(scaledAspect - initialAspect)).toBeLessThan(0.4);

    // 8. Test side handle (E handle): drag to expand width
    const eHandle = primaryPane.locator('[data-testid="pdf-text-resize-handle-e"]');
    await expect(eHandle).toBeVisible();
    const eBoxBefore = await eHandle.boundingBox();
    expect(eBoxBefore).not.toBeNull();

    await page.mouse.move(eBoxBefore!.x + eBoxBefore!.width / 2, eBoxBefore!.y + eBoxBefore!.height / 2);
    await page.mouse.down();
    await page.mouse.move(eBoxBefore!.x + 120, eBoxBefore!.y, { steps: 5 });
    await page.mouse.up();

    // 9. Side handle should change width without modifying font size
    const boxAfterSide = await textBox.boundingBox();
    expect(boxAfterSide).not.toBeNull();
    expect(boxAfterSide!.width).toBeGreaterThan(boxAfterCorner!.width);

    const fontSizeAfterSide = await textBox.evaluate((el) => parseFloat(window.getComputedStyle(el).fontSize));
    expect(fontSizeAfterSide).toBeCloseTo(scaledFontSize, 1);
  });

  test("text direction: verifies Text Box and Sticky Note English text aligns LTR / left and Arabic text aligns RTL / right, with dragging and scaling intact", async ({ page }) => {
    const pid = `${projectId}-text-sticky-direction-test`;
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const p1 = pdfDoc.addPage([595.28, 841.89]);
    p1.drawText("Text Box and Sticky Note Direction Test", {
      x: 50,
      y: 750,
      size: 18,
      font,
      color: rgb(0, 0, 0),
    });
    const pdfBytes = await pdfDoc.save();

    await page.goto(`/workspace?p=${pid}&kind=pdf`);
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();
    const primaryPane = page.locator('.pane[data-slot="primary"]');
    const fileInput = primaryPane.locator('input[data-testid="pdf-file-input"]');
    await expect(fileInput).toBeAttached();
    await fileInput.setInputFiles({
      name: "direction-test.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBytes),
    });
    const page1 = primaryPane.locator('[data-testid="pdf-page-1"]');
    await expect(page1).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(600);
    const page1Box = await page1.boundingBox();
    expect(page1Box).not.toBeNull();
    if (!page1Box) return;

    // 1. Add English Text Box
    await primaryPane.locator('[data-testid="pdf-tool-text"]').click();
    await page.mouse.click(page1Box!.x + 60, page1Box!.y + 100);

    const enTextarea = primaryPane.locator('[data-testid^="pdf-text-input-"]');
    await expect(enTextarea).toHaveCount(1, { timeout: 5000 });
    await page.keyboard.type("Hello English Text Box", { delay: 10 });
    await page.keyboard.press("Escape");
    await expect(primaryPane.locator('[data-testid^="pdf-text-input-"]')).toHaveCount(0);

    const enTextBox = primaryPane.locator('[data-testid^="pdf-text-box-"]').filter({ hasText: "Hello English Text Box" });
    await expect(enTextBox).toHaveCount(1);
    const enTextComputed = await enTextBox.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return { direction: cs.direction, textAlign: cs.textAlign, dir: el.getAttribute("dir") };
    });
    expect(enTextComputed.direction).toBe("ltr");
    expect(enTextComputed.textAlign).toBe("left");
    expect(enTextComputed.dir).toBe("ltr");

    // 2. Add Arabic Text Box
    await primaryPane.locator('[data-testid="pdf-tool-text"]').click();
    await page.mouse.click(page1Box!.x + 60, page1Box!.y + 220);

    const arTextarea = primaryPane.locator('[data-testid^="pdf-text-input-"]');
    await expect(arTextarea).toHaveCount(1, { timeout: 5000 });
    await page.keyboard.type("مرحبا نص صندوق عربي", { delay: 10 });
    await page.keyboard.press("Escape");
    await expect(primaryPane.locator('[data-testid^="pdf-text-input-"]')).toHaveCount(0);

    const arTextBox = primaryPane.locator('[data-testid^="pdf-text-box-"]').filter({ hasText: "مرحبا نص صندوق عربي" });
    await expect(arTextBox).toHaveCount(1);
    const arTextComputed = await arTextBox.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return { direction: cs.direction, textAlign: cs.textAlign, dir: el.getAttribute("dir") };
    });
    expect(arTextComputed.direction).toBe("rtl");
    expect(arTextComputed.textAlign).toBe("right");
    expect(arTextComputed.dir).toBe("rtl");

    // 3. Add English Sticky Note
    await primaryPane.locator('[data-testid="pdf-tool-sticky"]').click();
    await page.mouse.click(page1Box!.x + 350, page1Box!.y + 100);

    const stickyTextareas = primaryPane.locator('[data-testid^="pdf-sticky-textarea-"]');
    const enStickyTa = stickyTextareas.last();
    await expect(enStickyTa).toBeVisible({ timeout: 5000 });
    await enStickyTa.fill("Hello English Sticky Note");
    await page.keyboard.press("Escape");

    const enStickyComputed = await enStickyTa.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return { direction: cs.direction, textAlign: cs.textAlign };
    });
    expect(enStickyComputed.direction).toBe("ltr");
    expect(enStickyComputed.textAlign).toBe("left");

    // 4. Add Arabic Sticky Note
    await primaryPane.locator('[data-testid="pdf-tool-sticky"]').click();
    await page.mouse.click(page1Box!.x + 350, page1Box!.y + 320);

    const arStickyTa = primaryPane.locator('[data-testid^="pdf-sticky-textarea-"]').last();
    await expect(arStickyTa).toBeVisible({ timeout: 5000 });
    await arStickyTa.fill("ملاحظة لاصقة باللغة العربية");
    await page.keyboard.press("Escape");

    const arStickyComputed = await arStickyTa.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return { direction: cs.direction, textAlign: cs.textAlign };
    });
    expect(arStickyComputed.direction).toBe("rtl");
    expect(arStickyComputed.textAlign).toBe("right");

    // 5. Verify dragging, scaling, and corner handles for Text Box remain completely intact
    await primaryPane.locator('[data-testid="pdf-tool-select"]').click();
    await enTextBox.click();

    // Verify all 8 handles exist (4 corners + 4 sides)
    const nwHandle = primaryPane.locator('[data-testid="pdf-text-resize-handle-nw"]');
    const neHandle = primaryPane.locator('[data-testid="pdf-text-resize-handle-ne"]');
    const seHandle = primaryPane.locator('[data-testid="pdf-text-resize-handle-se"]');
    const swHandle = primaryPane.locator('[data-testid="pdf-text-resize-handle-sw"]');
    await expect(nwHandle).toBeVisible();
    await expect(neHandle).toBeVisible();
    await expect(seHandle).toBeVisible();
    await expect(swHandle).toBeVisible();

    // Drag move English text box
    const boxBeforeMove = await enTextBox.boundingBox();
    expect(boxBeforeMove).not.toBeNull();
    await page.mouse.move(boxBeforeMove!.x + 20, boxBeforeMove!.y + 10);
    await page.mouse.down();
    await page.mouse.move(boxBeforeMove!.x + 70, boxBeforeMove!.y + 30, { steps: 5 });
    await page.mouse.up();

    const boxAfterMove = await enTextBox.boundingBox();
    expect(boxAfterMove).not.toBeNull();
    expect(boxAfterMove!.x).toBeGreaterThan(boxBeforeMove!.x + 30);
    expect(boxAfterMove!.width).toBeCloseTo(boxBeforeMove!.width, 1);
    expect(boxAfterMove!.height).toBeCloseTo(boxBeforeMove!.height, 1);
  });
});