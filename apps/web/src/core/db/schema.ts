import Dexie, { type Table, type EntityTable, type DexieOptions } from "dexie";

export type ItemKind = "board" | "circuit" | "pdf" | "annotations";

export interface ProjectRecord {
  id: string;
  storage: "drive" | "local";
  updatedAt: number;
  title?: string;
  manifestJson?: string;
}

export interface ItemRecord {
  id: string;
  projectId: string;
  kind: ItemKind;
  dirty: number | boolean;
  updatedAt: number;
  title?: string;
  payload?: string;
  driveFileId?: string;
  driveRev?: string;
}

export interface FileRecord {
  projectId: string;
  key: string;
  lastAccess: number;
  blob?: Blob;
  mime?: string;
  size?: number;
  sha256?: string;
  driveFileId?: string;
  pinned?: boolean;
}

export interface OutboxRecord {
  seq?: number;
  projectId: string;
  itemId: string;
  createdAt?: number;
  payload?: string;
}

export interface MetaRecord {
  key: string;
  value: unknown;
}

/**
 * Per-user IndexedDB database schema using Dexie.
 * Database name: aboard:<userId>
 * Follows docs/specs/storage-layer.md §11.2 literally.
 */
export class AboardDatabase extends Dexie {
  projects!: EntityTable<ProjectRecord, "id">;
  items!: EntityTable<ItemRecord, "id">;
  files!: Table<FileRecord, [string, string]>;
  outbox!: EntityTable<OutboxRecord, "seq">;
  meta!: EntityTable<MetaRecord, "key">;

  constructor(userId: string, options?: DexieOptions) {
    super(`aboard:${userId}`, options);

    // Initial version(1) schema defined in docs/specs/storage-layer.md §11.2
    // RULE (Task 19 Requirement 8): Never edit this version(1) block once committed.
    // Future changes must append a new db.version(n).stores(...).upgrade(...) block.
    this.version(1).stores({
      projects: "id, storage, updatedAt",
      items: "id, projectId, [projectId+kind], dirty",
      files: "[projectId+key], projectId, lastAccess",
      outbox: "++seq, projectId, itemId",
      meta: "key",
    });
  }
}
