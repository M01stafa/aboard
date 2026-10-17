import { test, expect } from "@playwright/test";
import { mockSignIn } from "./helpers/auth";

test.describe("Study Templates Panel E2E (Task 27 / BOARD-5)", () => {
  const testUserId = "test-templates-user";
  const projectId = "templates-e2e-project";

  test.beforeEach(async ({ page }) => {
    await mockSignIn(page, {
      id: testUserId,
      email: "templates.student@example.com",
    });
  });

  test("opens templates panel, clicks 'Mind Map' template, and verifies it appears on the whiteboard canvas", async ({
    page,
  }) => {
    // 1. Navigate to workspace with a whiteboard tab
    await page.goto(`/workspace?p=${projectId}&kind=board`);

    // Verify workspace host and board pane render
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();
    const boardPane = page.locator(
      '.pane[data-slot="primary"] [data-testid="pane-board-tab-1"]'
    );
    await expect(boardPane).toBeVisible();

    // 2. Wait for Excalidraw API to be attached
    await page.waitForFunction(() => {
      const win = window as unknown as {
        __aboard_boardApi?: Record<
          string,
          {
            updateScene?: unknown;
            getSceneElements?: () => unknown[];
            getAppState?: () => { selectedElementIds?: Record<string, boolean> };
          }
        >;
      };
      const api = win.__aboard_boardApi?.["tab-1"];
      return (
        api !== undefined &&
        typeof api.updateScene === "function" &&
        typeof api.getSceneElements === "function"
      );
    }, { timeout: 25000 });

    // Initial scene should be empty or default
    const initialCount = await page.evaluate(() => {
      const win = window as unknown as {
        __aboard_boardApi?: Record<string, { getSceneElements: () => unknown[] }>;
      };
      return win.__aboard_boardApi?.["tab-1"]?.getSceneElements?.().length || 0;
    });

    // 3. Verify and click the Templates toggle button
    const toggleBtn = page.locator('[data-testid="templates-panel-toggle"]');
    await expect(toggleBtn).toBeVisible();
    await expect(toggleBtn).toHaveAttribute("aria-expanded", "false");

    await toggleBtn.click();

    // 4. Verify the side drawer opened and lists the 8 study templates
    const drawer = page.locator('[data-testid="aboard-templates-drawer"]');
    await expect(drawer).toBeVisible();
    await expect(toggleBtn).toHaveAttribute("aria-expanded", "true");

    // Verify all 8 templates are visible in the drawer
    const templateCards = page.locator('[data-testid^="template-card-"]');
    await expect(templateCards).toHaveCount(8);

    // 5. Locate the Mind Map template card and its insert button
    const mindMapCard = page.locator('[data-testid="template-card-mind-map"]');
    await expect(mindMapCard).toBeVisible();

    const insertBtn = page.locator('[data-testid="template-insert-mind-map"]');
    await expect(insertBtn).toBeVisible();

    // 6. Click Insert to place the Mind Map onto the canvas
    await insertBtn.click();

    // Verify insertion confirmation badge appears
    const insertedBadge = page.locator('[data-testid="template-inserted-badge"]');
    await expect(insertedBadge).toBeVisible();

    // 7. Verify elements were converted and added to the Excalidraw scene
    await page.waitForFunction((prevCount) => {
      const win = window as unknown as {
        __aboard_boardApi?: Record<string, { getSceneElements: () => unknown[] }>;
      };
      const current = win.__aboard_boardApi?.["tab-1"]?.getSceneElements?.() || [];
      return current.length > prevCount;
    }, initialCount, { timeout: 10000 });

    const newCount = await page.evaluate(() => {
      const win = window as unknown as {
        __aboard_boardApi?: Record<string, { getSceneElements: () => unknown[] }>;
      };
      return win.__aboard_boardApi?.["tab-1"]?.getSceneElements?.().length || 0;
    });

    expect(newCount).toBeGreaterThan(initialCount);

    // 8. Verify the newly inserted elements are selected in Excalidraw appState
    const selectedCount = await page.evaluate(() => {
      const win = window as unknown as {
        __aboard_boardApi?: Record<
          string,
          { getAppState: () => { selectedElementIds?: Record<string, boolean> } }
        >;
      };
      const appState = win.__aboard_boardApi?.["tab-1"]?.getAppState?.();
      return Object.keys(appState?.selectedElementIds || {}).length;
    });

    expect(selectedCount).toBeGreaterThan(0);

    // 9. Close the drawer using the close button and verify it hides cleanly
    const closeBtn = page.locator('[data-testid="templates-panel-close"]');
    await expect(closeBtn).toBeVisible();
    await closeBtn.click();
    await expect(drawer).not.toBeVisible();
    await expect(toggleBtn).toHaveAttribute("aria-expanded", "false");
  });
});
