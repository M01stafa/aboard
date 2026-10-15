import type { Page } from "@playwright/test";

export interface MockUser {
  id: string;
  email: string;
}

export const SUPABASE_STORAGE_KEY = "sb-fmlpkcbpoziwkjuxuyaf-auth-token";

let initScriptRegistered = false;

/**
 * Reusable mock sign-in helper for Playwright E2E tests.
 * Intercepts Supabase auth network calls and seeds localStorage for any given user.
 */
export async function mockSignIn(page: Page, user: MockUser): Promise<void> {
  const fullUser = {
    id: user.id,
    aud: "authenticated",
    role: "authenticated",
    email: user.email,
    app_metadata: {},
    user_metadata: {},
    created_at: new Date().toISOString(),
  };

  const session = {
    access_token: `test-access-token-${user.id}`,
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: `test-refresh-token-${user.id}`,
    user: fullUser,
  };

  // Remove any previously registered Supabase auth route handler
  try {
    await page.unroute("**/auth/v1/**");
  } catch {
    // ignore
  }

  // Intercept Supabase Auth checks
  await page.route("**/auth/v1/**", async (route) => {
    const url = route.request().url();
    if (url.includes("/token")) {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(session),
      });
    } else {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(fullUser),
      });
    }
  });

  // Set the session cookie so initial page loads on localhost can seed localStorage
  await page.context().addCookies([
    {
      name: "mock_session",
      value: encodeURIComponent(JSON.stringify(session)),
      domain: "localhost",
      path: "/",
    },
  ]);

  // If already on a localhost page, write directly to window.localStorage
  if (page.url() !== "about:blank") {
    await page.evaluate(
      ({ key, sessionData }) => {
        window.localStorage.setItem(key, JSON.stringify(sessionData));
      },
      { key: SUPABASE_STORAGE_KEY, sessionData: session }
    );
  } else {
    // If on about:blank before initial navigation, register the init script
    await page.addInitScript(
      ({ key, sessionData }) => {
        const match = document.cookie.match(/mock_session=([^;]+)/);
        if (match) {
          try {
            const parsed = JSON.parse(decodeURIComponent(match[1]));
            window.localStorage.setItem(key, JSON.stringify(parsed));
            return;
          } catch {
            // fallback to sessionData
          }
        }
        window.localStorage.setItem(key, JSON.stringify(sessionData));
      },
      { key: SUPABASE_STORAGE_KEY, sessionData: session }
    );
  }
}

/**
 * Reusable mock sign-out helper for Playwright E2E tests.
 * Clears cookies and clicks the application sign-out button to exercise the full sign-out routine.
 */
export async function mockSignOut(page: Page): Promise<void> {
  // Clear mock session cookie
  await page.context().clearCookies();

  const signOutBtn = page.locator('[data-testid="sign-out-btn"]');
  if (await signOutBtn.isVisible()) {
    await signOutBtn.click();
    await page.waitForURL("**/login");
  } else {
    // Fallback: clear Supabase token from localStorage
    await page.evaluate((key) => {
      window.localStorage.removeItem(key);
    }, SUPABASE_STORAGE_KEY);
  }
}
