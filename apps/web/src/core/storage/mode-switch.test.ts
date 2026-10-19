import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ProjectService } from "./project-service";
import { setDbFactoryForTesting, openDb, closeDb } from "@/core/db/lifecycle";
import type { AboardDatabase, FileRecord, ItemRecord as DbItemRecord, ProjectRecord, OutboxRecord } from "@/core/db";
import type { AlphaManifest } from "./types";
import { DriveProvider } from "../drive/drive-provider";
import * as driveApi from "../drive/api";
import { driveTokenManager } from "../drive/tokens";

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

  async delete(key: unknown): Promise<void> {
    const keyStr = Array.isArray(key) ? key.join(":") : String(key);
    this.data.delete(keyStr);
  }

  async update(key: unknown, changes: Partial<T>): Promise<void> {
    const keyStr = Array.isArray(key) ? key.join(":") : String(key);
    const existing = this.data.get(keyStr);
    if (existing) {
      Object.assign(existing, changes);
    }
  }

  async toArray(): Promise<T[]> {
    return Array.from(this.data.values()).map((v) => ({ ...v }));
  }

  async clear(): Promise<void> {
    this.data.clear();
  }

  where(field: string) {
    return {
      equals: (val: unknown) => ({
        toArray: async (): Promise<T[]> => {
          const res: T[] = [];
          for (const v of Array.from(this.data.values())) {
            if ((v as Record<string, unknown>)[field] === val) {
              res.push({ ...v });
            }
          }
          return res;
        },
        modify: async (changes: Partial<T>): Promise<number> => {
          let count = 0;
          for (const [k, v] of Array.from(this.data.entries())) {
            if ((v as Record<string, unknown>)[field] === val) {
              Object.assign(v as object, changes);
              count++;
            }
          }
          return count;
        },
      }),
    };
  }
}

class MockAboardDatabase {
  public name: string;
  public userId: string;
  public projects = new MockTable<ProjectRecord>((p) => p.id);
  public items = new MockTable<DbItemRecord>((i) => i.id);
  public files = new MockTable<FileRecord>((f) => `${f.projectId}:${f.key}`);
  public meta = new MockTable<{ key: string; value: unknown }>((m) => m.key);
  public outbox = new MockTable<OutboxRecord>((o) => `${o.projectId}:${o.itemId}`);
  private openState = true;

  constructor(userId: string) {
    this.userId = userId;
    this.name = `aboard:${userId}`;
  }

  isOpen(): boolean {
    return this.openState;
  }

  async open(): Promise<this> {
    this.openState = true;
    return this;
  }

  close(): void {
    this.openState = false;
  }
}

describe("Mode Switching (Local <-> Drive) (Task 37 / §11.6, LAUNCH-5, LAUNCH-6)", () => {
  let service: ProjectService;
  let mockDbInstance: MockAboardDatabase;
  let fakeIndexSyncer: {
    changed: Array<{ id: string; storage: string; driveFolderId?: string; localDeviceId?: string }>;
  };

  beforeEach(async () => {
    vi.restoreAllMocks();
    service = new ProjectService();

    mockDbInstance = new MockAboardDatabase("user-mode-switch-test");
    setDbFactoryForTesting(() => mockDbInstance as unknown as AboardDatabase);

    fakeIndexSyncer = { changed: [] };
    service.setIndexSyncer({
      onProjectCreated: async () => {},
      onProjectRenamed: async () => {},
      onProjectDeleted: async () => {},
      onStorageModeChanged: async (id, params) => {
        fakeIndexSyncer.changed.push({
          id,
          storage: params.storage,
          driveFolderId: params.driveFolderId,
          localDeviceId: params.localDeviceId,
        });
      },
    });

    vi.spyOn(driveTokenManager, "get").mockResolvedValue("mock-access-token");
    vi.spyOn(DriveProvider.prototype, "getProjectFolderId").mockResolvedValue("mock-folder-biology");
    vi.spyOn(DriveProvider.prototype, "writeFile").mockResolvedValue();
    vi.spyOn(DriveProvider.prototype, "writeItem").mockResolvedValue();
    vi.spyOn(DriveProvider.prototype, "saveManifest").mockResolvedValue();

    await openDb("user-mode-switch-test");
  });

  afterEach(async () => {
    await closeDb();
    setDbFactoryForTesting(null);
  });

  it("moves project from Local to Drive mode (uploads, unpins local files, updates index)", async () => {
    const projectId = "proj-local-to-drive";

    const manifest: AlphaManifest = {
      format: "alpha-project",
      formatVersion: 1,
      app: { name: "Aboard", version: "0.1.0" },
      project: {
        id: projectId,
        title: "Test Biology",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      items: [
        { id: "item-b1", kind: "board", title: "Board 1", path: "boards/item-b1.json" },
      ],
      files: [{ key: "file-hash-1", path: "files/file-hash-1.png", mime: "image/png", size: 100, sha256: "hash1" }],
      layout: { tabs: [], split: "none" },
    };

    await mockDbInstance.projects.put({
      id: projectId,
      storage: "local",
      updatedAt: Date.now(),
      title: "Test Biology",
      manifestJson: JSON.stringify(manifest),
    });

    await mockDbInstance.items.put({
      id: "item-b1",
      projectId,
      kind: "board",
      title: "Board 1",
      dirty: 0,
      updatedAt: Date.now(),
      payload: JSON.stringify({ elements: [] }),
    });

    await mockDbInstance.files.put({
      projectId,
      key: "file-hash-1",
      blob: new Blob(["sample image data"], { type: "image/png" }),
      mime: "image/png",
      size: 17,
      sha256: "file-hash-1",
      lastAccess: Date.now(),
      pinned: true, // initially pinned in local mode
    });

    const progressLog: string[] = [];
    const res = await service.moveProject(projectId, "drive", {
      driveFolderId: "drive-folder-biology",
      onProgress: (stage, current, total) => {
        progressLog.push(`${stage}:${current}/${total}`);
      },
    });

    expect(res.driveFolderId).toBe("drive-folder-biology");

    // Verify Dexie files are now UNPINNED (acting as cache in Drive mode)
    const fileRec = await mockDbInstance.files.get([projectId, "file-hash-1"]);
    expect(fileRec?.pinned).toBe(false);

    const projRec = await mockDbInstance.projects.get(projectId);
    expect(projRec?.storage).toBe("drive");

    // Verify index syncer updated storage to 'drive'
    expect(fakeIndexSyncer.changed).toContainEqual({
      id: projectId,
      storage: "drive",
      driveFolderId: "drive-folder-biology",
      localDeviceId: undefined,
    });

    // Verify progress callbacks fired
    expect(progressLog.some((p) => p.startsWith("files:"))).toBe(true);
    expect(progressLog.some((p) => p.startsWith("items:"))).toBe(true);
    expect(progressLog.some((p) => p.startsWith("manifest:"))).toBe(true);
  });

  it("moves project from Drive to Local mode (pins all files, updates index, optionally trashes Drive folder)", async () => {
    const projectId = "proj-drive-to-local";

    const manifest: AlphaManifest = {
      format: "alpha-project",
      formatVersion: 1,
      app: { name: "Aboard", version: "0.1.0" },
      project: {
        id: projectId,
        title: "Test Physics",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      items: [
        { id: "item-c1", kind: "circuit", title: "RLC Circuit", path: "circuits/item-c1.txt" },
      ],
      files: [{ key: "file-pdf-1", path: "files/file-pdf-1.pdf", mime: "application/pdf", size: 200, sha256: "hash2" }],
      layout: { tabs: [], split: "none" },
    };

    vi.spyOn(DriveProvider.prototype, "loadManifest").mockResolvedValue(manifest);
    vi.spyOn(DriveProvider.prototype, "readItem").mockResolvedValue("$ 1 0.000005 10 50 5 43");
    vi.spyOn(DriveProvider.prototype, "readFile").mockResolvedValue(new Blob(["mock pdf content"], { type: "application/pdf" }));

    await mockDbInstance.projects.put({
      id: projectId,
      storage: "drive",
      updatedAt: Date.now(),
      title: "Test Physics",
      manifestJson: JSON.stringify(manifest),
    });

    await mockDbInstance.items.put({
      id: "item-c1",
      projectId,
      kind: "circuit",
      title: "RLC Circuit",
      dirty: 0,
      updatedAt: Date.now(),
      payload: "$ 1 0.000005 10 50 5 43",
    });

    await mockDbInstance.files.put({
      projectId,
      key: "file-pdf-1",
      blob: new Blob(["mock pdf content"], { type: "application/pdf" }),
      mime: "application/pdf",
      size: 16,
      sha256: "file-pdf-1",
      lastAccess: Date.now(),
      pinned: false, // unpinned in Drive mode
    });

    const trashSpy = vi.spyOn(driveApi, "trashFile").mockResolvedValue();

    await service.moveProject(projectId, "local", {
      localDeviceId: "device-uuid-test",
      trashDriveFolder: true,
    });

    // 1. Verify Dexie files are now PINNED
    const fileRec = await mockDbInstance.files.get([projectId, "file-pdf-1"]);
    expect(fileRec?.pinned).toBe(true);

    const projRec = await mockDbInstance.projects.get(projectId);
    expect(projRec?.storage).toBe("local");

    // 2. Verify index syncer updated storage to 'local' with localDeviceId
    expect(fakeIndexSyncer.changed).toContainEqual({
      id: projectId,
      storage: "local",
      driveFolderId: undefined,
      localDeviceId: "device-uuid-test",
    });

    // 3. Verify trashFile was called
    expect(trashSpy).toHaveBeenCalled();
  });
});
