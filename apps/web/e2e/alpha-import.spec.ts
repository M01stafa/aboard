import { test, expect } from "@playwright/test";
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
});
