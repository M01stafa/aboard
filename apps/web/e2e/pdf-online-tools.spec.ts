import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";
import { mockSignIn } from "./helpers/auth";

test.describe("PDF Online Tools Interface (Task 41 / PDFX-1..5)", () => {
  const testUserId = "test-pdf-tools-user";
  const projectId = "pdf-tools-e2e-project";

  test.beforeEach(async ({ page }) => {
    await mockSignIn(page, {
      id: testUserId,
      email: "pdf.tools@example.com",
    });
  });

  test("shows one-time notice on first use, compresses PDF via Gateway mock, and saves result", async ({
    page,
  }) => {
    // 1. Generate an initial valid test PDF
    const initialDoc = await PDFDocument.create();
    const font = await initialDoc.embedFont(StandardFonts.Helvetica);
    const p1 = initialDoc.addPage([595.28, 841.89]);
    p1.drawText("Original Document Page 1", {
      x: 50,
      y: 800,
      size: 16,
      font,
      color: rgb(0.1, 0.1, 0.1),
    });
    const initialBytes = await initialDoc.save();

    // 2. Generate a mock compressed PDF response
    const compressedDoc = await PDFDocument.create();
    const cFont = await compressedDoc.embedFont(StandardFonts.Helvetica);
    const cp1 = compressedDoc.addPage([595.28, 841.89]);
    cp1.drawText("Compressed Document Content", {
      x: 50,
      y: 800,
      size: 14,
      font: cFont,
      color: rgb(0.2, 0.4, 0.2),
    });
    const compressedBytes = await compressedDoc.save();

    // 3. Mock the Gateway compress endpoint
    let apiCalled = false;
    await page.route("**/pdf/compress", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-methods": "GET, POST, OPTIONS",
            "access-control-allow-headers": "authorization, content-type",
          },
        });
        return;
      }

      apiCalled = true;
      await route.fulfill({
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "access-control-allow-origin": "*",
          "access-control-allow-headers": "*",
        },
        contentType: "application/pdf",
        body: Buffer.from(compressedBytes),
      });
    });

    // 4. Open workspace with PDF tool
    await page.goto(`/workspace?p=${projectId}&kind=pdf`);
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();

    const primaryPane = page.locator('.pane[data-slot="primary"]');
    const fileInput = primaryPane.locator('input[data-testid="pdf-file-input"]');
    await expect(fileInput).toBeAttached();

    // 5. Upload initial test PDF
    await fileInput.setInputFiles({
      name: "lecture-notes.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(initialBytes),
    });

    // 6. Verify active viewer and toolbar
    const activeViewer = primaryPane.locator('[data-testid="pdf-pane-active"]');
    await expect(activeViewer).toBeVisible({ timeout: 15000 });

    const toolbar = primaryPane.locator('[data-testid="pdf-toolbar"]');
    await expect(toolbar).toBeVisible();

    // 7. Verify notice has NOT been accepted yet in localStorage
    const initialNoticeAccepted = await page.evaluate(() => {
      return localStorage.getItem("aboard:pdf-tools-notice-accepted");
    });
    expect(initialNoticeAccepted).toBeNull();

    // 8. Open Online Tools dropdown
    const toolsBtn = primaryPane.locator('[data-testid="pdf-online-tools-menu"]');
    await expect(toolsBtn).toBeVisible();
    await toolsBtn.click();

    const toolsDropdown = primaryPane.locator('[data-testid="pdf-online-tools-dropdown"]');
    await expect(toolsDropdown).toBeVisible();

    // 9. Click "Compress PDF"
    const compressBtn = primaryPane.locator('[data-testid="pdf-tool-compress-btn"]');
    await expect(compressBtn).toBeVisible();
    await compressBtn.click();

    // 10. Verify One-Time Notice modal appears (PDFX-5)
    const noticeModal = page.locator('[data-testid="pdf-tools-notice-modal"]');
    await expect(noticeModal).toBeVisible();

    // 11. Click "I Understand & Proceed" in notice modal
    const acceptBtn = noticeModal.locator('[data-testid="pdf-tools-notice-accept-btn"]');
    await expect(acceptBtn).toBeVisible();
    await acceptBtn.click();

    // 12. Verify notice modal closes and notice accepted is persisted in localStorage
    await expect(noticeModal).not.toBeVisible();
    const storedNoticeVal = await page.evaluate(() => {
      return localStorage.getItem("aboard:pdf-tools-notice-accepted");
    });
    expect(storedNoticeVal).toBe("true");

    // 13. Verify API was called and success toast is displayed
    const toast = primaryPane.locator('[data-testid="pdf-restructure-toast"]');
    await expect(toast).toBeVisible({ timeout: 15000 });
    await expect(toast).toContainText("compressed");
    expect(apiCalled).toBe(true);

    // 14. Second invocation should NOT show the notice modal again
    await toolsBtn.click();
    await expect(toolsDropdown).toBeVisible();
    await compressBtn.click();

    // Notice modal does NOT appear
    await expect(noticeModal).not.toBeVisible();
  });
});
