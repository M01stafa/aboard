import { test, expect } from "@playwright/test";
import { mockSignIn, mockSignOut } from "./helpers/auth";

test.describe("Local Data Isolation & Shared Computer Sign-Out (SEC-4 / Task 19)", () => {
  const userA = {
    id: "user-alpha-1111-1111-1111-111111111111",
    email: "user.a@example.com",
  };

  const userB = {
    id: "user-beta-2222-2222-2222-222222222222",
    email: "user.b@example.com",
  };

  test("proves local data is isolated per user and wiped on shared-computer sign-out", async ({
    page,
  }) => {
    // 1. Sign in as user A
    await mockSignIn(page, userA);
    await page.goto("/");
    await expect(page.locator('[data-testid="sign-out-btn"]')).toBeVisible();

    // Insert a marker row into the "meta" store of aboard:<userA.id>
    await page.evaluate(async (userId) => {
      return new Promise<void>((resolve, reject) => {
        const req = window.indexedDB.open(`aboard:${userId}`);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("meta", "readwrite");
          const store = tx.objectStore("meta");
          store.put({ key: "sec4-marker", value: "marker-user-a" });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => {
            db.close();
            reject(tx.error);
          };
        };
        req.onerror = () => reject(req.error);
      });
    }, userA.id);

    // Verify marker was stored in user A's DB
    const initialMarkerA = await page.evaluate(async (userId) => {
      return new Promise<string | null>((resolve, reject) => {
        const req = window.indexedDB.open(`aboard:${userId}`);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("meta", "readonly");
          const store = tx.objectStore("meta");
          const getReq = store.get("sec4-marker");
          getReq.onsuccess = () => {
            db.close();
            resolve(getReq.result?.value ?? null);
          };
          getReq.onerror = () => {
            db.close();
            reject(getReq.error);
          };
        };
        req.onerror = () => reject(req.error);
      });
    }, userA.id);
    expect(initialMarkerA).toBe("marker-user-a");

    // 2. Sign out with the shared-computer flag UNchecked
    await mockSignOut(page);
    await expect(page).toHaveURL(/\/login/);

    // 3. Sign in as user B
    await mockSignIn(page, userB);
    await page.goto("/");
    await expect(page.locator('[data-testid="sign-out-btn"]')).toBeVisible();

    // Assert user B's DB is empty (no marker)
    const markerB = await page.evaluate(async (userId) => {
      return new Promise<string | null>((resolve, reject) => {
        const req = window.indexedDB.open(`aboard:${userId}`);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("meta")) {
            db.close();
            return resolve(null);
          }
          const tx = db.transaction("meta", "readonly");
          const store = tx.objectStore("meta");
          const getReq = store.get("sec4-marker");
          getReq.onsuccess = () => {
            db.close();
            resolve(getReq.result?.value ?? null);
          };
          getReq.onerror = () => {
            db.close();
            reject(getReq.error);
          };
        };
        req.onerror = () => reject(req.error);
      });
    }, userB.id);
    expect(markerB).toBeNull();

    // Sign out as user B (shared-computer flag unchecked)
    await mockSignOut(page);
    await expect(page).toHaveURL(/\/login/);

    // 4. Sign in as user A again
    await mockSignIn(page, userA);
    await page.goto("/");
    await expect(page.locator('[data-testid="sign-out-btn"]')).toBeVisible();

    // Assert the marker is still there
    const markerASecondTime = await page.evaluate(async (userId) => {
      return new Promise<string | null>((resolve, reject) => {
        const req = window.indexedDB.open(`aboard:${userId}`);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("meta", "readonly");
          const store = tx.objectStore("meta");
          const getReq = store.get("sec4-marker");
          getReq.onsuccess = () => {
            db.close();
            resolve(getReq.result?.value ?? null);
          };
          getReq.onerror = () => {
            db.close();
            reject(getReq.error);
          };
        };
        req.onerror = () => reject(req.error);
      });
    }, userA.id);
    expect(markerASecondTime).toBe("marker-user-a");

    // 5. With the shared-computer flag CHECKED, sign out as user A
    await page.evaluate(() => {
      sessionStorage.setItem("aboard:shared_computer", "true");
    });
    await mockSignOut(page);
    await expect(page).toHaveURL(/\/login/);

    // 6. Sign in as user A again
    await mockSignIn(page, userA);
    await page.goto("/");
    await expect(page.locator('[data-testid="sign-out-btn"]')).toBeVisible();

    // Assert user A's DB was deleted and freshly recreated without the marker
    const markerAAfterWipe = await page.evaluate(async (userId) => {
      return new Promise<string | null>((resolve, reject) => {
        const req = window.indexedDB.open(`aboard:${userId}`);
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains("meta")) {
            db.close();
            return resolve(null);
          }
          const tx = db.transaction("meta", "readonly");
          const store = tx.objectStore("meta");
          const getReq = store.get("sec4-marker");
          getReq.onsuccess = () => {
            db.close();
            resolve(getReq.result?.value ?? null);
          };
          getReq.onerror = () => {
            db.close();
            reject(getReq.error);
          };
        };
        req.onerror = () => reject(req.error);
      });
    }, userA.id);
    expect(markerAAfterWipe).toBeNull();
  });
});
