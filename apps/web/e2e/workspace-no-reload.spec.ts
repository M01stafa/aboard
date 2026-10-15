import { test, expect } from "@playwright/test";
import { mockSignIn } from "./helpers/auth";

test.describe("Workspace Host DOM Stability & Iframe Keep-Alive (Task 18 / WS-1, WS-2)", () => {
  test.beforeEach(async ({ page }) => {
    await mockSignIn(page, {
      id: "test-user-id",
      email: "student@example.com",
    });
  });

  test("iframe counter continuously increments and never reloads across split toggles, swaps, and tab switches", async ({
    page,
  }) => {
    // 1. Navigate to the workspace host
    await page.goto("/workspace?p=demo");

    // Verify workspace components render
    await expect(page.locator('[data-testid="ws-grid"]')).toBeVisible();
    await expect(page.locator('[data-testid="tab-btn-tab-1"]')).toBeVisible();
    await expect(page.locator('[data-testid="tab-btn-tab-2"]')).toBeVisible();

    // 2. Select tab-2 (which contains the iframe placeholder) to make it primary
    await page.click('[data-testid="tab-btn-tab-2"]');

    // 3. Locate the iframe element and frame counter
    const iframe = page.frameLocator('iframe[data-testid="iframe-element"]');
    const counter = iframe.locator("#counter");
    await expect(counter).toBeVisible({ timeout: 10000 });

    // Wait until the ticking interval increments to at least 1
    await expect(counter).not.toHaveText("0", { timeout: 6000 });
    const count1Text = await counter.textContent();
    const count1 = parseInt(count1Text?.trim() || "0", 10);
    expect(count1).toBeGreaterThanOrEqual(1);

    // 4. Toggle split view to vertical
    // Tab 2 is primary, Tab 1 is secondary
    await page.click('[data-testid="split-vertical-btn"]');
    await expect(page.locator('.pane[data-slot="primary"]')).toBeVisible();
    await expect(page.locator('.pane[data-slot="secondary"]')).toBeVisible();
    await expect(page.locator('[data-testid="ws-divider"]')).toBeVisible();

    // 5. Swap panes (Tab 2 moves from primary to secondary slot)
    await page.click('[data-testid="swap-panes-btn"]');

    // Wait 1.5 seconds for counter to keep ticking
    await page.waitForTimeout(1500);

    const count2Text = await counter.textContent();
    const count2 = parseInt(count2Text?.trim() || "0", 10);
    // Counter MUST have advanced without reloading back to 0
    expect(count2).toBeGreaterThan(count1);

    // 6. Toggle split view to horizontal
    await page.click('[data-testid="split-horizontal-btn"]');
    await page.waitForTimeout(1200);

    const count3Text = await counter.textContent();
    const count3 = parseInt(count3Text?.trim() || "0", 10);
    expect(count3).toBeGreaterThan(count2);

    // 7. Toggle split back to none (single pane) and switch tabs
    await page.click('[data-testid="split-none-btn"]');
    // Switch to tab-1 (making tab-2 hidden keep-alive)
    await page.click('[data-testid="tab-btn-tab-1"]');
    await page.waitForTimeout(1200);

    // Switch back to tab-2
    await page.click('[data-testid="tab-btn-tab-2"]');
    const count4Text = await counter.textContent();
    const count4 = parseInt(count4Text?.trim() || "0", 10);
    // Proves the iframe kept running while hidden and never reset!
    expect(count4).toBeGreaterThan(count3);

    // 8. Test Divider Dragging in Split Mode
    await page.click('[data-testid="split-vertical-btn"]');
    const divider = page.locator('[data-testid="ws-divider"]');
    await expect(divider).toBeVisible();

    const box = await divider.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      // While dragging, drag shield must be active
      await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2);
      await page.mouse.up();
    }

    // Wait for next tick after dragging
    await expect(counter).not.toHaveText(String(count4), { timeout: 3000 });
    const count5Text = await counter.textContent();
    const count5 = parseInt(count5Text?.trim() || "0", 10);
    expect(count5).toBeGreaterThan(count4);
  });

  test("divider dragging continues to work when moving pointer over an iframe pane", async ({
    page,
  }) => {
    // 1. Open workspace with at least one pane rendering the existing iframe
    await page.goto("/workspace?p=demo");
    await expect(page.locator('[data-testid="ws-grid"]')).toBeVisible();

    // 2. Enter split view (vertical split: Tab 1 is primary, Tab 2 with iframe is secondary)
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
