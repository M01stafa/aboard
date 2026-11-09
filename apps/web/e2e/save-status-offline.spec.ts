import { test, expect } from "@playwright/test";
import { mockSignIn } from "./helpers/auth";

test.describe("WS-3 / STORE-5: Save Status Reactivity & Offline Detection", () => {
  const testUser = {
    id: "user-offline-test-1111-2222-3333-444444444444",
    email: "student.offline@example.com",
  };

  const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  };

  test("reacts immediately to offline/online events in Drive mode", async ({ page, context }) => {
    // 1. Authenticate user
    await mockSignIn(page, testUser);

    // 2. Intercept Drive status RPC
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
            google_email: "student.offline@example.com",
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
          access_token: "mock-google-access-token-offline-test",
          expires_at: Date.now() + 3600_000,
        }),
      });
    });

    // 4. Intercept Google Drive API calls
    await page.route("https://www.googleapis.com/**", async (route) => {
      const req = route.request();
      if (req.method() === "OPTIONS") {
        await route.fulfill({ status: 200, headers: corsHeaders });
        return;
      }
      const url = new URL(req.url());
      if (url.pathname === "/drive/v3/files" && req.method() === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: corsHeaders,
          body: JSON.stringify({ files: [] }),
        });
        return;
      }
      // Return dummy file object for uploads / updates
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: corsHeaders,
        body: JSON.stringify({
          id: `drive-file-${Date.now()}`,
          name: "item.json",
          headRevisionId: `rev-${Date.now()}`,
          trashed: false,
        }),
      });
    });

    // 5. Open workspace
    await page.goto("/workspace?p=drive-offline-test");
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();

    const statusIndicator = page.locator('[data-testid="save-status-indicator"]');
    await expect(statusIndicator).toBeVisible();

    // 6. Wait for globals and configure DriveProvider
    await page.waitForFunction(() => {
      const win = window as unknown as {
        __aboard_DriveProvider?: unknown;
        __aboard_projectService?: unknown;
      };
      return (
        typeof win.__aboard_DriveProvider !== "undefined" &&
        typeof win.__aboard_projectService !== "undefined"
      );
    });

    await page.evaluate(async () => {
      const win = window as unknown as {
        __aboard_projectService: {
          setProvider: (p: unknown) => void;
        };
        __aboard_DriveProvider: new () => unknown;
        __aboard_saveQueue: {
          setStatus: (s: string) => void;
        };
      };
      const provider = new win.__aboard_DriveProvider();
      win.__aboard_projectService.setProvider(provider);
      win.__aboard_saveQueue.setStatus("saved-drive");
    });

    // Verify indicator shows "Saved to Google Drive"
    await expect(statusIndicator).toHaveText(/Saved to Google Drive/i);

    // 7. Make an edit to enter saving state
    await page.evaluate(async () => {
      const win = window as unknown as {
        __aboard_projectService: {
          saveBoard: (pId: string, itemId: string, payload: string, title?: string) => Promise<void>;
        };
      };
      await win.__aboard_projectService.saveBoard(
        "drive-offline-test",
        "board-offline-1",
        JSON.stringify({ text: "initial edit", time: Date.now() }),
        "Offline Test Board"
      );
    });

    // Verify indicator immediately shows "Saving…"
    await expect(statusIndicator).toHaveText(/Saving/i);

    // 8. SIMULATE OFFLINE MODE: context.setOffline(true)
    await context.setOffline(true);

    // Verify indicator IMMEDIATELY switches to "Waiting for connection"
    await expect(statusIndicator).toHaveText(/Waiting for connection/i);
    expect(await statusIndicator.getAttribute("data-status")).toBe("waiting-connection");

    // 9. Make another edit while offline — indicator must remain "Waiting for connection"
    await page.evaluate(async () => {
      const win = window as unknown as {
        __aboard_projectService: {
          saveBoard: (pId: string, itemId: string, payload: string, title?: string) => Promise<void>;
        };
      };
      await win.__aboard_projectService.saveBoard(
        "drive-offline-test",
        "board-offline-1",
        JSON.stringify({ text: "offline edit 2", time: Date.now() }),
        "Offline Test Board"
      );
    });

    await expect(statusIndicator).toHaveText(/Waiting for connection/i);

    // 10. RESTORE CONNECTION: context.setOffline(false)
    await context.setOffline(false);

    // Indicator transitions to "Saving…" then to "Saved to Google Drive"
    await expect(statusIndicator).toHaveText(/Saved to Google Drive/i, { timeout: 10000 });
    expect(await statusIndicator.getAttribute("data-status")).toBe("saved-drive");
  });

  test("shows confirmation warning when leaving with unsaved changes", async ({ page }) => {
    await mockSignIn(page, testUser);
    await page.goto("/workspace?p=unsaved-warn-test");
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();

    // Switch to DriveProvider so unsaved changes persist in outbox / pending Drive sync
    await page.evaluate(async () => {
      const win = window as unknown as {
        __aboard_projectService?: {
          setProvider: (p: unknown) => void;
          saveBoard: (pId: string, itemId: string, payload: string, title?: string) => Promise<void>;
        };
        __aboard_DriveProvider?: new () => unknown;
      };
      if (win.__aboard_projectService && win.__aboard_DriveProvider) {
        win.__aboard_projectService.setProvider(new win.__aboard_DriveProvider());
        await win.__aboard_projectService.saveBoard(
          "unsaved-warn-test",
          "board-unsaved",
          JSON.stringify({ strokes: [1, 2, 3], time: Date.now() }),
          "Dirty Board"
        );
      }
    });

    // Set up dialog handler before clicking
    let dialogShown = false;
    page.on("dialog", async (dialog) => {
      dialogShown = true;
      expect(dialog.message()).toContain("unsaved changes");
      await dialog.dismiss(); // Cancel leave
    });

    // Click the Aboard logo to navigate home
    const homeLink = page.locator('header a[href="/"]');
    await homeLink.click();

    expect(dialogShown).toBe(true);

    // Still in workspace because we dismissed
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();
  });

  test("closes specific tab when clicking tab close button (X)", async ({ page }) => {
    await mockSignIn(page, testUser);
    await page.goto("/workspace?p=tab-close-test");
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();

    // Add a second tab (PDF)
    const addTabBtn = page.locator('[data-testid="add-tab-btn"]');
    await addTabBtn.click();
    const pdfOption = page.locator('[data-testid="add-tab-pdf"]');
    await pdfOption.click();

    // Verify 2 tabs present
    const tabs = page.locator(".ws-tab-btn");
    await expect(tabs).toHaveCount(2);

    // Locate close button for the second tab (PDF)
    const closeBtn = page.locator(".ws-tab-close-btn").nth(1);
    await expect(closeBtn).toBeAttached();

    // Click tab close button
    await closeBtn.click();

    // Verify only 1 tab remains
    await expect(page.locator(".ws-tab-btn")).toHaveCount(1);
    await expect(page.locator(".ws-tab-btn")).toHaveText(/Board/i);
  });

  test("persists closed tabs across reloads and redirects to launcher on last tab close", async ({ page }) => {
    await mockSignIn(page, testUser);
    const projectId = `proj-persist-${Date.now()}`;
    await page.goto(`/workspace?p=${projectId}`);
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();

    // 1. Add a second tab (PDF)
    const addTabBtn = page.locator('[data-testid="add-tab-btn"]');
    await addTabBtn.click();
    await page.locator('[data-testid="add-tab-pdf"]').click();
    await expect(page.locator(".ws-tab-btn")).toHaveCount(2);

    // 2. Close PDF tab
    const pdfCloseBtn = page.locator(".ws-tab-close-btn").nth(1);
    await pdfCloseBtn.click();
    await expect(page.locator(".ws-tab-btn")).toHaveCount(1);
    await expect(page.locator(".ws-tab-btn")).toHaveText(/Board/i);

    // 3. Reload/reopen project and verify only Whiteboard tab is restored
    await page.goto(`/workspace?p=${projectId}`);
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();
    await expect(page.locator(".ws-tab-btn")).toHaveCount(1);
    await expect(page.locator(".ws-tab-btn")).toHaveText(/Board/i);

    // 4. Close the last remaining tab -> should redirect to launcher (/)
    const lastCloseBtn = page.locator(".ws-tab-close-btn").first();
    await expect(lastCloseBtn).toBeAttached();
    await lastCloseBtn.click();

    // Must redirect to launcher /
    await page.waitForURL((url) => url.pathname === "/" || url.pathname === "");
    expect(page.url()).not.toContain("/workspace");
  });
});

