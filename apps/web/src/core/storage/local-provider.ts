import type { StorageProvider, ItemRecord, AlphaManifest } from "./types";
import { getDb, type AboardDatabase } from "@/core/db";

/**
 * LocalProvider: backs the StorageProvider interface with the local Dexie database (Task 19).
 * Marks every row as pinned = true (Requirement 4 / docs/specs/storage-layer.md §11.2)
 * so future Drive cache eviction can never touch local mode data.
 */
export class LocalProvider implements StorageProvider {
  readonly kind: "local" = "local";
  private customDb?: AboardDatabase;

  constructor(db?: AboardDatabase) {
    this.customDb = db;
  }

  private resolveDb(): AboardDatabase {
    const db = this.customDb ?? getDb();
    if (!db) {
      throw new Error("Local database is not open. User must be signed in.");
    }
    return db;
  }

  async createProject(manifest: AlphaManifest): Promise<{ driveFolderId?: string }> {
    const db = this.resolveDb();
    await db.projects.put({
      id: manifest.project.id,
      storage: "local",
      updatedAt: Date.now(),
      title: manifest.project.title,
      manifestJson: JSON.stringify(manifest),
    });
    return {};
  }

  async loadManifest(projectId: string): Promise<AlphaManifest> {
    const db = this.resolveDb();
    const row = await db.projects.get(projectId);
    if (!row || !row.manifestJson) {
      throw new Error(`Project not found: ${projectId}`);
    }
    return JSON.parse(row.manifestJson) as AlphaManifest;
  }

  async saveManifest(manifest: AlphaManifest): Promise<void> {
    const db = this.resolveDb();
    await db.projects.put({
      id: manifest.project.id,
      storage: "local",
      updatedAt: Date.now(),
      title: manifest.project.title,
      manifestJson: JSON.stringify(manifest),
    });
  }

  async readItem(projectId: string, itemId: string): Promise<string> {
    const db = this.resolveDb();
    const item = await db.items.get(itemId);
    if (!item || item.projectId !== projectId) {
      throw new Error(`Item not found: ${itemId} in project ${projectId}`);
    }
    return item.payload ?? "";
  }

  async writeItem(projectId: string, item: ItemRecord, payload: string): Promise<void> {
    const db = this.resolveDb();
    await db.items.put({
      id: item.id,
      projectId,
      kind: item.kind,
      dirty: 0,
      updatedAt: item.updatedAt || Date.now(),
      title: item.title,
      payload,
    });
  }

  async deleteItem(projectId: string, itemId: string): Promise<void> {
    const db = this.resolveDb();
    const item = await db.items.get(itemId);
    if (item && item.projectId === projectId) {
      await db.items.delete(itemId);
    }
  }

  async hasFile(projectId: string, key: string): Promise<boolean> {
    const db = this.resolveDb();
    const file = await db.files.get([projectId, key]);
    return file !== undefined;
  }

  async readFile(projectId: string, key: string): Promise<Blob> {
    const db = this.resolveDb();
    const file = await db.files.get([projectId, key]);
    if (!file || !file.blob) {
      throw new Error(`File not found: ${key} in project ${projectId}`);
    }
    // Update lastAccess time for LRU tracking
    await db.files.update([projectId, key], { lastAccess: Date.now() });
    return file.blob;
  }

  async writeFile(
    projectId: string,
    key: string,
    blob: Blob,
    meta: { name?: string; mime: string }
  ): Promise<void> {
    const db = this.resolveDb();
    // Requirement 4: pinned = true on every write so local mode data is never evicted
    await db.files.put({
      projectId,
      key,
      blob,
      mime: meta.mime,
      size: blob.size,
      sha256: key,
      lastAccess: Date.now(),
      pinned: true,
    });
  }

  async deleteProject(projectId: string): Promise<void> {
    const db = this.resolveDb();
    await db.transaction("rw", [db.projects, db.items, db.files], async () => {
      await db.projects.delete(projectId);
      await db.items.where("projectId").equals(projectId).delete();
      await db.files.where("projectId").equals(projectId).delete();
    });
  }
}
