import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";
import { mockSignIn } from "./helpers/auth";

test.describe("PDF Viewer Module Integration (Task 28 / PDF-1, PDF-2, PDF-7)", () => {
  const testUserId = "test-pdf-user";
  const projectId = "pdf-e2e-project";

  test.beforeEach(async ({ page }) => {
    await mockSignIn(page, {
      id: testUserId,
      email: "pdf.student@example.com",
    });
  });

  test("opens a PDF, checks that it renders, changes the page, and verifies page persists after reload", async ({
    page,
  }) => {
    // 1. Generate a valid 3-page test PDF buffer using @cantoo/pdf-lib
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    for (let i = 1; i <= 3; i++) {
      const pdfPage = pdfDoc.addPage([595.28, 841.89]);
      pdfPage.drawText(`Aboard E2E Test Document - Page ${i}`, {
        x: 50,
        y: 800,
        size: 18,
        font,
        color: rgb(0, 0.17, 0.55),
      });
    }

    const pdfBytes = await pdfDoc.save();

    // 2. Open workspace with PDF as initial tool
    await page.goto(`/workspace?p=${projectId}&kind=pdf`);
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();

    // 3. Verify empty state dropzone renders in the primary pane
    const primaryPane = page.locator('.pane[data-slot="primary"]');
    const dropzone = primaryPane.locator('[data-testid="pdf-dropzone"]');
    await expect(dropzone).toBeVisible();

    const fileInput = primaryPane.locator('input[data-testid="pdf-file-input"]');
    await expect(fileInput).toBeAttached();

    // 4. Upload test PDF through the file input
    await fileInput.setInputFiles({
      name: "study-guide.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBytes),
    });

    // 5. Verify PDF viewer mounts and renders
    const activeViewer = primaryPane.locator('[data-testid="pdf-pane-active"]');
    await expect(activeViewer).toBeVisible({ timeout: 15000 });

    const toolbar = primaryPane.locator('[data-testid="pdf-toolbar"]');
    await expect(toolbar).toBeVisible();

    const pageDisplay = primaryPane.locator('[data-testid="pdf-page-display"]');
    await expect(pageDisplay).toContainText("1");
    await expect(pageDisplay).toContainText("3");

    // Verify first page canvas / layer rendered
    const page1 = primaryPane.locator('[data-testid="pdf-page-1"]');
    await expect(page1).toBeVisible({ timeout: 10000 });

    // 6. Navigate to Page 2
    const nextBtn = primaryPane.locator('[data-testid="pdf-next-page"]');
    await expect(nextBtn).toBeEnabled();
    await nextBtn.click();

    // Verify page display updates to page 2
    await expect(pageDisplay).toContainText("2");

    // Wait 1000ms for debounced SaveQueue write to complete
    await page.waitForTimeout(1000);

    // 7. Reload page to verify page state persistence
    await page.reload();

    // Wait for workspace and PDF pane to re-mount
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();
    await expect(primaryPane.locator('[data-testid="pdf-pane-active"]')).toBeVisible({ timeout: 15000 });

    // Verify restored page display is page 2
    await expect(primaryPane.locator('[data-testid="pdf-page-display"]')).toContainText("2", { timeout: 10000 });
  });
});
