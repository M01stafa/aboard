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

  it("shows 'saving' immediately and debounces 'saved-local' for 10 seconds of inactivity", async () => {
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

    // But indicator remains "saving" to prevent UI flicker while active
    expect(indicator?.getAttribute("data-status")).toBe("saving");
    expect(indicator?.textContent).toContain("Saving");

    // Advance 5 seconds — still shows "saving"
    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(indicator?.getAttribute("data-status")).toBe("saving");

    // Another edit arrives at 7s (resetting inactivity)
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

    // Advance 9.9 seconds — still shows "saving"
    await act(async () => {
      vi.advanceTimersByTime(9900);
    });
    expect(indicator?.getAttribute("data-status")).toBe("saving");

    // Advance past 10 seconds (10,000 ms total inactivity)
    await act(async () => {
      vi.advanceTimersByTime(200);
    });

    // Now it updates cleanly to "saved-local"
    expect(indicator?.getAttribute("data-status")).toBe("saved-local");
    expect(indicator?.textContent).toContain("Saved on this device");
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
