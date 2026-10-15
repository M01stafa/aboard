import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { SaveQueue, type QueuedItem } from "./save-queue";
import { ProjectService } from "./project-service";
import { requestPersistenceSilently } from "./persistence";
import type { StorageProvider, ItemRecord, AlphaManifest } from "./types";
import type { AboardDatabase, FileRecord, ProjectRecord } from "@/core/db";

class MockTable<T> {
  public data = new Map<string, T>();

  constructor(private keyFn: (item: T) => string) {}

  async put(item: T): Promise<string> {
    const key = this.keyFn(item);
    this.data.set(key, { ...item });
    return key;
  }

  async get(key: unknown): Promise<T | undefined> {
    const keyStr = Array.isArray(key) ? key.join(":") : String(key);
    const val = this.data.get(keyStr);
    return val ? { ...val } : undefined;
  }

  async update(key: unknown, changes: Partial<T>): Promise<void> {
    const keyStr = Array.isArray(key) ? key.join(":") : String(key);
    const existing = this.data.get(keyStr);
    if (existing) {
      Object.assign(existing, changes);
    }
  }

  async delete(key: unknown): Promise<void> {
    const keyStr = Array.isArray(key) ? key.join(":") : String(key);
    this.data.delete(keyStr);
  }

  where(field: string) {
    return {
      equals: (val: unknown) => ({
        first: async (): Promise<T | undefined> => {
          for (const v of Array.from(this.data.values())) {
            if ((v as Record<string, unknown>)[field] === val) {
              return { ...v };
            }
          }
          return undefined;
        },
        delete: async (): Promise<number> => {
          let count = 0;
          for (const [k, v] of Array.from(this.data.entries())) {
            if ((v as Record<string, unknown>)[field] === val) {
              this.data.delete(k);
              count++;
            }
          }
          return count;
        },
      }),
    };
  }

  async count(): Promise<number> {
    return this.data.size;
  }
}

interface MockOutboxRecord {
  seq?: number;
  projectId: string;
  itemId: string;
  payload?: string;
  createdAt?: number;
}

interface MockItemRecord extends ItemRecord {
  dirty: number;
  payload?: string;
}

class MockDb {
  public projects = new MockTable<ProjectRecord>((p) => p.id);
  public items = new MockTable<MockItemRecord>((i) => i.id);
  public files = new MockTable<FileRecord>((f) => `${f.projectId}:${f.key}`);
  public outbox = new MockTable<MockOutboxRecord>((o) => o.itemId);
}

class MockStorageProvider implements StorageProvider {
  public kind: "local" | "drive" = "local";
  public writes: Array<{ projectId: string; item: ItemRecord; payload: string }> = [];

  async createProject(_m: AlphaManifest): Promise<{ driveFolderId?: string }> {
    return {};
  }
  async loadManifest(_id: string): Promise<AlphaManifest> {
    throw new Error("not implemented");
  }
  async saveManifest(_m: AlphaManifest): Promise<void> {}
  async readItem(_pId: string, _iId: string): Promise<string> {
    return "";
  }
  async writeItem(projectId: string, item: ItemRecord, payload: string): Promise<void> {
    this.writes.push({ projectId, item: { ...item }, payload });
  }
  async deleteItem(_pId: string, _iId: string): Promise<void> {}
  async hasFile(_pId: string, _k: string): Promise<boolean> {
    return false;
  }
  async readFile(_pId: string, _k: string): Promise<Blob> {
    return new Blob();
  }
  async writeFile(_pId: string, _k: string, _b: Blob, _m: { name?: string; mime: string }): Promise<void> {}
  async deleteProject(_id: string): Promise<void> {}
}

describe("SaveQueue (Task 21 / STORE-1, STORE-3, STORE-9, WS-3, WS-4)", () => {
  let mockProvider: MockStorageProvider;
  let projectService: ProjectService;
  let mockDb: MockDb;

  beforeEach(() => {
    vi.useFakeTimers();
    mockProvider = new MockStorageProvider();
    projectService = new ProjectService(mockProvider);
    mockDb = new MockDb();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces writes at ~500 ms and collapses rapid burst edits", async () => {
    const queue = new SaveQueue({
      projectService,
      debounceMs: 500,
      db: mockDb as unknown as AboardDatabase,
    });
    projectService.setSaveQueue(queue);

    const item: ItemRecord = {
      id: "board-1",
      projectId: "proj-1",
      kind: "board",
      title: "Board Title",
      updatedAt: Date.now(),
    };

    // 10 rapid strokes within 100 ms
    for (let i = 1; i <= 10; i++) {
      queue.enqueue("proj-1", item, `payload-v${i}`);
      vi.advanceTimersByTime(10);
    }

    expect(queue.getStatus()).toBe("saving");
    // Before 500 ms debounce expires, no writes have occurred
    expect(mockProvider.writes).toHaveLength(0);

    // Advance remaining time past 500 ms debounce
    await vi.advanceTimersByTimeAsync(500);

    // Assert only ONE write occurred with the latest payload
    expect(mockProvider.writes).toHaveLength(1);
    expect(mockProvider.writes[0].payload).toBe("payload-v10");
    expect(queue.getStatus()).toBe("saved-local");
  });

  it("coalesces burst edits per item across different items", async () => {
    const queue = new SaveQueue({
      projectService,
      debounceMs: 500,
      db: mockDb as unknown as AboardDatabase,
    });
    projectService.setSaveQueue(queue);

    const itemA: ItemRecord = {
      id: "item-A",
      projectId: "proj-1",
      kind: "board",
      title: "Board A",
      updatedAt: Date.now(),
    };

    const itemB: ItemRecord = {
      id: "item-B",
      projectId: "proj-1",
      kind: "circuit",
      title: "Circuit B",
      updatedAt: Date.now(),
    };

    // Burst edits on itemA and itemB
    queue.enqueue("proj-1", itemA, "payload-A1");
    queue.enqueue("proj-1", itemB, "payload-B1");
    queue.enqueue("proj-1", itemA, "payload-A2");
    queue.enqueue("proj-1", itemB, "payload-B2");
    queue.enqueue("proj-1", itemA, "payload-A3");

    await vi.advanceTimersByTimeAsync(500);

    // Should collapse to exactly 2 writes: latest for A and latest for B
    expect(mockProvider.writes).toHaveLength(2);
    const writeA = mockProvider.writes.find((w) => w.item.id === "item-A");
    const writeB = mockProvider.writes.find((w) => w.item.id === "item-B");

    expect(writeA?.payload).toBe("payload-A3");
    expect(writeB?.payload).toBe("payload-B2");
  });

  it("flushes immediately via flushNow() without waiting for debounce", async () => {
    const queue = new SaveQueue({
      projectService,
      debounceMs: 500,
      db: mockDb as unknown as AboardDatabase,
    });
    projectService.setSaveQueue(queue);

    const item: ItemRecord = {
      id: "board-immediate",
      projectId: "proj-1",
      kind: "board",
      title: "Board",
      updatedAt: Date.now(),
    };

    queue.enqueue("proj-1", item, "immediate-payload");
    expect(mockProvider.writes).toHaveLength(0);

    // Call flushNow immediately
    await queue.flushNow();

    expect(mockProvider.writes).toHaveLength(1);
    expect(mockProvider.writes[0].payload).toBe("immediate-payload");
    expect(queue.hasPending("proj-1", "board-immediate")).toBe(false);
    expect(queue.getStatus()).toBe("saved-local");
  });

  it("performs dirty -> clean transition in local mode", async () => {
    const transitions: Array<{ itemId: string; state: "dirty" | "clean" }> = [];
    const queue = new SaveQueue({
      projectService,
      debounceMs: 500,
      db: mockDb as unknown as AboardDatabase,
      onDirtyTransition: (itemId, state) => {
        transitions.push({ itemId, state });
      },
    });

    const item: ItemRecord = {
      id: "board-dirty-test",
      projectId: "proj-1",
      kind: "board",
      title: "Board",
      updatedAt: Date.now(),
    };

    // Pre-seed item in mock database
    await mockDb.items.put({
      ...item,
      dirty: 0,
      payload: "initial",
    });

    queue.enqueue("proj-1", item, "updated-payload");
    await queue.flushNow();

    // Verify transition: first dirty, then clean
    expect(transitions).toEqual([
      { itemId: "board-dirty-test", state: "dirty" },
      { itemId: "board-dirty-test", state: "clean" },
    ]);

    // Item in DB ends in clean state (dirty = 0)
    const storedItem = await mockDb.items.get("board-dirty-test");
    expect(storedItem?.dirty).toBe(0);

    // Outbox in local mode is cleared (no unsynced uploads left)
    const outboxCount = await mockDb.outbox.count();
    expect(outboxCount).toBe(0);
  });

  it("gates beforeunload: never shows dialog in local mode, prompts only when unsynced Drive entries exist", async () => {
    const queue = new SaveQueue({
      projectService,
      debounceMs: 500,
      db: mockDb as unknown as AboardDatabase,
    });

    const event = {
      preventDefault: vi.fn(),
      returnValue: undefined as string | undefined,
    } as unknown as BeforeUnloadEvent;

    // 1. Local mode with pending queue
    queue.enqueue("proj-1", {
      id: "item-local",
      projectId: "proj-1",
      kind: "board",
      title: "Board",
      updatedAt: Date.now(),
    }, "unsaved-payload");

    const promptedLocal = queue.handleBeforeUnload(event);

    // In local mode, flush runs immediately and dialog is NEVER shown
    expect(promptedLocal).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(event.returnValue).toBeUndefined();

    // 2. Drive mode simulated (Task 35 structure) with unsynced entries
    mockProvider.kind = "drive";
    const driveEvent = {
      preventDefault: vi.fn(),
      returnValue: undefined as string | undefined,
    } as unknown as BeforeUnloadEvent;

    // Simulate unsynced Drive entry
    queue.enqueue("proj-1", {
      id: "item-drive",
      projectId: "proj-1",
      kind: "board",
      title: "Drive Board",
      updatedAt: Date.now(),
    }, "drive-payload");

    // Flush marks dirty in Drive mode
    await queue.flushNow();

    const promptedDrive = queue.handleBeforeUnload(driveEvent);
    expect(promptedDrive).toBe(true);
    expect(driveEvent.preventDefault).toHaveBeenCalled();
    expect(driveEvent.returnValue).toBe("");
  });

  it("structures Drive upload cadence (3s idle, 30s continuous) without calling Drive code", async () => {
    const queue = new SaveQueue({
      projectService,
      debounceMs: 500,
      db: mockDb as unknown as AboardDatabase,
    });

    const driveUploadCalls: QueuedItem[][] = [];
    queue.setDriveUploadHook(async (items) => {
      driveUploadCalls.push(items);
    });

    expect(SaveQueue.DRIVE_CADENCE.idleDelayMs).toBe(3000);
    expect(SaveQueue.DRIVE_CADENCE.maxIntervalMs).toBe(30000);

    // In Phase 2 (local mode), Drive upload cadence is not scheduled
    queue.enqueue("proj-1", {
      id: "item-cadence",
      projectId: "proj-1",
      kind: "board",
      title: "Cadence",
      updatedAt: Date.now(),
    }, "payload");

    await vi.advanceTimersByTimeAsync(35000);
    expect(driveUploadCalls).toHaveLength(0);
  });

  it("handles silent persistence (STORE-9): skips Firefox and requests Chromium/Safari", async () => {
    // 1. Firefox UA: skipped entirely without calling persist()
    const firefoxPersist = vi.fn();
    const firefoxResult = await requestPersistenceSilently({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/119.0",
      storage: {
        persisted: vi.fn().mockResolvedValue(false),
        persist: firefoxPersist,
      } as unknown as StorageManager,
    });
    expect(firefoxResult).toBe(false);
    expect(firefoxPersist).not.toHaveBeenCalled();

    // 2. Chromium UA: calls persist()
    const chromePersist = vi.fn().mockResolvedValue(true);
    const chromeResult = await requestPersistenceSilently({
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      storage: {
        persisted: vi.fn().mockResolvedValue(false),
        persist: chromePersist,
      } as unknown as StorageManager,
    });
    expect(chromeResult).toBe(true);
    expect(chromePersist).toHaveBeenCalled();

    // 3. Already persisted: returns true immediately without calling persist()
    const alreadyPersist = vi.fn();
    const alreadyResult = await requestPersistenceSilently({
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Safari/605.1.15",
      storage: {
        persisted: vi.fn().mockResolvedValue(true),
        persist: alreadyPersist,
      } as unknown as StorageManager,
    });
    expect(alreadyResult).toBe(true);
    expect(alreadyPersist).not.toHaveBeenCalled();
  });
});
