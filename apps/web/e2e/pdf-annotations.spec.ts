import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";
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
    await page.waitForTimeout(600);
    await page.evaluate(async () => {
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
      const rawAnnotations = await ps.readAnnotations(pid, hash);

      return { hash, rawAnnotations };
    }, { pid: projectId });

    expect(storageCheck).not.toBeNull();
    expect(storageCheck?.rawAnnotations).toBeTruthy();

    // Verify NO base64 strings or binary buffers stored in JSON
    expect(storageCheck?.rawAnnotations).not.toContain("base64");
    expect(storageCheck?.rawAnnotations).not.toContain("ArrayBuffer");
    expect(storageCheck?.rawAnnotations).not.toContain("Uint8Array");

    const parsedJson = JSON.parse(storageCheck?.rawAnnotations || "[]");
    expect(parsedJson.length).toBe(2);

    // Verify the stamp is stored as a reference
    const stampItem = parsedJson.find(
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
});
