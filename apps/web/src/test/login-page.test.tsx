// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import LoginPage from "../../app/login/page";
import { I18nProvider } from "@/i18n/provider";
import { featureFlags } from "@/core/feature-flags";

// @ts-expect-error React testing flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

vi.mock("@/core/supabase", () => ({
  supabase: {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  },
  signInWithGoogle: vi.fn(),
  signInWithEmailOtp: vi.fn(),
}));

describe("LoginPage — Public Beta Google UI Hiding", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    featureFlags.googleDrive = false;
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it("hides 'Sign in with Google' button when googleDrive feature flag is false", async () => {
    await act(async () => {
      root.render(
        <I18nProvider>
          <LoginPage />
        </I18nProvider>
      );
    });

    expect(container.textContent).not.toContain("Continue with Google");
    expect(container.textContent).not.toContain("Or with email");
    expect(container.querySelector("#auth-email-input")).not.toBeNull();
  });

  it("shows 'Sign in with Google' button when googleDrive feature flag is true", async () => {
    featureFlags.googleDrive = true;
    await act(async () => {
      root.render(
        <I18nProvider>
          <LoginPage />
        </I18nProvider>
      );
    });

    expect(container.textContent).toContain("Continue with Google");
    expect(container.textContent).toContain("Or with email");
    expect(container.querySelector("#auth-email-input")).not.toBeNull();
  });
});
