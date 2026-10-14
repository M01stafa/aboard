import { describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { checkAuthAndRedirect } from "../../app/auth-guard";
import { LauncherContent } from "../../app/page";
import { I18nProvider } from "@/i18n/provider";
import type { User } from "@supabase/supabase-js";

// Mock next/navigation
const mockReplace = vi.fn();
const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: mockPush,
  }),
  useSearchParams: () => new URLSearchParams(),
}));

// Mock Supabase
const mockUser: User = {
  id: "test-user-id",
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
  created_at: new Date().toISOString(),
  email: "student@example.com",
};

vi.mock("@/core/supabase", () => ({
  supabase: {
    auth: {
      getUser: vi.fn(async () => ({
        data: { user: mockUser },
        error: null,
      })),
      onAuthStateChange: vi.fn(() => ({
        data: {
          subscription: {
            unsubscribe: vi.fn(),
          },
        },
      })),
      signOut: vi.fn(async () => ({ error: null })),
    },
  },
  signOut: vi.fn(async () => ({ error: null })),
}));

describe("Launcher and Route Guard (Task 17)", () => {
  it("redirects unauthenticated users to /login and returns null", async () => {
    mockReplace.mockClear();
    const mockGetUser = vi.fn().mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const user = await checkAuthAndRedirect(mockGetUser, mockReplace);

    expect(user).toBeNull();
    expect(mockReplace).toHaveBeenCalledWith("/login");
  });

  it("permits authenticated users without redirecting", async () => {
    mockReplace.mockClear();
    const mockGetUser = vi.fn().mockResolvedValue({
      data: { user: mockUser },
      error: null,
    });

    const user = await checkAuthAndRedirect(mockGetUser, mockReplace);

    expect(user).toEqual(mockUser);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it("renders the three cards and empty state in authenticated launcher", () => {
    const html = renderToStaticMarkup(
      React.createElement(
        I18nProvider,
        null,
        React.createElement(LauncherContent, { user: mockUser })
      )
    );

    // Verify 3 cards exist in the rendered output
    expect(html).toContain('data-testid="card-whiteboard"');
    expect(html).toContain('data-testid="card-pdf"');
    expect(html).toContain('data-testid="card-circuit"');

    // Verify Recent projects area exists
    expect(html).toContain('id="recent-projects-heading"');

    // Verify Open .alpha file button exists
    expect(html).toContain('data-testid="open-alpha-btn"');

    // Verify R7: exactly one gold CTA button on the screen
    const goldMatches = html.match(/class="[^"]*btn-gold[^"]*"/g) || [];
    expect(goldMatches.length).toBe(1);
  });
});
