import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";
import { mockSignIn } from "./helpers/auth";

test.describe(".alpha Project Import with Safety Checks (Task 32 / ALPHA-2..4, SEC-7)", () => {
  const testUserId = "test-import-user";
  const projectId = "alpha-roundtrip-e2e-project";

  test.beforeEach(async ({ page }) => {
    await mockSignIn(page, {
      id: testUserId,
      email: "import.student@example.com",
    });
  });

  test("exports a project, clears local DB, imports .alpha file via launcher, and verifies project is restored", async ({
    page,
  }) => {
    // 1. Remove showSaveFilePicker in test runner so browser triggers download event
    await page.addInitScript(() => {
      // @ts-expect-error test environment override
      delete window.showSaveFilePicker;
    });

    // 2. Open workspace with a test project (creates board item)
    await page.goto(`/workspace?p=${projectId}&kind=board`);
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible({ timeout: 15000 });

    // 3. Export the project to .alpha container
    const exportBtn = page.locator('[data-testid="workspace-export-btn"]');
    await expect(exportBtn).toBeVisible({ timeout: 10000 });
    await exportBtn.click();

    const dialog = page.locator('[data-testid="alpha-export-dialog"]');
    await expect(dialog).toBeVisible();

    const submitBtn = dialog.locator('[data-testid="export-submit-btn"]');
    const downloadPromise = page.waitForEvent("download");
    await submitBtn.click();
    const download = await downloadPromise;

    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();

    // 4. Wipe local IndexedDB to simulate a completely fresh browser / new device
    await page.evaluate(async () => {
      if (typeof indexedDB !== "undefined" && indexedDB.databases) {
        const dbs = await indexedDB.databases();
        for (const db of dbs) {
          if (db.name) {
            indexedDB.deleteDatabase(db.name);
          }
        }
      }
    });

    // 5. Navigate to launcher home page
    await page.goto("/");
    await expect(page.locator('[data-testid="open-alpha-btn"]')).toBeVisible({ timeout: 10000 });

    // 6. Upload the downloaded .alpha file via hidden file input (without accept filter per iOS rule)
    const fileInput = page.locator('[data-testid="launcher-alpha-file-input"]');
    await fileInput.setInputFiles(downloadPath!);

    // 7. Verify navigation into the imported workspace
    await expect(page).toHaveURL(/\/workspace\?p=/, { timeout: 15000 });
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible({ timeout: 15000 });

    // 8. Verify the workspace tab and board module are restored
    await expect(page.locator('[data-testid="tab-btn-tab-1"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-testid="pane-board-tab-1"]')).toBeVisible({ timeout: 10000 });
  });

  test("draws custom ink on PDF, exports to .alpha, wipes DB, imports, and verifies custom annotations are preserved", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      // @ts-expect-error test environment override
      delete window.showSaveFilePicker;
    });

    // 1. Create a minimal PDF document
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const p1 = pdfDoc.addPage([595.28, 841.89]);
    p1.drawText("Round-trip custom annotation persistence verification", {
      x: 50,
      y: 750,
      size: 16,
      font,
      color: rgb(0, 0, 0),
    });
    const pdfBytes = await pdfDoc.save();

    // 2. Open workspace with a PDF module
    const pdfProjectId = "alpha-pdf-roundtrip-project";
    await page.goto(`/workspace?p=${pdfProjectId}&kind=pdf`);
    const primaryPane = page.locator('.pane[data-slot="primary"]');
    const fileInput = primaryPane.locator('input[data-testid="pdf-file-input"]');
    await expect(fileInput).toBeAttached({ timeout: 15000 });
    await fileInput.setInputFiles({
      name: "roundtrip-doc.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBytes),
    });

    const page1 = primaryPane.locator('[data-testid="pdf-page-1"]');
    await expect(page1).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(600);

    const box = await page1.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    // 3. Draw a custom stroke on page 1
    await primaryPane.locator('[data-testid="pdf-tool-ink"]').click();
    const startX = box.x + 80;
    const startY = box.y + 120;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    for (let i = 1; i <= 15; i++) {
      await page.mouse.move(startX + i * 15, startY + i * 8);
    }
    await page.mouse.up();

    // Verify stroke is rendered in custom ink layer
    const stroke = primaryPane.locator('[data-testid="pdf-custom-ink-layer-1"] path');
    await expect(stroke).toHaveCount(1, { timeout: 10000 });

    // 4. Export the project to .alpha (with annotations included)
    const exportBtn = page.locator('[data-testid="workspace-export-btn"]');
    await expect(exportBtn).toBeVisible({ timeout: 10000 });
    await exportBtn.click();

    const dialog = page.locator('[data-testid="alpha-export-dialog"]');
    await expect(dialog).toBeVisible();

    // Ensure buttons have no-wrap and correct shortened labels
    const submitBtn = dialog.locator('[data-testid="export-submit-btn"]');
    await expect(submitBtn).toContainText("Export .alpha");
    const driveBtn = dialog.locator('[data-testid="export-drive-btn"]');
    await expect(driveBtn).toContainText("Export to Drive");

    const downloadPromise = page.waitForEvent("download");
    await submitBtn.click();
    const download = await downloadPromise;

    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();

    // 5. Wipe local IndexedDB to simulate fresh new browser / device
    await page.evaluate(async () => {
      if (typeof indexedDB !== "undefined" && indexedDB.databases) {
        const dbs = await indexedDB.databases();
        for (const db of dbs) {
          if (db.name) {
            indexedDB.deleteDatabase(db.name);
          }
        }
      }
    });

    // 6. Navigate to launcher home page and import the downloaded .alpha
    await page.goto("/");
    await expect(page.locator('[data-testid="open-alpha-btn"]')).toBeVisible({ timeout: 10000 });

    const launcherInput = page.locator('[data-testid="launcher-alpha-file-input"]');
    await launcherInput.setInputFiles(downloadPath!);

    // 7. Verify workspace opens and the imported PDF has the custom annotations restored!
    await expect(page).toHaveURL(/\/workspace\?p=/, { timeout: 15000 });
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible({ timeout: 15000 });

    const importedPrimaryPane = page.locator('.pane[data-slot="primary"]');
    const importedPage1 = importedPrimaryPane.locator('[data-testid="pdf-page-1"]');
    await expect(importedPage1).toBeVisible({ timeout: 15000 });

    // The custom ink stroke MUST be restored on the imported PDF!
    const importedStroke = importedPrimaryPane.locator('[data-testid="pdf-custom-ink-layer-1"] path');
    await expect(importedStroke).toHaveCount(1, { timeout: 15000 });

    // 8. Verify the stroke is selectable with the Select tool
    await importedPrimaryPane.locator('[data-testid="pdf-tool-select"]').click();
    await page.waitForTimeout(200);
    const strokeBox = await importedStroke.first().boundingBox();
    expect(strokeBox).not.toBeNull();
    if (strokeBox) {
      const midX = strokeBox.x + strokeBox.width / 2;
      const midY = strokeBox.y + strokeBox.height / 2;
      await page.mouse.move(midX, midY);
      await page.mouse.down();
      await expect(importedPrimaryPane.locator('[data-testid="pdf-custom-ink-bbox"]')).toBeVisible({ timeout: 10000 });
      await page.mouse.up();
    }
  });
});
