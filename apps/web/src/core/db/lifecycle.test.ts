import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  openDb,
  closeDb,
  getDb,
  getActiveUserId,
  deleteUserDb,
  setDbFactoryForTesting,
} from "./lifecycle";
import type { AboardDatabase } from "./schema";

// In-memory persistent stores per user simulating persistent IndexedDB across closes
const mockUserStores = new Map<string, Map<string, unknown>>();

class MockDexieTable {
  constructor(private userStore: Map<string, unknown>) {}

  async get(key: string) {
    const val = this.userStore.get(key);
    return val !== undefined ? { key, value: val } : undefined;
  }

  async put(item: { key: string; value: unknown }) {
    this.userStore.set(item.key, item.value);
    return item.key;
  }
}

class MockAboardDatabase {
  public name: string;
  public userId: string;
  public meta: MockDexieTable;
  private openState = false;

  constructor(userId: string) {
    this.userId = userId;
    this.name = `aboard:${userId}`;
    if (!mockUserStores.has(userId)) {
      mockUserStores.set(userId, new Map());
    }
    this.meta = new MockDexieTable(mockUserStores.get(userId)!);
  }

  isOpen() {
    return this.openState;
  }

  async open() {
    this.openState = true;
    return this;
  }

  close() {
    this.openState = false;
  }
}

describe("Dexie Database Lifecycle (Task 19 / SEC-4)", () => {
  beforeEach(async () => {
    await closeDb();
    mockUserStores.clear();
    setDbFactoryForTesting((userId) => new MockAboardDatabase(userId) as unknown as AboardDatabase);
  });

  afterEach(async () => {
    await closeDb();
    setDbFactoryForTesting(null);
  });

  it("opens the database and sets active state after sign-in", async () => {
    expect(getDb()).toBeNull();
    expect(getActiveUserId()).toBeNull();

    const db = await openDb("user-alpha");
    expect(db).toBeDefined();
    expect(db.isOpen()).toBe(true);
    expect(getDb()).toBe(db);
    expect(getActiveUserId()).toBe("user-alpha");
  });

  it("is idempotent when opening with the same user ID", async () => {
    const firstOpen = await openDb("user-alpha");
    const secondOpen = await openDb("user-alpha");

    expect(firstOpen).toBe(secondOpen);
    expect(getActiveUserId()).toBe("user-alpha");
  });

  it("closes active database on closeDb", async () => {
    const db = await openDb("user-alpha");
    expect(db.isOpen()).toBe(true);

    await closeDb();

    expect(db.isOpen()).toBe(false);
    expect(getDb()).toBeNull();
    expect(getActiveUserId()).toBeNull();
  });

  it("persists device ID across close and reopen", async () => {
    const db1 = await openDb("user-alpha");
    const deviceRecord1 = await db1.meta.get("deviceId");
    expect(deviceRecord1).toBeDefined();
    const initialDeviceId = deviceRecord1?.value;
    expect(typeof initialDeviceId).toBe("string");
    expect(initialDeviceId).toBeTruthy();

    // Close the database
    await closeDb();
    expect(getDb()).toBeNull();

    // Reopen database for the same user
    const db2 = await openDb("user-alpha");
    expect(db2).not.toBe(db1); // New connection instance
    const deviceRecord2 = await db2.meta.get("deviceId");
    expect(deviceRecord2?.value).toBe(initialDeviceId);
  });

  it("switches databases cleanly when opening for a different user", async () => {
    const dbUser1 = await openDb("user-alpha");
    const device1 = (await dbUser1.meta.get("deviceId"))?.value;
    expect(getActiveUserId()).toBe("user-alpha");

    const dbUser2 = await openDb("user-beta");
    expect(dbUser1.isOpen()).toBe(false);
    expect(dbUser2.isOpen()).toBe(true);
    expect(getActiveUserId()).toBe("user-beta");

    const device2 = (await dbUser2.meta.get("deviceId"))?.value;
    expect(device2).not.toBe(device1);
  });

  it("throws when openDb is called without a userId", async () => {
    await expect(openDb("")).rejects.toThrow("Cannot open database without a valid userId.");
  });
});
