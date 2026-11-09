// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { WorkspaceHost } from "./workspace-host";
import { I18nProvider } from "@/i18n/provider";
import { bus } from "@/core/bus";

// @ts-expect-error React testing flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("Workspace Layout Management (No Auto-Split, No Tab Swapping, Preserve Split State)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it("Requirement 1: Send to Board does NOT auto-split the layout and inserts silently in the background", async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <WorkspaceHost
            projectId="test-no-auto-split"
            initialLayout={{
              tabs: [
                { id: "tab-circuit", kind: "circuit", itemId: "item-circuit", title: "Circuit 1" },
                { id: "tab-board", kind: "board", itemId: "item-board", title: "Board 1" },
              ],
              tabBarOrder: ["tab-circuit", "tab-board"],
              primary: "tab-circuit",
              secondary: null,
              split: "none",
            }}
          />
        </I18nProvider>
      );
    });

    const grid = container.querySelector('[data-testid="ws-grid"]');
    expect(grid).toBeTruthy();
    expect(grid?.getAttribute("data-split")).toBe("none");

    // Emit circuit:to-board
    await act(async () => {
      bus.emit("circuit:to-board", {
        circuitItemId: "item-circuit",
        svg: "<svg></svg>",
        sourceTabId: "tab-circuit",
        targetBoardTabId: "tab-board",
      });
    });

    // Layout MUST remain split="none" (no auto-splitting!)
    expect(grid?.getAttribute("data-split")).toBe("none");
    const circuitPane = container.querySelector('[data-testid="pane-slot-tab-circuit"]');
    expect(circuitPane?.getAttribute("data-slot")).toBe("primary");
  });

  it("Requirement 2: Clicking secondary tab in split view updates active focus without swapping left/right pane positions", async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <WorkspaceHost
            projectId="test-no-swap"
            initialLayout={{
              tabs: [
                { id: "tab-board", kind: "board", itemId: "item-board", title: "Board 1" },
                { id: "tab-pdf", kind: "pdf", itemId: "item-pdf", title: "PDF 1" },
              ],
              tabBarOrder: ["tab-board", "tab-pdf"],
              primary: "tab-board",
              secondary: "tab-pdf",
              split: "vertical",
            }}
          />
        </I18nProvider>
      );
    });

    const grid = container.querySelector('[data-testid="ws-grid"]');
    expect(grid?.getAttribute("data-split")).toBe("vertical");

    const boardPane = container.querySelector('[data-testid="pane-slot-tab-board"]');
    const pdfPane = container.querySelector('[data-testid="pane-slot-tab-pdf"]');

    // Initially: Board is primary (left), PDF is secondary (right)
    expect(boardPane?.getAttribute("data-slot")).toBe("primary");
    expect(pdfPane?.getAttribute("data-slot")).toBe("secondary");

    const boardTabBtn = container.querySelector('[data-testid="tab-btn-tab-board"]');
    const pdfTabBtn = container.querySelector('[data-testid="tab-btn-tab-pdf"]');

    expect(boardTabBtn?.getAttribute("data-active")).toBe("true");
    expect(pdfTabBtn?.getAttribute("data-active")).toBe("false");

    // Click PDF tab button
    await act(async () => {
      (pdfTabBtn as HTMLElement).click();
    });

    // PANE POSITIONS MUST NOT SWAP! Board is still primary (left), PDF is still secondary (right)
    expect(boardPane?.getAttribute("data-slot")).toBe("primary");
    expect(pdfPane?.getAttribute("data-slot")).toBe("secondary");

    // Active tab indicator must switch to PDF
    expect(pdfTabBtn?.getAttribute("data-active")).toBe("true");
    expect(boardTabBtn?.getAttribute("data-active")).toBe("false");
    expect(boardTabBtn?.getAttribute("data-secondary")).toBe("true");
  });

  it("Requirement 3: Opening/activating a 3rd tab occupies full-screen, and clicking back on split tab restores split view with exact pane placement", async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <WorkspaceHost
            projectId="test-split-restore"
            initialLayout={{
              tabs: [
                { id: "tab-board", kind: "board", itemId: "item-board", title: "Board 1" },
                { id: "tab-pdf", kind: "pdf", itemId: "item-pdf", title: "PDF 1" },
                { id: "tab-circuit", kind: "circuit", itemId: "item-circuit", title: "Circuit 1" },
              ],
              tabBarOrder: ["tab-board", "tab-pdf", "tab-circuit"],
              primary: "tab-board",
              secondary: "tab-pdf",
              split: "vertical",
            }}
          />
        </I18nProvider>
      );
    });

    const grid = container.querySelector('[data-testid="ws-grid"]');
    expect(grid?.getAttribute("data-split")).toBe("vertical");

    const boardPane = container.querySelector('[data-testid="pane-slot-tab-board"]');
    const pdfPane = container.querySelector('[data-testid="pane-slot-tab-pdf"]');
    const circuitPane = container.querySelector('[data-testid="pane-slot-tab-circuit"]');

    expect(boardPane?.getAttribute("data-slot")).toBe("primary");
    expect(pdfPane?.getAttribute("data-slot")).toBe("secondary");
    expect(circuitPane?.getAttribute("data-slot")).toBe("hidden");

    const circuitTabBtn = container.querySelector('[data-testid="tab-btn-tab-circuit"]');
    const boardTabBtn = container.querySelector('[data-testid="tab-btn-tab-board"]');
    const pdfTabBtn = container.querySelector('[data-testid="tab-btn-tab-pdf"]');

    // 1. Click 3rd tab (Circuit): it must occupy main view (full screen, split="none")
    await act(async () => {
      (circuitTabBtn as HTMLElement).click();
    });

    expect(grid?.getAttribute("data-split")).toBe("none");
    expect(circuitPane?.getAttribute("data-slot")).toBe("primary");
    expect(boardPane?.getAttribute("data-slot")).toBe("hidden");
    expect(pdfPane?.getAttribute("data-slot")).toBe("hidden");
    expect(circuitTabBtn?.getAttribute("data-active")).toBe("true");

    // 2. Click back on PDF (one of the original split tabs): MUST restore the split view!
    await act(async () => {
      (pdfTabBtn as HTMLElement).click();
    });

    // Restores split="vertical", Board on left (primary), PDF on right (secondary)
    expect(grid?.getAttribute("data-split")).toBe("vertical");
    expect(boardPane?.getAttribute("data-slot")).toBe("primary");
    expect(pdfPane?.getAttribute("data-slot")).toBe("secondary");
    expect(circuitPane?.getAttribute("data-slot")).toBe("hidden");
    expect(pdfTabBtn?.getAttribute("data-active")).toBe("true");

    // 3. Click back on Circuit again
    await act(async () => {
      (circuitTabBtn as HTMLElement).click();
    });
    expect(grid?.getAttribute("data-split")).toBe("none");
    expect(circuitPane?.getAttribute("data-slot")).toBe("primary");

    // 4. Click back on Board: MUST restore the exact split view again!
    await act(async () => {
      (boardTabBtn as HTMLElement).click();
    });
    expect(grid?.getAttribute("data-split")).toBe("vertical");
    expect(boardPane?.getAttribute("data-slot")).toBe("primary");
    expect(pdfPane?.getAttribute("data-slot")).toBe("secondary");
    expect(circuitPane?.getAttribute("data-slot")).toBe("hidden");
    expect(boardTabBtn?.getAttribute("data-active")).toBe("true");
  });
});

