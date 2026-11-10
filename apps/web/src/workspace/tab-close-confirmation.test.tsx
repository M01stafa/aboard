// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { WorkspaceHost } from "./workspace-host";
import { I18nProvider } from "@/i18n/provider";
import { saveQueue } from "@/core/storage";
import { bus } from "@/core/bus";

// @ts-expect-error React testing flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("Tab Close Confirmation on Unsaved Changes", () => {
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

  it("ALWAYS shows confirmation dialog when closing a Circuit tab, regardless of save status", async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <WorkspaceHost
            projectId="test-proj"
            initialLayout={{
              tabs: [
                { id: "tab-1", kind: "board", itemId: "item-1", title: "Board 1" },
                { id: "tab-2", kind: "circuit", itemId: "item-2", title: "Circuit 1" },
              ],
              tabBarOrder: ["tab-1", "tab-2"],
              primary: "tab-2",
            }}
          />
        </I18nProvider>
      );
    });

    // Verify 2 tabs present
    let tabButtons = container.querySelectorAll(".ws-tab-btn");
    expect(tabButtons.length).toBe(2);

    const closeBtnCircuit = container.querySelector(
      '[data-testid="tab-close-tab-2"]'
    ) as HTMLElement;
    expect(closeBtnCircuit).toBeTruthy();

    // Click close on Circuit tab
    await act(async () => {
      closeBtnCircuit.click();
    });

    // Dialog must appear
    const dialog = container.querySelector('[data-testid="discard-changes-dialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog?.textContent).toContain("Discard changes?");

    // Click Cancel
    const cancelBtn = container.querySelector(
      '[data-testid="discard-changes-cancel-btn"]'
    ) as HTMLButtonElement;
    expect(cancelBtn).toBeTruthy();

    await act(async () => {
      cancelBtn.click();
    });

    // Dialog closed, Circuit tab still exists
    expect(container.querySelector('[data-testid="discard-changes-dialog"]')).toBeNull();
    tabButtons = container.querySelectorAll(".ws-tab-btn");
    expect(tabButtons.length).toBe(2);

    // Re-trigger and click Discard
    await act(async () => {
      closeBtnCircuit.click();
    });

    const confirmBtn = container.querySelector(
      '[data-testid="discard-changes-confirm-btn"]'
    ) as HTMLButtonElement;
    expect(confirmBtn).toBeTruthy();

    await act(async () => {
      confirmBtn.click();
    });

    // Dialog closed, Circuit tab is removed
    expect(container.querySelector('[data-testid="discard-changes-dialog"]')).toBeNull();
    tabButtons = container.querySelectorAll(".ws-tab-btn");
    expect(tabButtons.length).toBe(1);
    expect(tabButtons[0]?.textContent).toContain("Board 1");
  });

  it("closes clean/empty Board and PDF tabs immediately without confirmation dialog", async () => {
    // Ensure saveQueue reports clean
    vi.spyOn(saveQueue, "hasPending").mockReturnValue(false);
    vi.spyOn(saveQueue, "isDirty").mockReturnValue(false);
    vi.spyOn(saveQueue, "getStatus").mockReturnValue("saved-local");

    await act(async () => {
      root.render(
        <I18nProvider>
          <WorkspaceHost
            projectId="test-proj"
            initialLayout={{
              tabs: [
                { id: "tab-1", kind: "board", itemId: "item-1", title: "Board 1" },
                { id: "tab-2", kind: "pdf", itemId: "item-2", title: "PDF 1" },
              ],
              tabBarOrder: ["tab-1", "tab-2"],
              primary: "tab-1",
            }}
          />
        </I18nProvider>
      );
    });

    const closeBtnPdf = container.querySelector(
      '[data-testid="tab-close-tab-2"]'
    ) as HTMLElement;
    expect(closeBtnPdf).toBeTruthy();

    // Click close on clean PDF tab
    await act(async () => {
      closeBtnPdf.click();
    });

    // Dialog must NOT appear, tab must close immediately
    expect(container.querySelector('[data-testid="discard-changes-dialog"]')).toBeNull();
    const tabButtons = container.querySelectorAll(".ws-tab-btn");
    expect(tabButtons.length).toBe(1);
    expect(tabButtons[0]?.textContent).toContain("Board 1");
  });

  it("shows confirmation dialog when closing a Board tab with unsaved/pending changes in SaveQueue", async () => {
    // Mock saveQueue having pending write for tab-1 (item-1)
    vi.spyOn(saveQueue, "hasPending").mockImplementation((_proj, itemId) => {
      return itemId === "item-1";
    });
    const cancelPendingSpy = vi.spyOn(saveQueue, "cancelPending");

    await act(async () => {
      root.render(
        <I18nProvider>
          <WorkspaceHost
            projectId="test-proj"
            initialLayout={{
              tabs: [
                { id: "tab-1", kind: "board", itemId: "item-1", title: "Dirty Board" },
                { id: "tab-2", kind: "pdf", itemId: "item-2", title: "PDF 1" },
              ],
              tabBarOrder: ["tab-1", "tab-2"],
              primary: "tab-1",
            }}
          />
        </I18nProvider>
      );
    });

    const closeBtnBoard = container.querySelector(
      '[data-testid="tab-close-tab-1"]'
    ) as HTMLElement;
    expect(closeBtnBoard).toBeTruthy();

    // Click close on dirty board
    await act(async () => {
      closeBtnBoard.click();
    });

    // Dialog must appear
    expect(container.querySelector('[data-testid="discard-changes-dialog"]')).toBeTruthy();

    // Confirm Discard
    const confirmBtn = container.querySelector(
      '[data-testid="discard-changes-confirm-btn"]'
    ) as HTMLButtonElement;

    await act(async () => {
      confirmBtn.click();
    });

    // Pending write should be cancelled in saveQueue and tab closed
    expect(cancelPendingSpy).toHaveBeenCalledWith("test-proj", "item-1");
    expect(container.querySelector('[data-testid="discard-changes-dialog"]')).toBeNull();
    const tabButtons = container.querySelectorAll(".ws-tab-btn");
    expect(tabButtons.length).toBe(1);
    expect(tabButtons[0]?.textContent).toContain("PDF 1");
  });

  it("supports keyboard accessibility: Esc to cancel and Enter to confirm discard", async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <WorkspaceHost
            projectId="test-proj"
            initialLayout={{
              tabs: [
                { id: "tab-1", kind: "board", itemId: "item-1", title: "Board 1" },
                { id: "tab-2", kind: "circuit", itemId: "item-2", title: "Circuit 1" },
              ],
              tabBarOrder: ["tab-1", "tab-2"],
              primary: "tab-2",
            }}
          />
        </I18nProvider>
      );
    });

    const closeBtnCircuit = container.querySelector(
      '[data-testid="tab-close-tab-2"]'
    ) as HTMLElement;

    // 1. Open dialog and test Escape key
    await act(async () => {
      closeBtnCircuit.click();
    });
    expect(container.querySelector('[data-testid="discard-changes-dialog"]')).toBeTruthy();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(container.querySelector('[data-testid="discard-changes-dialog"]')).toBeNull();
    expect(container.querySelectorAll(".ws-tab-btn").length).toBe(2);

    // 2. Open dialog and test Enter key to confirm discard
    await act(async () => {
      closeBtnCircuit.click();
    });
    expect(container.querySelector('[data-testid="discard-changes-dialog"]')).toBeTruthy();

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    });
    expect(container.querySelector('[data-testid="discard-changes-dialog"]')).toBeNull();
    expect(container.querySelectorAll(".ws-tab-btn").length).toBe(1);
  });

  it("shows confirmation dialog immediately when Board is marked dirty via event before SaveQueue debounces", async () => {
    // Ensure saveQueue reports clean
    vi.spyOn(saveQueue, "hasPending").mockReturnValue(false);
    vi.spyOn(saveQueue, "isDirty").mockReturnValue(false);
    vi.spyOn(saveQueue, "getStatus").mockReturnValue("saved-local");

    await act(async () => {
      root.render(
        <I18nProvider>
          <WorkspaceHost
            projectId="test-proj"
            initialLayout={{
              tabs: [
                { id: "tab-1", kind: "board", itemId: "item-1", title: "Board 1" },
                { id: "tab-2", kind: "pdf", itemId: "item-2", title: "PDF 1" },
              ],
              tabBarOrder: ["tab-1", "tab-2"],
              primary: "tab-1",
            }}
          />
        </I18nProvider>
      );
    });

    // Mark Board immediately dirty before debounce
    await act(async () => {
      bus.emit("tab:dirty-state", { tabId: "tab-1", itemId: "item-1", isDirty: true });
    });

    const closeBtnBoard = container.querySelector(
      '[data-testid="tab-close-tab-1"]'
    ) as HTMLElement;
    expect(closeBtnBoard).toBeTruthy();

    await act(async () => {
      closeBtnBoard.click();
    });

    // Dialog must appear because of immediate dirty state
    expect(container.querySelector('[data-testid="discard-changes-dialog"]')).toBeTruthy();

    // Confirm discard
    const confirmBtn = container.querySelector(
      '[data-testid="discard-changes-confirm-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      confirmBtn.click();
    });

    expect(container.querySelector('[data-testid="discard-changes-dialog"]')).toBeNull();
    const tabButtons = container.querySelectorAll(".ws-tab-btn");
    expect(tabButtons.length).toBe(1);
    expect(tabButtons[0]?.textContent).toContain("PDF 1");
  });

  it("shows confirmation dialog immediately when PDF is marked dirty via event before SaveQueue debounces", async () => {
    // Ensure saveQueue reports clean
    vi.spyOn(saveQueue, "hasPending").mockReturnValue(false);
    vi.spyOn(saveQueue, "isDirty").mockReturnValue(false);
    vi.spyOn(saveQueue, "getStatus").mockReturnValue("saved-local");

    await act(async () => {
      root.render(
        <I18nProvider>
          <WorkspaceHost
            projectId="test-proj"
            initialLayout={{
              tabs: [
                { id: "tab-1", kind: "board", itemId: "item-1", title: "Board 1" },
                { id: "tab-2", kind: "pdf", itemId: "item-2", title: "PDF 2" },
              ],
              tabBarOrder: ["tab-1", "tab-2"],
              primary: "tab-1",
            }}
          />
        </I18nProvider>
      );
    });

    // Mark PDF immediately dirty before debounce
    await act(async () => {
      bus.emit("tab:dirty-state", { tabId: "tab-2", itemId: "item-2", isDirty: true });
    });

    const closeBtnPdf = container.querySelector(
      '[data-testid="tab-close-tab-2"]'
    ) as HTMLElement;
    expect(closeBtnPdf).toBeTruthy();

    await act(async () => {
      closeBtnPdf.click();
    });

    // Dialog must appear
    expect(container.querySelector('[data-testid="discard-changes-dialog"]')).toBeTruthy();
  });

  it("saves updated layout and flushes when one of multiple tabs is closed", async () => {
    const { projectService: defaultProjectService } = await import("@/core/storage");
    const saveLayoutSpy = vi.spyOn(defaultProjectService, "saveLayout").mockResolvedValue(undefined);
    const flushNowSpy = vi.spyOn(defaultProjectService, "flushNow").mockResolvedValue(undefined);

    await act(async () => {
      root.render(
        <I18nProvider>
          <WorkspaceHost
            projectId="test-proj-layout"
            initialLayout={{
              tabs: [
                { id: "tab-1", kind: "board", itemId: "item-1", title: "Board 1" },
                { id: "tab-2", kind: "pdf", itemId: "item-2", title: "PDF 2" },
              ],
              tabBarOrder: ["tab-1", "tab-2"],
              primary: "tab-1",
            }}
          />
        </I18nProvider>
      );
    });

    const closeBtnPdf = container.querySelector(
      '[data-testid="tab-close-tab-2"]'
    ) as HTMLElement;
    expect(closeBtnPdf).toBeTruthy();

    await act(async () => {
      closeBtnPdf.click();
    });

    expect(saveLayoutSpy).toHaveBeenCalledWith("test-proj-layout", {
      tabs: ["item-1"],
      split: "none",
    });
    expect(flushNowSpy).toHaveBeenCalled();
  });

  it("redirects to launcher when closing the last remaining tab", async () => {
    const onNavigateHome = vi.fn();
    const { projectService: defaultProjectService } = await import("@/core/storage");
    const saveLayoutSpy = vi.spyOn(defaultProjectService, "saveLayout").mockResolvedValue(undefined);
    const flushNowSpy = vi.spyOn(defaultProjectService, "flushNow").mockResolvedValue(undefined);

    await act(async () => {
      root.render(
        <I18nProvider>
          <WorkspaceHost
            projectId="test-proj-last"
            onNavigateHome={onNavigateHome}
            initialLayout={{
              tabs: [
                { id: "tab-1", kind: "board", itemId: "item-1", title: "Board 1" },
              ],
              tabBarOrder: ["tab-1"],
              primary: "tab-1",
            }}
          />
        </I18nProvider>
      );
    });

    const closeBtn = container.querySelector(
      '[data-testid="tab-close-tab-1"]'
    ) as HTMLElement;
    expect(closeBtn).toBeTruthy();

    await act(async () => {
      closeBtn.click();
    });

    expect(saveLayoutSpy).toHaveBeenCalledWith("test-proj-last", {
      tabs: ["item-1"],
      split: "none",
    });
    expect(flushNowSpy).toHaveBeenCalled();
    expect(onNavigateHome).toHaveBeenCalledTimes(1);
  });

  it("shows confirmation when closing last dirty tab and redirects on discard", async () => {
    const onNavigateHome = vi.fn();
    const { projectService: defaultProjectService } = await import("@/core/storage");
    vi.spyOn(defaultProjectService, "saveLayout").mockResolvedValue(undefined);
    vi.spyOn(defaultProjectService, "flushNow").mockResolvedValue(undefined);

    await act(async () => {
      root.render(
        <I18nProvider>
          <WorkspaceHost
            projectId="test-proj-dirty-last"
            onNavigateHome={onNavigateHome}
            initialLayout={{
              tabs: [
                { id: "tab-1", kind: "circuit", itemId: "item-1", title: "Circuit 1" },
              ],
              tabBarOrder: ["tab-1"],
              primary: "tab-1",
            }}
          />
        </I18nProvider>
      );
    });

    const closeBtn = container.querySelector(
      '[data-testid="tab-close-tab-1"]'
    ) as HTMLElement;
    expect(closeBtn).toBeTruthy();

    // Circuit tab close prompts confirmation
    await act(async () => {
      closeBtn.click();
    });

    const dialog = container.querySelector('[data-testid="discard-changes-dialog"]');
    expect(dialog).toBeTruthy();
    expect(onNavigateHome).not.toHaveBeenCalled();

    // Confirm discard
    const confirmBtn = container.querySelector(
      '[data-testid="discard-changes-confirm-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      confirmBtn.click();
    });

    expect(onNavigateHome).toHaveBeenCalledTimes(1);
  });

  it("resets dirty state when SaveQueue publishes saved-local, allowing tab to close without prompt", async () => {
    vi.spyOn(saveQueue, "hasPending").mockReturnValue(false);
    vi.spyOn(saveQueue, "isDirty").mockReturnValue(false);
    vi.spyOn(saveQueue, "getStatus").mockReturnValue("saved-local");

    await act(async () => {
      root.render(
        <I18nProvider>
          <WorkspaceHost
            projectId="test-proj"
            initialLayout={{
              tabs: [
                { id: "tab-1", kind: "board", itemId: "item-1", title: "Board 1" },
                { id: "tab-2", kind: "pdf", itemId: "item-2", title: "PDF 1" },
              ],
              tabBarOrder: ["tab-1", "tab-2"],
              primary: "tab-1",
            }}
          />
        </I18nProvider>
      );
    });

    // Mark Board dirty
    await act(async () => {
      bus.emit("tab:dirty-state", { tabId: "tab-1", itemId: "item-1", isDirty: true });
    });

    // Simulate save completion (SaveQueue status updates to saved-local)
    await act(async () => {
      // @ts-expect-error test simulation
      saveQueue.listeners?.forEach((fn: (s: string) => void) => fn("saved-local"));
    });

    const closeBtnBoard = container.querySelector(
      '[data-testid="tab-close-tab-1"]'
    ) as HTMLElement;
    expect(closeBtnBoard).toBeTruthy();

    await act(async () => {
      closeBtnBoard.click();
    });

    // Dialog must NOT appear because isDirty was reset on save completion
    expect(container.querySelector('[data-testid="discard-changes-dialog"]')).toBeNull();
    const tabButtons = container.querySelectorAll(".ws-tab-btn");
    expect(tabButtons.length).toBe(1);
    expect(tabButtons[0]?.textContent).toContain("PDF 1");
  });

  it("does NOT show window.confirm prompt when clicking Logo if SaveQueue is saved", async () => {
    vi.spyOn(saveQueue, "hasPending").mockReturnValue(false);
    vi.spyOn(saveQueue, "isDirty").mockReturnValue(false);
    vi.spyOn(saveQueue, "getStatus").mockReturnValue("saved-local");
    window.confirm = vi.fn();
    const confirmSpy = vi.spyOn(window, "confirm");
    const onNavigateHome = vi.fn();

    await act(async () => {
      root.render(
        <I18nProvider>
          <WorkspaceHost
            projectId="test-proj"
            onNavigateHome={onNavigateHome}
            initialLayout={{
              tabs: [
                { id: "tab-1", kind: "board", itemId: "item-1", title: "Board 1" },
              ],
              tabBarOrder: ["tab-1"],
              primary: "tab-1",
            }}
          />
        </I18nProvider>
      );
    });

    const logoLink = container.querySelector('a[href="/"]') as HTMLElement;
    expect(logoLink).toBeTruthy();

    await act(async () => {
      logoLink.click();
      await new Promise((r) => setTimeout(r, 100));
    });

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(onNavigateHome).toHaveBeenCalledTimes(1);
  });
});

