import { test, expect } from "@playwright/test";
import { mockSignIn } from "./helpers/auth";

test.describe("Workspace Host DOM Stability & Circuit Iframe Keep-Alive (Task 18 / WS-1, WS-2)", () => {
  test.beforeEach(async ({ page }) => {
    await mockSignIn(page, {
      id: "test-user-id",
      email: "student@example.com",
    });
  });

  test("real circuit simulator iframe survives split toggles, swaps, and tab switches without reloading", async ({
    page,
  }) => {
    // 1. Navigate to the workspace host
    await page.goto("/workspace?p=demo");

    // Verify workspace components render
    await expect(page.locator('[data-testid="ws-grid"]')).toBeVisible();
    await expect(page.locator('[data-testid="tab-btn-tab-1"]')).toBeVisible();
    await expect(page.locator('[data-testid="tab-btn-tab-2"]')).toBeVisible();

    // 2. Select tab-2 (Circuit 1) to make it primary
    await page.click('[data-testid="tab-btn-tab-2"]');

    // 3. Locate the real circuit iframe and assert placeholder is completely gone
    const iframeLocator = page.locator('iframe[data-testid="circuit-iframe"]');
    await expect(iframeLocator).toBeVisible();

    // Explicit check: test placeholder badge and counter must NOT exist
    await expect(page.locator("text=Aboard Keep-Alive Verification")).toHaveCount(0);
    await expect(page.locator("#counter")).toHaveCount(0);

    // Wait for the GWT CircuitJS1 simulator to load in the iframe
    await page.waitForFunction(() => {
      const iframe = document.querySelector('iframe[data-testid="circuit-iframe"]') as HTMLIFrameElement | null;
      const sim = (iframe?.contentWindow as {
        CircuitJS1?: {
          isRunning?: () => boolean;
          getTime?: () => number;
          getElements?: () => unknown[];
        };
      })?.CircuitJS1;
      return (
        sim !== undefined &&
        typeof sim.getTime === "function" &&
        Array.isArray(sim.getElements?.())
      );
    }, { timeout: 25000 });

    // Assert the real circuit canvas is rendered and visible with non-zero dimensions
    const circuitFrame = page.frameLocator('iframe[data-testid="circuit-iframe"]');
    const canvas = circuitFrame.locator("canvas").first();
    await expect(canvas).toBeVisible();

    const canvasBox = await canvas.boundingBox();
    expect(canvasBox).not.toBeNull();
    expect(canvasBox!.width).toBeGreaterThan(0);
    expect(canvasBox!.height).toBeGreaterThan(0);

    // Attach custom property to the iframe window to verify DOM stability (never reloaded)
    await page.evaluate(() => {
      const iframe = document.querySelector('iframe[data-testid="circuit-iframe"]') as HTMLIFrameElement;
      (iframe.contentWindow as unknown as Record<string, unknown>).__aboardKeepAliveToken = 424242;
    });

    const time1 = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[data-testid="circuit-iframe"]') as HTMLIFrameElement;
      const sim = (iframe.contentWindow as unknown as { CircuitJS1: { getTime: () => number } }).CircuitJS1;
      return sim.getTime();
    });

    // 4. Toggle split view to vertical (Tab 2 is primary, Tab 1 is secondary)
    await page.click('[data-testid="split-vertical-btn"]');
    await expect(page.locator('.pane[data-slot="primary"]')).toBeVisible();
    await expect(page.locator('.pane[data-slot="secondary"]')).toBeVisible();
    await expect(page.locator('[data-testid="ws-divider"]')).toBeVisible();

    // Verify canvas adapted and maintains non-zero dimensions in split view
    const splitCanvasBox = await canvas.boundingBox();
    expect(splitCanvasBox).not.toBeNull();
    expect(splitCanvasBox!.width).toBeGreaterThan(0);
    expect(splitCanvasBox!.height).toBeGreaterThan(0);

    // 5. Swap panes (Tab 2 moves from primary to secondary slot)
    await page.click('[data-testid="swap-panes-btn"]');
    await page.waitForTimeout(800);

    const check1 = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[data-testid="circuit-iframe"]') as HTMLIFrameElement;
      const cw = iframe.contentWindow as unknown as {
        __aboardKeepAliveToken?: number;
        CircuitJS1: { getTime: () => number };
      };
      return {
        token: cw.__aboardKeepAliveToken,
        time: cw.CircuitJS1.getTime(),
      };
    });
    // Token proves iframe was never unmounted or reloaded
    expect(check1.token).toBe(424242);
    expect(check1.time).toBeGreaterThan(time1);

    // 6. Toggle split view to horizontal
    await page.click('[data-testid="split-horizontal-btn"]');
    await page.waitForTimeout(800);

    const check2 = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[data-testid="circuit-iframe"]') as HTMLIFrameElement;
      const cw = iframe.contentWindow as unknown as {
        __aboardKeepAliveToken?: number;
        CircuitJS1: { getTime: () => number };
      };
      return {
        token: cw.__aboardKeepAliveToken,
        time: cw.CircuitJS1.getTime(),
      };
    });
    expect(check2.token).toBe(424242);
    expect(check2.time).toBeGreaterThan(check1.time);

    // 7. Toggle split back to none (single pane) and switch tabs away to Tab 1
    await page.click('[data-testid="split-none-btn"]');
    await page.click('[data-testid="tab-btn-tab-1"]');
    await page.waitForTimeout(800);

    // Switch back to tab-2
    await page.click('[data-testid="tab-btn-tab-2"]');
    const check3 = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[data-testid="circuit-iframe"]') as HTMLIFrameElement;
      const cw = iframe.contentWindow as unknown as {
        __aboardKeepAliveToken?: number;
        CircuitJS1: { getTime: () => number };
      };
      return {
        token: cw.__aboardKeepAliveToken,
        time: cw.CircuitJS1.getTime(),
      };
    });
    expect(check3.token).toBe(424242);
    expect(check3.time).toBeGreaterThan(check2.time);

    // 8. Test Divider Dragging in Split Mode
    await page.click('[data-testid="split-vertical-btn"]');
    const divider = page.locator('[data-testid="ws-divider"]');
    await expect(divider).toBeVisible();

    const box = await divider.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2);
      await page.mouse.up();
    }

    const check4 = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[data-testid="circuit-iframe"]') as HTMLIFrameElement;
      const cw = iframe.contentWindow as unknown as {
        __aboardKeepAliveToken?: number;
        CircuitJS1: { getTime: () => number };
      };
      return {
        token: cw.__aboardKeepAliveToken,
        time: cw.CircuitJS1.getTime(),
      };
    });
    expect(check4.token).toBe(424242);
    expect(check4.time).toBeGreaterThan(check3.time);
  });

  test("divider dragging continues to work when moving pointer over an iframe pane", async ({
    page,
  }) => {
    // 1. Open workspace with at least one pane rendering the existing iframe
    await page.goto("/workspace?p=demo");
    await expect(page.locator('[data-testid="ws-grid"]')).toBeVisible();

    // 2. Enter split view (vertical split: Tab 1 is primary, Tab 2 with circuit iframe is secondary)
    await page.click('[data-testid="split-vertical-btn"]');
    const divider = page.locator('[data-testid="ws-divider"]');
    await expect(divider).toBeVisible();

    const iframePane = page.locator('[data-testid="pane-slot-tab-2"]');
    await expect(iframePane).toBeVisible();

    // 3. Record the current split ratio
    const grid = page.locator('[data-testid="ws-grid"]');
    const initialRatio = await grid.evaluate((el) =>
      parseFloat(el.style.getPropertyValue("--ratio"))
    );
    expect(initialRatio).toBe(0.5);

    // 4. pointerdown on the divider, page.mouse.move to coordinate inside iframe pane's bounding box, then mouse.up
    const dividerBox = await divider.boundingBox();
    const iframeBox = await iframePane.boundingBox();
    expect(dividerBox).not.toBeNull();
    expect(iframeBox).not.toBeNull();

    // Target a coordinate well inside the iframe pane
    const targetX = iframeBox!.x + iframeBox!.width * 0.5;
    const targetY = iframeBox!.y + iframeBox!.height * 0.5;

    await page.mouse.move(
      dividerBox!.x + dividerBox!.width / 2,
      dividerBox!.y + dividerBox!.height / 2
    );
    await page.mouse.down();
    await page.mouse.move(targetX, targetY, { steps: 5 });
    await page.mouse.up();

    // 5. Assert the split ratio changed (drag continued through the iframe)
    const newRatio = await grid.evaluate((el) =>
      parseFloat(el.style.getPropertyValue("--ratio"))
    );
    expect(newRatio).toBeGreaterThan(initialRatio);
  });
});
