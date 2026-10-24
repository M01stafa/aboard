// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { WorkspaceHost } from "./workspace-host";
import { I18nProvider } from "@/i18n/provider";

// @ts-expect-error React testing flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("Workspace '+' New Tab Menu & Unique Tool Rule", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("opens menu with New Whiteboard, New PDF, New Circuit on clicking '+' button and disables already open tools", async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <WorkspaceHost
            projectId="test-proj"
            initialLayout={{
              tabs: [{ id: "tab-1", kind: "board", itemId: "item-1", title: "Board 1" }],
              tabBarOrder: ["tab-1"],
              primary: "tab-1",
            }}
          />
        </I18nProvider>
      );
    });

    const addBtn = container.querySelector('[data-testid="add-tab-btn"]') as HTMLButtonElement;
    expect(addBtn).toBeTruthy();

    // Menu should initially be closed
    expect(container.querySelector('[data-testid="add-tab-menu"]')).toBeNull();

    // Click '+' button to toggle menu open
    await act(async () => {
      addBtn.click();
    });

    const menu = container.querySelector('[data-testid="add-tab-menu"]');
    expect(menu).toBeTruthy();

    const boardOpt = container.querySelector('[data-testid="add-tab-board"]') as HTMLButtonElement;
    const pdfOpt = container.querySelector('[data-testid="add-tab-pdf"]') as HTMLButtonElement;
    const circuitOpt = container.querySelector('[data-testid="add-tab-circuit"]') as HTMLButtonElement;

    expect(boardOpt).toBeTruthy();
    expect(boardOpt.textContent).toContain("Whiteboard");
    // Board is already open -> disabled
    expect(boardOpt.disabled).toBe(true);
    expect(boardOpt.title).toBeTruthy();

    expect(pdfOpt).toBeTruthy();
    expect(pdfOpt.textContent).toContain("PDF");
    expect(pdfOpt.disabled).toBe(false);

    expect(circuitOpt).toBeTruthy();
    expect(circuitOpt.textContent).toContain("Circuit");
    expect(circuitOpt.disabled).toBe(false);
  });

  it("focuses existing tab instead of creating duplicate if an already open tool is selected", async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <WorkspaceHost
            projectId="test-proj"
            initialLayout={{
              tabs: [{ id: "tab-1", kind: "board", itemId: "item-1", title: "Board 1" }],
              tabBarOrder: ["tab-1"],
              primary: "tab-1",
            }}
          />
        </I18nProvider>
      );
    });

    const addBtn = container.querySelector('[data-testid="add-tab-btn"]') as HTMLButtonElement;
    await act(async () => {
      addBtn.click();
    });

    const boardOpt = container.querySelector('[data-testid="add-tab-board"]') as HTMLButtonElement;
    expect(boardOpt.disabled).toBe(true);

    // When the button's click handler is invoked (e.g. programmatic or accessibility action)
    const reactPropsKey = Object.keys(boardOpt).find((k) => k.startsWith("__reactProps"));
    if (reactPropsKey) {
      await act(async () => {
        // @ts-expect-error accessing internal props
        boardOpt[reactPropsKey]?.onClick?.({ preventDefault: () => {}, stopPropagation: () => {} });
      });
      // Menu closes
      expect(container.querySelector('[data-testid="add-tab-menu"]')).toBeNull();
    }

    // Tab bar still contains exactly 1 tab (no duplicate created)
    const tabButtons = container.querySelectorAll(".ws-tab-btn");
    expect(tabButtons.length).toBe(1);

    const activeTab = container.querySelector('.ws-tab-btn[data-active="true"]');
    expect(activeTab?.textContent).toContain("Board 1");
  });

  it("creates a new circuit tab when New Circuit is clicked and disables both board and circuit afterwards", async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <WorkspaceHost
            projectId="test-proj"
            initialLayout={{
              tabs: [{ id: "tab-1", kind: "board", itemId: "item-1", title: "Board 1" }],
              tabBarOrder: ["tab-1"],
              primary: "tab-1",
            }}
          />
        </I18nProvider>
      );
    });

    const addBtn = container.querySelector('[data-testid="add-tab-btn"]') as HTMLButtonElement;
    await act(async () => {
      addBtn.click();
    });

    const circuitOpt = container.querySelector('[data-testid="add-tab-circuit"]') as HTMLButtonElement;
    await act(async () => {
      circuitOpt.click();
    });

    // Menu closes after selection
    expect(container.querySelector('[data-testid="add-tab-menu"]')).toBeNull();

    // Tab bar now contains 2 tabs
    const tabButtons = container.querySelectorAll(".ws-tab-btn");
    expect(tabButtons.length).toBe(2);

    // The newly created tab is active and has Circuit title
    const activeTab = container.querySelector('.ws-tab-btn[data-active="true"]');
    expect(activeTab?.textContent).toContain("Circuit");

    // Open '+' menu again to verify both Whiteboard and Circuit options are now disabled
    await act(async () => {
      addBtn.click();
    });
    const boardOptAfter = container.querySelector('[data-testid="add-tab-board"]') as HTMLButtonElement;
    const circuitOptAfter = container.querySelector('[data-testid="add-tab-circuit"]') as HTMLButtonElement;
    const pdfOptAfter = container.querySelector('[data-testid="add-tab-pdf"]') as HTMLButtonElement;

    expect(boardOptAfter.disabled).toBe(true);
    expect(circuitOptAfter.disabled).toBe(true);
    expect(pdfOptAfter.disabled).toBe(false);
  });

  it("disables split view buttons when tabs < 2 and enables when tabs >= 2", async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <WorkspaceHost
            projectId="test-proj"
            initialLayout={{
              tabs: [{ id: "tab-1", kind: "board", itemId: "item-1", title: "Board 1" }],
              tabBarOrder: ["tab-1"],
              primary: "tab-1",
            }}
          />
        </I18nProvider>
      );
    });

    const splitVerticalBtn = container.querySelector('[data-testid="split-vertical-btn"]') as HTMLButtonElement;
    const splitHorizontalBtn = container.querySelector('[data-testid="split-horizontal-btn"]') as HTMLButtonElement;
    const swapPanesBtn = container.querySelector('[data-testid="swap-panes-btn"]') as HTMLButtonElement;

    expect(splitVerticalBtn.disabled).toBe(true);
    expect(splitVerticalBtn.title).toContain("Open another tool to split view");
    expect(splitHorizontalBtn.disabled).toBe(true);
    expect(splitHorizontalBtn.title).toContain("Open another tool to split view");
    expect(swapPanesBtn.disabled).toBe(true);

    // Add a second tab (PDF)
    const addBtn = container.querySelector('[data-testid="add-tab-btn"]') as HTMLButtonElement;
    await act(async () => {
      addBtn.click();
    });
    const pdfOpt = container.querySelector('[data-testid="add-tab-pdf"]') as HTMLButtonElement;
    await act(async () => {
      pdfOpt.click();
    });

    // Now with 2 tabs, vertical and horizontal split buttons are enabled
    expect(splitVerticalBtn.disabled).toBe(false);
    expect(splitHorizontalBtn.disabled).toBe(false);
  });

  it("closes menu when Escape key is pressed", async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <WorkspaceHost
            projectId="test-proj"
            initialLayout={{
              tabs: [{ id: "tab-1", kind: "board", itemId: "item-1", title: "Board 1" }],
              tabBarOrder: ["tab-1"],
              primary: "tab-1",
            }}
          />
        </I18nProvider>
      );
    });

    const addBtn = container.querySelector('[data-testid="add-tab-btn"]') as HTMLButtonElement;
    await act(async () => {
      addBtn.click();
    });
    expect(container.querySelector('[data-testid="add-tab-menu"]')).toBeTruthy();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(container.querySelector('[data-testid="add-tab-menu"]')).toBeNull();
  });

  it("closes menu when clicking outside", async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <WorkspaceHost
            projectId="test-proj"
            initialLayout={{
              tabs: [{ id: "tab-1", kind: "board", itemId: "item-1", title: "Board 1" }],
              tabBarOrder: ["tab-1"],
              primary: "tab-1",
            }}
          />
        </I18nProvider>
      );
    });

    const addBtn = container.querySelector('[data-testid="add-tab-btn"]') as HTMLButtonElement;
    await act(async () => {
      addBtn.click();
    });
    expect(container.querySelector('[data-testid="add-tab-menu"]')).toBeTruthy();

    // Click outside on document body
    await act(async () => {
      window.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    expect(container.querySelector('[data-testid="add-tab-menu"]')).toBeNull();
  });
});
