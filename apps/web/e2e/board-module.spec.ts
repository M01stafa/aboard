import { test, expect } from "@playwright/test";
import { mockSignIn } from "./helpers/auth";

test.describe("Board Whiteboard Module Integration (Task 25 / BOARD-1, BOARD-2, BOARD-4)", () => {
  const testUserId = "test-board-user";
  const projectId = "board-e2e-project";

  test.beforeEach(async ({ page }) => {
    await mockSignIn(page, {
      id: testUserId,
      email: "board.student@example.com",
    });
  });

  test("whiteboard survives tab switch, split-view resize, and full page reload without losing state", async ({
    page,
  }) => {
    // 1. Navigate to workspace with a whiteboard as the initial primary tab
    await page.goto(`/workspace?p=${projectId}&kind=board`);

    // Verify workspace host and tabs render
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();
    const tab1Btn = page.locator('[data-testid="tab-btn-tab-1"]');
    await expect(tab1Btn).toBeVisible();

    // Verify board pane renders
    const boardPane = page.locator('.pane[data-slot="primary"] [data-testid="pane-board-tab-1"]');
    await expect(boardPane).toBeVisible();

    // Wait for Excalidraw to mount and API to attach
    await page.waitForFunction(() => {
      const win = window as unknown as {
        __aboard_boardApi?: Record<
          string,
          {
            updateScene?: unknown;
            getSceneElements?: () => unknown[];
            refresh?: unknown;
          }
        >;
      };
      const api = win.__aboard_boardApi?.["tab-1"];
      return (
        api !== undefined &&
        typeof api.updateScene === "function" &&
        typeof api.refresh === "function"
      );
    }, { timeout: 25000 });

    // Seed custom whiteboard elements into Excalidraw scene and trigger auto-save
    const testElements = [
      {
        id: "rect-1",
        type: "rectangle",
        x: 100,
        y: 100,
        width: 200,
        height: 120,
        backgroundColor: "#4f9ed5",
        strokeColor: "#002c8c",
        fillStyle: "solid",
        strokeWidth: 2,
        roughness: 1,
        opacity: 100,
        groupIds: [],
        roundness: { type: 3 },
        seed: 12345,
        version: 1,
        versionNonce: 1,
        isDeleted: false,
        boundElements: null,
        updated: 1,
        link: null,
        locked: false,
      },
    ];

    await page.evaluate(
      async ({ elements, projId }) => {
        const win = window as unknown as {
          __aboard_boardApi?: Record<
            string,
            {
              updateScene: (scene: { elements: unknown[]; appState?: Record<string, unknown> }) => void;
              getSceneElements: () => unknown[];
            }
          >;
          __aboard_projectService?: {
            saveBoard: (p: string, item: string, payload: string, title?: string) => Promise<void>;
          };
          __aboard_saveQueue?: {
            flushNow: () => Promise<void>;
          };
        };
        const api = win.__aboard_boardApi?.["tab-1"];
        if (api) {
          api.updateScene({ elements, appState: { viewBackgroundColor: "#edeae1" } });
        }
        // Save through ProjectService and flush SaveQueue to persist in IndexedDB
        if (win.__aboard_projectService) {
          await win.__aboard_projectService.saveBoard(
            projId,
            "item-1",
            JSON.stringify({ elements, appState: { viewBackgroundColor: "#edeae1" } }),
            "Whiteboard 1"
          );
        }
        if (win.__aboard_saveQueue) {
          await win.__aboard_saveQueue.flushNow();
        }
      },
      { elements: testElements, projId: projectId }
    );

    // Verify element exists in scene
    const initialElementsCount = await page.evaluate(() => {
      const win = window as unknown as {
        __aboard_boardApi?: Record<string, { getSceneElements: () => unknown[] }>;
      };
      return win.__aboard_boardApi?.["tab-1"]?.getSceneElements().length ?? 0;
    });
    expect(initialElementsCount).toBeGreaterThanOrEqual(1);

    // 2. Tab Switch Test:
    // Switch to tab-2 (circuit)
    const tab2Btn = page.locator('[data-testid="tab-btn-tab-2"]');
    await expect(tab2Btn).toBeVisible();
    await tab2Btn.click();

    // Verify tab-1 pane is now hidden with visibility:hidden (slot="hidden")
    const hiddenPane = page.locator('.pane[data-slot="hidden"] [data-testid="pane-board-tab-1"]');
    await expect(hiddenPane).toBeAttached();

    // Switch back to tab-1 (whiteboard)
    await tab1Btn.click();
    await expect(boardPane).toBeVisible();

    // Verify whiteboard scene elements survived the tab switch intact
    const postSwitchCount = await page.evaluate(() => {
      const win = window as unknown as {
        __aboard_boardApi?: Record<string, { getSceneElements: () => { id: string; isDeleted?: boolean }[] }>;
      };
      const elements = win.__aboard_boardApi?.["tab-1"]?.getSceneElements() ?? [];
      return elements.filter((e) => !e.isDeleted && e.id === "rect-1").length;
    });
    expect(postSwitchCount).toBe(1);

    // 3. Split View Resize Test:
    // Open vertical split view via the split buttons
    const splitVerticalBtn = page.locator('[data-testid="split-vertical-btn"]');
    await expect(splitVerticalBtn).toBeVisible();
    await splitVerticalBtn.click();

    // Verify split divider is visible
    const divider = page.locator('[data-testid="ws-divider"]');
    await expect(divider).toBeVisible();

    // Drag the divider to trigger ResizeObserver on the board pane
    const dividerBox = await divider.boundingBox();
    if (dividerBox) {
      await page.mouse.move(dividerBox.x + dividerBox.width / 2, dividerBox.y + dividerBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(dividerBox.x + 80, dividerBox.y + dividerBox.height / 2);
      await page.mouse.up();
    }

    // Verify whiteboard elements still present after split resize
    const postResizeCount = await page.evaluate(() => {
      const win = window as unknown as {
        __aboard_boardApi?: Record<string, { getSceneElements: () => { id: string; isDeleted?: boolean }[] }>;
      };
      const elements = win.__aboard_boardApi?.["tab-1"]?.getSceneElements() ?? [];
      return elements.filter((e) => !e.isDeleted && e.id === "rect-1").length;
    });
    expect(postResizeCount).toBe(1);

    // 4. Full Page Reload Test:
    await page.reload();

    // Wait for workspace host and board pane to restore
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();
    await expect(
      page.locator('.pane[data-slot="primary"] [data-testid="pane-board-tab-1"]')
    ).toBeVisible();

    // Wait for Excalidraw API to attach and restore initialData from IndexedDB
    await page.waitForFunction(() => {
      const win = window as unknown as {
        __aboard_boardApi?: Record<string, { getSceneElements: () => { id: string }[] }>;
      };
      const api = win.__aboard_boardApi?.["tab-1"];
      if (!api || typeof api.getSceneElements !== "function") return false;
      const elements = api.getSceneElements() || [];
      return elements.some((e) => e.id === "rect-1");
    }, { timeout: 25000 });

    // Assert that the whiteboard elements and state were fully restored after reload
    const postReloadElements = await page.evaluate(() => {
      const win = window as unknown as {
        __aboard_boardApi?: Record<
          string,
          {
            getSceneElements: () => { id: string; type: string }[];
            getAppState: () => { viewBackgroundColor?: string };
          }
        >;
      };
      const api = win.__aboard_boardApi?.["tab-1"];
      return {
        elements: (api?.getSceneElements() ?? []).filter((e) => e.id === "rect-1"),
        backgroundColor: api?.getAppState()?.viewBackgroundColor,
      };
    });

    expect(postReloadElements.elements.length).toBe(1);
    expect(postReloadElements.elements[0].type).toBe("rectangle");
    expect(postReloadElements.backgroundColor).toBe("#edeae1");
  });
});
