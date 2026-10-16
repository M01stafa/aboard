import { describe, expect, it, beforeEach } from "vitest";
import { ProjectService } from "./project-service";
import type { StorageProvider, ItemRecord, AlphaManifest } from "./types";

class FakeStorageProvider implements StorageProvider {
  readonly kind: "local" = "local";

  public manifests = new Map<string, AlphaManifest>();
  public items = new Map<string, { item: ItemRecord; payload: string }>();
  public files = new Map<string, { blob: Blob; meta: { name?: string; mime: string } }>();

  async createProject(manifest: AlphaManifest): Promise<{ driveFolderId?: string }> {
    this.manifests.set(manifest.project.id, JSON.parse(JSON.stringify(manifest)));
    return {};
  }

  async loadManifest(projectId: string): Promise<AlphaManifest> {
    const m = this.manifests.get(projectId);
    if (!m) throw new Error(`Project not found: ${projectId}`);
    return JSON.parse(JSON.stringify(m));
  }

  async saveManifest(manifest: AlphaManifest): Promise<void> {
    this.manifests.set(manifest.project.id, JSON.parse(JSON.stringify(manifest)));
  }

  async readItem(projectId: string, itemId: string): Promise<string> {
    const entry = this.items.get(`${projectId}:${itemId}`);
    if (!entry) throw new Error(`Item not found: ${itemId}`);
    return entry.payload;
  }

  async writeItem(projectId: string, item: ItemRecord, payload: string): Promise<void> {
    this.items.set(`${projectId}:${item.id}`, { item, payload });
  }

  async deleteItem(projectId: string, itemId: string): Promise<void> {
    this.items.delete(`${projectId}:${itemId}`);
  }

  async hasFile(projectId: string, key: string): Promise<boolean> {
    return this.files.has(`${projectId}:${key}`);
  }

  async readFile(projectId: string, key: string): Promise<Blob> {
    const entry = this.files.get(`${projectId}:${key}`);
    if (!entry) throw new Error(`File not found: ${key}`);
    return entry.blob;
  }

  async writeFile(
    projectId: string,
    key: string,
    blob: Blob,
    meta: { name?: string; mime: string }
  ): Promise<void> {
    this.files.set(`${projectId}:${key}`, { blob, meta });
  }

  async deleteProject(projectId: string): Promise<void> {
    this.manifests.delete(projectId);
    for (const k of Array.from(this.items.keys())) {
      if (k.startsWith(`${projectId}:`)) this.items.delete(k);
    }
    for (const k of Array.from(this.files.keys())) {
      if (k.startsWith(`${projectId}:`)) this.files.delete(k);
    }
  }
}

describe("ProjectService (Task 20 / STORE-1, STORE-7)", () => {
  let fakeProvider: FakeStorageProvider;
  let service: ProjectService;

  beforeEach(() => {
    fakeProvider = new FakeStorageProvider();
    service = new ProjectService(fakeProvider);
  });

  it("creates and opens a project", async () => {
    const created = await service.createProject("Physics 101", "Mechanics");
    expect(created.project.title).toBe("Physics 101");
    expect(created.project.subject).toBe("Mechanics");
    expect(created.project.id).toBeTruthy();

    const loaded = await service.openProject(created.project.id);
    expect(loaded.project.id).toBe(created.project.id);
    expect(loaded.project.title).toBe("Physics 101");
  });

  it("saves and reads whiteboard items", async () => {
    const project = await service.createProject("Circuit Analysis");
    const pId = project.project.id;
    const itemId = "board-123";
    const payload = JSON.stringify({ elements: [{ id: "el1", type: "rectangle" }] });

    await service.saveBoard(pId, itemId, payload, "Main Board");
    const read = await service.readItem(pId, itemId);
    expect(read).toBe(payload);
  });

  it("saves and reads circuit items", async () => {
    const project = await service.createProject("Lab 2");
    const pId = project.project.id;
    const itemId = "circ-1";
    const circuitText = "$ 1 0.000005 10.20 50 5 43\nr 100 200 100 300 0 1000";

    await service.saveCircuit(pId, itemId, circuitText, "RC Lowpass");
    const read = await service.readItem(pId, itemId);
    expect(read).toBe(circuitText);
  });

  it("saves and reads annotation items", async () => {
    const project = await service.createProject("Pathology Slides");
    const pId = project.project.id;
    const itemId = "annot-1";
    const payload = JSON.stringify({ items: [{ page: 1, type: "highlight" }] });

    await service.saveAnnotations(pId, itemId, payload);
    const read = await service.readItem(pId, itemId);
    expect(read).toBe(payload);
  });

  it("stores binary files content-addressed with SHA-256 and deduplicates writes", async () => {
    const project = await service.createProject("Anatomy Atlas");
    const pId = project.project.id;

    const fileContent = "PDF file sample content for streaming hash test";
    const blob1 = new Blob([fileContent], { type: "application/pdf" });
    const blob2 = new Blob([fileContent], { type: "application/pdf" });

    const res1 = await service.putFile(pId, blob1, { name: "atlas.pdf", mime: "application/pdf" });
    expect(res1.key).toHaveLength(64); // Valid SHA-256 hex string

    // Put identical file again
    const res2 = await service.putFile(pId, blob2, { name: "atlas-copy.pdf", mime: "application/pdf" });
    expect(res2.key).toBe(res1.key);

    // Assert only one entry exists in provider
    expect(fakeProvider.files.size).toBe(1);

    // Retrieve file
    const retrieved = await service.getFile(pId, res1.key);
    expect(retrieved.size).toBe(blob1.size);
  });

  it("creates, renames, and deletes project items while maintaining manifest", async () => {
    const project = await service.createProject("Course Notes");
    const pId = project.project.id;

    // Create item
    const item = await service.createItem(pId, "board", "Lecture 1");
    expect(item.id).toBeTruthy();
    expect(item.title).toBe("Lecture 1");

    let manifest = await service.openProject(pId);
    expect(manifest.items).toHaveLength(1);
    expect(manifest.items[0].id).toBe(item.id);
    expect(manifest.items[0].title).toBe("Lecture 1");

    // Rename item
    await service.renameItem(pId, item.id, "Lecture 1 (Reviewed)");
    manifest = await service.openProject(pId);
    expect(manifest.items[0].title).toBe("Lecture 1 (Reviewed)");

    // Delete item
    await service.deleteItem(pId, item.id);
    manifest = await service.openProject(pId);
    expect(manifest.items).toHaveLength(0);
    await expect(service.readItem(pId, item.id)).rejects.toThrow();
  });

  it("deletes a whole project and removes all its resources", async () => {
    const project = await service.createProject("Temporary Project");
    const pId = project.project.id;

    await service.saveBoard(pId, "temp-board", "board content");
    await service.putFile(pId, new Blob(["data"]), { mime: "text/plain" });

    expect(fakeProvider.manifests.has(pId)).toBe(true);
    expect(fakeProvider.items.size).toBe(1);
    expect(fakeProvider.files.size).toBe(1);

    await service.deleteProject(pId);

    expect(fakeProvider.manifests.has(pId)).toBe(false);
    expect(fakeProvider.items.size).toBe(0);
    expect(fakeProvider.files.size).toBe(0);
  });

  it("throws descriptive errors for future phase stubs", async () => {
    await expect(service.exportAlpha("p1")).rejects.toThrow("Phase 6");
    await expect(service.importAlpha(new Blob())).rejects.toThrow("Phase 6");
  });

  it("stubs moveProject by notifying index syncer", async () => {
    let notified: { id: string; storage: string } | null = null;
    service.setIndexSyncer({
      onProjectCreated: async () => {},
      onProjectRenamed: async () => {},
      onProjectDeleted: async () => {},
      onStorageModeChanged: async (id, params) => {
        notified = { id, storage: params.storage };
      },
    });

    await service.moveProject("p1", "drive", { driveFolderId: "f-123" });
    expect(notified).toEqual({ id: "p1", storage: "drive" });
  });
});

