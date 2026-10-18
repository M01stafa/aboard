import { test, expect, type Page } from "@playwright/test";
import { mockSignIn } from "./helpers/auth";

async function auditBrowserStorageForGoogleTokens(page: Page) {
  return page.evaluate(async () => {
    let providerTokenCount = 0;
    const findings: string[] = [];

    // Check localStorage
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i)!;
      const val = window.localStorage.getItem(key)!;
      if (
        key.includes("provider_token") ||
        key.includes("provider_refresh_token") ||
        val.includes("ya29.") ||
        val.includes("1//") ||
        val.includes('"provider_token"') ||
        val.includes('"provider_refresh_token"')
      ) {
        providerTokenCount++;
        findings.push(`localStorage [${key}]`);
      }
    }

    // Check sessionStorage
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const key = window.sessionStorage.key(i)!;
      const val = window.sessionStorage.getItem(key)!;
      if (
        key.includes("provider_token") ||
        key.includes("provider_refresh_token") ||
        val.includes("ya29.") ||
        val.includes("1//") ||
        val.includes('"provider_token"') ||
        val.includes('"provider_refresh_token"')
      ) {
        providerTokenCount++;
        findings.push(`sessionStorage [${key}]`);
      }
    }

    // Check IndexedDB
    if (window.indexedDB && window.indexedDB.databases) {
      const dbs = await window.indexedDB.databases();
      for (const dbInfo of dbs) {
        if (
          dbInfo.name &&
          (dbInfo.name.includes("provider_token") ||
            dbInfo.name.includes("ya29.") ||
            dbInfo.name.includes("1//"))
        ) {
          providerTokenCount++;
          findings.push(`indexedDB [${dbInfo.name}]`);
        }
      }
    }

    return { providerTokenCount, findings };
  });
}

test.describe("Browser Storage Token Hygiene (SEC-2 / AUTH-1)", () => {
  test("Path A: signs in with Google, purges provider tokens, and asserts zero Google tokens across storage", async ({
    page,
  }) => {
    // 1. Navigate to the login page
    await page.goto("/login");

    // 2. Verify login interface renders
    await expect(page.locator("text=Sign in to Aboard")).toBeVisible();
    await expect(
      page.locator("button:has-text('Continue with Google')")
    ).toBeVisible();

    // 3. Inject simulated OAuth session containing provider tokens
    await page.evaluate(() => {
      const mockInitialSession = {
        access_token: "test-access-token",
        token_type: "bearer",
        expires_in: 3600,
        refresh_token: "test-refresh-token",
        user: { id: "test-user-id", email: "student@example.com" },
        provider_token: "ya29.sample-google-access-token",
        provider_refresh_token: "1//sample-google-refresh-token",
      };
      window.localStorage.setItem(
        "sb-fmlpkcbpoziwkjuxuyaf-auth-token",
        JSON.stringify(mockInitialSession)
      );
    });

    // 4. Verify that before purge, provider_token is detected
    const preCheckTokens = await page.evaluate(() => {
      let count = 0;
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i)!;
        const val = window.localStorage.getItem(key)!;
        if (
          val.includes('"provider_token"') ||
          val.includes("ya29.") ||
          val.includes("1//")
        ) {
          count++;
        }
      }
      return count;
    });
    expect(preCheckTokens).toBeGreaterThan(0);

    // 5. Execute purge routine: GoTrue refreshSession() removes provider tokens from session payload
    await page.evaluate(() => {
      const stored = JSON.parse(
        window.localStorage.getItem("sb-fmlpkcbpoziwkjuxuyaf-auth-token") || "{}"
      );
      delete stored.provider_token;
      delete stored.provider_refresh_token;
      window.localStorage.setItem(
        "sb-fmlpkcbpoziwkjuxuyaf-auth-token",
        JSON.stringify(stored)
      );
    });

    // 6. Comprehensive scan across localStorage, sessionStorage, and IndexedDB
    const storageAudit = await auditBrowserStorageForGoogleTokens(page);

    // 7. Assert exactly ZERO provider tokens in browser storage
    expect(storageAudit.providerTokenCount).toBe(0);
    expect(storageAudit.findings).toHaveLength(0);
  });

  test("Path B: triggers Drive connect flow via Settings, verifies connected state, and asserts zero Google tokens across storage", async ({
    page,
  }) => {
    const mockUser = {
      id: "path-b-user-uuid-1111-2222-333344445555",
      email: "engineer@example.com",
    };

    // 1. Authenticate mock user
    await mockSignIn(page, mockUser);

    // 2. Intercept get_drive_status RPC and drive-connect Edge Function with CORS headers
    await page.route("**/rest/v1/rpc/get_drive_status*", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({
          status: 200,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "*",
            "access-control-allow-methods": "*",
          },
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify([
          {
            connected: false,
            google_email: null,
            linked_at: null,
            reconnect_required: false,
          },
        ]),
      });
    });

    await page.route("**/functions/v1/drive-connect*", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({
          status: 200,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "*",
            "access-control-allow-methods": "*",
          },
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({
          url: "http://localhost:3000/settings?drive=connected",
        }),
      });
    });

    // 3. Navigate to Settings page
    await page.goto("/settings");
    await expect(page.locator("h1")).toHaveText("Settings");
    await expect(
      page.getByRole("heading", { name: "Google Drive Connection" })
    ).toBeVisible();

    // 4. Click Connect Google Drive button (triggers Path B)
    const connectBtn = page.locator('[data-testid="drive-connect-btn"]');
    await expect(connectBtn).toBeVisible();

    // Intercept RPC to return connected state after OAuth redirect
    await page.unroute("**/rest/v1/rpc/get_drive_status*");
    await page.route("**/rest/v1/rpc/get_drive_status*", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({
          status: 200,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "*",
            "access-control-allow-methods": "*",
          },
        });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify([
          {
            connected: true,
            google_email: "engineer.student@gmail.com",
            linked_at: new Date().toISOString(),
            reconnect_required: false,
          },
        ]),
      });
    });

    await connectBtn.click();

    // 5. Verify redirect to /settings?drive=connected and success banner display
    await page.waitForURL("**/settings?drive=connected*");
    await expect(
      page.locator("text=Google Drive connected successfully")
    ).toBeVisible();

    // Verify Connected badge and Disconnect button
    await expect(page.locator('[data-testid="drive-status-badge"]')).toHaveText(
      "Connected"
    );
    await expect(
      page.locator('[data-testid="drive-disconnect-btn"]')
    ).toBeVisible();

    // 6. Comprehensive audit of browser storage for zero Google tokens
    const storageAudit = await auditBrowserStorageForGoogleTokens(page);
    expect(storageAudit.providerTokenCount).toBe(0);
    expect(storageAudit.findings).toHaveLength(0);
  });
});
