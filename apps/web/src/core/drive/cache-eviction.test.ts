import { describe, it, expect, beforeEach } from "vitest";
import type { AboardDatabase, FileRecord } from "@/core/db";
import {
  evictLruCacheIfNeeded,
  getUnpinnedCacheSize,
  DEFAULT_CACHE_MAX_BYTES,
} from "./cache-eviction";

class MockFilesTable {
  public data = new Map<string, FileRecord>();

  async put(item: FileRecord): Promise<string> {
    const key = `${item.projectId}:${item.key}`;
    this.data.set(key, { ...item });
    return key;
  }

  async get(key: [string, string]): Promise<FileRecord | undefined> {
    const keyStr = `${key[0]}:${key[1]}`;
    const val = this.data.get(keyStr);
    return val ? { ...val } : undefined;
  }

  async delete(key: [string, string]): Promise<void> {
    const keyStr = `${key[0]}:${key[1]}`;
    this.data.delete(keyStr);
  }

  async toArray(): Promise<FileRecord[]> {
    return Array.from(this.data.values()).map((v) => ({ ...v }));
  }
}

class MockCacheDb {
  public files = new MockFilesTable();
}

describe("Cache Eviction Logic (cache-eviction.ts / STORE-2, SEC-4)", () => {
  let mockDb: MockCacheDb;

  beforeEach(() => {
    mockDb = new MockCacheDb();
  });

  it("getUnpinnedCacheSize ignores pinned files and sums unpinned clean files", async () => {
    // 1. Insert pinned file (local mode) - 100 MB
    await mockDb.files.put({
      projectId: "proj-1",
      key: "hash-pinned",
      size: 100 * 1024 * 1024,
      lastAccess: Date.now(),
      pinned: true,
    });

    // 2. Insert unpinned file (Drive mode) - 50 MB
    await mockDb.files.put({
      projectId: "proj-1",
      key: "hash-unpinned",
      size: 50 * 1024 * 1024,
      lastAccess: Date.now(),
      pinned: false,
    });

    const unpinnedSize = await getUnpinnedCacheSize(mockDb as unknown as AboardDatabase);
    expect(unpinnedSize).toBe(50 * 1024 * 1024);
  });

  it("does not evict when usage is below max limit", async () => {
    await mockDb.files.put({
      projectId: "proj-1",
      key: "hash-1",
      size: 100 * 1024 * 1024,
      driveFileId: "drive-1",
      lastAccess: Date.now(),
      pinned: false,
    });

    const res = await evictLruCacheIfNeeded(
      mockDb as unknown as AboardDatabase,
      DEFAULT_CACHE_MAX_BYTES
    );
    expect(res.evictedCount).toBe(0);
    expect(res.evictedBytes).toBe(0);

    const remaining = await mockDb.files.toArray();
    expect(remaining).toHaveLength(1);
  });

  it("evicts least-recently-used clean files when total usage exceeds threshold", async () => {
    const now = Date.now();

    // Insert 3 unpinned files:
    // File 1: oldest access (now - 3000), 200 MB
    await mockDb.files.put({
      projectId: "proj-1",
      key: "hash-oldest",
      size: 200 * 1024 * 1024,
      driveFileId: "drive-oldest",
      lastAccess: now - 3000,
      pinned: false,
    });

    // File 2: middle access (now - 2000), 200 MB
    await mockDb.files.put({
      projectId: "proj-1",
      key: "hash-middle",
      size: 200 * 1024 * 1024,
      driveFileId: "drive-middle",
      lastAccess: now - 2000,
      pinned: false,
    });

    // File 3: newest access (now - 1000), 200 MB
    await mockDb.files.put({
      projectId: "proj-1",
      key: "hash-newest",
      size: 200 * 1024 * 1024,
      driveFileId: "drive-newest",
      lastAccess: now - 1000,
      pinned: false,
    });

    // Total = 600 MB > 500 MB limit
    // Target = 400 MB
    const res = await evictLruCacheIfNeeded(
      mockDb as unknown as AboardDatabase,
      500 * 1024 * 1024,
      400 * 1024 * 1024
    );

    expect(res.evictedCount).toBe(1);
    expect(res.evictedBytes).toBe(200 * 1024 * 1024);
    expect(res.finalBytes).toBe(400 * 1024 * 1024);

    // Oldest file should be evicted, middle and newest preserved
    const remaining = await mockDb.files.toArray();
    const remainingKeys = remaining.map((f) => f.key);
    expect(remainingKeys).not.toContain("hash-oldest");
    expect(remainingKeys).toContain("hash-middle");
    expect(remainingKeys).toContain("hash-newest");
  });

  it("NEVER evicts pinned files (local mode), even if they are oldest", async () => {
    const now = Date.now();

    // Pinned file: oldest (now - 5000), 400 MB
    await mockDb.files.put({
      projectId: "proj-1",
      key: "hash-local-pinned",
      size: 400 * 1024 * 1024,
      lastAccess: now - 5000,
      pinned: true,
    });

    // Unpinned file: 200 MB
    await mockDb.files.put({
      projectId: "proj-1",
      key: "hash-drive-clean",
      size: 200 * 1024 * 1024,
      driveFileId: "drive-clean-1",
      lastAccess: now - 1000,
      pinned: false,
    });

    // With a low limit of 100 MB, unpinned file will be evicted but pinned must stay intact
    const res = await evictLruCacheIfNeeded(
      mockDb as unknown as AboardDatabase,
      100 * 1024 * 1024,
      50 * 1024 * 1024
    );

    expect(res.evictedCount).toBe(1);
    expect(res.evictedBytes).toBe(200 * 1024 * 1024);

    const remaining = await mockDb.files.toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].key).toBe("hash-local-pinned");
    expect(remaining[0].pinned).toBe(true);
  });

  it("NEVER evicts unpinned files that lack a driveFileId (not yet synced to Drive)", async () => {
    const now = Date.now();

    // Unpinned file, but not yet uploaded (no driveFileId)
    await mockDb.files.put({
      projectId: "proj-1",
      key: "hash-pending-upload",
      size: 600 * 1024 * 1024,
      lastAccess: now - 5000,
      pinned: false,
      // driveFileId is undefined!
    });

    const res = await evictLruCacheIfNeeded(
      mockDb as unknown as AboardDatabase,
      500 * 1024 * 1024,
      400 * 1024 * 1024
    );

    // Cannot evict because it has not been saved to Drive yet
    expect(res.evictedCount).toBe(0);
    const remaining = await mockDb.files.toArray();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].key).toBe("hash-pending-upload");
  });
});
