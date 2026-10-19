// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { DriveStatusBanner } from "./drive-status-banner";
import { useDriveStore } from "@/core/drive/drive-store";
import { I18nProvider } from "@/i18n/provider";
import { bus } from "@/core/bus";

// @ts-expect-error React testing flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("DriveStatusBanner Component (Task 36 / §10.10, DESIGN.md)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    useDriveStore.getState().setQuotaExceeded(false);
    useDriveStore.getState().setReconnectRequired(false);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("renders nothing when neither quotaExceeded nor reconnectRequired is set", async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <DriveStatusBanner />
        </I18nProvider>
      );
    });

    const banner = container.querySelector('[data-testid="drive-status-banner"]');
    expect(banner).toBeNull();
  });

  it("renders quota exceeded banner and triggers export click", async () => {
    useDriveStore.getState().setQuotaExceeded(true);
    const onExportClick = vi.fn();

    await act(async () => {
      root.render(
        <I18nProvider>
          <DriveStatusBanner onExportClick={onExportClick} />
        </I18nProvider>
      );
    });

    const banner = container.querySelector('[data-testid="drive-status-banner"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain("Drive full. Work is saved locally. Export to free space.");

    const exportBtn = container.querySelector('[data-testid="drive-export-btn"]') as HTMLButtonElement;
    expect(exportBtn).not.toBeNull();
    expect(exportBtn.textContent).toBe("Export .alpha");

    await act(async () => {
      exportBtn.click();
    });

    expect(onExportClick).toHaveBeenCalled();
  });

  it("emits drive:open-export-dialog when export button clicked without explicit onExportClick prop", async () => {
    useDriveStore.getState().setQuotaExceeded(true);

    const busSpy = vi.fn();
    bus.on("drive:open-export-dialog", busSpy);

    await act(async () => {
      root.render(
        <I18nProvider>
          <DriveStatusBanner />
        </I18nProvider>
      );
    });

    const exportBtn = container.querySelector('[data-testid="drive-export-btn"]') as HTMLButtonElement;
    await act(async () => {
      exportBtn.click();
    });

    expect(busSpy).toHaveBeenCalled();
    bus.off("drive:open-export-dialog", busSpy);
  });

  it("renders reconnect required banner and triggers connect()", async () => {
    useDriveStore.getState().setReconnectRequired(true);
    const connectSpy = vi.spyOn(useDriveStore.getState(), "connect").mockResolvedValue("https://accounts.google.com/o/oauth2/v2/auth");

    await act(async () => {
      root.render(
        <I18nProvider>
          <DriveStatusBanner />
        </I18nProvider>
      );
    });

    const banner = container.querySelector('[data-testid="drive-status-banner"]');
    expect(banner).not.toBeNull();
    expect(banner?.textContent).toContain("Google Drive access was revoked or expired. Reconnect to resume sync.");

    const reconnectBtn = container.querySelector('[data-testid="drive-reconnect-btn"]') as HTMLButtonElement;
    expect(reconnectBtn).not.toBeNull();
    expect(reconnectBtn.textContent).toBe("Reconnect");

    await act(async () => {
      reconnectBtn.click();
    });

    expect(connectSpy).toHaveBeenCalledWith("/settings");
  });

  it("renders in Arabic with correct localized text", async () => {
    useDriveStore.getState().setQuotaExceeded(true);
    localStorage.setItem("aboard:language", "ar");

    await act(async () => {
      root.render(
        <I18nProvider>
          <DriveStatusBanner />
        </I18nProvider>
      );
    });

    const banner = container.querySelector('[data-testid="drive-status-banner"]');
    expect(banner?.textContent).toContain("مساحة Drive ممتلئة. تم حفظ عملك محلياً. صدّر لتحرير مساحة.");

    const exportBtn = container.querySelector('[data-testid="drive-export-btn"]');
    expect(exportBtn?.textContent).toBe("تصدير .alpha");
  });
});
