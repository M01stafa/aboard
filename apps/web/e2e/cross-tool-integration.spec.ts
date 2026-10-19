import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";
import { mockSignIn } from "./helpers/auth";

test.describe("Cross-Tool Integration (Task 38 / INT-1, INT-2)", () => {
  const testUserId = "test-cross-tool-user";
  const projectId = "cross-tool-e2e-project";

  test.beforeEach(async ({ page }) => {
    await mockSignIn(page, {
      id: testUserId,
      email: "cross.tool@example.com",
    });
  });

  test("sends PDF page to board in split view, inserts locked image, and survives reload (INT-1)", async ({
    page,
  }) => {
    // 1. Generate a test PDF with @cantoo/pdf-lib
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const pdfPage = pdfDoc.addPage([600, 800]);
    pdfPage.drawText("Aboard Medical Anatomy - Nervous System", {
      x: 50,
      y: 750,
      size: 18,
      font,
      color: rgb(0.1, 0.3, 0.7),
    });
    pdfPage.drawRectangle({
      x: 50,
      y: 400,
      width: 500,
      height: 300,
      borderColor: rgb(0.2, 0.4, 0.8),
      borderWidth: 2,
      color: rgb(0.9, 0.95, 1.0),
    });
    pdfPage.drawText("Figure 1: Brainstem and Spinal Cord Pathways", {
      x: 70,
      y: 550,
      size: 14,
      font,
      color: rgb(0.1, 0.1, 0.2),
    });

    const pdfBytes = await pdfDoc.save();

    // 2. Open workspace with Board as tab-1
    await page.goto(`/workspace?p=${projectId}&kind=board`);
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();

    // 3. Set up vertical split view
    const splitVerticalBtn = page.locator('[data-testid="split-vertical-btn"]');
    await expect(splitVerticalBtn).toBeVisible();
    await splitVerticalBtn.click();

    // Verify split layout
    const grid = page.locator('[data-testid="ws-grid"]');
    await expect(grid).toHaveAttribute("data-split", "vertical");

    // Swap panes so secondary becomes primary
    const swapPanesBtn = page.locator('[data-testid="swap-panes-btn"]');
    await swapPanesBtn.click();

    // Activate tab-3 (PDF) into the primary slot while tab-1 (Board) stays in secondary
    const tab3Btn = page.locator('[data-testid="tab-btn-tab-3"]');
    await tab3Btn.click();

    // 4. Verify primary pane has PDF and secondary pane has Board
    const primaryPane = page.locator('.pane[data-slot="primary"]');
    const secondaryPane = page.locator('.pane[data-slot="secondary"]');

    await expect(secondaryPane.locator('[data-testid="pane-board-tab-1"]')).toBeVisible();

    // Wait for Excalidraw API in tab-1 to be available
    await page.waitForFunction(() => {
      const win = window as unknown as {
        __aboard_boardApi?: Record<
          string,
          {
            getSceneElements?: () => unknown[];
          }
        >;
      };
      const api = win.__aboard_boardApi?.["tab-1"];
      return api !== undefined && typeof api.getSceneElements === "function";
    }, { timeout: 25000 });

    // Initial element count in whiteboard should be 0
    const initialCount = await page.evaluate(() => {
      const win = window as unknown as {
        __aboard_boardApi?: Record<string, { getSceneElements: () => unknown[] }>;
      };
      return win.__aboard_boardApi?.["tab-1"]?.getSceneElements().length ?? 0;
    });
    expect(initialCount).toBe(0);

    // 5. Upload PDF into the PDF tab
    const fileInput = primaryPane.locator('input[data-testid="pdf-file-input"]');
    await expect(fileInput).toBeAttached();

    await fileInput.setInputFiles({
      name: "anatomy-diagram.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBytes),
    });

    // Wait for PDF viewer active state and toolbar
    const activeViewer = primaryPane.locator('[data-testid="pdf-pane-active"]');
    await expect(activeViewer).toBeVisible({ timeout: 15000 });

    const sendToBoardBtn = primaryPane.locator('[data-testid="pdf-send-to-board-btn"]');
    await expect(sendToBoardBtn).toBeVisible({ timeout: 10000 });

    // 6. Click "Send to Board" in PDF toolbar
    await sendToBoardBtn.click();

    // 7. Verify the image element is inserted into the board in secondary pane as a locked element
    await page.waitForFunction(() => {
      const win = window as unknown as {
        __aboard_boardApi?: Record<
          string,
          {
            getSceneElements: () => Array<{
              type?: string;
              locked?: boolean;
              fileId?: string;
            }>;
          }
        >;
      };
      const elements = win.__aboard_boardApi?.["tab-1"]?.getSceneElements() || [];
      return (
        elements.length > 0 &&
        elements.some((el) => el.type === "image" && el.locked === true && !!el.fileId)
      );
    }, { timeout: 25000 });

    const insertedImage = await page.evaluate(() => {
      const win = window as unknown as {
        __aboard_boardApi?: Record<
          string,
          {
            getSceneElements: () => Array<{
              type?: string;
              locked?: boolean;
              fileId?: string;
              width?: number;
              height?: number;
            }>;
          }
        >;
      };
      const elements = win.__aboard_boardApi?.["tab-1"]?.getSceneElements() || [];
      return elements.find((el) => el.type === "image");
    });

    expect(insertedImage).toBeDefined();
    expect(insertedImage?.type).toBe("image");
    expect(insertedImage?.locked).toBe(true);
    expect(insertedImage?.fileId).toBeTruthy();

    // 8. Flush SaveQueue to ensure Dexie persistence is written
    await page.evaluate(async () => {
      const win = window as unknown as {
        __aboard_saveQueue?: {
          flushNow: () => Promise<void>;
        };
      };
      if (win.__aboard_saveQueue?.flushNow) {
        await win.__aboard_saveQueue.flushNow();
      }
    });

    // 9. Reload the page and verify the image element survives reload
    await page.reload();
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();

    // Wait for Excalidraw in tab-1 to attach and restore elements
    await page.waitForFunction(() => {
      const win = window as unknown as {
        __aboard_boardApi?: Record<
          string,
          {
            getSceneElements: () => Array<{
              type?: string;
              locked?: boolean;
              fileId?: string;
            }>;
          }
        >;
      };
      const elements = win.__aboard_boardApi?.["tab-1"]?.getSceneElements() || [];
      return (
        elements.length > 0 &&
        elements.some((el) => el.type === "image" && el.locked === true)
      );
    }, { timeout: 30000 });

    const restoredImage = await page.evaluate(() => {
      const win = window as unknown as {
        __aboard_boardApi?: Record<
          string,
          {
            getSceneElements: () => Array<{
              type?: string;
              locked?: boolean;
              fileId?: string;
            }>;
          }
        >;
      };
      const elements = win.__aboard_boardApi?.["tab-1"]?.getSceneElements() || [];
      return elements.find((el) => el.type === "image");
    });

    expect(restoredImage).toBeDefined();
    expect(restoredImage?.type).toBe("image");
    expect(restoredImage?.locked).toBe(true);
  });
});
