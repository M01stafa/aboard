import type { StorageProvider, ItemRecord, AlphaManifest } from "../storage/types";
import { getDb, type AboardDatabase } from "@/core/db";
import { bus } from "@/core/bus";
import type { reconcileElements as ReconcileFn } from "@excalidraw/excalidraw";
import {
  getOrCreateRootFolder,
  getOrCreateProjectFolder,
  findFiles,
  getFileMeta,
  uploadFile,
  updateFileContent,
  downloadFileBlob,
  downloadFileText,
  trashFile,
  DriveApiError,
  StorageQuotaExceededError,
  type DriveFileMeta,
  type AboardKind,
} from "./api";
import { evictLruCacheIfNeeded } from "./cache-eviction";
import { driveTokenManager, type DriveTokenManager } from "./tokens";
import { useDriveStore } from "./drive-store";

export interface DriveProviderOptions {
  db?: AboardDatabase;
  tokenManager?: DriveTokenManager;
}

/**
 * DriveProvider: backs the StorageProvider interface with Google Drive,
 * using the local Dexie database as buffer, write queue, and cache.
 * Implements docs/specs/google-drive.md §10.7–10.10 and docs/specs/storage-layer.md §11.1–11.4.
 */
export class DriveProvider implements StorageProvider {
  readonly kind: "drive" = "drive";
  private customDb?: AboardDatabase;
  private tokenManager: DriveTokenManager;
  private rootFolderIdCache?: string;
  private projectFolderIdMap = new Map<string, string>(); // projectId -> folderId

  constructor(options?: DriveProviderOptions) {
    this.customDb = options?.db;
    this.tokenManager = options?.tokenManager ?? driveTokenManager;

    if (typeof window !== "undefined") {
      bus.on("drive:connected", () => {
        void this.syncOutbox();
      });
    }
  }

  private resolveDb(): AboardDatabase {
    const db = this.customDb ?? getDb();
    if (!db) {
      throw new Error("Local database is not open. User must be signed in.");
    }
    return db;
  }

  /**
   * Resolves or creates the Aboard root folder in the user's My Drive.
   */
  async getRootFolderId(): Promise<string> {
    if (this.rootFolderIdCache) return this.rootFolderIdCache;
    const root = await getOrCreateRootFolder(this.tokenManager);
    this.rootFolderIdCache = root.id;
    return root.id;
  }

  /**
   * Resolves or creates the project folder under root.
   */
  async getProjectFolderId(projectId: string, title?: string): Promise<string> {
    if (this.projectFolderIdMap.has(projectId)) {
      return this.projectFolderIdMap.get(projectId)!;
    }

    const rootId = await this.getRootFolderId();

    // If title was not provided, look in local Dexie first
    let resolvedTitle = title;
    if (!resolvedTitle) {
      const db = this.resolveDb();
      const proj = await db.projects.get(projectId);
      resolvedTitle = proj?.title || "Untitled Project";
    }

    const folder = await getOrCreateProjectFolder(
      projectId,
      resolvedTitle,
      rootId,
      this.tokenManager
    );

    this.projectFolderIdMap.set(projectId, folder.id);
    return folder.id;
  }

  async createProject(manifest: AlphaManifest): Promise<{ driveFolderId?: string }> {
    const db = this.resolveDb();
    const folderId = await this.getProjectFolderId(
      manifest.project.id,
      manifest.project.title
    );

    // Save manifest in local Dexie buffer
    await db.projects.put({
      id: manifest.project.id,
      storage: "drive",
      updatedAt: Date.now(),
      title: manifest.project.title,
      manifestJson: JSON.stringify(manifest),
    });

    // Upload project.json into project folder in Drive
    const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], {
      type: "application/json",
    });

    await uploadFile(
      {
        name: "project.json",
        mimeType: "application/json",
        parents: [folderId],
        appProperties: {
          aboardKind: "manifest",
          aboardProjectId: manifest.project.id,
        },
      },
      manifestBlob,
      undefined,
      this.tokenManager
    );

    return { driveFolderId: folderId };
  }

  async loadManifest(projectId: string): Promise<AlphaManifest> {
    const db = this.resolveDb();

    // 1. Check local Dexie first
    const row = await db.projects.get(projectId);
    if (row?.manifestJson) {
      try {
        return JSON.parse(row.manifestJson) as AlphaManifest;
      } catch {
        // Fall back to Drive on parse error
      }
    }

    // 2. Fetch manifest from Drive
    const folderId = await this.getProjectFolderId(projectId);
    const query = `'${folderId}' in parents and appProperties has { key='aboardKind' and value='manifest' } and trashed = false`;
    const files = await findFiles(query, undefined, this.tokenManager);

    if (files.length === 0) {
      throw new Error(`Manifest for project ${projectId} not found in Google Drive`);
    }

    const text = await downloadFileText(files[0].id, this.tokenManager);
    const manifest = JSON.parse(text) as AlphaManifest;

    // Cache locally
    await db.projects.put({
      id: projectId,
      storage: "drive",
      updatedAt: Date.now(),
      title: manifest.project.title,
      manifestJson: text,
    });

    return manifest;
  }

  async saveManifest(manifest: AlphaManifest): Promise<void> {
    const db = this.resolveDb();
    const manifestJson = JSON.stringify(manifest, null, 2);

    // Save to local cache
    await db.projects.put({
      id: manifest.project.id,
      storage: "drive",
      updatedAt: Date.now(),
      title: manifest.project.title,
      manifestJson,
    });

    // Update or create in Drive
    const folderId = await this.getProjectFolderId(
      manifest.project.id,
      manifest.project.title
    );
    const query = `'${folderId}' in parents and appProperties has { key='aboardKind' and value='manifest' } and trashed = false`;
    const files = await findFiles(query, undefined, this.tokenManager);

    const blob = new Blob([manifestJson], { type: "application/json" });

    if (files.length > 0) {
      await updateFileContent(files[0].id, blob, this.tokenManager);
    } else {
      await uploadFile(
        {
          name: "project.json",
          mimeType: "application/json",
          parents: [folderId],
          appProperties: {
            aboardKind: "manifest",
            aboardProjectId: manifest.project.id,
          },
        },
        blob,
        undefined,
        this.tokenManager
      );
    }
  }

  async readItem(projectId: string, itemId: string): Promise<string> {
    const db = this.resolveDb();

    // 1. Check local Dexie
    const local = await db.items.get(itemId);
    if (local && local.projectId === projectId && local.payload !== undefined) {
      return local.payload;
    }

    // 2. Fetch from Drive
    const folderId = await this.getProjectFolderId(projectId);
    const query = `'${folderId}' in parents and appProperties has { key='aboardItemId' and value='${itemId}' } and trashed = false`;
    const files = await findFiles(query, undefined, this.tokenManager);

    if (files.length === 0) {
      throw new Error(`Item not found: ${itemId} in project ${projectId}`);
    }

    const driveFile = files[0];
    const text = await downloadFileText(driveFile.id, this.tokenManager);

    const kind =
      (driveFile.appProperties?.aboardKind as ItemRecord["kind"]) || "board";

    // Cache in local Dexie
    await db.items.put({
      id: itemId,
      projectId,
      kind,
      dirty: 0,
      updatedAt: Date.now(),
      title: driveFile.name,
      payload: text,
      driveFileId: driveFile.id,
      driveRev: driveFile.headRevisionId,
    });

    return text;
  }

  async writeItem(
    projectId: string,
    item: ItemRecord,
    payload: string
  ): Promise<void> {
    const db = this.resolveDb();

    // 1. Buffer in local Dexie with dirty flag
    const existing = await db.items.get(item.id);
    await db.items.put({
      id: item.id,
      projectId,
      kind: item.kind,
      dirty: 1,
      updatedAt: item.updatedAt || Date.now(),
      title: item.title,
      payload,
      driveFileId: existing?.driveFileId,
      driveRev: existing?.driveRev,
    });

    // 2. Queue in outbox
    const outboxRow = await db.outbox.where("itemId").equals(item.id).first();
    if (outboxRow?.seq) {
      await db.outbox.update(outboxRow.seq, {
        payload,
        createdAt: Date.now(),
      });
    } else {
      await db.outbox.put({
        projectId,
        itemId: item.id,
        payload,
        createdAt: Date.now(),
      });
    }

    // 3. If Drive quota is exceeded or token is revoked, do not attempt upload now.
    // Local save is already guaranteed in Dexie and queued in outbox.
    const store = useDriveStore.getState();
    if (store.quotaExceeded || store.reconnectRequired) {
      return;
    }

    // 4. Upload to Drive with resilient error protection (SEC-6 / STORE-3: never fail local save)
    try {
      await this.uploadItemToDrive(projectId, item, payload);
    } catch (err: unknown) {
      const isQuota =
        err instanceof StorageQuotaExceededError ||
        (err instanceof DriveApiError && err.isQuotaExceeded) ||
        (err instanceof Error &&
          (err.name === "StorageQuotaExceededError" ||
            err.message.includes("storageQuotaExceeded") ||
            err.message.includes("quota")));

      const isAuth =
        (err instanceof DriveApiError && (err.status === 401 || err.status === 409)) ||
        (err instanceof Error &&
          (err.message.includes("401") ||
            err.message.includes("invalid_grant") ||
            err.message.includes("reconnect-required")));

      if (isQuota) {
        store.setQuotaExceeded(true);
        bus.emit("drive:quota-exceeded", { exceeded: true });
      } else if (isAuth) {
        store.setReconnectRequired(true);
        bus.emit("drive:reconnect-required", { reason: "unauthorized" });
      }
      // Error is absorbed here so local canvas/editor never crashes or stops saving.
    }
  }

  private async uploadItemToDrive(
    projectId: string,
    item: ItemRecord,
    payload: string
  ): Promise<void> {
    const db = this.resolveDb();
    const folderId = await this.getProjectFolderId(projectId);

    let driveFileId = (await db.items.get(item.id))?.driveFileId;

    if (!driveFileId) {
      const query = `'${folderId}' in parents and appProperties has { key='aboardItemId' and value='${item.id}' } and trashed = false`;
      const existing = await findFiles(query, undefined, this.tokenManager);
      if (existing.length > 0) {
        driveFileId = existing[0].id;
      }
    }

    const { fileName, mimeType } = this.getItemFileInfo(item);
    const blob = new Blob([payload], { type: mimeType });

    if (driveFileId) {
      // Inspect remote file metadata to detect conflicts or external deletion
      let remoteMeta: DriveFileMeta | null = null;
      try {
        remoteMeta = await getFileMeta(
          driveFileId,
          "id,headRevisionId,trashed,name",
          this.tokenManager
        );
      } catch (err: unknown) {
        if (err instanceof DriveApiError && err.status === 404) {
          remoteMeta = null;
        } else {
          throw err;
        }
      }

      // Scenario A: File was deleted or moved to trash in Drive -> Recreate from local cache
      if (!remoteMeta || remoteMeta.trashed) {
        const recreated = await uploadFile(
          {
            name: fileName,
            mimeType,
            parents: [folderId],
            appProperties: {
              aboardKind: item.kind as AboardKind,
              aboardProjectId: projectId,
              aboardItemId: item.id,
            },
          },
          blob,
          undefined,
          this.tokenManager
        );

        await db.items.update(item.id, {
          dirty: 0,
          driveFileId: recreated.id,
          driveRev: recreated.headRevisionId,
        });
        await db.outbox.where("itemId").equals(item.id).delete();
        return;
      }

      // Scenario B: Conflict Detection
      const localItem = await db.items.get(item.id);
      const cachedRev = localItem?.driveRev;
      const remoteRev = remoteMeta.headRevisionId;

      if (cachedRev && remoteRev && cachedRev !== remoteRev) {
        // CONFLICT DETECTED!
        if (item.kind === "board") {
          // Boards: merge elements with @excalidraw/excalidraw's reconcileElements
          const remotePayload = await downloadFileText(driveFileId, this.tokenManager);
          try {
            const localBoard = JSON.parse(payload) as {
              elements?: Array<{ id: string; version?: number; versionNonce?: number }>;
              appState?: Record<string, unknown>;
              files?: Record<string, unknown>;
              [key: string]: unknown;
            };
            const remoteBoard = JSON.parse(remotePayload) as {
              elements?: Array<{ id: string; version?: number; versionNonce?: number }>;
              appState?: Record<string, unknown>;
              files?: Record<string, unknown>;
              [key: string]: unknown;
            };

            const { reconcileElements } = await import("@excalidraw/excalidraw");
            const mergedElements = reconcileElements(
              (localBoard.elements || []) as unknown as Parameters<typeof ReconcileFn>[0],
              (remoteBoard.elements || []) as unknown as Parameters<typeof ReconcileFn>[1],
              (localBoard.appState || {}) as unknown as Parameters<typeof ReconcileFn>[2]
            );

            const mergedObj = {
              ...localBoard,
              elements: mergedElements,
              files: { ...(remoteBoard.files || {}), ...(localBoard.files || {}) },
            };
            const mergedPayload = JSON.stringify(mergedObj, null, 2);
            const mergedBlob = new Blob([mergedPayload], { type: "application/json" });

            const updated = await updateFileContent(driveFileId, mergedBlob, this.tokenManager);

            await db.items.update(item.id, {
              dirty: 0,
              payload: mergedPayload,
              driveRev: updated.headRevisionId,
            });
            await db.outbox.where("itemId").equals(item.id).delete();
            return;
          } catch {
            // Fall through to normal update if parsing fails
          }
        } else if (item.kind === "circuit" || item.kind === "annotations") {
          // Circuits / Annotations: Keep BOTH versions
          const dateStr = new Date().toISOString().split("T")[0];
          const conflictItemId =
            typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : `conflict-${Date.now()}`;
          const conflictTitle = `${item.title || item.id} (conflict ${dateStr})`;
          const ext = item.kind === "circuit" ? "txt" : "json";
          const conflictFileName = `${conflictItemId}.${ext}`;

          // 1. Upload local payload as a new conflict file in Drive
          const conflictUpload = await uploadFile(
            {
              name: conflictFileName,
              mimeType,
              parents: [folderId],
              appProperties: {
                aboardKind: item.kind as AboardKind,
                aboardProjectId: projectId,
                aboardItemId: conflictItemId,
                aboardConflictOf: item.id,
              },
            },
            blob,
            undefined,
            this.tokenManager
          );

          // 2. Register conflict copy in Dexie items store so it is visible in the workspace
          await db.items.put({
            id: conflictItemId,
            projectId,
            kind: item.kind,
            dirty: 0,
            updatedAt: Date.now(),
            title: conflictTitle,
            payload,
            driveFileId: conflictUpload.id,
            driveRev: conflictUpload.headRevisionId,
          });

          // 3. Register conflict copy in project manifest
          try {
            const manifest = await this.loadManifest(projectId);
            const exists = manifest.items.some((i) => i.id === conflictItemId);
            if (!exists) {
              const subfolder = item.kind === "circuit" ? "circuits" : "annotations";
              manifest.items.push({
                id: conflictItemId,
                kind: item.kind,
                title: conflictTitle,
                path: `${subfolder}/${conflictFileName}`,
              });
              await this.saveManifest(manifest);
            }
          } catch {
            // Non-fatal if manifest update fails
          }

          // 4. Download remote version into the active item
          const remotePayload = await downloadFileText(driveFileId, this.tokenManager);
          await db.items.update(item.id, {
            dirty: 0,
            payload: remotePayload,
            driveRev: remoteRev,
          });
          await db.outbox.where("itemId").equals(item.id).delete();
          return;
        }
      }

      // Normal update when no conflict
      const result = await updateFileContent(driveFileId, blob, this.tokenManager);
      await db.items.update(item.id, {
        dirty: 0,
        driveFileId: result.id,
        driveRev: result.headRevisionId,
      });
      await db.outbox.where("itemId").equals(item.id).delete();
      return;
    }

    // New item creation
    const result = await uploadFile(
      {
        name: fileName,
        mimeType,
        parents: [folderId],
        appProperties: {
          aboardKind: item.kind as AboardKind,
          aboardProjectId: projectId,
          aboardItemId: item.id,
        },
      },
      blob,
      undefined,
      this.tokenManager
    );

    await db.items.update(item.id, {
      dirty: 0,
      driveFileId: result.id,
      driveRev: result.headRevisionId,
    });

    await db.outbox.where("itemId").equals(item.id).delete();
  }

  private getItemFileInfo(item: ItemRecord): { fileName: string; mimeType: string } {
    switch (item.kind) {
      case "board":
        return { fileName: `${item.id}.json`, mimeType: "application/json" };
      case "circuit":
        return { fileName: `${item.id}.txt`, mimeType: "text/plain" };
      case "pdf":
        return { fileName: `${item.id}.json`, mimeType: "application/json" };
      case "annotations":
        return { fileName: `${item.id}.json`, mimeType: "application/json" };
      default:
        return { fileName: `${item.id}.json`, mimeType: "application/json" };
    }
  }

  async deleteItem(projectId: string, itemId: string): Promise<void> {
    const db = this.resolveDb();
    const item = await db.items.get(itemId);

    let fileId = item?.driveFileId;
    if (!fileId) {
      const folderId = await this.getProjectFolderId(projectId);
      const query = `'${folderId}' in parents and appProperties has { key='aboardItemId' and value='${itemId}' } and trashed = false`;
      const files = await findFiles(query, undefined, this.tokenManager);
      if (files.length > 0) {
        fileId = files[0].id;
      }
    }

    if (fileId) {
      await trashFile(fileId, this.tokenManager);
    }

    await db.items.delete(itemId);
    await db.outbox.where("itemId").equals(itemId).delete();
  }

  async hasFile(projectId: string, key: string): Promise<boolean> {
    const db = this.resolveDb();
    const local = await db.files.get([projectId, key]);
    if (local !== undefined) return true;

    const folderId = await this.getProjectFolderId(projectId);
    const query = `'${folderId}' in parents and appProperties has { key='aboardKind' and value='file' } and appProperties has { key='aboardFileHash' and value='${key}' } and trashed = false`;
    const files = await findFiles(query, undefined, this.tokenManager);
    return files.length > 0;
  }

  async readFile(projectId: string, key: string): Promise<Blob> {
    const db = this.resolveDb();

    // 1. Check local Dexie cache
    const local = await db.files.get([projectId, key]);
    if (local?.blob) {
      await db.files.update([projectId, key], { lastAccess: Date.now() });
      return local.blob;
    }

    // 2. Fetch from Drive
    const folderId = await this.getProjectFolderId(projectId);
    const query = `'${folderId}' in parents and appProperties has { key='aboardKind' and value='file' } and appProperties has { key='aboardFileHash' and value='${key}' } and trashed = false`;
    const files = await findFiles(query, undefined, this.tokenManager);

    if (files.length === 0) {
      throw new Error(`File not found: ${key} in project ${projectId}`);
    }

    const driveFile = files[0];
    const blob = await downloadFileBlob(driveFile.id, this.tokenManager);

    // 3. Cache locally (unpinned Drive cache)
    await db.files.put({
      projectId,
      key,
      blob,
      mime: driveFile.mimeType || "application/octet-stream",
      size: blob.size,
      sha256: key,
      driveFileId: driveFile.id,
      lastAccess: Date.now(),
      pinned: false,
    });

    // 4. Run cache eviction check
    await evictLruCacheIfNeeded(db);

    return blob;
  }

  async writeFile(
    projectId: string,
    key: string,
    blob: Blob,
    meta: { name?: string; mime: string }
  ): Promise<void> {
    const db = this.resolveDb();

    // 1. Write to local cache (pinned: false, lastAccess: now)
    await db.files.put({
      projectId,
      key,
      blob,
      mime: meta.mime,
      size: blob.size,
      sha256: key,
      lastAccess: Date.now(),
      pinned: false,
    });

    // 2. Check if already uploaded to Drive (content-addressed files are written only once)
    const folderId = await this.getProjectFolderId(projectId);
    const query = `'${folderId}' in parents and appProperties has { key='aboardKind' and value='file' } and appProperties has { key='aboardFileHash' and value='${key}' } and trashed = false`;
    const existing = await findFiles(query, undefined, this.tokenManager);

    let driveFileId: string;

    if (existing.length > 0) {
      driveFileId = existing[0].id;
    } else {
      // 3. Upload file (multipart if < 5MB, resumable if >= 5MB)
      const fileName = meta.name ? `${key}-${meta.name}` : key;
      const uploaded = await uploadFile(
        {
          name: fileName,
          mimeType: meta.mime || "application/octet-stream",
          parents: [folderId],
          appProperties: {
            aboardKind: "file",
            aboardProjectId: projectId,
            aboardFileHash: key,
            aboardFileKey: key,
          },
        },
        blob,
        undefined,
        this.tokenManager
      );
      driveFileId = uploaded.id;
    }

    // 4. Update driveFileId in local Dexie cache
    await db.files.update([projectId, key], { driveFileId });

    // 5. Run cache eviction check
    await evictLruCacheIfNeeded(db);
  }

  async listFiles(
    projectId: string
  ): Promise<Array<{ key: string; name?: string; mime: string; size: number }>> {
    const db = this.resolveDb();
    const records = await db.files.where("projectId").equals(projectId).toArray();
    return records.map((r) => ({
      key: r.key,
      name: `file-${r.key}`,
      mime: r.mime || "application/octet-stream",
      size: r.size || (r.blob?.size ?? 0),
    }));
  }

  async deleteProject(projectId: string): Promise<void> {
    const db = this.resolveDb();

    // Trash project folder in Drive
    try {
      const folderId = await this.getProjectFolderId(projectId);
      await trashFile(folderId, this.tokenManager);
    } catch {
      // Non-fatal if folder was already removed
    }

    // Clean up local Dexie tables
    await db.transaction("rw", [db.projects, db.items, db.files, db.outbox], async () => {
      await db.projects.delete(projectId);
      await db.items.where("projectId").equals(projectId).delete();
      await db.files.where("projectId").equals(projectId).delete();
      await db.outbox.where("projectId").equals(projectId).delete();
    });

    this.projectFolderIdMap.delete(projectId);
  }

  /**
   * Uploads all pending items from the Dexie outbox to Google Drive.
   * Invoked by SaveQueue on 3s idle, 30s continuous, or flushNow().
   */
  async syncOutbox(): Promise<void> {
    const store = useDriveStore.getState();
    if (store.quotaExceeded || store.reconnectRequired) {
      return;
    }

    const db = this.resolveDb();
    const outboxEntries = await db.outbox.toArray();

    for (const entry of outboxEntries) {
      const item = await db.items.get(entry.itemId);
      if (!item || !item.payload) {
        if (entry.seq) await db.outbox.delete(entry.seq);
        continue;
      }
      const storageItem: ItemRecord = {
        id: item.id,
        projectId: item.projectId,
        kind: item.kind,
        title: item.title || item.id,
        updatedAt: item.updatedAt || Date.now(),
      };
      try {
        await this.uploadItemToDrive(entry.projectId, storageItem, item.payload);
      } catch (err: unknown) {
        const isQuota =
          err instanceof StorageQuotaExceededError ||
          (err instanceof DriveApiError && err.isQuotaExceeded) ||
          (err instanceof Error &&
            (err.name === "StorageQuotaExceededError" ||
              err.message.includes("storageQuotaExceeded") ||
              err.message.includes("quota")));

        const isAuth =
          (err instanceof DriveApiError && (err.status === 401 || err.status === 409)) ||
          (err instanceof Error &&
            (err.message.includes("401") ||
              err.message.includes("invalid_grant") ||
              err.message.includes("reconnect-required")));

        if (isQuota) {
          store.setQuotaExceeded(true);
          bus.emit("drive:quota-exceeded", { exceeded: true });
          break; // Stop further attempts while quota is full
        } else if (isAuth) {
          store.setReconnectRequired(true);
          bus.emit("drive:reconnect-required", { reason: "unauthorized" });
          break; // Stop further attempts while revoked/unauthorized
        }
      }
    }
  }
}

if (typeof window !== "undefined") {
  (window as unknown as { __aboard_DriveProvider?: typeof DriveProvider }).__aboard_DriveProvider =
    DriveProvider;
}
