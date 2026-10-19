import { test, expect } from "@playwright/test";
import { mockSignIn } from "./helpers/auth";

test.describe("Drive Errors & Resilience E2E (Task 36 / §10.10, SEC-6)", () => {
  const testUser = {
    id: "user-drive-errors-1111-2222-3333-444444444444",
    email: "student.quota@example.com",
  };

  const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "access-control-expose-headers": "Location, Range",
  };

  test("handles 403 storageQuotaExceeded: local saving succeeds and DriveStatusBanner appears with export action", async ({
    page,
  }) => {
    // 1. Authenticate user
    await mockSignIn(page, testUser);

    // 2. Intercept get_drive_status RPC (connected: true)
    await page.route("**/rest/v1/rpc/get_drive_status*", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 200, headers: corsHeaders });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: corsHeaders,
        body: JSON.stringify([
          {
            connected: true,
            google_email: "student.quota@example.com",
            linked_at: new Date().toISOString(),
            reconnect_required: false,
          },
        ]),
      });
    });

    // 3. Intercept drive-token Edge Function
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
          access_token: "mock-google-token-quota",
          expires_at: Date.now() + 3600_000,
        }),
      });
    });

    // 4. Intercept Google Drive API v3 endpoints
    await page.route("https://www.googleapis.com/**", async (route) => {
      const req = route.request();
      const method = req.method();
      const url = req.url();

      if (method === "OPTIONS") {
        await route.fulfill({ status: 200, headers: corsHeaders });
        return;
      }

      // Root / Project folder query or creation -> succeeds
      if (url.includes("/drive/v3/files") && method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: corsHeaders,
          body: JSON.stringify({
            files: [
              {
                id: "mock-drive-root",
                name: "Aboard",
                mimeType: "application/vnd.google-apps.folder",
                appProperties: { aboardKind: "root" },
              },
            ],
          }),
        });
        return;
      }

      if (url.includes("/drive/v3/files") && method === "POST") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: corsHeaders,
          body: JSON.stringify({
            id: "mock-proj-folder",
            name: "Quota Project",
            mimeType: "application/vnd.google-apps.folder",
            appProperties: { aboardKind: "project" },
          }),
        });
        return;
      }

      // Any file upload (project.json or item upload) -> return 403 storageQuotaExceeded
      if (url.includes("/upload/drive/v3/files")) {
        await route.fulfill({
          status: 403,
          contentType: "application/json",
          headers: corsHeaders,
          body: JSON.stringify({
            error: {
              errors: [
                {
                  domain: "usageLimits",
                  reason: "storageQuotaExceeded",
                  message: "The user's Drive storage quota has been exceeded.",
                },
              ],
              code: 403,
              message: "The user's Drive storage quota has been exceeded.",
            },
          }),
        });
        return;
      }

      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: corsHeaders,
        body: "{}",
      });
    });

    // 5. Open workspace
    await page.goto("/workspace?p=quota-test-proj");
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();

    await page.waitForFunction(() => {
      const win = window as unknown as { __aboard_DriveProvider?: unknown };
      return typeof win.__aboard_DriveProvider !== "undefined";
    });

    // 6. Execute saving through ProjectService backed by DriveProvider while Drive returns 403
    const savedLocally = await page.evaluate(async () => {
      const win = window as unknown as {
        __aboard_projectService?: {
          setProvider: (p: unknown) => void;
          saveBoard: (pId: string, itemId: string, payload: string, title?: string) => Promise<void>;
          readItem: (pId: string, itemId: string) => Promise<string>;
        };
        __aboard_DriveProvider?: new () => unknown;
        __aboard_saveQueue?: {
          flushNow: () => Promise<void>;
        };
      };

      if (!win.__aboard_projectService || !win.__aboard_DriveProvider || !win.__aboard_saveQueue) {
        throw new Error("Services missing on window");
      }

      // Switch to DriveProvider
      const driveProvider = new win.__aboard_DriveProvider();
      win.__aboard_projectService.setProvider(driveProvider);

      // Save a board item: triggers local Dexie save then upload attempt
      await win.__aboard_projectService.saveBoard(
        "quota-test-proj",
        "board-quota-1",
        JSON.stringify({ elements: [{ id: "shape-1", type: "rectangle" }] }),
        "Quota Test Board"
      );

      // Flush queue to run the upload which returns 403 quota exceeded
      await win.__aboard_saveQueue.flushNow();

      // Read back item to verify it saved locally
      const readBack = await win.__aboard_projectService.readItem("quota-test-proj", "board-quota-1");
      return readBack.includes("shape-1");
    });

    // 7. Assert local save succeeded
    expect(savedLocally).toBe(true);

    // 8. Assert DriveStatusBanner appears displaying translated Drive full text
    const banner = page.locator('[data-testid="drive-status-banner"]');
    await expect(banner).toBeVisible({ timeout: 5000 });
    await expect(banner).toContainText("Drive full. Work is saved locally. Export to free space.");

    // 9. Assert Export .alpha button is present inside the banner
    const exportBtn = page.locator('[data-testid="drive-export-btn"]');
    await expect(exportBtn).toBeVisible();

    // 10. Click "Export .alpha" button and assert export dialog opens
    await exportBtn.click();
    const exportDialog = page.locator('[data-testid="alpha-export-dialog"]');
    await expect(exportDialog).toBeVisible({ timeout: 5000 });
  });
});
