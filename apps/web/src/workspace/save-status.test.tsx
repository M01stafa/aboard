// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SaveStatusIndicator } from "./save-status";
import { saveQueue, type SaveStatus } from "@/core/storage";
import { I18nProvider } from "@/i18n/provider";

// @ts-expect-error React testing flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("SaveStatusIndicator Debounce Inactivity Mechanism", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it("shows 'saving' immediately and debounces 'saved-local' for 2 seconds of inactivity (reactive <= 3s)", async () => {
    // Force initial state to saved-local
    // @ts-expect-error accessing private method for testing
    saveQueue.setStatus("saved-local");

    await act(async () => {
      root.render(
        <I18nProvider>
          <SaveStatusIndicator />
        </I18nProvider>
      );
    });

    const indicator = container.querySelector('[data-testid="save-status-indicator"]');
    expect(indicator).toBeTruthy();
    expect(indicator?.getAttribute("data-status")).toBe("saved-local");
    expect(indicator?.textContent).toContain("Saved on this device");

    // 1. Simulate edit: saveQueue transitions to "saving"
    await act(async () => {
      // @ts-expect-error accessing private method for testing
      saveQueue.setStatus("saving");
    });

    // Indicator updates to "saving" immediately
    expect(indicator?.getAttribute("data-status")).toBe("saving");
    expect(indicator?.textContent).toContain("Saving");

    // 2. Save finishes in the background, saveQueue notifies "saved-local"
    await act(async () => {
      // @ts-expect-error accessing private method for testing
      saveQueue.setStatus("saved-local");
    });

    // But indicator remains "saving" during debounce to prevent UI flicker
    expect(indicator?.getAttribute("data-status")).toBe("saving");
    expect(indicator?.textContent).toContain("Saving");

    // Advance 1 second — still shows "saving"
    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    expect(indicator?.getAttribute("data-status")).toBe("saving");

    // Another edit arrives at 1.5s (resetting inactivity)
    await act(async () => {
      // @ts-expect-error accessing private method for testing
      saveQueue.setStatus("saving");
    });
    expect(indicator?.getAttribute("data-status")).toBe("saving");

    await act(async () => {
      // @ts-expect-error accessing private method for testing
      saveQueue.setStatus("saved-local");
    });
    expect(indicator?.getAttribute("data-status")).toBe("saving");

    // Advance 1.9 seconds — still shows "saving"
    await act(async () => {
      vi.advanceTimersByTime(1900);
    });
    expect(indicator?.getAttribute("data-status")).toBe("saving");

    // Advance past 2 seconds (2,000 ms total inactivity)
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // Now it updates cleanly to "saved-local"
    expect(indicator?.getAttribute("data-status")).toBe("saved-local");
    expect(indicator?.textContent).toContain("Saved on this device");
  });

  it("switches immediately to 'Waiting for connection' on offline event and flushes to 'Saved to Google Drive' on online", async () => {
    // Simulate Drive mode
    vi.spyOn(saveQueue, "isLocalMode").mockReturnValue(false);
    // @ts-expect-error accessing private method for testing
    saveQueue.setStatus("saved-drive");

    await act(async () => {
      root.render(
        <I18nProvider>
          <SaveStatusIndicator />
        </I18nProvider>
      );
    });

    const indicator = container.querySelector('[data-testid="save-status-indicator"]');
    expect(indicator?.getAttribute("data-status")).toBe("saved-drive");
    expect(indicator?.textContent).toContain("Saved to Google Drive");

    // Trigger offline event
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
    });

    // Immediately shows waiting-connection
    expect(indicator?.getAttribute("data-status")).toBe("waiting-connection");
    expect(indicator?.textContent).toContain("Waiting for connection");

    // Trigger online event
    const flushSpy = vi.spyOn(saveQueue, "flushNow").mockResolvedValue(undefined);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });

    // Immediately shows saving while flushNow runs
    expect(indicator?.getAttribute("data-status")).toBe("saving");
    expect(indicator?.textContent).toContain("Saving");
    expect(flushSpy).toHaveBeenCalled();

    // Flush completes with saved-drive
    await act(async () => {
      // @ts-expect-error accessing private method for testing
      saveQueue.setStatus("saved-drive");
      vi.advanceTimersByTime(2000);
    });

    expect(indicator?.getAttribute("data-status")).toBe("saved-drive");
    expect(indicator?.textContent).toContain("Saved to Google Drive");
  });

  it("correctly renders all 5 WS-3 states", async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <SaveStatusIndicator />
        </I18nProvider>
      );
    });

    const indicator = container.querySelector('[data-testid="save-status-indicator"]');

    // 1. saved-drive
    await act(async () => {
      // @ts-expect-error accessing private method for testing
      saveQueue.setStatus("saved-drive");
      vi.advanceTimersByTime(2000);
    });
    expect(indicator?.textContent).toContain("Saved to Google Drive");

    // 2. saving
    await act(async () => {
      // @ts-expect-error accessing private method for testing
      saveQueue.setStatus("saving");
    });
    expect(indicator?.textContent).toContain("Saving…");

    // 3. saved-local
    await act(async () => {
      // @ts-expect-error accessing private method for testing
      saveQueue.setStatus("saved-local");
      vi.advanceTimersByTime(2000);
    });
    expect(indicator?.textContent).toContain("Saved on this device");

    // 4. waiting-connection
    await act(async () => {
      // @ts-expect-error accessing private method for testing
      saveQueue.setStatus("waiting-connection");
    });
    expect(indicator?.textContent).toContain("Waiting for connection");

    // 5. reconnect-drive
    await act(async () => {
      // @ts-expect-error accessing private method for testing
      saveQueue.setStatus("reconnect-drive");
    });
    expect(indicator?.textContent).toContain("Reconnect Google Drive");
  });

  it("supports custom debounceMs prop", async () => {
    // @ts-expect-error accessing private method for testing
    saveQueue.setStatus("saving");

    await act(async () => {
      root.render(
        <I18nProvider>
          <SaveStatusIndicator debounceMs={2000} />
        </I18nProvider>
      );
    });

    const indicator = container.querySelector('[data-testid="save-status-indicator"]');
    expect(indicator?.getAttribute("data-status")).toBe("saving");

    await act(async () => {
      // @ts-expect-error accessing private method for testing
      saveQueue.setStatus("saved-local");
    });
    expect(indicator?.getAttribute("data-status")).toBe("saving");

    await act(async () => {
      vi.advanceTimersByTime(1500);
    });
    expect(indicator?.getAttribute("data-status")).toBe("saving");

    await act(async () => {
      vi.advanceTimersByTime(600);
    });
    expect(indicator?.getAttribute("data-status")).toBe("saved-local");
  });
});
