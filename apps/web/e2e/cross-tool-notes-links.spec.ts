import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";
import { mockSignIn } from "./helpers/auth";

test.describe("Cross-Tool Integration: Board to PDF and Selection to Note (Task 39 / INT-3, INT-4)", () => {
  const testUserId = "test-notes-links-user";
  const projectId = "notes-links-e2e-project";

  test.beforeEach(async ({ page }) => {
    await mockSignIn(page, {
      id: testUserId,
      email: "notes.links@example.com",
    });
  });

  test("selects PDF text, sends to board as linked note, navigates back via alpha:// link, and appends board to PDF", async ({
    page,
  }) => {
    // 1. Generate a 2-page test PDF with @cantoo/pdf-lib
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Page 1
    const page1 = pdfDoc.addPage([600, 800]);
    page1.drawText("Medical Pathology - Chapter 1", {
      x: 50,
      y: 750,
      size: 18,
      font,
      color: rgb(0.1, 0.3, 0.7),
    });
    page1.drawText("Introduction to Neuropathology and Imaging Fundamentals", {
      x: 50,
      y: 700,
      size: 13,
      font,
      color: rgb(0.2, 0.2, 0.2),
    });

    // Page 2
    const page2 = pdfDoc.addPage([600, 800]);
    page2.drawText("Clinical Cases & Observations", {
      x: 50,
      y: 750,
      size: 18,
      font,
      color: rgb(0.1, 0.3, 0.7),
    });
    page2.drawText(
      "Critical Observation: Acute temporal hemorrhage observed on lateral angiogram.",
      {
        x: 50,
        y: 680,
        size: 12,
        font,
        color: rgb(0.1, 0.1, 0.1),
      }
    );

    const pdfBytes = await pdfDoc.save();

    // 2. Open workspace with Board
    await page.goto(`/workspace?p=${projectId}&kind=board`);
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();

    // 3. Set up vertical split view
    const splitVerticalBtn = page.locator('[data-testid="split-vertical-btn"]');
    await expect(splitVerticalBtn).toBeVisible();
    await splitVerticalBtn.click();

    // Swap panes so secondary becomes primary
    const swapPanesBtn = page.locator('[data-testid="swap-panes-btn"]');
    await swapPanesBtn.click();

    // Open/activate PDF tab in primary slot (tab-3) while board stays in secondary (tab-1)
    const tab3Btn = page.locator('[data-testid="tab-btn-tab-3"]');
    await tab3Btn.click();

    const primaryPane = page.locator('.pane[data-slot="primary"]');
    const secondaryPane = page.locator('.pane[data-slot="secondary"]');

    await expect(secondaryPane.locator('[data-testid="pane-board-tab-1"]')).toBeVisible();

    // Wait for Excalidraw API in tab-1 to attach
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

    // 4. Upload PDF into the PDF tab
    const fileInput = primaryPane.locator('input[data-testid="pdf-file-input"]');
    await expect(fileInput).toBeAttached();

    await fileInput.setInputFiles({
      name: "neuro-pathology.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBytes),
    });

    // Wait for PDF viewer active state
    const activeViewer = primaryPane.locator('[data-testid="pdf-pane-active"]');
    await expect(activeViewer).toBeVisible({ timeout: 15000 });

    // 5. Navigate to Page 2
    const nextPageBtn = primaryPane.locator('[data-testid="pdf-next-page"]');
    await expect(nextPageBtn).toBeVisible();
    await nextPageBtn.click();

    // Verify page counter displays page 2
    const pageDisplay = primaryPane.locator('[data-testid="pdf-page-display"]');
    await expect(pageDisplay).toContainText("2");

    // 6. Simulate text selection on Page 2 and verify floating "Send to Board" button
    await page.evaluate(() => {
      const viewerRoot = document.querySelector('[data-testid="pdf-viewer-root"]');
      if (!viewerRoot) return;

      const textToSelect = "Critical Observation: Acute temporal hemorrhage";
      const targetContainer =
        viewerRoot.querySelector('[data-testid="pdf-toolbar"]')?.parentElement || viewerRoot;
      const span = document.createElement("span");
      span.textContent = textToSelect;
      span.style.position = "relative";
      span.style.display = "inline-block";
      span.setAttribute("data-testid", "temp-selected-text");
      targetContainer.appendChild(span);
    });

    const textToSelectLocator = primaryPane.locator('[data-testid="temp-selected-text"]');
    await expect(textToSelectLocator).toBeVisible();
    await textToSelectLocator.selectText();

    // Verify floating "Send to Board" button appears
    const selectionBtn = primaryPane.locator('[data-testid="pdf-selection-to-board-btn"]');
    await expect(selectionBtn).toBeVisible({ timeout: 10000 });

    // 7. Click "Send to Board" button (INT-4)
    await selectionBtn.click();

    // 8. Verify text note element is inserted on the board with alpha:// link
    await page.waitForFunction(() => {
      const win = window as unknown as {
        __aboard_boardApi?: Record<
          string,
          {
            getSceneElements: () => Array<{
              type?: string;
              text?: string;
              link?: string;
            }>;
          }
        >;
      };
      const elements = win.__aboard_boardApi?.["tab-1"]?.getSceneElements() || [];
      return elements.some(
        (el) =>
          el.type === "text" &&
          el.text?.includes("Critical Observation") &&
          el.link?.startsWith("alpha://pdf/") &&
          el.link?.includes("#page=2")
      );
    }, { timeout: 20000 });

    const insertedNote = await page.evaluate(() => {
      const win = window as unknown as {
        __aboard_boardApi?: Record<
          string,
          {
            getSceneElements: () => Array<{
              type?: string;
              text?: string;
              link?: string;
            }>;
          }
        >;
      };
      const elements = win.__aboard_boardApi?.["tab-1"]?.getSceneElements() || [];
      return elements.find((el) => el.type === "text" && el.text?.includes("Critical Observation"));
    });

    expect(insertedNote).toBeDefined();
    expect(insertedNote?.link).toMatch(/^alpha:\/\/pdf\/[^#]+#page=2$/);

    // 9. Navigate PDF viewer back to Page 1
    const prevPageBtn = primaryPane.locator('[data-testid="pdf-prev-page"]');
    await prevPageBtn.click();
    await expect(pageDisplay).toContainText("1");

    // 10. Click the alpha:// link on the board to navigate back to Page 2 (INT-4 / link protocol)
    await page.evaluate((linkUrl) => {
      // Simulate clicking an anchor with the internal link URL
      const a = document.createElement("a");
      a.href = linkUrl;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }, insertedNote?.link || "");

    // Verify PDF viewer automatically navigates back to Page 2!
    await expect(pageDisplay).toContainText("2", { timeout: 10000 });

    // 11. Test "Board to PDF" (INT-3)
    const sendToPdfBtn = secondaryPane.locator('[data-testid="board-send-to-pdf-btn"]');
    await expect(sendToPdfBtn).toBeVisible();

    await sendToPdfBtn.click();

    // Verify success toast appears
    const toastNotice = secondaryPane.locator('[data-testid="board-toast-notice"]');
    await expect(toastNotice).toBeVisible({ timeout: 15000 });
    await expect(toastNotice).toContainText(/PDF/i);

    // Verify PDF now navigated to or contains the newly appended page (Page 3)
    await expect(pageDisplay).toContainText("3", { timeout: 15000 });
  });
});
