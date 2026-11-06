import { test, expect } from "@playwright/test";
import { mockSignIn } from "./helpers/auth";

test.describe("Circuit Simulator Module Integration (Task 24 / CIRC-1, CIRC-2, CIRC-3, CIRC-4)", () => {
  const testUserId = "test-circuit-user";
  const projectId = "circuit-e2e-project";
  const customCircuitText =
    "$ 1 0.000005 10 50 5 0.5\nr 128 128 224 128 0 1000\nc 224 128 224 224 0 0.000001 0\ng 224 224 224 240 0\nw 128 128 128 224 0\nv 128 224 224 224 0 0 40 5 0 0 0.5";

  test.beforeEach(async ({ page }) => {
    await mockSignIn(page, {
      id: testUserId,
      email: "circuit.student@example.com",
    });
  });

  test("circuit survives tab switch, theme change, and page reload without losing state", async ({
    page,
  }) => {
    // 1. Navigate to workspace with a circuit as the initial primary tab
    await page.goto(`/workspace?p=${projectId}&kind=circuit`);

    // Verify workspace host and tabs render
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();
    const tab1Btn = page.locator('[data-testid="tab-btn-tab-1"]');
    await expect(tab1Btn).toBeVisible();

    // Verify circuit pane and iframe render
    const circuitPane = page.locator('.pane[data-slot="primary"] [data-testid="pane-circuit-tab-1"]');
    await expect(circuitPane).toBeVisible();

    const iframeLocator = page.locator('iframe[data-testid="circuit-iframe"]');
    await expect(iframeLocator).toBeVisible();

    // Verify initial iframe src contains light theme parameters
    const initialSrc = await iframeLocator.getAttribute("src");
    expect(initialSrc).toContain("whiteBackground=true");
    expect(initialSrc).toContain("selectColor=%234F9ED5");

    // Wait for the iframe, GWT CircuitJS1 API, and initial setup to fully load
    await page.waitForFunction(() => {
      const iframe = document.querySelector('iframe[data-testid="circuit-iframe"]') as HTMLIFrameElement | null;
      const sim = (iframe?.contentWindow as {
        CircuitJS1?: {
          importCircuit?: unknown;
          exportCircuit?: unknown;
          getElements?: () => unknown[];
        };
      })?.CircuitJS1;
      return (
        sim !== undefined &&
        typeof sim.importCircuit === "function" &&
        typeof sim.exportCircuit === "function" &&
        Array.isArray(sim.getElements?.()) &&
        (sim.getElements?.().length ?? 0) > 0
      );
    }, { timeout: 25000 });

    // Seed and import custom circuit into the simulator and project storage
    await page.evaluate(
      async ({ projId, text }) => {
        const iframe = document.querySelector('iframe[data-testid="circuit-iframe"]') as HTMLIFrameElement | null;
        const sim = (iframe?.contentWindow as { CircuitJS1?: { importCircuit: (t: string, sub?: boolean) => void } })?.CircuitJS1;
        if (sim) {
          sim.importCircuit(text, false);
        }

        const win = window as unknown as {
          __aboard_projectService?: {
            saveCircuit: (p: string, item: string, payload: string, title?: string) => Promise<void>;
          };
          __aboard_saveQueue?: {
            flushNow: () => Promise<void>;
          };
        };
        if (win.__aboard_projectService) {
          await win.__aboard_projectService.saveCircuit(projId, "item-1", text, "Circuit 1");
        }
        if (win.__aboard_saveQueue) {
          await win.__aboard_saveQueue.flushNow();
        }
      },
      { projId: projectId, text: customCircuitText }
    );

    // Verify circuit was imported
    const circuitInitial = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[data-testid="circuit-iframe"]') as HTMLIFrameElement | null;
      const sim = (iframe?.contentWindow as { CircuitJS1?: { exportCircuit: () => string } })?.CircuitJS1;
      return sim?.exportCircuit() || "";
    });
    expect(circuitInitial).toContain("1000");

    // 2. Tab Switch Test:
    // Create a whiteboard tab via '+' menu
    const addTabBtn = page.locator('[data-testid="add-tab-btn"]');
    await addTabBtn.click();
    await page.locator('[data-testid="add-tab-board"]').click();
    await expect(page.locator(".ws-tab-btn")).toHaveCount(2);

    // Verify tab-1 pane is now hidden
    const hiddenPane = page.locator('.pane[data-slot="hidden"] [data-testid="pane-circuit-tab-1"]');
    await expect(hiddenPane).toBeAttached();

    // Switch back to tab-1
    await tab1Btn.click();
    await expect(page.locator('.pane[data-slot="primary"] [data-testid="pane-circuit-tab-1"]')).toBeVisible();

    // Verify circuit survives tab switch
    const circuitAfterTabSwitch = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[data-testid="circuit-iframe"]') as HTMLIFrameElement | null;
      const sim = (iframe?.contentWindow as { CircuitJS1?: { exportCircuit: () => string } })?.CircuitJS1;
      return sim?.exportCircuit() || "";
    });
    expect(circuitAfterTabSwitch).toContain("1000");

    // 3. Theme Change Test:
    // Toggle theme to dark on documentElement
    await page.evaluate(() => {
      document.documentElement.setAttribute("data-theme", "dark");
    });

    // Wait for the iframe src to update with dark theme parameters (whiteBackground=false)
    await expect(async () => {
      const darkSrc = await iframeLocator.getAttribute("src");
      expect(darkSrc).toContain("whiteBackground=false");
    }).toPass({ timeout: 10000 });

    // Wait for the reloaded dark iframe's CircuitJS1 to initialize
    await page.waitForFunction(() => {
      const iframe = document.querySelector('iframe[data-testid="circuit-iframe"]') as HTMLIFrameElement | null;
      const sim = (iframe?.contentWindow as { CircuitJS1?: { exportCircuit?: unknown } })?.CircuitJS1;
      return sim !== undefined && typeof sim.exportCircuit === "function";
    }, { timeout: 25000 });

    // Verify circuit is preserved across theme change
    await expect(async () => {
      const circuitAfterThemeChange = await page.evaluate(() => {
        const iframe = document.querySelector('iframe[data-testid="circuit-iframe"]') as HTMLIFrameElement | null;
        const sim = (iframe?.contentWindow as { CircuitJS1?: { exportCircuit: () => string } })?.CircuitJS1;
        return sim?.exportCircuit() || "";
      });
      expect(circuitAfterThemeChange).toContain("1000");
    }).toPass({ timeout: 10000 });

    // 4. Page Reload Test:
    // Flush saves before reload
    await page.evaluate(async () => {
      const win = window as unknown as { __aboard_saveQueue?: { flushNow: () => Promise<void> } };
      await win.__aboard_saveQueue?.flushNow();
    });

    // Reload page
    await page.reload();

    // Verify circuit reopens and restores persisted data
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();
    await expect(page.locator('.pane[data-slot="primary"] [data-testid="pane-circuit-tab-1"]')).toBeVisible();

    await page.waitForFunction(() => {
      const iframe = document.querySelector('iframe[data-testid="circuit-iframe"]') as HTMLIFrameElement | null;
      const sim = (iframe?.contentWindow as { CircuitJS1?: { exportCircuit?: unknown } })?.CircuitJS1;
      return sim !== undefined && typeof sim.exportCircuit === "function";
    }, { timeout: 25000 });

    await expect(async () => {
      const circuitAfterReload = await page.evaluate(() => {
        const iframe = document.querySelector('iframe[data-testid="circuit-iframe"]') as HTMLIFrameElement | null;
        const sim = (iframe?.contentWindow as { CircuitJS1?: { exportCircuit: () => string } })?.CircuitJS1;
        return sim?.exportCircuit() || "";
      });
      expect(circuitAfterReload).toContain("1000");
    }).toPass({ timeout: 15000 });
  });

  test("Send to Board button is disabled when only Circuit is open, and becomes enabled when a Board is opened side-by-side", async ({
    page,
  }) => {
    // 1. Navigate to workspace with only Circuit open
    await page.goto(`/workspace?p=${projectId}-dest-check&kind=circuit`);

    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();
    const sendToBoardBtn = page.locator('[data-testid="circuit-send-to-board-btn"]');
    await expect(sendToBoardBtn).toBeVisible();

    // 2. Verify button is disabled and shows appropriate tooltip because no Board tab is open
    await expect(sendToBoardBtn).toBeDisabled();
    await expect(sendToBoardBtn).toHaveAttribute("title", /Open a whiteboard tab to send circuit/i);

    // 3. Add a Board tab via '+' menu
    const addTabBtn = page.locator('[data-testid="add-tab-btn"]');
    await addTabBtn.click();
    await page.locator('[data-testid="add-tab-board"]').click();
    await expect(page.locator(".ws-tab-btn")).toHaveCount(2);

    // 4. Open side-by-side using vertical split view
    const splitVerticalBtn = page.locator('[data-testid="split-vertical-btn"]');
    await expect(splitVerticalBtn).toBeVisible();
    await splitVerticalBtn.click();

    // Verify split layout is active
    await expect(page.locator('.pane[data-slot="secondary"]')).toBeVisible();

    // 5. In side-by-side view, verify Send to Board button is now enabled
    await expect(sendToBoardBtn).toBeEnabled({ timeout: 10000 });
    await expect(sendToBoardBtn).toHaveAttribute("title", /Send to Board/i);
  });
});
