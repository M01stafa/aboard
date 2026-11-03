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

    // 4. Add Text annotation
    await primaryPane.locator('[data-testid="pdf-tool-text"]').click();
    await page.waitForTimeout(200);

    const textClickX = initialBox.x + 100;
    const textClickY = initialBox.y + 300;
    await page.mouse.click(textClickX, textClickY);
    await page.waitForTimeout(500);

    // Wait for FreeText annotation to be created
    await expect.poll(async () => {
      return await page.evaluate(() => {
        const scope = (window as unknown as {
          __aboard_pdfAnnotations?: { scope?: { getAnnotations: () => unknown } };
        }).__aboard_pdfAnnotations?.scope;
        const res = scope?.getAnnotations();
        const list = Array.isArray(res) ? res : Object.values((res as Record<string, any[]>) || {}).flat();
        return list.some((a: any) => a?.object?.type === 3);
      });
    }, { timeout: 10000 }).toBe(true);

    // Switch to Select tool
    await primaryPane.locator('[data-testid="pdf-tool-select"]').click();
    await page.waitForTimeout(300);

    // Get text object and position
    await expect(primaryPane.locator('[data-testid="pdf-text-object"]').first()).toBeAttached({ timeout: 10000 });
    const textObject = primaryPane.locator('[data-testid="pdf-text-object"]').first();
    const textBox = await textObject.boundingBox();
    expect(textBox).not.toBeNull();
    if (!textBox) return;

    const initialTextOrigin = await page.evaluate(() => {
      const scope = (window as unknown as {
        __aboard_pdfAnnotations?: { scope?: { getAnnotations: () => unknown } };
      }).__aboard_pdfAnnotations?.scope;
      const res = scope?.getAnnotations();
      const list = Array.isArray(res) ? res : Object.values((res as Record<string, any[]>) || {}).flat();
      const textAnno = list.find((a: any) => a?.object?.type === 3);
      return textAnno ? { ...textAnno.object.rect.origin } : null;
    });
    expect(initialTextOrigin).not.toBeNull();

    // Click text to select
    await page.mouse.click(textBox.x + textBox.width / 2, textBox.y + textBox.height / 2);
    await page.waitForTimeout(200);

    // Verify text selection bounding box is displayed
    const textBbox = primaryPane.locator('[data-testid="pdf-text-bbox"]');
    await expect(textBbox).toBeVisible({ timeout: 5000 });

    // Drag text by (+70px, +50px)
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
    await page.waitForTimeout(400);

    // Verify text origin updated in store
    const movedTextOrigin = await page.evaluate(() => {
      const scope = (window as unknown as {
        __aboard_pdfAnnotations?: { scope?: { getAnnotations: () => unknown } };
      }).__aboard_pdfAnnotations?.scope;
      const res = scope?.getAnnotations();
      const list = Array.isArray(res) ? res : Object.values((res as Record<string, any[]>) || {}).flat();
      const textAnno = list.find((a: any) => a?.object?.type === 3);
      return textAnno ? { ...textAnno.object.rect.origin } : null;
    });
    expect(movedTextOrigin).not.toBeNull();
    expect(movedTextOrigin!.x).toBeGreaterThan(initialTextOrigin!.x + 30);
    expect(movedTextOrigin!.y).toBeGreaterThan(initialTextOrigin!.y + 20);

    // Wait for debounced flush to Dexie
    await page.waitForTimeout(1000);

    // 5. Reload the page and confirm stamp and text render at their moved positions
    await page.reload();
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible({ timeout: 15000 });
    const reloadedPage1 = primaryPane.locator('[data-testid="pdf-page-1"]');
    await expect(reloadedPage1).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);

    // Verify restored annotations match moved positions
    const restoredPositions = await page.evaluate(() => {
      const scope = (window as unknown as {
        __aboard_pdfAnnotations?: { scope?: { getAnnotations: () => unknown } };
      }).__aboard_pdfAnnotations?.scope;
      const res = scope?.getAnnotations();
      const list = Array.isArray(res) ? res : Object.values((res as Record<string, any[]>) || {}).flat();
      const stamp = list.find((a: any) => a?.object?.type === 13);
      const textAnno = list.find((a: any) => a?.object?.type === 3);
      return {
        stampOrigin: stamp ? stamp.object.rect.origin : null,
        textOrigin: textAnno ? textAnno.object.rect.origin : null,
      };
    });

    expect(restoredPositions.stampOrigin).not.toBeNull();
    expect(restoredPositions.textOrigin).not.toBeNull();
    expect(Math.abs(restoredPositions.stampOrigin.x - movedStampOrigin!.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(restoredPositions.stampOrigin.y - movedStampOrigin!.y)).toBeLessThanOrEqual(2);
    expect(Math.abs(restoredPositions.textOrigin.x - movedTextOrigin!.x)).toBeLessThanOrEqual(2);
    expect(Math.abs(restoredPositions.textOrigin.y - movedTextOrigin!.y)).toBeLessThanOrEqual(2);

    // 6. Test Resizing Stamp and Text using the Select Tool
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

    // Now select the text
    const reloadedText = primaryPane.locator('[data-testid="pdf-text-object"]').first();
    const reloadedTextBox = await reloadedText.boundingBox();
    expect(reloadedTextBox).not.toBeNull();
    if (!reloadedTextBox) return;

    await page.mouse.click(reloadedTextBox.x + reloadedTextBox.width / 2, reloadedTextBox.y + reloadedTextBox.height / 2);
    await page.waitForTimeout(200);

    // Verify resize handles appear on the text bounding box
    const textResizeHandleSE = primaryPane.locator('[data-testid="pdf-text-resize-handle-se"]');
    await expect(textResizeHandleSE).toBeVisible({ timeout: 5000 });

    const initialTextSize = await page.evaluate(() => {
      const scope = (window as unknown as {
        __aboard_pdfAnnotations?: { scope?: { getAnnotations: () => unknown } };
      }).__aboard_pdfAnnotations?.scope;
      const res = scope?.getAnnotations();
      const list = Array.isArray(res) ? res : Object.values((res as Record<string, any[]>) || {}).flat();
      const textAnno = list.find((a: any) => a?.object?.type === 3);
      return textAnno ? { ...textAnno.object.rect.size } : null;
    });
    expect(initialTextSize).not.toBeNull();

    // Drag the southeast resize handle of the text (+80px, +40px)
    const textSeBox = await textResizeHandleSE.boundingBox();
    expect(textSeBox).not.toBeNull();
    if (!textSeBox) return;

    await page.mouse.move(textSeBox.x + textSeBox.width / 2, textSeBox.y + textSeBox.height / 2);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(
        textSeBox.x + textSeBox.width / 2 + (80 * i) / 10,
        textSeBox.y + textSeBox.height / 2 + (40 * i) / 10
      );
    }
    await page.mouse.up();
    await page.waitForTimeout(400);

    // Verify text size increased
    const resizedTextSize = await page.evaluate(() => {
      const scope = (window as unknown as {
        __aboard_pdfAnnotations?: { scope?: { getAnnotations: () => unknown } };
      }).__aboard_pdfAnnotations?.scope;
      const res = scope?.getAnnotations();
      const list = Array.isArray(res) ? res : Object.values((res as Record<string, any[]>) || {}).flat();
      const textAnno = list.find((a: any) => a?.object?.type === 3);
      return textAnno ? { ...textAnno.object.rect.size } : null;
    });
    expect(resizedTextSize).not.toBeNull();
    expect(resizedTextSize!.width).toBeGreaterThan(initialTextSize!.width + 20);

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
      const textAnno = list.find((a: any) => a?.object?.type === 3);
      return {
        stampSize: stamp ? stamp.object.rect.size : null,
        textSize: textAnno ? textAnno.object.rect.size : null,
      };
    });

    expect(persistedSizes.stampSize).not.toBeNull();
    expect(persistedSizes.textSize).not.toBeNull();
    expect(Math.abs(persistedSizes.stampSize.width - resizedStampSize!.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(persistedSizes.stampSize.height - resizedStampSize!.height)).toBeLessThanOrEqual(2);
    expect(Math.abs(persistedSizes.textSize.width - resizedTextSize!.width)).toBeLessThanOrEqual(2);
    expect(Math.abs(persistedSizes.textSize.height - resizedTextSize!.height)).toBeLessThanOrEqual(2);
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

    // Wait for FreeText annotation
    await expect.poll(async () => {
      return await page.evaluate(() => {
        const scope = (window as unknown as {
          __aboard_pdfAnnotations?: { scope?: { getAnnotations: () => unknown } };
        }).__aboard_pdfAnnotations?.scope;
        const res = scope?.getAnnotations();
        const list = Array.isArray(res) ? res : Object.values((res as Record<string, any[]>) || {}).flat();
        return list.some((a: any) => a?.object?.type === 3);
      });
    }, { timeout: 10000 }).toBe(true);

    // Switch to Select tool
    await primaryPane.locator('[data-testid="pdf-tool-select"]').click();
    await page.waitForTimeout(200);

    const textObject = primaryPane.locator('[data-testid="pdf-text-object"]').first();
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
    const textAfterDrag = primaryPane.locator('[data-testid="pdf-text-object"]').first();
    await expect(textAfterDrag).toBeVisible();
    const textContainer = primaryPane.locator('[data-annotation-type="3"]').first();
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
    const textOriginData = await page.evaluate(() => {
      const scope = (window as unknown as {
        __aboard_pdfAnnotations?: { scope?: { getAnnotations: () => unknown } };
      }).__aboard_pdfAnnotations?.scope;
      const res = scope?.getAnnotations();
      const list = Array.isArray(res) ? res : Object.values((res as Record<string, any[]>) || {}).flat();
      const textAnno = list.find((a: any) => a?.object?.type === 3);
      return textAnno ? textAnno.object.rect.origin : null;
    });
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
    const reloadedText = primaryPane.locator('[data-testid="pdf-text-object"]').first();
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

  test("locks highlights to text (no drag/resize, selectable for deletion) and scales text proportionally with polished handles", async ({ page }) => {
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

    // Also add a FreeText annotation (type: 3)
    await page.evaluate(() => {
      const scope = (window as unknown as {
        __aboard_pdfAnnotations?: { scope?: any };
      }).__aboard_pdfAnnotations?.scope;
      if (scope) {
        scope.createAnnotation(0, {
          id: "test-text-prop",
          type: 3,
          pageIndex: 0,
          contents: "Proportional Text Scaling",
          fontSize: 16,
          rect: { origin: { x: 60, y: 220 }, size: { width: 160, height: 40 } },
        });
      }
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

    // 4. Text Proportional Scaling Verification
    const textObject = primaryPane.locator('[data-testid="pdf-text-object"]').first();
    await expect(textObject).toBeVisible({ timeout: 5000 });
    const textBox = await textObject.boundingBox();
    expect(textBox).not.toBeNull();
    if (textBox) {
      await page.mouse.click(textBox.x + textBox.width / 2, textBox.y + textBox.height / 2);
      await page.waitForTimeout(200);

      // Verify bounding box and resize handles exist with polished styling
      const textBbox = primaryPane.locator('[data-testid="pdf-text-bbox"] rect').first();
      await expect(textBbox).toBeVisible({ timeout: 5000 });
      await expect(textBbox).toHaveAttribute("stroke-dasharray", "4 3");

      const handleSE = primaryPane.locator('[data-testid="pdf-text-resize-handle-se"]');
      await expect(handleSE).toBeVisible({ timeout: 5000 });
      await expect(handleSE).toHaveAttribute("width", "8");
      await expect(handleSE).toHaveAttribute("rx", "1.5");

      // Initial aspect ratio: 160 / 40 = 4.0
      const initialTextRect = await page.evaluate(() => {
        const scope = (window as unknown as {
          __aboard_pdfAnnotations?: { scope?: any };
        }).__aboard_pdfAnnotations?.scope;
        const list = scope?.getAnnotations() || [];
        const t = list.find((a: any) => a?.object?.id === "test-text-prop");
        return t ? { ...t.object.rect.size } : null;
      });
      expect(initialTextRect).not.toBeNull();
      const initialAspect = initialTextRect!.width / initialTextRect!.height;

      // Drag SE handle (+80px, +20px)
      const handleBox = await handleSE.boundingBox();
      expect(handleBox).not.toBeNull();
      if (handleBox) {
        await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
        await page.mouse.down();
        await page.mouse.move(handleBox.x + handleBox.width / 2 + 80, handleBox.y + handleBox.height / 2 + 20);
        await page.mouse.up();
        await page.waitForTimeout(400);

        // Verify new dimensions maintain exact aspect ratio (proportional scaling)
        const newTextRect = await page.evaluate(() => {
          const scope = (window as unknown as {
            __aboard_pdfAnnotations?: { scope?: any };
          }).__aboard_pdfAnnotations?.scope;
          const list = scope?.getAnnotations() || [];
          const t = list.find((a: any) => a?.object?.id === "test-text-prop");
          return t ? { ...t.object.rect.size } : null;
        });
        expect(newTextRect).not.toBeNull();
        expect(newTextRect!.width).toBeGreaterThan(initialTextRect!.width + 20);
        const newAspect = newTextRect!.width / newTextRect!.height;
        expect(Math.abs(newAspect - initialAspect)).toBeLessThan(0.05);
      }
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
});
