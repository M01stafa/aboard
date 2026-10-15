import type { StorageProvider, ItemRecord, ItemKind, AlphaManifest } from "./types";
import { LocalProvider } from "./local-provider";
import { computeBlobSha256 } from "./sha256";

/**
 * ProjectService: the single gateway through which tool modules (Circuit, Board, PDF) read and write.
 * Implements docs/specs/storage-layer.md §11.1.
 * Modules never know whether content is local or in Drive; the service routes each call.
 */
export class ProjectService {
  private provider: StorageProvider;

  constructor(provider?: StorageProvider) {
    this.provider = provider ?? new LocalProvider();
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

  /**
   * Opens an existing project and loads its manifest.
   */
  async openProject(projectId: string): Promise<AlphaManifest> {
    return this.provider.loadManifest(projectId);
  }

  /**
   * Creates a new project with an initial AlphaManifest.
   */
  async createProject(title: string, subject?: string): Promise<AlphaManifest> {
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
    return manifest;
  }

  /**
   * Reads an item's raw payload (JSON string or circuit text).
   */
  async readItem(projectId: string, itemId: string): Promise<string> {
    return this.provider.readItem(projectId, itemId);
  }

  /**
   * Saves a whiteboard item (Excalidraw elements & state JSON).
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
    await this.provider.writeItem(projectId, item, payload);
  }

  /**
   * Saves an electronic circuit item (CircuitJS text).
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
    await this.provider.writeItem(projectId, item, payload);
  }

  /**
   * Saves an annotations item (EmbedPDF annotations JSON).
   */
  async saveAnnotations(
    projectId: string,
    itemId: string,
    payload: string,
    title?: string
  ): Promise<void> {
    const item: ItemRecord = {
      id: itemId,
      projectId,
      kind: "annotations",
      title: title ?? "Annotations",
      updatedAt: Date.now(),
    };
    await this.provider.writeItem(projectId, item, payload);
  }

  /**
   * Stores large binary files content-addressed by their streaming SHA-256 hash.
   * If the file is already stored for this project, writing is skipped (deduplicated).
   */
  async putFile(
    projectId: string,
    blob: Blob,
    meta: { name?: string; mime: string }
  ): Promise<{ key: string }> {
    const key = await computeBlobSha256(blob);
    const exists = await this.provider.hasFile(projectId, key);
    if (!exists) {
      await this.provider.writeFile(projectId, key, blob, meta);
    }
    return { key };
  }

  /**
   * Retrieves a binary file by its content key.
   */
  async getFile(projectId: string, key: string): Promise<Blob> {
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

    // Update manifest if project exists
    try {
      const manifest = await this.provider.loadManifest(projectId);
      const ext = kind === "circuit" ? "txt" : "json";
      const folder = kind === "board" ? "boards" : kind === "circuit" ? "circuits" : kind === "pdf" ? "pdfs" : "annotations";
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
    const payload = await this.provider.readItem(projectId, itemId);
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

    await this.provider.writeItem(
      projectId,
      { id: itemId, projectId, kind, title: newTitle, updatedAt: Date.now() },
      payload
    );
  }

  /**
   * Deletes an item from the project and removes it from the manifest.
   */
  async deleteItem(projectId: string, itemId: string): Promise<void> {
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
   * Deletes a whole project and all its associated items and files.
   */
  async deleteProject(projectId: string): Promise<void> {
    await this.provider.deleteProject(projectId);
  }

  /**
   * Export to .alpha format (Phase 6 / Tasks 31-32 stub).
   */
  async exportAlpha(_projectId: string): Promise<Blob> {
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
  async moveProject(_projectId: string, _toMode: "drive" | "local"): Promise<void> {
    throw new Error("moveProject is implemented in Phase 7 (Task 37)");
  }
}

export const projectService = new ProjectService();
