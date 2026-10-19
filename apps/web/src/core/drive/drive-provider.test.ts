import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AboardDatabase, FileRecord, ItemRecord as DbItemRecord, ProjectRecord, OutboxRecord } from "@/core/db";
import { DriveProvider } from "./drive-provider";
import { DriveTokenManager } from "./tokens";
import type { AlphaManifest, ItemRecord } from "../storage/types";
import * as driveApi from "./api";
import { useDriveStore } from "./drive-store";
import { bus } from "@/core/bus";

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

  async count(): Promise<number> {
    return this.data.size;
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
}

class MockDb {
  public projects = new MockTable<ProjectRecord>((p) => p.id);
  public items = new MockTable<DbItemRecord>((i) => i.id);
  public files = new MockTable<FileRecord>((f) => `${f.projectId}:${f.key}`);
  public outbox = new MockTable<OutboxRecord>((o) => `${o.projectId}:${o.itemId}`);

  async transaction(_mode: string, _tables: unknown[], fn: () => Promise<void>): Promise<void> {
    await fn();
  }
}

describe("DriveProvider (drive-provider.ts / STORE-2, STORE-3, STORE-7)", () => {
  let mockDb: MockDb;
  let tokenManager: DriveTokenManager;
  let provider: DriveProvider;

  const sampleManifest: AlphaManifest = {
    format: "alpha-project",
    formatVersion: 1,
    app: { name: "Aboard", version: "0.1.0" },
    project: {
      id: "proj-123456",
      title: "Cell Biology",
      subject: "Biology",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    items: [],
    files: [],
  };

  beforeEach(() => {
    mockDb = new MockDb();
    tokenManager = new DriveTokenManager();
    vi.spyOn(tokenManager, "get").mockResolvedValue("mock-token-abc");

    provider = new DriveProvider({
      db: mockDb as unknown as AboardDatabase,
      tokenManager,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("createProject creates root and project folder with appProperties, uploads manifest, and caches in Dexie", async () => {
    const rootFolder: driveApi.DriveFileMeta = { id: "root-folder-id", name: "Aboard" };
    const projectFolder: driveApi.DriveFileMeta = {
      id: "project-folder-id",
      name: "Cell Biology (proj-1)",
      appProperties: { aboardKind: "project", aboardProjectId: "proj-123456" },
    };

    vi.spyOn(driveApi, "getOrCreateRootFolder").mockResolvedValue(rootFolder);
    vi.spyOn(driveApi, "getOrCreateProjectFolder").mockResolvedValue(projectFolder);
    const uploadSpy = vi.spyOn(driveApi, "uploadFile").mockResolvedValue({
      id: "manifest-file-id",
      headRevisionId: "rev-1",
    });

    const res = await provider.createProject(sampleManifest);
    expect(res.driveFolderId).toBe("project-folder-id");

    // Check Drive upload called with appProperties
    expect(uploadSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "project.json",
        parents: ["project-folder-id"],
        appProperties: expect.objectContaining({
          aboardKind: "manifest",
          aboardProjectId: "proj-123456",
        }),
      }),
      expect.any(Blob),
      undefined,
      tokenManager
    );

    // Check local Dexie cached manifest
    const cached = await mockDb.projects.get("proj-123456");
    expect(cached).toBeDefined();
    expect(cached?.storage).toBe("drive");
    expect(JSON.parse(cached?.manifestJson || "{}").project.title).toBe("Cell Biology");
  });

  it("loadManifest loads from Dexie cache if present, else downloads from Drive", async () => {
    // 1. When present in Dexie
    await mockDb.projects.put({
      id: "proj-cached",
      storage: "drive",
      updatedAt: Date.now(),
      title: "Cached Project",
      manifestJson: JSON.stringify(sampleManifest),
    });

    const loadedCached = await provider.loadManifest("proj-cached");
    expect(loadedCached.project.id).toBe("proj-123456");

    // 2. When missing from Dexie, fetches from Drive
    vi.spyOn(provider, "getProjectFolderId").mockResolvedValue("folder-xyz");
    vi.spyOn(driveApi, "findFiles").mockResolvedValue([
      { id: "drive-manifest-id", name: "project.json" },
    ]);
    vi.spyOn(driveApi, "downloadFileText").mockResolvedValue(
      JSON.stringify({ ...sampleManifest, project: { ...sampleManifest.project, id: "proj-drive" } })
    );

    const loadedFromDrive = await provider.loadManifest("proj-drive");
    expect(loadedFromDrive.project.id).toBe("proj-drive");

    // Confirmed it was cached locally
    const cachedAfter = await mockDb.projects.get("proj-drive");
    expect(cachedAfter).toBeDefined();
  });

  it("saveManifest updates local Dexie cache and uploads to Drive", async () => {
    vi.spyOn(provider, "getProjectFolderId").mockResolvedValue("folder-123");
    vi.spyOn(driveApi, "findFiles").mockResolvedValue([
      { id: "manifest-drive-id", name: "project.json" },
    ]);
    const updateSpy = vi.spyOn(driveApi, "updateFileContent").mockResolvedValue({
      id: "manifest-drive-id",
      headRevisionId: "rev-2",
    });

    await provider.saveManifest(sampleManifest);

    expect(updateSpy).toHaveBeenCalledWith(
      "manifest-drive-id",
      expect.any(Blob),
      tokenManager
    );

    const local = await mockDb.projects.get(sampleManifest.project.id);
    expect(local?.manifestJson).toContain("Cell Biology");
  });

  it("writeItem buffers in Dexie, queues in outbox, uploads to Drive, and marks clean", async () => {
    vi.spyOn(provider, "getProjectFolderId").mockResolvedValue("folder-123");
    vi.spyOn(driveApi, "findFiles").mockResolvedValue([]);
    const uploadSpy = vi.spyOn(driveApi, "uploadFile").mockResolvedValue({
      id: "item-drive-id-1",
      headRevisionId: "rev-1",
    });

    const item: ItemRecord = {
      id: "board-item-1",
      projectId: "proj-123456",
      kind: "board",
      title: "Board 1",
      updatedAt: Date.now(),
    };

    await provider.writeItem("proj-123456", item, '{"elements": []}');

    expect(uploadSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "board-item-1.json",
        appProperties: expect.objectContaining({
          aboardKind: "board",
          aboardProjectId: "proj-123456",
          aboardItemId: "board-item-1",
        }),
      }),
      expect.any(Blob),
      undefined,
      tokenManager
    );

    // After upload completes, local item must be clean and outbox cleared
    const localItem = await mockDb.items.get("board-item-1");
    expect(localItem?.dirty).toBe(0);
    expect(localItem?.driveFileId).toBe("item-drive-id-1");

    const outboxCount = await mockDb.outbox.count();
    expect(outboxCount).toBe(0);
  });

  it("deleteItem trashes file in Drive and removes from Dexie", async () => {
    await mockDb.items.put({
      id: "item-to-delete",
      projectId: "proj-1",
      kind: "board",
      dirty: 0,
      updatedAt: Date.now(),
      driveFileId: "drive-file-to-trash",
    });

    const trashSpy = vi.spyOn(driveApi, "trashFile").mockResolvedValue(undefined);

    await provider.deleteItem("proj-1", "item-to-delete");

    expect(trashSpy).toHaveBeenCalledWith("drive-file-to-trash", tokenManager);
    const itemInDb = await mockDb.items.get("item-to-delete");
    expect(itemInDb).toBeUndefined();
  });

  it("writeFile writes to Dexie, checks Drive, and avoids duplicate upload if already on Drive", async () => {
    vi.spyOn(provider, "getProjectFolderId").mockResolvedValue("folder-123");

    // Simulate file ALREADY exists in Drive
    vi.spyOn(driveApi, "findFiles").mockResolvedValue([
      { id: "existing-drive-file-id", name: "hash-already-there" },
    ]);
    const uploadSpy = vi.spyOn(driveApi, "uploadFile");

    const blob = new Blob(["image data"], { type: "image/png" });
    await provider.writeFile("proj-1", "hash-already-there", blob, { mime: "image/png" });

    // Must NOT upload duplicate content-addressed file
    expect(uploadSpy).not.toHaveBeenCalled();

    // Dexie should be updated with the existing driveFileId and pinned: false
    const file = await mockDb.files.get(["proj-1", "hash-already-there"]);
    expect(file).toBeDefined();
    expect(file?.driveFileId).toBe("existing-drive-file-id");
    expect(file?.pinned).toBe(false);
  });

  it("readFile reads from Dexie cache if available; downloads and caches with pinned=false if missing", async () => {
    vi.spyOn(provider, "getProjectFolderId").mockResolvedValue("folder-123");

    // 1. File missing locally, exists on Drive
    vi.spyOn(driveApi, "findFiles").mockResolvedValue([
      { id: "drive-file-download", mimeType: "image/jpeg" },
    ]);
    const downloadedBlob = new Blob(["jpeg bytes"], { type: "image/jpeg" });
    const downloadSpy = vi.spyOn(driveApi, "downloadFileBlob").mockResolvedValue(downloadedBlob);

    const blob = await provider.readFile("proj-1", "hash-drive-img");
    expect(downloadSpy).toHaveBeenCalledWith("drive-file-download", tokenManager);
    expect(blob.size).toBe(downloadedBlob.size);

    // Verify it was cached in Dexie as clean Drive cache (pinned: false)
    const cachedFile = await mockDb.files.get(["proj-1", "hash-drive-img"]);
    expect(cachedFile).toBeDefined();
    expect(cachedFile?.pinned).toBe(false);
    expect(cachedFile?.driveFileId).toBe("drive-file-download");
  });

  it("deleteProject moves project folder to Drive trash and deletes Dexie records", async () => {
    vi.spyOn(provider, "getProjectFolderId").mockResolvedValue("proj-folder-to-trash");
    const trashSpy = vi.spyOn(driveApi, "trashFile").mockResolvedValue(undefined);

    await mockDb.projects.put({ id: "proj-1", storage: "drive", updatedAt: Date.now() });
    await mockDb.items.put({ id: "item-1", projectId: "proj-1", kind: "board", dirty: 0, updatedAt: Date.now() });

    await provider.deleteProject("proj-1");

    expect(trashSpy).toHaveBeenCalledWith("proj-folder-to-trash", tokenManager);
    expect(await mockDb.projects.get("proj-1")).toBeUndefined();
    expect(await mockDb.items.get("item-1")).toBeUndefined();
  });

  it("syncOutbox uploads pending outbox items and marks them clean", async () => {
    vi.spyOn(provider, "getProjectFolderId").mockResolvedValue("folder-123");
    vi.spyOn(driveApi, "findFiles").mockResolvedValue([]);
    const uploadSpy = vi.spyOn(driveApi, "uploadFile").mockResolvedValue({
      id: "synced-drive-id",
      headRevisionId: "rev-synced",
    });

    // Populate Dexie item marked dirty and an outbox entry
    await mockDb.items.put({
      id: "circuit-1",
      projectId: "proj-1",
      kind: "circuit",
      dirty: 1,
      title: "RLC Circuit",
      updatedAt: Date.now(),
      payload: "$ 1 5.0e-6 10.0 50 5.0 50",
    });

    await mockDb.outbox.put({
      projectId: "proj-1",
      itemId: "circuit-1",
      payload: "$ 1 5.0e-6 10.0 50 5.0 50",
      createdAt: Date.now(),
    });

    await provider.syncOutbox();

    expect(uploadSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "circuit-1.txt",
        appProperties: expect.objectContaining({
          aboardKind: "circuit",
          aboardItemId: "circuit-1",
        }),
      }),
      expect.any(Blob),
      undefined,
      tokenManager
    );

    const item = await mockDb.items.get("circuit-1");
    expect(item?.dirty).toBe(0);
    expect(item?.driveFileId).toBe("synced-drive-id");

    const outboxCount = await mockDb.outbox.count();
    expect(outboxCount).toBe(0);
  });

  describe("Conflict Detection & Resolution (Task 36 / §10.9–10.10)", () => {
    it("detects board conflict via headRevisionId and merges elements via reconcileElements", async () => {
      vi.spyOn(provider, "getProjectFolderId").mockResolvedValue("folder-123");

      // Setup initial cached board item with revision "rev-device-1"
      await mockDb.items.put({
        id: "board-1",
        projectId: "proj-1",
        kind: "board",
        title: "Architecture Diagram",
        dirty: 1,
        updatedAt: Date.now(),
        driveFileId: "drive-board-123",
        driveRev: "rev-device-1",
      });

      // Remote file in Drive has different headRevisionId "rev-device-2" (conflict!)
      vi.spyOn(driveApi, "getFileMeta").mockResolvedValue({
        id: "drive-board-123",
        name: "board-1.json",
        headRevisionId: "rev-device-2",
        trashed: false,
      });

      // Remote content: contains rectangle element A (version 1)
      const remoteBoardData = {
        elements: [{ id: "rect-a", type: "rectangle", version: 1, versionNonce: 10 }],
        appState: {},
      };
      vi.spyOn(driveApi, "downloadFileText").mockResolvedValue(JSON.stringify(remoteBoardData));

      // Local content: contains new rectangle element B
      const localBoardData = {
        elements: [{ id: "rect-b", type: "rectangle", version: 1, versionNonce: 20 }],
        appState: {},
      };

      const updateSpy = vi.spyOn(driveApi, "updateFileContent").mockResolvedValue({
        id: "drive-board-123",
        headRevisionId: "rev-merged-3",
      });

      await provider.writeItem(
        "proj-1",
        {
          id: "board-1",
          projectId: "proj-1",
          kind: "board",
          title: "Architecture Diagram",
          updatedAt: Date.now(),
        },
        JSON.stringify(localBoardData)
      );

      // Verify updateFileContent was called with merged elements (rect-a and rect-b)
      expect(updateSpy).toHaveBeenCalled();
      const updatedBlob = updateSpy.mock.calls[0][1] as Blob;
      const updatedText = await updatedBlob.text();
      const updatedJson = JSON.parse(updatedText) as { elements: Array<{ id: string }> };

      const elementIds = updatedJson.elements.map((e) => e.id);
      expect(elementIds).toContain("rect-a");
      expect(elementIds).toContain("rect-b");

      // Verify Dexie item was updated with merged result, marked clean, and new revision
      const cached = await mockDb.items.get("board-1");
      expect(cached?.dirty).toBe(0);
      expect(cached?.driveRev).toBe("rev-merged-3");
    });

    it("detects circuit conflict, creates conflict copy in Drive & Dexie & manifest, and loads remote version", async () => {
      vi.spyOn(provider, "getProjectFolderId").mockResolvedValue("folder-123");

      // Setup initial cached circuit item with revision "rev-circ-1"
      await mockDb.items.put({
        id: "circ-1",
        projectId: "proj-1",
        kind: "circuit",
        title: "Filter Circuit",
        dirty: 1,
        updatedAt: Date.now(),
        driveFileId: "drive-circ-123",
        driveRev: "rev-circ-1",
      });

      // Existing manifest in Dexie
      await mockDb.projects.put({
        id: "proj-1",
        storage: "drive",
        updatedAt: Date.now(),
        title: "Circuits Project",
        manifestJson: JSON.stringify({
          ...sampleManifest,
          project: { ...sampleManifest.project, id: "proj-1" },
          items: [{ id: "circ-1", kind: "circuit", title: "Filter Circuit", path: "circuits/circ-1.txt" }],
        }),
      });

      // Remote Drive file has differing headRevisionId "rev-circ-2"
      vi.spyOn(driveApi, "getFileMeta").mockResolvedValue({
        id: "drive-circ-123",
        name: "circ-1.txt",
        headRevisionId: "rev-circ-2",
        trashed: false,
      });

      const remoteCircuitContent = "$ 1 5.0e-6 10.0 50 (REMOTE EDIT)";
      vi.spyOn(driveApi, "downloadFileText").mockResolvedValue(remoteCircuitContent);

      const uploadSpy = vi.spyOn(driveApi, "uploadFile").mockResolvedValue({
        id: "drive-conflict-copy-id",
        headRevisionId: "rev-conflict-copy-1",
      });

      const localCircuitContent = "$ 1 5.0e-6 10.0 50 (LOCAL EDIT)";
      await provider.writeItem(
        "proj-1",
        {
          id: "circ-1",
          projectId: "proj-1",
          kind: "circuit",
          title: "Filter Circuit",
          updatedAt: Date.now(),
        },
        localCircuitContent
      );

      // 1. Proves local version was uploaded as a conflict copy
      expect(uploadSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: expect.stringMatching(/\.txt$/),
          appProperties: expect.objectContaining({
            aboardKind: "circuit",
            aboardConflictOf: "circ-1",
          }),
        }),
        expect.any(Blob),
        undefined,
        tokenManager
      );

      // 2. Proves conflict copy is registered in Dexie items store
      const allItems = await mockDb.items.toArray();
      const conflictItem = allItems.find((i) => i.id !== "circ-1");
      expect(conflictItem).toBeDefined();
      expect(conflictItem?.title).toContain("conflict");
      expect(conflictItem?.payload).toBe(localCircuitContent);
      expect(conflictItem?.driveFileId).toBe("drive-conflict-copy-id");

      // 3. Proves project manifest is updated with the conflict item
      const updatedManifestRow = await mockDb.projects.get("proj-1");
      const updatedManifest = JSON.parse(updatedManifestRow?.manifestJson || "{}") as AlphaManifest;
      expect(updatedManifest.items.some((i) => i.id === conflictItem?.id)).toBe(true);

      // 4. Proves active item was updated with remote payload and revision
      const activeItem = await mockDb.items.get("circ-1");
      expect(activeItem?.payload).toBe(remoteCircuitContent);
      expect(activeItem?.driveRev).toBe("rev-circ-2");
      expect(activeItem?.dirty).toBe(0);
    });
  });

  describe("Drive Error Handling & Resilience (Task 36 / §10.10, SEC-6)", () => {
    beforeEach(() => {
      useDriveStore.getState().setQuotaExceeded(false);
      useDriveStore.getState().setReconnectRequired(false);
    });

    it("handles 403 storageQuotaExceeded by setting quota state, preserving outbox, and not throwing", async () => {
      vi.spyOn(provider, "getProjectFolderId").mockResolvedValue("folder-123");
      vi.spyOn(driveApi, "findFiles").mockResolvedValue([]);
      vi.spyOn(driveApi, "uploadFile").mockRejectedValue(
        new driveApi.StorageQuotaExceededError("Google Drive quota exceeded")
      );

      const writePromise = provider.writeItem(
        "proj-1",
        {
          id: "board-quota",
          projectId: "proj-1",
          kind: "board",
          title: "Quota Board",
          updatedAt: Date.now(),
        },
        '{"elements":[]}'
      );

      // 1. writeItem MUST NOT THROW
      await expect(writePromise).resolves.not.toThrow();

      // 2. Local Dexie save succeeded
      const localItem = await mockDb.items.get("board-quota");
      expect(localItem).toBeDefined();
      expect(localItem?.payload).toBe('{"elements":[]}');
      expect(localItem?.dirty).toBe(1);

      // 3. Outbox preserves the unsynced entry
      const outboxEntry = await mockDb.outbox.where("itemId").equals("board-quota").first();
      expect(outboxEntry).toBeDefined();

      // 4. Store reflects quotaExceeded: true
      expect(useDriveStore.getState().quotaExceeded).toBe(true);
    });

    it("handles 404 missing / trashed file by recreating it in Drive from local Dexie cache", async () => {
      vi.spyOn(provider, "getProjectFolderId").mockResolvedValue("folder-123");

      await mockDb.items.put({
        id: "item-deleted-in-drive",
        projectId: "proj-1",
        kind: "circuit",
        title: "Oscillator",
        dirty: 1,
        updatedAt: Date.now(),
        driveFileId: "drive-missing-file-404",
        driveRev: "rev-old",
        payload: "circuit oscillator data",
      });

      // getFileMeta throws 404 (file removed in Drive)
      vi.spyOn(driveApi, "getFileMeta").mockRejectedValue(
        new driveApi.DriveApiError(404, "File not found")
      );

      const recreateSpy = vi.spyOn(driveApi, "uploadFile").mockResolvedValue({
        id: "recreated-drive-file-id",
        headRevisionId: "rev-new-recreated",
      });

      await provider.writeItem(
        "proj-1",
        {
          id: "item-deleted-in-drive",
          projectId: "proj-1",
          kind: "circuit",
          title: "Oscillator",
          updatedAt: Date.now(),
        },
        "circuit oscillator data"
      );

      // File was recreated via uploadFile
      expect(recreateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "item-deleted-in-drive.txt",
          parents: ["folder-123"],
        }),
        expect.any(Blob),
        undefined,
        tokenManager
      );

      // Dexie item now points to the recreated file
      const updatedItem = await mockDb.items.get("item-deleted-in-drive");
      expect(updatedItem?.driveFileId).toBe("recreated-drive-file-id");
      expect(updatedItem?.driveRev).toBe("rev-new-recreated");
      expect(updatedItem?.dirty).toBe(0);
    });

    it("handles 401 revocation by setting reconnectRequired, preserving local save, and not throwing", async () => {
      vi.spyOn(provider, "getProjectFolderId").mockResolvedValue("folder-123");
      vi.spyOn(driveApi, "findFiles").mockResolvedValue([]);
      vi.spyOn(driveApi, "uploadFile").mockRejectedValue(
        new driveApi.DriveApiError(401, "Invalid credentials")
      );

      const writePromise = provider.writeItem(
        "proj-1",
        {
          id: "item-revoked",
          projectId: "proj-1",
          kind: "board",
          title: "Revoked Board",
          updatedAt: Date.now(),
        },
        '{"elements":[]}'
      );

      await expect(writePromise).resolves.not.toThrow();

      // Local save is intact
      expect(await mockDb.items.get("item-revoked")).toBeDefined();
      expect(useDriveStore.getState().reconnectRequired).toBe(true);
    });

    it("reconnects and flushes pending outbox automatically", async () => {
      vi.spyOn(provider, "getProjectFolderId").mockResolvedValue("folder-123");
      vi.spyOn(driveApi, "findFiles").mockResolvedValue([]);
      const uploadSpy = vi.spyOn(driveApi, "uploadFile").mockResolvedValue({
        id: "flushed-id",
        headRevisionId: "rev-flushed",
      });

      // Put item in Dexie and outbox
      await mockDb.items.put({
        id: "pending-reconnect-item",
        projectId: "proj-1",
        kind: "board",
        dirty: 1,
        title: "Pending Item",
        updatedAt: Date.now(),
        payload: '{"elements":["pending"]}',
      });
      await mockDb.outbox.put({
        projectId: "proj-1",
        itemId: "pending-reconnect-item",
        payload: '{"elements":["pending"]}',
        createdAt: Date.now(),
      });

      // Simulate drive reconnection event
      useDriveStore.getState().setReconnectRequired(false);
      bus.emit("drive:connected", { email: "user@example.com" });

      await provider.syncOutbox();

      expect(uploadSpy).toHaveBeenCalled();
      const updated = await mockDb.items.get("pending-reconnect-item");
      expect(updated?.dirty).toBe(0);
      expect(updated?.driveFileId).toBe("flushed-id");
    });
  });
});
