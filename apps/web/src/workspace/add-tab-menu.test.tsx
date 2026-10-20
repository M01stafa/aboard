// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { WorkspaceHost } from "./workspace-host";
import { I18nProvider } from "@/i18n/provider";

// @ts-expect-error React testing flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("Workspace '+' New Tab Menu", () => {
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

  it("opens menu with New Whiteboard, New PDF, New Circuit on clicking '+' button", async () => {
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

    expect(pdfOpt).toBeTruthy();
    expect(pdfOpt.textContent).toContain("PDF");

    expect(circuitOpt).toBeTruthy();
    expect(circuitOpt.textContent).toContain("Circuit");
  });

  it("creates a new whiteboard tab when New Whiteboard is clicked", async () => {
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
    await act(async () => {
      boardOpt.click();
    });

    // Menu closes after selection
    expect(container.querySelector('[data-testid="add-tab-menu"]')).toBeNull();

    // Tab bar now contains 2 tabs
    const tabButtons = container.querySelectorAll('.ws-tab-btn');
    expect(tabButtons.length).toBe(2);

    // The newly created tab is selected and has Whiteboard title
    const activeTab = container.querySelector('.ws-tab-btn[data-active="true"]');
    expect(activeTab?.textContent).toContain("Whiteboard");
  });

  it("creates a new circuit tab when New Circuit is clicked", async () => {
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
    const tabButtons = container.querySelectorAll('.ws-tab-btn');
    expect(tabButtons.length).toBe(2);

    // The newly created tab is active and has Circuit title
    const activeTab = container.querySelector('.ws-tab-btn[data-active="true"]');
    expect(activeTab?.textContent).toContain("Circuit");
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
});
