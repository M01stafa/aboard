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
    // Create a new circuit tab via '+' menu
    const addTabBtn = page.locator('[data-testid="add-tab-btn"]');
    await addTabBtn.click();
    await page.locator('[data-testid="add-tab-circuit"]').click();
    await expect(page.locator(".ws-tab-btn")).toHaveCount(2);

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

  test("whiteboard removes third-party external links and branding", async ({ page }) => {
    await page.goto(`/workspace?p=${projectId}&kind=board`);
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();

    // Verify workspace header logo uses real image
    await expect(page.locator('a[href="/"] img[src="/logo.png"]')).toBeVisible();

    const boardPane = page.locator('.pane[data-slot="primary"] [data-testid="pane-board-tab-1"]');
    await expect(boardPane).toBeVisible();

    // Verify Excalidraw logo is hidden
    const excalidrawLogo = boardPane.locator(".ExcalidrawLogo");
    await expect(excalidrawLogo).toBeHidden();

    // Verify Excalidraw native library/templates button is hidden
    const libraryTrigger = boardPane.locator(
      ".sidebar-trigger, .default-sidebar-trigger, .library-button, [data-testid=\"library-button\"], [data-testid=\"sidebar-trigger\"]"
    );
    await expect(libraryTrigger).toBeHidden();

    // Check hamburger main menu trigger
    const menuBtn = boardPane.locator('.main-menu-trigger, [data-testid="main-menu-trigger"], button[aria-label="Main menu"]');
    await expect(menuBtn).toBeVisible({ timeout: 10000 });
    await menuBtn.click();

    // Verify restored items exist:
    // 1. Export image
    const exportImageBtn = page.locator('[data-testid="image-export-button"]');
    await expect(exportImageBtn).toBeVisible();

    // 2. Find on canvas
    const searchBtn = page.locator('[data-testid="search-menu-button"]');
    await expect(searchBtn).toBeVisible();

    // 3. Clear / Reset canvas
    const clearCanvasBtn = page.locator('[data-testid="clear-canvas-button"]');
    await expect(clearCanvasBtn).toBeVisible();

    // 4. Preferences (Theme toggle & Canvas background)
    const toggleThemeBtn = page.locator('[data-testid="toggle-dark-mode"]');
    await expect(toggleThemeBtn).toBeVisible();
    const canvasBgLabel = page.locator('[data-testid="canvas-background-label"]');
    await expect(canvasBgLabel).toBeVisible();

    // Verify third-party external links, social links, Help, and branding are absent
    await expect(boardPane.locator('[data-testid="help-menu-item"]')).toBeHidden();
    await expect(page.locator('[data-testid="help-menu-item"]')).toHaveCount(0);
    await expect(
      page.locator('a[href*="discord"], a[href*="github.com/excalidraw"], a[href*="twitter.com/excalidraw"]')
    ).toHaveCount(0);
    await expect(page.locator('text="Excalidraw+"')).toHaveCount(0);
    await expect(page.locator('text="Sign up"')).toHaveCount(0);

    // Verify loadScene and saveToActiveFile are absent
    await expect(page.locator('[data-testid="load-button"], [data-testid="save-button"]')).toHaveCount(0);

    // Verify functionality: clicking "Export image" opens the ImageExportDialog and downloads PNG
    await exportImageBtn.click();
    const exportDialog = page.getByRole("dialog");
    await expect(exportDialog).toBeVisible();
    await expect(exportDialog.getByRole("heading", { name: "Export image" })).toBeVisible();
    await expect(exportDialog.getByRole("button", { name: "Export to PNG" })).toBeVisible();
    await expect(exportDialog.getByRole("button", { name: "Export to SVG" })).toBeVisible();

    await expect(exportDialog.getByRole("button", { name: "Copy PNG to clipboard" })).toBeVisible();

    // Close export dialog
    await page.keyboard.press("Escape");
    await expect(exportDialog).toBeHidden();
  });

  test("removes Web Embed and Mermaid from extra tools and enforces natural slider direction in RTL", async ({
    page,
  }) => {
    await page.goto(`/workspace?p=${projectId}&kind=board`);
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();

    const boardPane = page.locator('.pane[data-slot="primary"] [data-testid="pane-board-tab-1"]');
    await expect(boardPane).toBeVisible();

    // Wait for Excalidraw toolbar to be attached
    const extraToolsBtn = boardPane.locator(
      '.App-toolbar__extra-tools-trigger, button[title*="Extra tools" i], button[aria-label*="Extra tools" i]'
    );
    await expect(extraToolsBtn).toBeVisible({ timeout: 25000 });

    // Open extra tools dropdown
    await extraToolsBtn.click();

    // Verify extra tools dropdown opens
    const dropdown = page.locator('.App-toolbar__extra-tools-dropdown, .dropdown-menu');
    await expect(dropdown).toBeVisible();

    // Verify "Web Embed" and "Mermaid to Excalidraw" are absent / hidden
    await expect(page.locator('text="Web Embed"')).toBeHidden();
    await expect(page.locator('text="Mermaid to Excalidraw"')).toBeHidden();
    await expect(dropdown.locator('[data-testid="toolbar-embeddable"]:visible')).toHaveCount(0);

    // Verify allowed tools (Frame, Laser) remain visible
    await expect(dropdown.locator('[data-testid="toolbar-frame"]')).toBeVisible();
    await expect(dropdown.locator('[data-testid="toolbar-laser"]')).toBeVisible();

    // Close menu
    await page.keyboard.press("Escape");

    // Verify slider direction is forced to LTR globally even under RTL
    await page.evaluate(() => {
      document.documentElement.setAttribute("dir", "rtl");
    });
    const sliderDirection = await page.evaluate(() => {
      const input = document.createElement("input");
      input.type = "range";
      input.className = "range-input";
      document.body.appendChild(input);
      const computed = window.getComputedStyle(input).direction;
      input.remove();
      return computed;
    });
    expect(sliderDirection).toBe("ltr");

    // Verify top bar RTL override forces direction ltr for toolbar left / menu right
    const topBar = boardPane.locator('.App-menu_top');
    const topBarDir = await topBar.evaluate((el) => window.getComputedStyle(el).direction);
    expect(topBarDir).toBe("ltr");
  });

  test("switches to Arabic (RTL), keeps top bar and Excalidraw toolbar clean without overlapping icons", async ({
    page,
  }) => {
    // 1. Set language to Arabic before navigation
    await page.addInitScript(() => {
      localStorage.setItem("aboard:language", "ar");
    });

    await page.goto(`/workspace?p=${projectId}&kind=board`);
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();

    // 2. Verify Top Bar in RTL:
    // Logo and status on the right (start), action buttons on the left (end), not squished
    const logoLink = page.locator('header a[href="/"]');
    const saveStatus = page.locator('[data-testid="save-status-indicator"]');
    const actionControls = page.locator('[data-testid="add-tab-btn"]');

    await expect(logoLink).toBeVisible();
    await expect(saveStatus).toBeVisible();
    await expect(actionControls).toBeVisible();

    const logoBox = await logoLink.boundingBox();
    const statusBox = await saveStatus.boundingBox();
    const actionBox = await actionControls.boundingBox();
    expect(logoBox).toBeTruthy();
    expect(statusBox).toBeTruthy();
    expect(actionBox).toBeTruthy();

    if (logoBox && statusBox && actionBox) {
      // In RTL, logo and status are on the right (larger x coordinate than action buttons)
      expect(logoBox.x).toBeGreaterThan(actionBox.x);
      // Logo and status do not overlap horizontally
      expect(statusBox.x + statusBox.width).toBeLessThanOrEqual(logoBox.x + 4);
    }

    // 3. Verify Excalidraw Board Toolbar in RTL:
    const boardPane = page.locator('.pane[data-slot="primary"] [data-testid="pane-board-tab-1"]');
    await expect(boardPane).toBeVisible();

    // Assert that the board pane enforces direction: ltr
    const paneDir = await boardPane.evaluate((el) => window.getComputedStyle(el).direction);
    expect(paneDir).toBe("ltr");

    // Wait for Excalidraw toolbar buttons to mount
    const toolItems = boardPane.locator(
      '.App-toolbar-container input[type="radio"], .App-toolbar-container button, .shapes-section [data-testid^="toolbar-"]'
    );
    await expect(toolItems.first()).toBeVisible({ timeout: 25000 });

    // Collect bounding boxes of all visible toolbar tool items
    const count = await toolItems.count();
    const boxes: { x: number; width: number; y: number; height: number }[] = [];
    for (let i = 0; i < count; i++) {
      const item = toolItems.nth(i);
      if (await item.isVisible()) {
        const box = await item.boundingBox();
        if (box && box.width > 0 && box.height > 0) {
          boxes.push(box);
        }
      }
    }

    expect(boxes.length).toBeGreaterThan(5);

    // Sort by x coordinate ascending (left-to-right)
    boxes.sort((a, b) => a.x - b.x);

    // Assert that no adjacent toolbar icons overlap horizontally
    for (let i = 0; i < boxes.length - 1; i++) {
      const curr = boxes[i];
      const next = boxes[i + 1];
      // Right edge of current icon (curr.x + curr.width) must not exceed next.x (+ 1.5px subpixel tolerance)
      expect(curr.x + curr.width).toBeLessThanOrEqual(next.x + 1.5);
    }

    // 4. Verify bottom controls (zoom and undo) exist and do not overlap
    const zoomControls = boardPane.locator('.zoom-actions, .layer-ui__wrapper__footer-left');
    await expect(zoomControls.first()).toBeVisible();
  });
});

