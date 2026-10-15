import { describe, expect, it, beforeEach } from "vitest";
import { LocalProvider } from "./local-provider";
import type { AboardDatabase, FileRecord, ItemRecord, ProjectRecord } from "@/core/db";
import type { AlphaManifest } from "./types";

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

  where(field: string) {
    return {
      equals: (val: unknown) => ({
        delete: async () => {
          for (const [k, v] of Array.from(this.data.entries())) {
            if ((v as Record<string, unknown>)[field] === val) {
              this.data.delete(k);
            }
          }
        },
      }),
    };
  }
}

class MockDb {
  public projects = new MockTable<ProjectRecord>((p) => p.id);
  public items = new MockTable<ItemRecord>((i) => i.id);
  public files = new MockTable<FileRecord>((f) => `${f.projectId}:${f.key}`);

  async transaction(_mode: string, _tables: unknown[], fn: () => Promise<void>): Promise<void> {
    await fn();
  }
}

describe("LocalProvider (Task 20 / Requirement 4)", () => {
  let mockDb: MockDb;
  let provider: LocalProvider;

  beforeEach(() => {
    mockDb = new MockDb();
    provider = new LocalProvider(mockDb as unknown as AboardDatabase);
  });

  it("creates and loads project manifest", async () => {
    const manifest: AlphaManifest = {
      format: "alpha-project",
      formatVersion: 1,
      app: { name: "Aboard", version: "0.1.0" },
      project: {
        id: "proj-1",
        title: "Differential Equations",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      items: [],
      files: [],
    };

    await provider.createProject(manifest);
    const loaded = await provider.loadManifest("proj-1");
    expect(loaded.project.id).toBe("proj-1");
    expect(loaded.project.title).toBe("Differential Equations");
  });

  it("writes and reads items", async () => {
    const item = {
      id: "board-1",
      projectId: "proj-1",
      kind: "board" as const,
      title: "Board 1",
      updatedAt: Date.now(),
    };

    await provider.writeItem("proj-1", item, "elements-payload-123");
    const payload = await provider.readItem("proj-1", "board-1");
    expect(payload).toBe("elements-payload-123");

    await provider.deleteItem("proj-1", "board-1");
    await expect(provider.readItem("proj-1", "board-1")).rejects.toThrow("Item not found");
  });

  it("writes files with pinned = true (Requirement 4)", async () => {
    const blob = new Blob(["sample pdf binary"], { type: "application/pdf" });
    await provider.writeFile("proj-1", "hash-key-123", blob, {
      name: "syllabus.pdf",
      mime: "application/pdf",
    });

    // Check stored file in database
    const storedFile = await mockDb.files.get(["proj-1", "hash-key-123"]);
    expect(storedFile).toBeDefined();
    expect(storedFile?.pinned).toBe(true); // Must be pinned = true for local mode
    expect(storedFile?.mime).toBe("application/pdf");
    expect(storedFile?.size).toBe(blob.size);

    const exists = await provider.hasFile("proj-1", "hash-key-123");
    expect(exists).toBe(true);

    const retrievedBlob = await provider.readFile("proj-1", "hash-key-123");
    expect(retrievedBlob.size).toBe(blob.size);
  });

  it("deletes project and cascades deletion to items and files", async () => {
    const manifest: AlphaManifest = {
      format: "alpha-project",
      formatVersion: 1,
      app: { name: "Aboard", version: "0.1.0" },
      project: { id: "p-del", title: "To Delete", createdAt: "", updatedAt: "" },
      items: [],
      files: [],
    };

    await provider.createProject(manifest);
    await provider.writeItem(
      "p-del",
      { id: "i1", projectId: "p-del", kind: "board", title: "B", updatedAt: 1 },
      "payload"
    );
    await provider.writeFile("p-del", "f1", new Blob(["123"]), { mime: "text/plain" });

    expect(mockDb.projects.data.size).toBe(1);
    expect(mockDb.items.data.size).toBe(1);
    expect(mockDb.files.data.size).toBe(1);

    await provider.deleteProject("p-del");

    expect(mockDb.projects.data.size).toBe(0);
    expect(mockDb.items.data.size).toBe(0);
    expect(mockDb.files.data.size).toBe(0);
  });
});
