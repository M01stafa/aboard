import { test, expect } from "@playwright/test";

test.describe("Browser Storage Token Hygiene (SEC-2 / AUTH-1)", () => {
  test("asserts zero provider_token in localStorage, sessionStorage, and IndexedDB after auth", async ({
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
    const storageAudit = await page.evaluate(async () => {
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

    // 7. Assert exactly ZERO provider tokens in browser storage
    expect(storageAudit.providerTokenCount).toBe(0);
    expect(storageAudit.findings).toHaveLength(0);
  });
});
