import { test, expect } from "@playwright/test";
import { mockSignIn } from "./helpers/auth";

test.describe("Workspace Host Unified Top Bar (Header + Tab Bar)", () => {
  test.beforeEach(async ({ page }) => {
    await mockSignIn(page, {
      id: "unified-bar-user",
      email: "student@example.com",
    });
  });

  test("proves header and tab bar are merged into a single cohesive bar with clickable tabs and action buttons", async ({
    page,
  }) => {
    // 1. Navigate to workspace
    await page.goto("/workspace?p=demo");
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();

    // 2. Exactly one <header> bar exists in the workspace
    const headers = page.locator('[data-testid="workspace-host"] > header');
    await expect(headers).toHaveCount(1);

    const header = headers.first();
    await expect(header).toBeVisible();

    // 3. Large project ID badge / user email text is completely removed from the header
    await expect(header.locator("bdi")).toHaveCount(0);
    await expect(header.locator("text=demo")).toHaveCount(0);
    await expect(header.locator("text=student@example.com")).toHaveCount(0);

    // 4. Logo link sits on the far left (start) of the header
    const homeLink = header.locator('a[href="/"]');
    await expect(homeLink).toBeVisible();
    await expect(homeLink).toContainText("Aboard");

    // 5. Save status indicator is inside the header
    const statusIndicator = header.locator('[data-testid="save-status-indicator"]');
    await expect(statusIndicator).toBeVisible();
    await expect(statusIndicator).toHaveText(/Saved on this device/i);

    // 6. Tabs sit in the center/left inside <nav aria-label="Workspace tabs">
    const tabNav = header.locator('nav[aria-label="Workspace tabs"]');
    await expect(tabNav).toBeVisible();

    const tabList = tabNav.locator('[role="tablist"]');
    await expect(tabList).toBeVisible();

    // Verify tabs are rendered and clickable
    const tab1 = header.locator('[data-testid="tab-btn-tab-1"]');
    const tab2 = header.locator('[data-testid="tab-btn-tab-2"]');
    await expect(tab1).toBeVisible();
    await expect(tab2).toBeVisible();

    // Switch active tab by clicking tab2
    await tab2.click();
    await expect(tab2).toHaveAttribute("data-active", "true");

    // Switch back by clicking tab1
    await tab1.click();
    await expect(tab1).toHaveAttribute("data-active", "true");

    // 7. '+' (Add Tab) button sits right inside the header and opens the new tab menu
    const addTabBtn = header.locator('[data-testid="add-tab-btn"]');
    await expect(addTabBtn).toBeVisible();
    await addTabBtn.click();

    const addTabMenu = page.locator('[data-testid="add-tab-menu"]');
    await expect(addTabMenu).toBeVisible();

    // Close menu by pressing Escape
    await page.keyboard.press("Escape");
    await expect(addTabMenu).toHaveCount(0);

    // 8. Action buttons (Split controls, Export) sit right next to '+' button and are clickable
    const splitVerticalBtn = header.locator('[data-testid="split-vertical-btn"]');
    const splitHorizontalBtn = header.locator('[data-testid="split-horizontal-btn"]');
    const splitNoneBtn = header.locator('[data-testid="split-none-btn"]');
    const swapPanesBtn = header.locator('[data-testid="swap-panes-btn"]');
    const exportBtn = header.locator('[data-testid="workspace-export-btn"]');

    await expect(splitVerticalBtn).toBeVisible();
    await expect(splitHorizontalBtn).toBeVisible();
    await expect(splitNoneBtn).toBeVisible();
    await expect(swapPanesBtn).toBeVisible();
    await expect(exportBtn).toBeVisible();

    // Test clicking split vertical
    await splitVerticalBtn.click();
    const grid = page.locator('[data-testid="ws-grid"]');
    await expect(grid).toHaveAttribute("data-split", "vertical");

    // Test clicking split horizontal
    await splitHorizontalBtn.click();
    await expect(grid).toHaveAttribute("data-split", "horizontal");

    // Test clicking split none (single view)
    await splitNoneBtn.click();
    await expect(grid).toHaveAttribute("data-split", "none");

    // Test export button opens export dialog
    await exportBtn.click();
    await expect(page.locator('[data-testid="alpha-export-dialog"]')).toBeVisible();

    // Close export dialog
    const cancelBtn = page.locator('[data-testid="export-cancel-btn"]');
    await cancelBtn.click();
    await expect(page.locator('[data-testid="alpha-export-dialog"]')).toHaveCount(0);
  });
});
