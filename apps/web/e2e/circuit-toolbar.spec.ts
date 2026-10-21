import { test, expect } from "@playwright/test";
import { mockSignIn } from "./helpers/auth";

test.describe("Circuit Simulator Custom Toolbar (Task 42 / CIRC-5)", () => {
  const testUserId = "test-circuit-toolbar-user";
  const projectId = "circuit-toolbar-e2e-project";

  test.beforeEach(async ({ page }) => {
    await mockSignIn(page, {
      id: testUserId,
      email: "circuit.student@example.com",
    });
  });

  test("interacts with custom toolbar actions: Run/Pause, Reset, Speed, Component Palette, and Advanced Menu toggle", async ({
    page,
  }) => {
    // 1. Navigate to workspace with circuit tool
    await page.goto(`/workspace?p=${projectId}&kind=circuit`);

    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();

    const primaryPane = page.locator('.pane[data-slot="primary"]');
    const circuitPane = primaryPane.locator('[data-testid^="pane-circuit-"]');
    await expect(circuitPane).toBeVisible();

    // 2. Verify custom toolbar renders
    const toolbar = circuitPane.locator('[data-testid="circuit-toolbar"]');
    await expect(toolbar).toBeVisible();

    const runPauseBtn = toolbar.locator('[data-testid="circuit-run-pause-btn"]');
    const resetBtn = toolbar.locator('[data-testid="circuit-reset-btn"]');
    const speedBtn = toolbar.locator('[data-testid="circuit-speed-dropdown-btn"]');
    const paletteBtn = toolbar.locator('[data-testid="circuit-palette-btn"]');
    const advancedBtn = toolbar.locator('[data-testid="circuit-advanced-toggle-btn"]');

    await expect(runPauseBtn).toBeVisible();
    await expect(resetBtn).toBeVisible();
    await expect(speedBtn).toBeVisible();
    await expect(paletteBtn).toBeVisible();
    await expect(advancedBtn).toBeVisible();

    // 3. Wait for CircuitJS1 simulator API to attach inside the iframe
    await page.waitForFunction(() => {
      const iframe = document.querySelector('iframe[data-testid="circuit-iframe"]') as HTMLIFrameElement | null;
      const sim = (iframe?.contentWindow as {
        CircuitJS1?: {
          isRunning?: () => boolean;
          setSimRunning?: (run: boolean) => void;
          getMaxTimeStep?: () => number;
          getElements?: () => unknown[];
        };
      })?.CircuitJS1;
      return (
        sim !== undefined &&
        typeof sim.isRunning === "function" &&
        Array.isArray(sim.getElements?.()) &&
        (sim.getElements?.().length ?? 0) > 0
      );
    }, { timeout: 25000 });

    // 4. Test Run / Pause toggle:
    // Initial state is running
    await expect(runPauseBtn).toContainText("Pause");

    // Click Pause
    await runPauseBtn.click();
    await expect(runPauseBtn).toContainText("Run");

    // Verify simulation is paused in simulator
    const isPausedInSim = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[data-testid="circuit-iframe"]') as HTMLIFrameElement | null;
      const sim = (iframe?.contentWindow as { CircuitJS1?: { isRunning?: () => boolean } })?.CircuitJS1;
      return sim?.isRunning?.();
    });
    expect(isPausedInSim).toBe(false);

    // Click Run to resume
    await runPauseBtn.click();
    await expect(runPauseBtn).toContainText("Pause");
    const isRunningInSim = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[data-testid="circuit-iframe"]') as HTMLIFrameElement | null;
      const sim = (iframe?.contentWindow as { CircuitJS1?: { isRunning?: () => boolean } })?.CircuitJS1;
      return sim?.isRunning?.();
    });
    expect(isRunningInSim).toBe(true);

    // 5. Test Reset action
    await resetBtn.click();
    await expect(runPauseBtn).toContainText("Pause");

    // 6. Test Speed dropdown
    await speedBtn.click();
    const speedMenu = toolbar.locator('[data-testid="circuit-speed-menu"]');
    await expect(speedMenu).toBeVisible();

    const fastSpeedBtn = speedMenu.locator('[data-testid="circuit-speed-fast-btn"]');
    await fastSpeedBtn.click();
    await expect(speedMenu).not.toBeVisible();
    await expect(speedBtn).toContainText("Fast");

    // Verify timestep adjusted in simulator
    const maxTimeStep = await page.evaluate(() => {
      const iframe = document.querySelector('iframe[data-testid="circuit-iframe"]') as HTMLIFrameElement | null;
      const sim = (iframe?.contentWindow as { CircuitJS1?: { getMaxTimeStep?: () => number } })?.CircuitJS1;
      return sim?.getMaxTimeStep?.();
    });
    expect(maxTimeStep).toBeGreaterThan(1e-5);

    // 7. Test Component Palette selection
    await paletteBtn.click();
    const paletteDropdown = toolbar.locator('[data-testid="circuit-palette-dropdown"]');
    await expect(paletteDropdown).toBeVisible();

    // Select Resistor
    const resistorBtn = paletteDropdown.locator('[data-testid="circuit-comp-resistor-btn"]');
    await expect(resistorBtn).toBeVisible();
    await resistorBtn.click();

    // Verify dropdown closed and active tool badge appeared
    await expect(paletteDropdown).not.toBeVisible();
    const activeToolBadge = toolbar.locator('[data-testid="circuit-active-tool-badge"]');
    await expect(activeToolBadge).toBeVisible();
    await expect(activeToolBadge).toContainText("Resistor");

    // 8. Test Advanced Menu toggle cycle:
    // Click Advanced button in toolbar
    await advancedBtn.click();

    // Toolbar is hidden
    await expect(toolbar).not.toBeVisible();

    // Verify iframe reloads with hideMenu=false (native menu visible)
    const iframe = circuitPane.locator('iframe[data-testid="circuit-iframe"]');
    await expect(iframe).toHaveAttribute("src", /hideMenu=false/);

    // In the header strip, the return button is visible
    const returnBtn = circuitPane.locator('[data-testid="circuit-pane-header"] [data-testid="circuit-advanced-toggle-btn"]');
    await expect(returnBtn).toBeVisible();

    // Wait for iframe to reload with simulator attached
    await page.waitForFunction(() => {
      const frame = document.querySelector('iframe[data-testid="circuit-iframe"]') as HTMLIFrameElement | null;
      const sim = (frame?.contentWindow as {
        CircuitJS1?: {
          getElements?: () => unknown[];
        };
      })?.CircuitJS1;
      return sim !== undefined && (sim.getElements?.().length ?? 0) > 0;
    }, { timeout: 25000 });

    // Click return button to restore custom toolbar
    await returnBtn.click();

    // Verify toolbar is restored
    await expect(toolbar).toBeVisible();
    await expect(iframe).toHaveAttribute("src", /hideMenu=true/);
  });
});
