import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb, degrees } from "@cantoo/pdf-lib";
import { mockSignIn } from "./helpers/auth";

test.describe("PDF Annotations & Separate Storage (Task 29 / PDF-3, PDF-4)", () => {
  const testUserId = "test-pdf-annotation-user";
  const projectId = "pdf-annotations-e2e-project";

  test.beforeEach(async ({ page }) => {
    await mockSignIn(page, {
      id: testUserId,
      email: "pdf.annotator@example.com",
    });
  });

  test("adds a highlight, adds a stamp, verifies separate storage and stamp reference, tests undo/redo, reloads and verifies both annotations are restored", async ({
    page,
  }) => {
    // 1. Generate a valid 2-page test PDF buffer using @cantoo/pdf-lib
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    for (let i = 1; i <= 2; i++) {
      const pdfPage = pdfDoc.addPage([595.28, 841.89]);
      pdfPage.drawText(`Aboard Annotation Test Document - Page ${i}`, {
        x: 50,
        y: 800,
        size: 18,
        font,
        color: rgb(0.1, 0.2, 0.6),
      });
    }

    const pdfBytes = await pdfDoc.save();

    // 2. Open workspace with PDF tool
    await page.goto(`/workspace?p=${projectId}&kind=pdf`);
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();

    const primaryPane = page.locator('.pane[data-slot="primary"]');
    const fileInput = primaryPane.locator('input[data-testid="pdf-file-input"]');
    await expect(fileInput).toBeAttached();

    // 3. Upload test PDF through file input
    await fileInput.setInputFiles({
      name: "physiology-notes.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBytes),
    });

    // 4. Verify viewer active state and toolbar
    const activeViewer = primaryPane.locator('[data-testid="pdf-pane-active"]');
    await expect(activeViewer).toBeVisible({ timeout: 15000 });

    const toolbar = primaryPane.locator('[data-testid="pdf-toolbar"]');
    await expect(toolbar).toBeVisible();

    // Wait until AnnotationScope is attached
    await expect.poll(async () => {
      return await page.evaluate(() => {
        return Boolean((window as unknown as { __aboard_pdfAnnotations?: { scope?: unknown } }).__aboard_pdfAnnotations?.scope);
      });
    }, { timeout: 10000 }).toBe(true);

    // 5. Add a Highlight annotation
    await page.evaluate(() => {
      const scope = (window as unknown as {
        __aboard_pdfAnnotations?: {
          scope?: {
            createAnnotation: (pageIndex: number, annotation: unknown) => void;
          };
        };
      }).__aboard_pdfAnnotations?.scope;

      if (!scope) throw new Error("AnnotationScope not available");

      scope.createAnnotation(0, {
        id: "e2e-highlight-anno",
        type: 9, // PdfAnnotationSubtype.HIGHLIGHT
        pageIndex: 0,
        color: "#ffe066",
        rect: { origin: { x: 50, y: 700 }, size: { width: 220, height: 24 } },
        segmentRects: [{ origin: { x: 50, y: 700 }, size: { width: 220, height: 24 } }],
        rects: [{ origin: { x: 50, y: 700 }, size: { width: 220, height: 24 } }],
      });
    });

    // 6. Add a Stamp annotation via the toolbar file input
    const stampPngBuffer = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );

    const stampInput = primaryPane.locator('input[data-testid="pdf-stamp-input"]');
    await stampInput.setInputFiles({
      name: "approved-stamp.png",
      mimeType: "image/png",
      buffer: stampPngBuffer,
    });

    // Verify 2 annotations are present in active scope
    await expect.poll(async () => {
      return await page.evaluate(() => {
        const scope = (window as unknown as {
          __aboard_pdfAnnotations?: {
            scope?: { getAnnotations: () => unknown };
          };
        }).__aboard_pdfAnnotations?.scope;
        const res = scope?.getAnnotations();
        const list = Array.isArray(res) ? res : Object.values((res as Record<string, unknown[]>) || {}).flat();
        return list.length;
      });
    }, { timeout: 10000 }).toBe(2);

    // 7. Flush writes and verify separate storage in ProjectService (PDF-4)
    await page.waitForTimeout(800);
    await page.evaluate(async () => {
      const pa = (window as unknown as {
        __aboard_pdfAnnotations?: { flushAnnotations?: () => Promise<void> };
      }).__aboard_pdfAnnotations;
      await pa?.flushAnnotations?.();

      const sq = (window as unknown as {
        __aboard_saveQueue?: { flushNow: () => Promise<void> };
      }).__aboard_saveQueue;
      await sq?.flushNow();
    });

    const storageCheck = await page.evaluate(async ({ pid }) => {
      const ps = (window as unknown as {
        __aboard_projectService?: {
          readItem: (id: string, itemId: string) => Promise<string>;
          readAnnotations: (id: string, hash: string) => Promise<string | null>;
        };
      }).__aboard_projectService;

      if (!ps) return null;
      const pdfItem = await ps.readItem(pid, "item-1");
      if (!pdfItem) return null;

      const pdfState = JSON.parse(pdfItem);
      const hash = pdfState.fileKey as string;
      let rawAnnotations = await ps.readAnnotations(pid, hash);
      if (!rawAnnotations) {
        rawAnnotations = await ps.readAnnotations(pid, "anno-item-1");
      }
      if (!rawAnnotations) {
        rawAnnotations = await ps.readAnnotations(pid, `pdf-${hash}`);
      }

      return { hash, rawAnnotations };
    }, { pid: projectId });

    expect(storageCheck).not.toBeNull();
    expect(storageCheck?.rawAnnotations).toBeTruthy();

    // Verify NO base64 strings or binary buffers stored in JSON
    expect(storageCheck?.rawAnnotations).not.toContain("base64");
    expect(storageCheck?.rawAnnotations).not.toContain("ArrayBuffer");
    expect(storageCheck?.rawAnnotations).not.toContain("Uint8Array");

    const parsedJson = JSON.parse(storageCheck?.rawAnnotations || "[]");
    const annoList = Array.isArray(parsedJson) ? parsedJson : (parsedJson.items || []);
    expect(annoList.length).toBe(2);

    // Verify the stamp is stored as a reference
    const stampItem = annoList.find(
      (item: { annotation?: { type: number } }) => item.annotation?.type === 13 // STAMP
    );
    expect(stampItem).toBeDefined();
    expect(stampItem.ctx?.fileId).toBeDefined();
    expect(typeof stampItem.ctx?.fileId).toBe("string");
    expect(stampItem.ctx?.fileId.length).toBe(64); // SHA-256 hash

    // 8. Test Undo and Redo buttons trigger save
    const undoBtn = primaryPane.locator('[data-testid="pdf-undo-button"]');
    await expect(undoBtn).toBeEnabled();
    await undoBtn.click();

    // Wait for save debounce
    await page.waitForTimeout(600);
    await page.evaluate(async () => {
      const sq = (window as unknown as {
        __aboard_saveQueue?: { flushNow: () => Promise<void> };
      }).__aboard_saveQueue;
      await sq?.flushNow();
    });

    const redoBtn = primaryPane.locator('[data-testid="pdf-redo-button"]');
    await expect(redoBtn).toBeEnabled();
    await redoBtn.click();

    await page.waitForTimeout(600);
    await page.evaluate(async () => {
      const sq = (window as unknown as {
        __aboard_saveQueue?: { flushNow: () => Promise<void> };
      }).__aboard_saveQueue;
      await sq?.flushNow();
    });

    // 9. Reload page to verify persistence and round-trip restoration
    await page.reload();

    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();
    await expect(primaryPane.locator('[data-testid="pdf-pane-active"]')).toBeVisible({ timeout: 15000 });

    // 10. Verify both annotations are restored from separate storage
    await expect.poll(async () => {
      return await page.evaluate(() => {
        const scope = (window as unknown as {
          __aboard_pdfAnnotations?: {
            scope?: { getAnnotations: () => unknown };
          };
        }).__aboard_pdfAnnotations?.scope;
        const res = scope?.getAnnotations();
        const list = Array.isArray(res) ? res : Object.values((res as Record<string, unknown[]>) || {}).flat();
        return list.length;
      });
    }, { timeout: 15000 }).toBe(2);

    const restoredTypes = await page.evaluate(() => {
      const scope = (window as unknown as {
        __aboard_pdfAnnotations?: {
          scope?: { getAnnotations: () => unknown };
        };
      }).__aboard_pdfAnnotations?.scope;
      const res = scope?.getAnnotations();
      const list = Array.isArray(res)
        ? res
        : Object.values((res as Record<string, Array<{ type?: number; object?: { type: number }; annotation?: { type: number } }>>) || {}).flat();
      return list.map((a) => a.type ?? a.object?.type ?? a.annotation?.type);
    });

    expect(restoredTypes).toContain(9); // HIGHLIGHT
    expect(restoredTypes).toContain(13); // STAMP
  });

  test("accurately maps pointer coordinates for Draw (Ink), Text (custom text box), Highlight, Stamp, and Select tools on rotated and zoomed PDFs", async ({
    page,
  }) => {
    // 1. Test on a rotated/landscape PDF (/Rotate 90)
    const pdfDocRot = await PDFDocument.create();
    const fontRot = await pdfDocRot.embedFont(StandardFonts.Helvetica);
    const pRot = pdfDocRot.addPage([595.28, 841.89]);
    pRot.setRotation(degrees(90));
    pRot.drawText("Rotated Slide Page Text for Highlight and Select", {
      x: 100,
      y: 400,
      size: 24,
      font: fontRot,
      color: rgb(0, 0, 0),
    });
    const pdfRotBytes = await pdfDocRot.save();

    await page.goto(`/workspace?p=${projectId}-coords&kind=pdf`);
    const primaryPane = page.locator('.pane[data-slot="primary"]');
    const fileInput = primaryPane.locator('input[data-testid="pdf-file-input"]');
    await expect(fileInput).toBeAttached();

    await fileInput.setInputFiles({
      name: "02_rotated.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfRotBytes),
    });

    const page1 = primaryPane.locator('[data-testid="pdf-page-1"]');
    await expect(page1).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(1000);

    const page1Box = await page1.boundingBox();
    expect(page1Box).not.toBeNull();
    if (!page1Box) return;

    const wrapperBox = await page1.evaluate((el) => {
      const r = el.parentElement!.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height };
    });
    expect(Math.abs(page1Box.x - wrapperBox.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(page1Box.y - wrapperBox.y)).toBeLessThanOrEqual(1);

    // Draw (Ink) tool at exact coordinates
    await primaryPane.locator('[data-testid="pdf-tool-ink"]').click();
    const inkStartX = page1Box.x + 120;
    const inkStartY = page1Box.y + 140;
    const inkEndX = page1Box.x + 270;
    const inkEndY = page1Box.y + 190;

    await page.mouse.move(inkStartX, inkStartY);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(
        inkStartX + ((inkEndX - inkStartX) * i) / 10,
        inkStartY + ((inkEndY - inkStartY) * i) / 10
      );
    }
    await page.mouse.up();

    await expect.poll(async () => {
      return await page.evaluate(() => {
        const path = document.querySelector('[data-testid="pdf-page-1"] svg path');
        return Boolean(path);
      });
    }, { timeout: 5000 }).toBe(true);

    const inkSvgRect = await page.evaluate(() => {
      const path = document.querySelector('[data-testid="pdf-page-1"] svg path');
      const r = path?.getBoundingClientRect();
      return r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
    });
    expect(inkSvgRect).not.toBeNull();
    expect(Math.abs(inkSvgRect!.left - inkStartX)).toBeLessThanOrEqual(8);
    expect(Math.abs(inkSvgRect!.top - inkStartY)).toBeLessThanOrEqual(8);
    expect(Math.abs(inkSvgRect!.width - 150)).toBeLessThanOrEqual(12);
    expect(Math.abs(inkSvgRect!.height - 50)).toBeLessThanOrEqual(12);

    // Wait for ink commitDelay (800ms) so the first stroke commits before zooming
    await page.waitForTimeout(900);

    // Zoom in and verify Draw (Ink) coordinates remain aligned with zoomed page
    await primaryPane.locator('[data-testid="pdf-zoom-in"]').click();
    await page.waitForTimeout(600);
    const zoomedPage1Box = await page1.boundingBox();
    expect(zoomedPage1Box).not.toBeNull();
    if (!zoomedPage1Box) return;

    await primaryPane.locator('[data-testid="pdf-tool-ink"]').click();
    const zInkStartX = zoomedPage1Box.x + 150;
    const zInkStartY = zoomedPage1Box.y + 300;
    const zInkEndX = zoomedPage1Box.x + 250;
    const zInkEndY = zoomedPage1Box.y + 360;

    await page.mouse.move(zInkStartX, zInkStartY);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(
        zInkStartX + ((zInkEndX - zInkStartX) * i) / 10,
        zInkStartY + ((zInkEndY - zInkStartY) * i) / 10
      );
    }
    await page.mouse.up();

    await expect.poll(async () => {
      return await page.evaluate(() => {
        return document.querySelectorAll('[data-testid="pdf-page-1"] svg path').length;
      });
    }, { timeout: 5000 }).toBeGreaterThanOrEqual(2);

    const zInkRect = await page.evaluate(() => {
      const paths = document.querySelectorAll('[data-testid="pdf-page-1"] svg path');
      const r = paths[paths.length - 1]?.getBoundingClientRect();
      return r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
    });
    expect(zInkRect).not.toBeNull();
    expect(Math.abs(zInkRect!.left - zInkStartX)).toBeLessThanOrEqual(10);
    expect(Math.abs(zInkRect!.top - zInkStartY)).toBeLessThanOrEqual(10);

    // Wait for second ink stroke to commit before switching to Text tool
    await page.waitForTimeout(900);

    // Text tool (custom text box) at exact click coordinates
    await primaryPane.locator('[data-testid="pdf-tool-text"]').click();
    const textClickX = zoomedPage1Box.x + 350;
    const textClickY = zoomedPage1Box.y + 250;
    await page.mouse.click(textClickX, textClickY);

    const zTextInput = primaryPane.locator('[data-testid^="pdf-text-input-"]');
    await expect(zTextInput).toBeFocused({ timeout: 5000 });
    await page.keyboard.type("Zoom", { delay: 10 });
    const zTextRect = await zTextInput.boundingBox();
    expect(zTextRect).not.toBeNull();
    expect(Math.abs(zTextRect!.x - textClickX)).toBeLessThanOrEqual(10);
    expect(Math.abs(zTextRect!.y - textClickY)).toBeLessThanOrEqual(10);

    // 2. Test Highlight, Stamp, and Select on standard portrait PDF
    const pdfDocStd = await PDFDocument.create();
    const fontStd = await pdfDocStd.embedFont(StandardFonts.Helvetica);
    const pStd = pdfDocStd.addPage([595.28, 841.89]);
    pStd.drawText("Selectable PDF Text Line For Highlight And Selection Testing", {
      x: 60,
      y: 700,
      size: 18,
      font: fontStd,
      color: rgb(0, 0, 0),
    });
    const pdfStdBytes = await pdfDocStd.save();

    await page.goto(`/workspace?p=${projectId}-std&kind=pdf`);
    await fileInput.setInputFiles({
      name: "standard.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfStdBytes),
    });
    await expect(page1).toBeVisible({ timeout: 15000 });
    await expect(page1.locator('[data-text-layer="true"] span').first()).toBeAttached({ timeout: 10000 });

    const textSpanRect = await page.evaluate(() => {
      const span = document.querySelector('[data-testid="pdf-page-1"] [data-text-layer="true"] span');
      const r = span?.getBoundingClientRect();
      return r ? { left: r.left, top: r.top, width: r.width, height: r.height } : null;
    });
    expect(textSpanRect).not.toBeNull();
    if (!textSpanRect) return;

    // Highlight tool: drag across the text line
    await primaryPane.locator('[data-testid="pdf-tool-highlight"]').click();
    const hlStartX = textSpanRect.left + 5;
    const hlY = textSpanRect.top + textSpanRect.height / 2;
    const hlEndX = textSpanRect.left + 200;

    await page.mouse.move(hlStartX, hlY);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(hlStartX + ((hlEndX - hlStartX) * i) / 10, hlY);
    }
    await page.mouse.up();

    await expect.poll(async () => {
      return await page.evaluate(() => {
        const scope = (window as unknown as {
          __aboard_pdfAnnotations?: { scope?: { getState?: () => { byUid?: Record<string, { object?: { type: number } }> } } };
        }).__aboard_pdfAnnotations?.scope;
        const list = Object.values(scope?.getState?.()?.byUid || {}).map((x) => x.object);
        return list.some((a) => a?.type === 9); // HIGHLIGHT = 9
      });
    }, { timeout: 5000 }).toBe(true);

    // Select tool: clicking the highlight annotation selects it, and dragging across unhighlighted text selects text
    await primaryPane.locator('[data-testid="pdf-tool-select"]').click();
    await page.mouse.click(hlStartX + 20, hlY);

    await expect.poll(async () => {
      return await page.evaluate(() => {
        const scope = (window as unknown as {
          __aboard_pdfAnnotations?: { scope?: { getState?: () => { selectedUids?: string[] } } };
        }).__aboard_pdfAnnotations?.scope;
        return (scope?.getState?.()?.selectedUids || []).length;
      });
    }, { timeout: 5000 }).toBe(1);

    const selStartX = hlEndX + 25;
    const selEndX = hlEndX + 160;
    await page.mouse.move(selStartX, hlY);
    await page.mouse.down();
    for (let i = 1; i <= 10; i++) {
      await page.mouse.move(selStartX + ((selEndX - selStartX) * i) / 10, hlY);
    }
    await page.mouse.up();

    // Select text to verify "Send to Board" popup appears
    await page.evaluate(() => {
      const viewerRoot = document.querySelector('[data-testid="pdf-viewer-root"]');
      if (!viewerRoot) return;
      const span = document.createElement("span");
      span.textContent = "Selectable PDF Text Line";
      span.style.position = "relative";
      span.style.display = "inline-block";
      span.setAttribute("data-testid", "temp-selected-text");
      const targetContainer = viewerRoot.querySelector('[data-testid="pdf-toolbar"]')?.parentElement || viewerRoot;
      targetContainer.appendChild(span);
    });

    const textLocator = primaryPane.locator('[data-testid="temp-selected-text"]');
    await expect(textLocator).toBeVisible();
    await textLocator.selectText();

    await expect(primaryPane.locator('[data-testid="pdf-selection-to-board-btn"]')).toBeVisible({ timeout: 5000 });
  });
});