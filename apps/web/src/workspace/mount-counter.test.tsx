// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { WorkspaceHost } from "./workspace-host";
import { I18nProvider } from "@/i18n/provider";

// Mark test environment as supporting React act(...)
// @ts-expect-error React testing flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("WorkspaceHost Mount Counter & DOM Stability (Task 18)", () => {
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

  it("proves each pane mounts exactly once across tab switches, split toggles, pane swaps, and tab closing", async () => {
    const mountCounts: Record<string, number> = {};
    const mountTokens: Record<string, string[]> = {};

    const handlePaneMount = vi.fn((tabId: string, token: string) => {
      mountCounts[tabId] = (mountCounts[tabId] || 0) + 1;
      if (!mountTokens[tabId]) {
        mountTokens[tabId] = [];
      }
      mountTokens[tabId].push(token);
    });

    // 1. Initial Render with 3 tabs: tab-1 (board), tab-2 (circuit/iframe), tab-3 (pdf)
    await act(async () => {
      root.render(
        React.createElement(
          I18nProvider,
          null,
          React.createElement(WorkspaceHost, {
            projectId: "test-project",
            onPaneMount: handlePaneMount,
            initialLayout: {
              tabs: [
                { id: "tab-1", kind: "board", itemId: "item-1", title: "Board 1" },
                {
                  id: "tab-2",
                  kind: "circuit",
                  itemId: "item-2",
                  title: "Circuit 1",
                  isIframe: true,
                },
                { id: "tab-3", kind: "pdf", itemId: "item-3", title: "Document 1" },
              ],
              tabBarOrder: ["tab-1", "tab-2", "tab-3"],
              primary: "tab-1",
              secondary: "tab-2",
              split: "none",
              ratio: 0.5,
            },
          })
        )
      );
    });

    // Verify initial mount counts: each of the 3 panes mounted exactly once
    expect(mountCounts["tab-1"]).toBe(1);
    expect(mountCounts["tab-2"]).toBe(1);
    expect(mountCounts["tab-3"]).toBe(1);

    const initialTokens = {
      "tab-1": mountTokens["tab-1"][0],
      "tab-2": mountTokens["tab-2"][0],
      "tab-3": mountTokens["tab-3"][0],
    };

    // Helper to get DOM pane nodes order in .ws-grid
    const getGridPaneIds = () => {
      const panes = container.querySelectorAll<HTMLElement>(".ws-grid > .pane");
      return Array.from(panes).map((p) => p.getAttribute("data-tab-id"));
    };

    // Initial DOM order must be strictly ["tab-1", "tab-2", "tab-3"]
    expect(getGridPaneIds()).toEqual(["tab-1", "tab-2", "tab-3"]);

    // Helper to click an element by selector
    const clickElement = async (selector: string) => {
      const el = container.querySelector<HTMLElement>(selector);
      if (!el) {
        throw new Error(`Element not found: ${selector}`);
      }
      await act(async () => {
        el.click();
      });
    };

    // 2. Switch tabs 5 times:
    // Switch 1: Click Tab 2
    await clickElement('[data-testid="tab-btn-tab-2"]');
    // Switch 2: Click Tab 3
    await clickElement('[data-testid="tab-btn-tab-3"]');
    // Switch 3: Click Tab 1
    await clickElement('[data-testid="tab-btn-tab-1"]');
    // Switch 4: Click Tab 2
    await clickElement('[data-testid="tab-btn-tab-2"]');
    // Switch 5: Click Tab 3
    await clickElement('[data-testid="tab-btn-tab-3"]');

    // Assert 0 remounts after 5 tab switches
    expect(mountCounts["tab-1"]).toBe(1);
    expect(mountCounts["tab-2"]).toBe(1);
    expect(mountCounts["tab-3"]).toBe(1);
    expect(getGridPaneIds()).toEqual(["tab-1", "tab-2", "tab-3"]);

    // 3. Toggle split 3 times:
    // Split toggle 1: Vertical split
    await clickElement('[data-testid="split-vertical-btn"]');
    // Split toggle 2: Horizontal split
    await clickElement('[data-testid="split-horizontal-btn"]');
    // Split toggle 3: None (single pane)
    await clickElement('[data-testid="split-none-btn"]');

    // Assert 0 remounts after 3 split toggles
    expect(mountCounts["tab-1"]).toBe(1);
    expect(mountCounts["tab-2"]).toBe(1);
    expect(mountCounts["tab-3"]).toBe(1);
    expect(getGridPaneIds()).toEqual(["tab-1", "tab-2", "tab-3"]);

    // 4. Swap panes 2 times:
    // First enter split mode to enable swapping
    await clickElement('[data-testid="split-vertical-btn"]');

    // Swap 1
    await clickElement('[data-testid="swap-panes-btn"]');
    // Swap 2
    await clickElement('[data-testid="swap-panes-btn"]');

    // Assert 0 remounts after 2 pane swaps
    expect(mountCounts["tab-1"]).toBe(1);
    expect(mountCounts["tab-2"]).toBe(1);
    expect(mountCounts["tab-3"]).toBe(1);

    // DOM order in .ws-grid MUST remain unchanged (only CSS grid / data-slot changes)
    expect(getGridPaneIds()).toEqual(["tab-1", "tab-2", "tab-3"]);

    // 5. Close a tab:
    // Close tab-3
    await clickElement('[data-testid="tab-close-tab-3"]');

    // Assert surviving panes tab-1 and tab-2 did NOT remount
    expect(mountCounts["tab-1"]).toBe(1);
    expect(mountCounts["tab-2"]).toBe(1);

    // Assert identity tokens for surviving panes are preserved
    const token1 = container
      .querySelector('[data-pane-id="tab-1"]')
      ?.getAttribute("data-identity-token");
    const token2 = container
      .querySelector('[data-pane-id="tab-2"]')
      ?.getAttribute("data-identity-token");

    expect(token1).toBe(initialTokens["tab-1"]);
    expect(token2).toBe(initialTokens["tab-2"]);

    // Closed pane is unmounted and removed from DOM
    expect(container.querySelector('[data-pane-id="tab-3"]')).toBeNull();
    expect(getGridPaneIds()).toEqual(["tab-1", "tab-2"]);
  });
});
