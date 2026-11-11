// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from "vitest";
import { ZipReader, BlobReader, TextWriter } from "@zip.js/zip.js";
import { ProjectService } from "@/core/storage/project-service";
import type { StorageProvider, ItemRecord, AlphaManifest } from "@/core/storage/types";
import { exportAlpha, ExportCapExceededError, safeFileName } from "./export";
import { ALPHA_MIME, validateAlphaManifest } from "./manifest";

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

  async listFiles(
    projectId: string
  ): Promise<Array<{ key: string; name?: string; mime: string; size: number }>> {
    const list: Array<{ key: string; name?: string; mime: string; size: number }> = [];
    for (const [k, v] of this.files.entries()) {
      if (k.startsWith(`${projectId}:`)) {
        const key = k.slice(projectId.length + 1);
        list.push({
          key,
          name: v.meta.name,
          mime: v.meta.mime,
          size: v.blob.size,
        });
      }
    }
    return list;
  }

  async deleteProject(projectId: string): Promise<void> {
    this.manifests.delete(projectId);
  }
}

describe("Alpha Export Engine (Task 31 / ALPHA-1, ALPHA-5, ALPHA-6, ALPHA-8)", () => {
  let provider: FakeStorageProvider;
  let service: ProjectService;
  const projectId = "test-export-project";

  beforeEach(async () => {
    provider = new FakeStorageProvider();
    service = new ProjectService(provider);

    // Create baseline project
    await service.createProject("Cardiovascular Anatomy", "Medicine");
    // Overwrite manifest ID to constant test ID
    const initialManifest = await service.openProject(service.getActiveProjectId()!);
    initialManifest.project.id = projectId;
    initialManifest.project.title = "Cardiovascular Anatomy";
    await provider.saveManifest(initialManifest);
    service.setActiveProjectId(projectId);

    // Add whiteboard item
    await service.createItem(
      projectId,
      "board",
      "Heart Circulation",
      JSON.stringify({ type: "alpha-board", version: 1, elements: [] })
    );

    // Add circuit item
    await service.createItem(
      projectId,
      "circuit",
      "Pacemaker Simulator",
      "$ 1 0.000005 10.2 50 5 43\nr 120 80 120 160 0 1000\n"
    );

    // Add PDF binary file
    const pdfBlob = new Blob(["%PDF-1.4 Mock PDF Content For Testing Purposes"], {
      type: "application/pdf",
    });
    await service.putFile(projectId, pdfBlob, {
      name: "cardio_atlas.pdf",
      mime: "application/pdf",
    }, "pdf-hash-1111");

    // Add stamp image binary file
    const stampBlob = new Blob(["mock-png-bytes"], { type: "image/png" });
    await service.putFile(projectId, stampBlob, {
      name: "approved_stamp.png",
      mime: "image/png",
    }, "stamp-hash-2222");
  });

  it("exports valid .alpha ZIP with uncompressed 'mimetype' as the strictly first entry", async () => {
    const result = await exportAlpha(projectId, {
      streamToDisk: false,
      projectService: service,
    });

    expect(result.fileName).toBe("Cardiovascular_Anatomy.alpha");
    expect(result.blob).toBeDefined();

    // Read and verify ZIP archive
    const zipReader = new ZipReader(new BlobReader(result.blob!));
    const entries = await zipReader.getEntries();

    expect(entries.length).toBeGreaterThanOrEqual(4);

    // 1. Entry 1 MUST be "mimetype"
    const firstEntry = entries[0];
    expect(firstEntry.filename).toBe("mimetype");
    expect(firstEntry.uncompressedSize).toBe(ALPHA_MIME.length);
    // CompressionMethod 0 = STORED (uncompressed)
    expect(firstEntry.compressionMethod).toBe(0);

    const mimeContent = await (firstEntry as any).getData(new TextWriter());
    expect(mimeContent).toBe(ALPHA_MIME);

    // 2. Entry 2 MUST be "manifest.json"
    const secondEntry = entries[1];
    expect(secondEntry.filename).toBe("manifest.json");
    const manifestJson = await (secondEntry as any).getData(new TextWriter());
    const parsedManifest = JSON.parse(manifestJson);
    const validated = validateAlphaManifest(parsedManifest);
    expect(validated.format).toBe("alpha-project");
    expect(validated.formatVersion).toBe(1);
    expect(validated.exportedAt).toBeDefined();

    // 3. Verify PDF and image are stored uncompressed (level 0 / method 0)
    const pdfEntry = entries.find((e) => e.filename.endsWith(".pdf"));
    expect(pdfEntry).toBeDefined();
    expect(pdfEntry!.compressionMethod).toBe(0); // STORED without compression

    const pngEntry = entries.find((e) => e.filename.endsWith(".png"));
    expect(pngEntry).toBeDefined();
    expect(pngEntry!.compressionMethod).toBe(0); // STORED without compression

    await zipReader.close();
  });

  it("exports and imports all open tabs in multi-tab projects (Board, PDF, Circuit)", async () => {
    const { importAlpha } = await import("./import");
    const { computeBlobSha256 } = await import("@/core/storage/sha256");

    const multiTabProjId = "multi-tab-test-project";
    await service.createProject("Multi Tab Project", "Engineering");
    const manifest = await service.openProject(service.getActiveProjectId()!);
    manifest.project.id = multiTabProjId;
    manifest.project.title = "Multi Tab Project";
    manifest.items = [];
    manifest.files = [];
    manifest.layout = { tabs: [], split: "none" };
    await provider.saveManifest(manifest);

    const pdfBlob = new Blob(["%PDF-1.4 mock content"], { type: "application/pdf" });
    const realPdfHash = await computeBlobSha256(pdfBlob);

    // Add board, pdf, and circuit items to project
    await service.saveBoard(multiTabProjId, "item-board-1", JSON.stringify({ elements: [] }), "Main Whiteboard");
    await service.saveCircuit(multiTabProjId, "item-circuit-1", "$ 1 0.000005 10.2 50 5 43\n", "RLC Circuit");
    await service.savePdf(
      multiTabProjId,
      "item-pdf-1",
      JSON.stringify({ fileKey: realPdfHash }),
      "Manual.pdf"
    );
    await service.putFile(
      multiTabProjId,
      pdfBlob,
      { name: "Manual.pdf", mime: "application/pdf" },
      realPdfHash
    );

    // Set layout with 3 tabs and vertical split
    await service.saveLayout(multiTabProjId, {
      tabs: ["item-board-1", "item-circuit-1", "item-pdf-1"],
      split: "vertical",
    });

    const exportRes = await exportAlpha(multiTabProjId, {
      streamToDisk: false,
      projectService: service,
    });

    expect(exportRes.blob).toBeDefined();
    expect(exportRes.manifest.layout?.tabs).toEqual(["item-board-1", "item-circuit-1", "item-pdf-1"]);
    expect(exportRes.manifest.workspaceLayout).toBeDefined();
    expect((exportRes.manifest.workspaceLayout as any)?.tabs).toEqual(["item-board-1", "item-circuit-1", "item-pdf-1"]);

    // Now import into a fresh provider and verify all 3 tabs are restored
    const importProvider = new FakeStorageProvider();
    const importService = new ProjectService(importProvider);

    const importRes = await importAlpha(exportRes.blob!, {
      projectService: importService,
    });

    expect(importRes.projectId).toBeDefined();
    const importedManifest = await importProvider.loadManifest(importRes.projectId);

    // Verify all 3 items exist in manifest
    expect(importedManifest.items.some((i) => i.kind === "board")).toBe(true);
    expect(importedManifest.items.some((i) => i.kind === "circuit")).toBe(true);
    expect(importedManifest.items.some((i) => i.kind === "pdf")).toBe(true);

    // Verify layout has all 3 tabs
    expect(importedManifest.layout?.tabs.length).toBe(3);
    expect(importedManifest.workspaceLayout).toBeDefined();
  });

  it("excludes PDF files when includePdfs is set to false", async () => {
    const result = await exportAlpha(projectId, {
      includePdfs: false,
      streamToDisk: false,
      projectService: service,
    });

    const zipReader = new ZipReader(new BlobReader(result.blob!));
    const entries = await zipReader.getEntries();

    const pdfEntries = entries.filter((e) => e.filename.endsWith(".pdf"));
    expect(pdfEntries).toHaveLength(0);

    // Image files and board/circuits are still present
    const pngEntry = entries.find((e) => e.filename.endsWith(".png"));
    expect(pngEntry).toBeDefined();

    await zipReader.close();
  });

  it("sanitizes forbidden filename characters", () => {
    expect(safeFileName('Project: "Heart" / Bio? <1> *')).toBe("Project___Heart____Bio___1___");
    expect(safeFileName("   ")).toBe("project");
  });

  it("throws ExportCapExceededError when total bytes exceed in-memory limit", async () => {
    // Inject massive simulated file size
    provider.files.set(`${projectId}:huge`, {
      blob: { size: 400 * 1024 * 1024 } as unknown as Blob,
      meta: { mime: "application/octet-stream" },
    });

    // Mock mobile environment
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("coarse"),
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;

    try {
      await expect(
        exportAlpha(projectId, {
          streamToDisk: false,
          projectService: service,
        })
      ).rejects.toThrow(ExportCapExceededError);
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });
});
