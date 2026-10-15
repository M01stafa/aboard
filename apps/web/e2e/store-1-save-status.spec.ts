import { test, expect } from "@playwright/test";
import { mockSignIn } from "./helpers/auth";

test.describe("STORE-1 / WS-3 / WS-4: Silent Persistence & Save Status", () => {
  const testUser = {
    id: "user-store1-1111-2222-3333-444444444444",
    email: "student@example.com",
  };

  test("edits for a few seconds in local mode, proves no dialog appears, and status reads 'Saved on this device'", async ({
    page,
  }) => {
    // 1. Authenticate user
    await mockSignIn(page, testUser);

    // 2. Open workspace
    await page.goto("/workspace?p=store1-demo");
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();

    const statusIndicator = page.locator('[data-testid="save-status-indicator"]');
    await expect(statusIndicator).toBeVisible();
    await expect(statusIndicator).toHaveText(/Saved on this device/i);

    // Track if any browser beforeunload or unexpected dialog is triggered
    let dialogTriggered = false;
    page.on("dialog", async (dialog) => {
      dialogTriggered = true;
      await dialog.dismiss();
    });

    // 3. Perform edits for a few seconds (simulating continuous typing / sketching)
    for (let i = 1; i <= 5; i++) {
      await page.evaluate(async (step) => {
        const win = window as unknown as {
          __aboard_projectService?: {
            saveBoard: (pId: string, itemId: string, payload: string, title?: string) => Promise<void>;
          };
        };
        if (win.__aboard_projectService) {
          await win.__aboard_projectService.saveBoard(
            "store1-demo",
            "board-store1",
            JSON.stringify({ strokeCount: step, updatedAt: Date.now() }),
            "Live Study Board"
          );
        }
      }, i);

      // Verify status indicator shows "Saving…" while editing is active
      await expect(statusIndicator).toHaveText(/Saving/i);
      await page.waitForTimeout(150);
    }

    // 4. Wait for debounce (~500 ms) to settle and verify status returns to "Saved on this device"
    await expect(statusIndicator).toHaveText(/Saved on this device/i, { timeout: 3000 });

    // 5. Navigate away to launcher / close page
    await page.goto("/");
    await expect(page.locator('[data-testid="sign-out-btn"]')).toBeVisible();

    // STORE-1 & WS-4 assertion: in local mode, no leave-site prompt must ever be shown
    expect(dialogTriggered).toBe(false);

    // 6. Return to workspace and verify data was persisted to IndexedDB
    await page.goto("/workspace?p=store1-demo");
    await expect(statusIndicator).toHaveText(/Saved on this device/i);

    const savedPayload = await page.evaluate(async () => {
      const win = window as unknown as {
        __aboard_projectService?: {
          readItem: (pId: string, itemId: string) => Promise<string>;
        };
      };
      if (win.__aboard_projectService) {
        return await win.__aboard_projectService.readItem("store1-demo", "board-store1");
      }
      return null;
    });

    expect(savedPayload).toBeTruthy();
    const parsed = JSON.parse(savedPayload as string);
    expect(parsed.strokeCount).toBe(5);
  });
});
