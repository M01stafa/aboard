// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import SettingsPage from "../../app/settings/page";
import { I18nProvider } from "@/i18n/provider";
import { supabase } from "@/core/supabase";

// @ts-expect-error React testing flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
  }),
  useSearchParams: () => ({
    get: vi.fn().mockReturnValue(null),
  }),
}));

vi.mock("@/core/drive", () => ({
  useDriveStore: () => ({
    connected: false,
    googleEmail: null,
    linkedAt: null,
    reconnectRequired: false,
    loading: false,
    error: null,
    fetchStatus: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
  }),
}));

vi.mock("../../app/auth-guard", () => ({
  AuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

describe("SettingsPage — Account Deletion Flow (LEGAL-3, AUTH-4)", () => {
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

  it("renders the Danger Zone with Delete Account button", async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <SettingsPage />
        </I18nProvider>
      );
    });

    const deleteBtn = container.querySelector('[data-testid="delete-account-btn"]');
    expect(deleteBtn).toBeTruthy();
  });

  it("opens the confirmation modal when Delete Account is clicked and explains Drive/browser files are kept", async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <SettingsPage />
        </I18nProvider>
      );
    });

    const deleteBtn = container.querySelector('[data-testid="delete-account-btn"]') as HTMLButtonElement;
    await act(async () => {
      deleteBtn.click();
    });

    const modal = container.querySelector('[data-testid="delete-account-modal"]');
    expect(modal).toBeTruthy();

    // Verify explanation that files in Drive or the browser are not deleted (Task 44 requirement)
    expect(modal?.textContent).toContain("Google Drive");
    expect(modal?.textContent).toContain("DELETE");

    const confirmBtn = container.querySelector('[data-testid="delete-confirm-btn"]') as HTMLButtonElement;
    expect(confirmBtn.disabled).toBe(true);

    // Cancel closes the modal
    const cancelBtn = container.querySelector('[data-testid="delete-cancel-btn"]') as HTMLButtonElement;
    await act(async () => {
      cancelBtn.click();
    });

    expect(container.querySelector('[data-testid="delete-account-modal"]')).toBeNull();
  });

  it("enables the delete button only when DELETE is typed and invokes account-delete endpoint", async () => {
    const mockInvoke = vi.fn().mockResolvedValue({
      data: { deleted: true },
      error: null,
    });
    vi.spyOn(supabase, "functions", "get").mockReturnValue({
      invoke: mockInvoke,
    } as any);

    vi.spyOn(supabase.auth, "getSession").mockResolvedValue({
      data: { session: { user: { id: "test-user-id" } } },
      error: null,
    } as any);

    const mockSignOut = vi.spyOn(supabase.auth, "signOut").mockResolvedValue({ error: null } as any);

    await act(async () => {
      root.render(
        <I18nProvider>
          <SettingsPage />
        </I18nProvider>
      );
    });

    const deleteBtn = container.querySelector('[data-testid="delete-account-btn"]') as HTMLButtonElement;
    await act(async () => {
      deleteBtn.click();
    });

    const input = container.querySelector('[data-testid="delete-confirm-input"]') as HTMLInputElement;
    const confirmBtn = container.querySelector('[data-testid="delete-confirm-btn"]') as HTMLButtonElement;

    expect(confirmBtn.disabled).toBe(true);

    const setInputValue = (val: string) => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value"
      )?.set;
      nativeSetter?.call(input, val);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    };

    // Type incorrect confirmation
    await act(async () => {
      setInputValue("no");
    });
    expect(confirmBtn.disabled).toBe(true);

    // Type DELETE
    await act(async () => {
      setInputValue("DELETE");
    });

    const activeConfirmBtn = container.querySelector('[data-testid="delete-confirm-btn"]') as HTMLButtonElement;
    expect(activeConfirmBtn.disabled).toBe(false);

    // Click confirm
    await act(async () => {
      activeConfirmBtn.click();
    });

    expect(mockInvoke).toHaveBeenCalledWith("account-delete", { method: "POST" });
    expect(mockSignOut).toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith("/?account_deleted=1");
  });
});
