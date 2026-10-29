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
    await page.waitForTimeout(600);

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
    await page.waitForTimeout(600);
    }
  });

  test("draws custom ink on PDF, exports editable folder to Drive, imports folder via Drive, and verifies ink strokes are present and movable", async ({
    page,
  }) => {
    // 1. Create a minimal PDF document upfront so bytes are available to route handlers
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const p1 = pdfDoc.addPage([595.28, 841.89]);
    p1.drawText("Drive folder editable export-import test", {
      x: 50,
      y: 750,
      size: 16,
      font,
      color: rgb(0, 0, 0),
    });
    const pdfBytes = await pdfDoc.save();

    const corsHeaders = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      "access-control-expose-headers": "Location, Range",
    };

    let savedAnnotationsJson = "";

    // 2. Mock drive auth & edge function
    await page.route("**/functions/v1/drive-token*", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 200, headers: corsHeaders });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: corsHeaders,
        body: JSON.stringify({
          access_token: "mock-google-token-e2e",
          expires_at: Date.now() + 3600_000,
        }),
      });
    });

    // 3. Mock Google Drive API v3 endpoints
    await page.route("https://www.googleapis.com/**", async (route) => {
      const req = route.request();
      const method = req.method();
      const url = req.url();

      if (method === "OPTIONS") {
        await route.fulfill({ status: 200, headers: corsHeaders });
        return;
      }

      // Query files
      if (url.includes("/drive/v3/files") && method === "GET") {
        if (url.includes("mock-pdf-id")) {
          // Download PDF
          await route.fulfill({
            status: 200,
            contentType: "application/pdf",
            headers: corsHeaders,
            body: Buffer.from(pdfBytes),
          });
          return;
        }

        if (url.includes("mock-anno-id")) {
          // Download annotations.json
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            headers: corsHeaders,
            body: savedAnnotationsJson || "[]",
          });
          return;
        }

        if (url.includes("mock-folder-id")) {
          // List files in folder
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            headers: corsHeaders,
            body: JSON.stringify({
              files: [
                { id: "mock-pdf-id", name: "drive-export-test.pdf", mimeType: "application/pdf" },
                { id: "mock-anno-id", name: "annotations.json", mimeType: "application/json" },
              ],
            }),
          });
          return;
        }

        if (url.toLowerCase().includes("exports")) {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            headers: corsHeaders,
            body: JSON.stringify({
              files: [
                { id: "mock-exports-id", name: "Exports", mimeType: "application/vnd.google-apps.folder" },
              ],
            }),
          });
          return;
        }

        // Default root folder
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: corsHeaders,
          body: JSON.stringify({
            files: [
              { id: "mock-root-id", name: "Aboard", mimeType: "application/vnd.google-apps.folder" },
            ],
          }),
        });
        return;
      }

      // Multipart upload for files < 5MB (or resumable session initiate)
      if (url.includes("/upload/drive/v3/files") && method === "POST") {
        const postData = req.postData() || "";
        if (postData.includes("annotations.json")) {
          const parts = postData.split(/--aboard-[a-zA-Z0-9_\-]+/);
          for (let i = 0; i < parts.length; i++) {
            if (parts[i].includes("annotations.json")) {
              const nextPart = parts[i + 1] || "";
              const headerEnd = nextPart.indexOf("\r\n\r\n");
              const body = headerEnd !== -1 ? nextPart.slice(headerEnd + 4).trim() : nextPart.trim();
              savedAnnotationsJson = body;
              break;
            }
          }
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            headers: corsHeaders,
            body: JSON.stringify({
              id: "mock-anno-id",
              name: "annotations.json",
            }),
          });
          return;
        }

        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: corsHeaders,
          body: JSON.stringify({
            id: "mock-pdf-id",
            name: "drive-export-test.pdf",
          }),
        });
        return;
      }

      // Create folder (metadata only, no upload)
      if (!url.includes("/upload/") && url.includes("/drive/v3/files") && method === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: corsHeaders,
          body: JSON.stringify({
            id: "mock-folder-id",
            name: "drive-export-test",
            mimeType: "application/vnd.google-apps.folder",
          }),
        });
        return;
      }

      // Resumable upload content send (if used)
      if (url.includes("/upload/drive/v3/files") && method === "PUT") {
        const postData = req.postData();
        if (postData && (postData.includes("customStrokes") || postData.includes("points") || postData.startsWith("[") || postData.startsWith("{"))) {
          savedAnnotationsJson = postData;
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: corsHeaders,
          body: JSON.stringify({
            id: "mock-uploaded-file-id",
            name: "uploaded-file",
          }),
        });
        return;
      }

      await route.fulfill({ status: 200, headers: corsHeaders });
    });

    // 4. Mock Google Picker
    await page.addInitScript(() => {
      window.gapi = {
        load: (_mod: string, cbs: { callback?: () => void }) => {
          window.google = {
            picker: {
              ViewId: { DOCS: "docs" },
              Action: { PICKED: "picked", CANCEL: "cancel" },
              Response: { ACTION: "action", DOCUMENTS: "docs" },
              Document: { ID: "id", NAME: "name", MIME_TYPE: "mimeType" },
              DocsView: class {
                setMimeTypes() { return this; }
                setIncludeFolders() { return this; }
                setSelectFolderEnabled() { return this; }
                setParent() { return this; }
                setInitialDir() { return this; }
              },
              PickerBuilder: class {
                private _cb?: (data: Record<string, unknown>) => void;
                setAppId() { return this; }
                setOAuthToken() { return this; }
                setDeveloperKey() { return this; }
                setOrigin() { return this; }
                addView() { return this; }
                setLocale() { return this; }
                setTitle() { return this; }
                setCallback(cb: (data: Record<string, unknown>) => void) {
                  this._cb = cb;
                  return this;
                }
                build() {
                  return {
                    setVisible: () => {
                      setTimeout(() => {
                        this._cb?.({
                          action: "picked",
                          docs: [
                            {
                              id: "mock-folder-id",
                              name: "drive-export-test",
                              mimeType: "application/vnd.google-apps.folder",
                            },
                          ],
                        });
                      }, 50);
                    },
                  };
                }
              },
            },
          };
          cbs.callback?.();
        },
      };
    });

    // 5. Open workspace with a PDF module
    const pdfProjectId = "drive-folder-roundtrip-project";
    await page.goto(`/workspace?p=${pdfProjectId}&kind=pdf`);
    const primaryPane = page.locator('.pane[data-slot="primary"]');
    const fileInput = primaryPane.locator('input[data-testid="pdf-file-input"]');
    await expect(fileInput).toBeAttached({ timeout: 15000 });
    await fileInput.setInputFiles({
      name: "drive-export-test.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBytes),
    });

    const page1 = primaryPane.locator('[data-testid="pdf-page-1"]');
    await expect(page1).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(600);

    const box = await page1.boundingBox();
    expect(box).not.toBeNull();
    if (!box) return;

    // 6. Draw a custom stroke on page 1
    await primaryPane.locator('[data-testid="pdf-tool-ink"]').click();
    const startX = box.x + 80;
    const startY = box.y + 120;
    await page.mouse.move(startX, startY);
    await page.mouse.down();
    for (let i = 1; i <= 15; i++) {
      await page.mouse.move(startX + i * 15, startY + i * 8);
    }
    await page.mouse.up();
    await page.waitForTimeout(600);

    const stroke = primaryPane.locator('[data-testid="pdf-custom-ink-layer-1"] path');
    await expect(stroke).toHaveCount(1, { timeout: 10000 });

    // 7. Open Export Dialog
    const exportBtn = page.locator('[data-testid="workspace-export-btn"]');
    await expect(exportBtn).toBeVisible({ timeout: 10000 });
    await exportBtn.click();

    const dialog = page.locator('[data-testid="alpha-export-dialog"]');
    await expect(dialog).toBeVisible();

    // 8. Verify folder name input and editable radio are present
    const folderInput = dialog.locator('[data-testid="export-folder-name-input"]');
    await expect(folderInput).toBeVisible();
    await expect(folderInput).toHaveValue("drive-export-test");

    const editableRadio = dialog.locator('[data-testid="export-pdf-editable"]');
    await expect(editableRadio).toBeChecked();

    // 9. Click "Export to Drive" button
    const driveBtn = dialog.locator('[data-testid="export-drive-btn"]');
    await driveBtn.click();
    await expect(dialog).not.toBeVisible({ timeout: 10000 });

    // 10. Wipe DB and reload workspace to simulate fresh state
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

    // Open a fresh workspace with empty PDF pane
    await page.goto(`/workspace?p=fresh-imported-project&kind=pdf`);
    const freshPane = page.locator('.pane[data-slot="primary"]');
    const driveImportBtn = freshPane.locator('[data-testid="pdf-drive-button"]');
    await expect(driveImportBtn).toBeVisible({ timeout: 15000 });

    // 11. Click "Add PDF from Google Drive"
    await driveImportBtn.click();

    // 12. Verify PDF and annotations are restored!
    const importedPage = freshPane.locator('[data-testid="pdf-page-1"]');
    await expect(importedPage).toBeVisible({ timeout: 15000 });

    const importedStroke = freshPane.locator('[data-testid="pdf-custom-ink-layer-1"] path');
    await expect(importedStroke).toHaveCount(1, { timeout: 15000 });

    // 13. Select tool allows moving the restored stroke
    await freshPane.locator('[data-testid="pdf-tool-select"]').click();
    await page.waitForTimeout(200);
    const strokeBox = await importedStroke.first().boundingBox();
    expect(strokeBox).not.toBeNull();
    if (strokeBox) {
      const midX = strokeBox.x + strokeBox.width / 2;
      const midY = strokeBox.y + strokeBox.height / 2;
      await page.mouse.move(midX, midY);
      await page.mouse.down();
      await expect(freshPane.locator('[data-testid="pdf-custom-ink-bbox"]')).toBeVisible({ timeout: 10000 });
      await page.mouse.up();
    await page.waitForTimeout(600);
    }
  });
});
