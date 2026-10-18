import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";
import { mockSignIn } from "./helpers/auth";

test.describe("PDF Annotated Download & Page Operations (Task 30 / PDF-5, PDF-6)", () => {
  const testUserId = "test-pdf-operations-user";
  const projectId = "pdf-operations-e2e-project";

  test.beforeEach(async ({ page }) => {
    await mockSignIn(page, {
      id: testUserId,
      email: "pdf.operations@example.com",
    });
  });

  test("performs rotate, insert image page, delete page, and downloads annotated PDF", async ({
    page,
  }) => {
    // 1. Generate a valid 2-page test PDF buffer using @cantoo/pdf-lib
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    for (let i = 1; i <= 2; i++) {
      const pdfPage = pdfDoc.addPage([595.28, 841.89]);
      pdfPage.drawText(`Aboard Restructure Test Document - Page ${i}`, {
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
      name: "pathology-lecture.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBytes),
    });

    // 4. Verify viewer active state and toolbar
    const activeViewer = primaryPane.locator('[data-testid="pdf-pane-active"]');
    await expect(activeViewer).toBeVisible({ timeout: 15000 });

    const toolbar = primaryPane.locator('[data-testid="pdf-toolbar"]');
    await expect(toolbar).toBeVisible();

    // Initial page display check: "1 / 2"
    const pageDisplay = primaryPane.locator('[data-testid="pdf-page-display"]');
    await expect(pageDisplay).toContainText("1 / 2", { timeout: 10000 });

    // 5. Test Page Operations Menu: Rotate Page 90°
    const menuBtn = primaryPane.locator('[data-testid="pdf-page-operations-menu"]');
    await expect(menuBtn).toBeVisible();
    await menuBtn.click();

    const dropdown = primaryPane.locator('[data-testid="pdf-page-operations-dropdown"]');
    await expect(dropdown).toBeVisible();

    const rotateBtn = primaryPane.locator('[data-testid="pdf-rotate-page-btn"]');
    await rotateBtn.click();

    // Verify warning toast is shown (PDF-6)
    const toast = primaryPane.locator('[data-testid="pdf-restructure-toast"]');
    await expect(toast).toBeVisible({ timeout: 10000 });
    await expect(toast).toContainText("Annotations do not carry over");

    // Dismiss toast
    const dismissBtn = primaryPane.locator('[data-testid="pdf-dismiss-toast"]');
    await dismissBtn.click();
    await expect(toast).not.toBeVisible();

    // 6. Test Insert Image as Page
    const sampleImagePng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64"
    );

    const imageInput = primaryPane.locator('input[data-testid="pdf-insert-image-input"]');
    await imageInput.setInputFiles({
      name: "histology-slide.png",
      mimeType: "image/png",
      buffer: sampleImagePng,
    });

    // Verify page display updates to "1 / 3" (since a new page was inserted)
    await expect(pageDisplay).toContainText("3", { timeout: 15000 });

    // Verify toast appeared again for restructure
    await expect(toast).toBeVisible({ timeout: 10000 });
    await dismissBtn.click();

    // 7. Test Delete Page
    await menuBtn.click();
    await expect(dropdown).toBeVisible();

    const deleteBtn = primaryPane.locator('[data-testid="pdf-delete-page-btn"]');
    await deleteBtn.click();

    // Verify page display updates back down to 2 pages
    await expect(pageDisplay).toContainText("2", { timeout: 15000 });

    // 8. Test Download Annotated PDF (PDF-5)
    const downloadBtn = primaryPane.locator('[data-testid="pdf-download-btn"]');
    await expect(downloadBtn).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await downloadBtn.click();
    const download = await downloadPromise;

    expect(download.suggestedFilename()).toMatch(/\.pdf$/i);

    // Save download to temporary buffer and verify valid PDF document
    const downloadStream = await download.createReadStream();
    if (!downloadStream) throw new Error("No download stream");

    const chunks: Buffer[] = [];
    for await (const chunk of downloadStream) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const downloadedBuffer = Buffer.concat(chunks);
    expect(downloadedBuffer.length).toBeGreaterThan(100);

    const parsedPdf = await PDFDocument.load(downloadedBuffer);
    expect(parsedPdf.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
