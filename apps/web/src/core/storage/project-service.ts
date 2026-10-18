import type { StorageProvider, ItemRecord, ItemKind, AlphaManifest, ProjectBundle } from "./types";
import { LocalProvider } from "./local-provider";
import { computeBlobSha256 } from "./sha256";
import { SaveQueue } from "./save-queue";
import { projectIndex, type ProjectIndexSyncer } from "./project-index";

/**
 * ProjectService: the single gateway through which tool modules (Circuit, Board, PDF) read and write.
 * Implements docs/specs/storage-layer.md §11.1 and §11.5.
 * Modules never know whether content is local or in Drive; the service routes each call.
 */
export class ProjectService {
  private provider: StorageProvider;
  private saveQueue?: SaveQueue;
  private indexSyncer?: ProjectIndexSyncer;
  private activeProjectId?: string;

  constructor(
    provider?: StorageProvider,
    saveQueue?: SaveQueue,
    indexSyncer?: ProjectIndexSyncer
  ) {
    this.provider = provider ?? new LocalProvider();
    this.saveQueue = saveQueue;
    this.indexSyncer = indexSyncer;
    if (this.saveQueue) {
      this.saveQueue.setProjectService(this);
    }
  }

  setIndexSyncer(syncer?: ProjectIndexSyncer): void {
    this.indexSyncer = syncer;
  }

  getIndexSyncer(): ProjectIndexSyncer | undefined {
    return this.indexSyncer;
  }

  getActiveProjectId(): string | undefined {
    return this.activeProjectId;
  }

  setActiveProjectId(projectId?: string): void {
    this.activeProjectId = projectId;
  }

  /**
   * Sets or switches the active storage provider (e.g. for testing or Drive mode in Phase 7).
   */
  setProvider(provider: StorageProvider): void {
    this.provider = provider;
  }

  getProvider(): StorageProvider {
    return this.provider;
  }

  setSaveQueue(saveQueue: SaveQueue): void {
    this.saveQueue = saveQueue;
    this.saveQueue.setProjectService(this);
  }

  getSaveQueue(): SaveQueue | undefined {
    return this.saveQueue;
  }

  /**
   * Opens an existing project and loads its manifest.
   * Flushes any pending writes from previous projects before opening.
   */
  async openProject(projectId: string): Promise<AlphaManifest> {
    this.activeProjectId = projectId;
    if (this.saveQueue) {
      await this.saveQueue.flushNow();
    }
    return this.provider.loadManifest(projectId);
  }

  /**
   * Creates a new project with an initial AlphaManifest and notifies the index syncer.
   */
  async createProject(
    title: string,
    subject?: string,
    options?: { storage?: "local" | "drive"; localDeviceId?: string; driveFolderId?: string }
  ): Promise<AlphaManifest> {
    const id =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `proj-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const now = new Date().toISOString();
    const manifest: AlphaManifest = {
      format: "alpha-project",
      formatVersion: 1,
      app: { name: "Aboard", version: "0.1.0" },
      project: {
        id,
        title,
        subject,
        createdAt: now,
        updatedAt: now,
      },
      items: [],
      files: [],
      layout: { tabs: [], split: "none" },
    };

    await this.provider.createProject(manifest);
    this.activeProjectId = id;

    if (this.indexSyncer) {
      await this.indexSyncer.onProjectCreated({
        id,
        title,
        subject,
        storage: options?.storage ?? (this.provider.kind === "drive" ? "drive" : "local"),
        localDeviceId: options?.localDeviceId,
        driveFolderId: options?.driveFolderId,
      });
    }

    return manifest;
  }

  /**
   * Reads an item's raw payload (JSON string or circuit text).
   * Checks any pending debounced writes in SaveQueue first so reads are immediately consistent.
   */
  async readItem(projectId: string, itemId: string): Promise<string> {
    if (this.saveQueue?.hasPending(projectId, itemId)) {
      const pending = this.saveQueue.getPendingPayload(projectId, itemId);
      if (pending !== undefined) {
        return pending;
      }
    }
    return this.provider.readItem(projectId, itemId);
  }

  /**
   * Saves a whiteboard item (Excalidraw elements & state JSON).
   * Routes through SaveQueue for ~500 ms debouncing and coalescing when queue is attached.
   */
  async saveBoard(
    projectId: string,
    itemId: string,
    payload: string,
    title?: string
  ): Promise<void> {
    const item: ItemRecord = {
      id: itemId,
      projectId,
      kind: "board",
      title: title ?? "Whiteboard",
      updatedAt: Date.now(),
    };
    if (this.saveQueue) {
      this.saveQueue.enqueue(projectId, item, payload);
    } else {
      await this.provider.writeItem(projectId, item, payload);
    }
  }

  /**
   * Saves an electronic circuit item (CircuitJS text).
   * Routes through SaveQueue for ~500 ms debouncing and coalescing when queue is attached.
   */
  async saveCircuit(
    projectId: string,
    itemId: string,
    payload: string,
    title?: string
  ): Promise<void> {
    const item: ItemRecord = {
      id: itemId,
      projectId,
      kind: "circuit",
      title: title ?? "Circuit",
      updatedAt: Date.now(),
    };
    if (this.saveQueue) {
      this.saveQueue.enqueue(projectId, item, payload);
    } else {
      await this.provider.writeItem(projectId, item, payload);
    }
  }

  /**
   * Saves an annotations item (EmbedPDF annotations JSON).
   * Routes through SaveQueue for ~500 ms debouncing and coalescing when queue is attached.
   */
  async saveAnnotations(
    projectId: string,
    itemId: string,
    payload: string,
    title?: string
  ): Promise<void>;
  async saveAnnotations(
    itemId: string,
    payload: string,
    title?: string
  ): Promise<void>;
  async saveAnnotations(
    arg1: string,
    arg2: string,
    arg3?: string,
    arg4?: string
  ): Promise<void> {
    let projectId: string;
    let itemId: string;
    let payload: string;
    let title: string | undefined;

    if (arg4 !== undefined) {
      projectId = arg1;
      itemId = arg2;
      payload = arg3!;
      title = arg4;
    } else if (arg3 !== undefined) {
      if (this.activeProjectId && arg1 === this.activeProjectId) {
        projectId = arg1;
        itemId = arg2;
        payload = arg3;
      } else if (this.activeProjectId) {
        projectId = this.activeProjectId;
        itemId = arg1;
        payload = arg2;
        title = arg3;
      } else {
        projectId = arg1;
        itemId = arg2;
        payload = arg3;
      }
    } else {
      projectId = this.activeProjectId ?? "default";
      itemId = arg1;
      payload = arg2;
    }

    const item: ItemRecord = {
      id: itemId,
      projectId,
      kind: "annotations",
      title: title ?? "Annotations",
      updatedAt: Date.now(),
    };
    if (this.saveQueue) {
      this.saveQueue.enqueue(projectId, item, payload);
    } else {
      await this.provider.writeItem(projectId, item, payload);
    }
  }

  /**
   * Reads an annotations item payload, or returns null if not found.
   */
  async readAnnotations(projectId: string, itemId: string): Promise<string | null>;
  async readAnnotations(itemId: string): Promise<string | null>;
  async readAnnotations(arg1: string, arg2?: string): Promise<string | null> {
    const projectId = arg2 !== undefined ? arg1 : (this.activeProjectId ?? "default");
    const itemId = arg2 !== undefined ? arg2 : arg1;
    try {
      return await this.readItem(projectId, itemId);
    } catch {
      return null;
    }
  }

  /**
   * Saves a PDF item state (JSON descriptor with fileKey, lastPage, etc.).
   * Routes through SaveQueue for ~500 ms debouncing and coalescing when queue is attached.
   */
  async savePdf(
    projectId: string,
    itemId: string,
    payload: string,
    title?: string
  ): Promise<void> {
    const item: ItemRecord = {
      id: itemId,
      projectId,
      kind: "pdf",
      title: title ?? "PDF Document",
      updatedAt: Date.now(),
    };
    if (this.saveQueue) {
      this.saveQueue.enqueue(projectId, item, payload);
    } else {
      await this.provider.writeItem(projectId, item, payload);
    }
  }

  /**
   * Stores large binary files content-addressed by their streaming SHA-256 hash.
   * If the file is already stored for this project, writing is skipped (deduplicated).
   * Notifies SaveQueue upon completion.
   */
  async putFile(
    projectId: string,
    blob: Blob,
    meta?: { name?: string; mime: string },
    knownKey?: string
  ): Promise<{ key: string }>;
  async putFile(
    knownKey: string,
    blob: Blob,
    meta?: { name?: string; mime: string }
  ): Promise<{ key: string }>;
  async putFile(
    arg1: string,
    arg2: Blob,
    arg3?: { name?: string; mime: string } | string,
    arg4?: string
  ): Promise<{ key: string }> {
    let projectId: string;
    let blob: Blob;
    let meta: { name?: string; mime: string };
    let knownKey: string | undefined;

    if (arg3 && typeof arg3 === "object" && "mime" in arg3) {
      // (projectId, blob, meta, knownKey)
      projectId = arg1;
      blob = arg2;
      meta = arg3;
      knownKey = arg4;
    } else {
      // (knownKey, blob, meta?)
      projectId = this.activeProjectId ?? "default";
      knownKey = arg1;
      blob = arg2;
      meta =
        typeof arg3 === "object"
          ? arg3
          : { name: `file-${knownKey}`, mime: blob.type || "application/octet-stream" };
    }

    const key = knownKey ?? (await computeBlobSha256(blob));
    const exists = await this.provider.hasFile(projectId, key);
    if (!exists) {
      await this.provider.writeFile(projectId, key, blob, meta);
    }
    if (this.saveQueue) {
      this.saveQueue.notifyFileSaved(projectId, key);
    }
    return { key };
  }

  /**
   * Retrieves a binary file by its content key.
   */
  async getFile(projectId: string, key: string): Promise<Blob>;
  async getFile(key: string): Promise<Blob>;
  async getFile(arg1: string, arg2?: string): Promise<Blob> {
    const projectId = arg2 !== undefined ? arg1 : (this.activeProjectId ?? "default");
    const key = arg2 !== undefined ? arg2 : arg1;
    return this.provider.readFile(projectId, key);
  }

  /**
   * Creates a new document item within a project and registers it in the manifest.
   */
  async createItem(
    projectId: string,
    kind: ItemKind,
    title: string,
    initialPayload: string = ""
  ): Promise<ItemRecord> {
    const itemId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const item: ItemRecord = {
      id: itemId,
      projectId,
      kind,
      title,
      updatedAt: Date.now(),
    };

    await this.provider.writeItem(projectId, item, initialPayload);
    if (this.saveQueue) {
      this.saveQueue.notifyItemSaved(projectId, item);
    }

    // Update manifest if project exists
    try {
      const manifest = await this.provider.loadManifest(projectId);
      const ext = kind === "circuit" ? "txt" : "json";
      const folder =
        kind === "board"
          ? "boards"
          : kind === "circuit"
          ? "circuits"
          : kind === "pdf"
          ? "pdfs"
          : "annotations";
      const itemPath = `${folder}/${itemId}.${ext}`;

      if (kind === "pdf") {
        manifest.items.push({
          id: itemId,
          kind: "pdf",
          title,
          path: itemPath,
          fileKey: "",
        });
      } else {
        manifest.items.push({
          id: itemId,
          kind: kind as "board" | "circuit" | "annotations",
          title,
          path: itemPath,
        });
      }
      manifest.project.updatedAt = new Date().toISOString();
      await this.provider.saveManifest(manifest);
    } catch {
      // Manifest update is non-fatal if project was created raw without manifest
    }

    return item;
  }

  /**
   * Renames an existing item in the project and updates the manifest.
   */
  async renameItem(
    projectId: string,
    itemId: string,
    newTitle: string
  ): Promise<void> {
    const payload = await this.readItem(projectId, itemId);
    let kind: ItemKind = "board";

    try {
      const manifest = await this.provider.loadManifest(projectId);
      const manifestItem = manifest.items.find((i) => i.id === itemId);
      if (manifestItem) {
        manifestItem.title = newTitle;
        kind = manifestItem.kind as ItemKind;
        manifest.project.updatedAt = new Date().toISOString();
        await this.provider.saveManifest(manifest);
      }
    } catch {
      // ignore if manifest missing
    }

    const item: ItemRecord = {
      id: itemId,
      projectId,
      kind,
      title: newTitle,
      updatedAt: Date.now(),
    };

    if (this.saveQueue) {
      this.saveQueue.enqueue(projectId, item, payload);
    } else {
      await this.provider.writeItem(projectId, item, payload);
    }
  }

  /**
   * Deletes an item from the project and removes it from the manifest.
   */
  async deleteItem(projectId: string, itemId: string): Promise<void> {
    if (this.saveQueue) {
      this.saveQueue.cancelPending(projectId, itemId);
    }
    await this.provider.deleteItem(projectId, itemId);

    try {
      const manifest = await this.provider.loadManifest(projectId);
      manifest.items = manifest.items.filter((i) => i.id !== itemId);
      manifest.project.updatedAt = new Date().toISOString();
      await this.provider.saveManifest(manifest);
    } catch {
      // ignore if manifest missing
    }
  }

  /**
   * Renames an existing project in local storage and notifies the index syncer.
   */
  async renameProject(projectId: string, newTitle: string): Promise<void> {
    try {
      const manifest = await this.provider.loadManifest(projectId);
      manifest.project.title = newTitle;
      manifest.project.updatedAt = new Date().toISOString();
      await this.provider.saveManifest(manifest);
    } catch {
      // ignore if manifest missing
    }

    if (this.indexSyncer) {
      await this.indexSyncer.onProjectRenamed(projectId, newTitle);
    }
  }

  /**
   * Deletes a whole project and all its associated items and files,
   * and notifies the index syncer.
   */
  async deleteProject(projectId: string, storageMode: "local" | "drive" = "local"): Promise<void> {
    if (this.saveQueue) {
      this.saveQueue.cancelAllForProject(projectId);
    }
    await this.provider.deleteProject(projectId);

    if (this.indexSyncer) {
      await this.indexSyncer.onProjectDeleted(projectId, storageMode);
    }
  }

  /**
   * Explicitly flushes the queue immediately.
   */
  async flushNow(): Promise<void> {
    if (this.saveQueue) {
      await this.saveQueue.flushNow();
    }
  }

  /**
   * Lists all binary files stored for a project.
   */
  async listFiles(
    projectId?: string
  ): Promise<Array<{ key: string; name?: string; mime: string; size: number }>> {
    const pId = projectId ?? this.activeProjectId ?? "default";
    return this.provider.listFiles(pId);
  }

  /**
   * Collects all manifest metadata, item payloads, and binary file streams for export.
   * Flushes SaveQueue before collecting so dirty writes are included.
   * Implements docs/specs/alpha-format.md §12.4.
   */
  async collect(
    projectId: string,
    options?: { includePdfs?: boolean; includeAnnotated?: boolean }
  ): Promise<ProjectBundle> {
    if (this.saveQueue) {
      await this.saveQueue.flushNow();
    }

    let manifest: AlphaManifest;
    try {
      manifest = await this.openProject(projectId);
    } catch {
      const now = new Date().toISOString();
      manifest = {
        format: "alpha-project",
        formatVersion: 1,
        app: { name: "Aboard", version: "0.1.0" },
        project: {
          id: projectId,
          title: "Aboard Project",
          createdAt: now,
          updatedAt: now,
        },
        items: [],
        files: [],
        layout: { tabs: [], split: "none" },
      };
      await this.provider.saveManifest(manifest);
    }
    const textEntries: Array<{ path: string; text: string }> = [];
    let totalBytes = 0;

    // 1. Collect all registered items and their text payloads
    const updatedItems = [...manifest.items];
    for (let i = 0; i < updatedItems.length; i++) {
      const it = updatedItems[i];
      try {
        const text = await this.readItem(projectId, it.id);
        textEntries.push({ path: it.path, text });
        totalBytes += new TextEncoder().encode(text).length;

        // If PDF, check if annotations exist
        if (it.kind === "pdf" && it.fileKey) {
          const annoJson = await this.readAnnotations(projectId, it.fileKey).catch(() => "");
          if (annoJson && annoJson.trim().length > 0) {
            const annoPath = `annotations/${it.id}.json`;
            it.annotationsPath = annoPath;
            textEntries.push({ path: annoPath, text: annoJson });
            totalBytes += new TextEncoder().encode(annoJson).length;
          }
        }
      } catch (err) {
        console.warn(`[ProjectService.collect] Failed reading item ${it.id}:`, err);
      }
    }

    // 2. Collect binary files (PDFs, images, stamps)
    const storedFiles = await this.provider.listFiles(projectId);
    const files: ProjectBundle["files"] = [];
    const manifestFiles: AlphaManifest["files"] = [];

    const includePdfs = options?.includePdfs !== false; // default true

    for (const f of storedFiles) {
      const isPdf = f.mime === "application/pdf";
      if (isPdf && !includePdfs) {
        continue;
      }

      const ext = isPdf
        ? "pdf"
        : f.mime === "image/png"
        ? "png"
        : f.mime === "image/jpeg"
        ? "jpg"
        : f.mime === "image/webp"
        ? "webp"
        : "bin";
      const filePath = `files/${f.key}.${ext}`;

      files.push({
        key: f.key,
        path: filePath,
        mime: f.mime,
        size: f.size,
        name: f.name,
        getBlob: () => this.getFile(projectId, f.key),
      });

      manifestFiles.push({
        key: f.key,
        path: filePath,
        mime: f.mime,
        size: f.size,
        name: f.name,
        sha256: f.key,
      });

      totalBytes += f.size;
    }

    const completeManifest: AlphaManifest = {
      ...manifest,
      items: updatedItems,
      files: manifestFiles,
    };

    return {
      manifest: completeManifest,
      totalBytes,
      textEntries,
      files,
    };
  }

  /**
   * Export to .alpha format (Phase 6 / Tasks 31-32 stub).
   * Flushes queue before export.
   */
  async exportAlpha(_projectId: string): Promise<Blob> {
    if (this.saveQueue) {
      await this.saveQueue.flushNow();
    }
    throw new Error("exportAlpha is implemented in Phase 6 (Tasks 31-32)");
  }

  /**
   * Import from .alpha format (Phase 6 / Tasks 31-32 stub).
   */
  async importAlpha(_file: File | Blob): Promise<string> {
    throw new Error("importAlpha is implemented in Phase 6 (Tasks 31-32)");
  }

  /**
   * Move project between storage modes (Phase 7 / Task 37 stub).
   */
  async moveProject(
    projectId: string,
    toMode: "drive" | "local",
    details?: { localDeviceId?: string; driveFolderId?: string }
  ): Promise<void> {
    if (this.indexSyncer) {
      await this.indexSyncer.onStorageModeChanged(projectId, {
        storage: toMode,
        localDeviceId: details?.localDeviceId,
        driveFolderId: details?.driveFolderId,
      });
    }
  }
}

export const projectService = new ProjectService();
export const saveQueue = new SaveQueue(projectService);
projectService.setSaveQueue(saveQueue);
projectService.setIndexSyncer(projectIndex);

// Expose on window for E2E testing in browser environments
if (typeof window !== "undefined") {
  (window as unknown as { __aboard_projectService?: ProjectService }).__aboard_projectService =
    projectService;
  (window as unknown as { __aboard_saveQueue?: SaveQueue }).__aboard_saveQueue = saveQueue;
}
