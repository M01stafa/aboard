// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CircuitPane } from "./circuit-pane";
import { I18nProvider } from "@/i18n/provider";
import { projectService } from "@/core/storage";
import type { CircuitJS1Api } from "./types";

// @ts-expect-error React testing flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function createMockSim(): CircuitJS1Api {
  let running = true;
  let circuit = "$ 1 0.000005 10 50 5 0.5";
  return {
    setSimRunning: vi.fn((r: boolean) => {
      running = r;
    }),
    isRunning: vi.fn(() => running),
    getTime: vi.fn(() => 0),
    getTimeStep: vi.fn(() => 5e-6),
    setTimeStep: vi.fn(),
    getMaxTimeStep: vi.fn(() => 1e-5),
    setMaxTimeStep: vi.fn(),
    getNodeVoltage: vi.fn(() => 0),
    setExtVoltage: vi.fn(),
    getElements: vi.fn(() => []),
    getCircuitAsSVG: vi.fn(),
    exportCircuit: vi.fn(() => circuit),
    importCircuit: vi.fn((t: string) => {
      circuit = t;
    }),
    onupdate: null,
    ontimestep: null,
    onanalyze: null,
    onsvgrendered: null,
  };
}

describe("CircuitPane Component (Task 24 / CIRC-1, CIRC-2, CIRC-3, CIRC-4)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("renders iframe with required parameters including theme colors", async () => {
    await act(async () => {
      root.render(
        React.createElement(
          I18nProvider,
          null,
          React.createElement(CircuitPane, {
            projectId: "test-proj",
            tab: { id: "tab-circuit-1", kind: "circuit", itemId: "item-1", title: "My Circuit" },
            visible: true,
          })
        )
      );
    });

    const iframe = container.querySelector<HTMLIFrameElement>('iframe[data-testid="circuit-iframe"]');
    expect(iframe).toBeTruthy();
    const src = iframe?.getAttribute("src") || "";

    // Required parameters per spec §7.2
    expect(src).toContain("/circuit/circuitjs.html");
    expect(src).toContain("hideMenu=false");
    expect(src).toContain("hideSidebar=false");
    expect(src).toContain("hideInfoBox=false");
    expect(src).toContain("whiteBackground=true"); // light theme default
    expect(src).toContain("selectColor=%234F9ED5"); // tech blue
    expect(src).toContain("running=true");
    expect(src).toContain("editable=true");
  });

  it("attaches adapter on iframe load and auto-saves on analyze event", async () => {
    const saveSpy = vi.spyOn(projectService, "saveCircuit").mockImplementation(async () => {});
    const mockSim = createMockSim();

    await act(async () => {
      root.render(
        React.createElement(
          I18nProvider,
          null,
          React.createElement(CircuitPane, {
            projectId: "test-proj",
            tab: { id: "tab-c1", kind: "circuit", itemId: "item-c1", title: "Test Circuit" },
            visible: true,
          })
        )
      );
    });

    const iframe = container.querySelector<HTMLIFrameElement>('iframe[data-testid="circuit-iframe"]');
    expect(iframe).toBeTruthy();

    // Mock contentWindow on the iframe
    const mockContentWindow = {
      CircuitJS1: mockSim,
    } as unknown as Window;
    Object.defineProperty(iframe, "contentWindow", {
      value: mockContentWindow,
      writable: true,
    });

    // Simulate iframe load event
    await act(async () => {
      iframe?.dispatchEvent(new Event("load"));
    });

    // Trigger onanalyze from the simulator
    expect(typeof mockSim.onanalyze).toBe("function");
    await act(async () => {
      mockSim.onanalyze!(mockSim);
    });

    // Verify auto-save was routed through ProjectService
    expect(saveSpy).toHaveBeenCalledWith(
      "test-proj",
      "item-c1",
      "$ 1 0.000005 10 50 5 0.5",
      "Test Circuit"
    );

    saveSpy.mockRestore();
  });

  it("implements pause-when-hidden option (CIRC-4) when pane visibility toggles", async () => {
    const mockSim = createMockSim();

    const renderPane = async (visible: boolean, pauseDefault: boolean) => {
      await act(async () => {
        root.render(
          React.createElement(
            I18nProvider,
            null,
            React.createElement(CircuitPane, {
              projectId: "test-proj",
              tab: { id: "tab-c2", kind: "circuit", itemId: "item-c2", title: "Pause Test" },
              visible,
              pauseWhenHiddenDefault: pauseDefault,
            })
          )
        );
      });
    };

    // 1. Initial render visible with pauseWhenHidden enabled
    await renderPane(true, true);
    const iframe = container.querySelector<HTMLIFrameElement>('iframe[data-testid="circuit-iframe"]');

    Object.defineProperty(iframe, "contentWindow", {
      value: { CircuitJS1: mockSim },
      writable: true,
    });

    await act(async () => {
      iframe?.dispatchEvent(new Event("load"));
    });

    expect(mockSim.isRunning()).toBe(true);

    // 2. Hide pane -> simulator should be paused
    await renderPane(false, true);
    expect(mockSim.setSimRunning).toHaveBeenCalledWith(false);

    // 3. Show pane -> simulator should resume running
    await renderPane(true, true);
    expect(mockSim.setSimRunning).toHaveBeenCalledWith(true);
  });
});
