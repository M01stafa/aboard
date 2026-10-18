// src/core/storage/types.ts
// Directly implements docs/specs/storage-layer.md §11.1 and docs/specs/alpha-format.md §12.3

export type ItemKind = "board" | "circuit" | "pdf" | "annotations";

export interface ItemRecord {
  id: string;
  projectId: string;
  kind: ItemKind;
  title: string;
  updatedAt: number;
}

export interface AlphaManifest {
  format: "alpha-project";
  formatVersion: 1;
  app: { name: "Aboard"; version: string };
  exportedAt?: string;
  project: {
    id: string;
    title: string;
    subject?: string;
    createdAt: string;
    updatedAt: string;
  };
  items: Array<
    | { id: string; kind: "board"; title: string; path: string }
    | { id: string; kind: "circuit"; title: string; path: string }
    | { id: string; kind: "pdf"; title: string; path: string; fileKey: string; annotationsPath?: string }
    | { id: string; kind: "annotations"; title: string; path: string }
  >;
  files: Array<{
    key: string;
    path: string;
    name?: string;
    mime: string;
    size: number;
    sha256: string;
  }>;
  layout?: { tabs: string[]; split?: "none" | "vertical" | "horizontal" };
}

export interface ProjectBundle {
  manifest: AlphaManifest;
  totalBytes: number;
  textEntries: Array<{ path: string; text: string }>;
  files: Array<{
    key: string;
    path: string;
    mime: string;
    size: number;
    name?: string;
    getBlob: () => Promise<Blob>;
  }>;
}

export interface StorageProvider {
  readonly kind: "drive" | "local";
  createProject(manifest: AlphaManifest): Promise<{ driveFolderId?: string }>;
  loadManifest(projectId: string): Promise<AlphaManifest>;
  saveManifest(manifest: AlphaManifest): Promise<void>;
  readItem(projectId: string, itemId: string): Promise<string>;
  writeItem(projectId: string, item: ItemRecord, payload: string): Promise<void>;
  deleteItem(projectId: string, itemId: string): Promise<void>;
  hasFile(projectId: string, key: string): Promise<boolean>;
  readFile(projectId: string, key: string): Promise<Blob>;
  writeFile(projectId: string, key: string, blob: Blob, meta: { name?: string; mime: string }): Promise<void>;
  listFiles(projectId: string): Promise<Array<{ key: string; name?: string; mime: string; size: number }>>;
  deleteProject(projectId: string): Promise<void>;
}

