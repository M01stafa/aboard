// @vitest-environment happy-dom
import { describe, expect, it, beforeEach } from "vitest";
import {
  ZipWriter,
  BlobWriter,
  TextReader,
  BlobReader,
  type Entry,
} from "@zip.js/zip.js";
import { ProjectService } from "@/core/storage/project-service";
import type { StorageProvider, ItemRecord, AlphaManifest } from "@/core/storage/types";
import { exportAlpha } from "./export";
import {
  importAlpha,
  ImportError,
  assertArchiveSafety,
  sanitizeBoardJson,
  MAX_ENTRIES,
  MAX_SINGLE_ENTRY_BYTES,
  MAX_TOTAL_UNCOMPRESSED_BYTES,
  MAX_COMPRESSION_RATIO,
} from "./import";
import { ALPHA_MIME } from "./manifest";
import { computeBlobSha256 } from "@/core/storage/sha256";

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
    for (const key of Array.from(this.items.keys())) {
      if (key.startsWith(`${projectId}:`)) {
        this.items.delete(key);
      }
    }
    for (const key of Array.from(this.files.keys())) {
      if (key.startsWith(`${projectId}:`)) {
        this.files.delete(key);
      }
    }
  }
}

/**
 * Helper to build custom test ZIP blobs
 */
async function buildTestZip(
  entries: Array<{ path: string; text?: string; blob?: Blob }>
): Promise<Blob> {
  const zipWriter = new ZipWriter(new BlobWriter("application/x-alpha-project"));
  for (const entry of entries) {
    if (entry.text !== undefined) {
      await zipWriter.add(entry.path, new TextReader(entry.text));
    } else if (entry.blob !== undefined) {
      await zipWriter.add(entry.path, new BlobReader(entry.blob));
    }
  }
  return await zipWriter.close();
}

describe("Alpha Import Engine with Security Checks (Task 32 / ALPHA-2..4, SEC-7)", () => {
  let provider: FakeStorageProvider;
  let service: ProjectService;

  beforeEach(() => {
    provider = new FakeStorageProvider();
    service = new ProjectService(provider);
  });

  describe("Malicious & Malformed Archives (Security Checks)", () => {
    it("rejects archive if first entry is not 'mimetype'", async () => {
      const zipBlob = await buildTestZip([
        { path: "manifest.json", text: "{}" },
        { path: "mimetype", text: ALPHA_MIME },
      ]);

      await expect(
        importAlpha(zipBlob, { projectService: service })
      ).rejects.toThrow(ImportError);

      try {
        await importAlpha(zipBlob, { projectService: service });
      } catch (err: unknown) {
        expect((err as ImportError).code).toBe("not_alpha_file");
      }
    });

    it("rejects archive if mimetype content does not match exactly", async () => {
      const zipBlob = await buildTestZip([
        { path: "mimetype", text: "application/zip" },
        { path: "manifest.json", text: "{}" },
      ]);

      try {
        await importAlpha(zipBlob, { projectService: service });
        expect.unreachable("should have thrown");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ImportError);
        expect((err as ImportError).code).toBe("not_alpha_file");
      }
    });

    it("rejects path traversal with parent directory ('..')", () => {
      const fakeEntries = [
        { filename: "mimetype", uncompressedSize: 28, compressedSize: 28, directory: false },
        { filename: "../evil.txt", uncompressedSize: 100, compressedSize: 100, directory: false },
      ] as unknown as Entry[];

      expect(() => assertArchiveSafety(fakeEntries)).toThrowError(
        expect.objectContaining({ code: "path_traversal" })
      );
    });

    it("rejects path traversal with leading slash ('/etc/passwd')", () => {
      const fakeEntries = [
        { filename: "mimetype", uncompressedSize: 28, compressedSize: 28, directory: false },
        { filename: "/etc/passwd", uncompressedSize: 100, compressedSize: 100, directory: false },
      ] as unknown as Entry[];

      expect(() => assertArchiveSafety(fakeEntries)).toThrowError(
        expect.objectContaining({ code: "path_traversal" })
      );
    });

    it("rejects path traversal with backslashes ('boards\\board.json')", async () => {
      const zipBlob = await buildTestZip([
        { path: "mimetype", text: ALPHA_MIME },
        { path: "boards\\board.json", text: "{}" },
      ]);

      try {
        await importAlpha(zipBlob, { projectService: service });
        expect.unreachable("should have thrown");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ImportError);
        expect((err as ImportError).code).toBe("path_traversal");
      }
    });

    it("rejects unexpected root or folder path ('secrets/api_keys.json')", async () => {
      const zipBlob = await buildTestZip([
        { path: "mimetype", text: ALPHA_MIME },
        { path: "secrets/api_keys.json", text: "compromised" },
      ]);

      try {
        await importAlpha(zipBlob, { projectService: service });
        expect.unreachable("should have thrown");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ImportError);
        expect((err as ImportError).code).toBe("path_traversal");
      }
    });

    it("detects and rejects oversized single entry (> 500 MB limit)", () => {
      const fakeEntries = [
        { filename: "mimetype", uncompressedSize: 28, compressedSize: 28, directory: false },
        {
          filename: "files/huge.pdf",
          uncompressedSize: MAX_SINGLE_ENTRY_BYTES + 1,
          compressedSize: 5000,
          directory: false,
        },
      ] as unknown as Entry[];

      expect(() => assertArchiveSafety(fakeEntries)).toThrowError(
        expect.objectContaining({ code: "entry_too_large" })
      );
    });

    it("detects and rejects total uncompressed size exceeded (> 2 GB limit)", () => {
      const fakeEntries = [
        { filename: "mimetype", uncompressedSize: 28, compressedSize: 28, directory: false },
        {
          filename: "files/part1.pdf",
          uncompressedSize: 450 * 1024 * 1024,
          compressedSize: 450 * 1024 * 1024,
          directory: false,
        },
        {
          filename: "files/part2.pdf",
          uncompressedSize: 450 * 1024 * 1024,
          compressedSize: 450 * 1024 * 1024,
          directory: false,
        },
        {
          filename: "files/part3.pdf",
          uncompressedSize: 450 * 1024 * 1024,
          compressedSize: 450 * 1024 * 1024,
          directory: false,
        },
        {
          filename: "files/part4.pdf",
          uncompressedSize: 450 * 1024 * 1024,
          compressedSize: 450 * 1024 * 1024,
          directory: false,
        },
        {
          filename: "files/part5.pdf",
          uncompressedSize: 450 * 1024 * 1024,
          compressedSize: 450 * 1024 * 1024,
          directory: false,
        },
      ] as unknown as Entry[];

      expect(() => assertArchiveSafety(fakeEntries)).toThrowError(
        expect.objectContaining({ code: "total_size_exceeded" })
      );
    });

    it("detects and rejects Zip Bomb compression ratio (> 100:1 for > 10 MB)", () => {
      const fakeEntries = [
        { filename: "mimetype", uncompressedSize: 28, compressedSize: 28, directory: false },
        {
          filename: "boards/bomb.json",
          uncompressedSize: 50 * 1024 * 1024, // 50 MB uncompressed
          compressedSize: 1000, // 1 KB compressed (~50,000:1 ratio)
          directory: false,
        },
      ] as unknown as Entry[];

      expect(() => assertArchiveSafety(fakeEntries)).toThrowError(
        expect.objectContaining({ code: "zip_bomb_detected" })
      );
    });

    it("rejects archive exceeding max entry count (> 5,000 entries)", () => {
      const fakeEntries: Entry[] = [
        { filename: "mimetype", uncompressedSize: 28, compressedSize: 28, directory: false } as Entry,
      ];
      for (let i = 0; i < MAX_ENTRIES + 1; i++) {
        fakeEntries.push({
          filename: `boards/item_${i}.json`,
          uncompressedSize: 10,
          compressedSize: 10,
          directory: false,
        } as Entry);
      }

      expect(() => assertArchiveSafety(fakeEntries)).toThrowError(
        expect.objectContaining({ code: "too_many_entries" })
      );
    });

    it("rejects archive with missing manifest.json", async () => {
      const zipBlob = await buildTestZip([
        { path: "mimetype", text: ALPHA_MIME },
        { path: "boards/b1.json", text: "{}" },
      ]);

      try {
        await importAlpha(zipBlob, { projectService: service });
        expect.unreachable("should have thrown");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ImportError);
        expect((err as ImportError).code).toBe("missing_manifest");
      }
    });

    it("rejects archive with malformed JSON manifest", async () => {
      const zipBlob = await buildTestZip([
        { path: "mimetype", text: ALPHA_MIME },
        { path: "manifest.json", text: "NOT VALID JSON {{{" },
      ]);

      try {
        await importAlpha(zipBlob, { projectService: service });
        expect.unreachable("should have thrown");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ImportError);
        expect((err as ImportError).code).toBe("invalid_manifest");
      }
    });

    it("rejects archive with newer format version (formatVersion: 99)", async () => {
      const newerManifest = {
        format: "alpha-project",
        formatVersion: 99,
        app: { name: "Aboard", version: "99.0.0" },
        project: {
          id: "new-proj",
          title: "Future Project",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        items: [],
        files: [],
      };

      const zipBlob = await buildTestZip([
        { path: "mimetype", text: ALPHA_MIME },
        { path: "manifest.json", text: JSON.stringify(newerManifest) },
      ]);

      try {
        await importAlpha(zipBlob, { projectService: service });
        expect.unreachable("should have thrown");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ImportError);
        expect((err as ImportError).code).toBe("newer_format");
      }
    });

    it("rejects archive with SHA-256 hash mismatch on a binary file", async () => {
      const fakeBinary = new Blob(["Real binary content"], { type: "application/pdf" });
      const manifest = {
        format: "alpha-project",
        formatVersion: 1,
        app: { name: "Aboard", version: "0.1.0" },
        project: {
          id: "proj-tampered",
          title: "Tampered Project",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        items: [
          {
            id: "pdf-1",
            kind: "pdf",
            title: "Tampered Doc",
            path: "files/tampered.pdf",
            fileKey: "tampered_key",
          },
        ],
        files: [
          {
            key: "tampered_key",
            path: "files/tampered.pdf",
            name: "tampered.pdf",
            mime: "application/pdf",
            size: fakeBinary.size,
            sha256: "0000000000000000000000000000000000000000000000000000000000000000", // deliberate mismatch
          },
        ],
      };

      const zipBlob = await buildTestZip([
        { path: "mimetype", text: ALPHA_MIME },
        { path: "manifest.json", text: JSON.stringify(manifest) },
        { path: "files/tampered.pdf", blob: fakeBinary },
      ]);

      try {
        await importAlpha(zipBlob, { projectService: service });
        expect.unreachable("should have thrown");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(ImportError);
        expect((err as ImportError).code).toBe("hash_mismatch");
      }
    });

    it("cleans up partial files and project records on failure (atomic rollback)", async () => {
      const validBinary = new Blob(["Valid binary content"], { type: "application/pdf" });
      const validHash = await computeBlobSha256(validBinary);

      const manifest = {
        format: "alpha-project",
        formatVersion: 1,
        app: { name: "Aboard", version: "0.1.0" },
        project: {
          id: "atomic-proj",
          title: "Atomic Rollback Test",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        items: [
          {
            id: "pdf-item",
            kind: "pdf",
            title: "Doc",
            path: "files/file1.pdf",
            fileKey: "key_1",
          },
        ],
        files: [
          {
            key: "key_1",
            path: "files/file1.pdf",
            mime: "application/pdf",
            size: validBinary.size,
            sha256: validHash,
          },
          {
            key: "key_2",
            path: "files/file2.pdf",
            mime: "application/pdf",
            size: 10,
            sha256: "badbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbadbad1",
          },
        ],
      };

      const zipBlob = await buildTestZip([
        { path: "mimetype", text: ALPHA_MIME },
        { path: "manifest.json", text: JSON.stringify(manifest) },
        { path: "files/file1.pdf", blob: validBinary },
        { path: "files/file2.pdf", blob: new Blob(["corrupt"]) },
      ]);

      try {
        await importAlpha(zipBlob, { projectService: service });
        expect.unreachable("should have failed on second file");
      } catch (err: unknown) {
        expect((err as ImportError).code).toBe("hash_mismatch");
      }

      // Prove that partial project was rolled back completely
      expect(provider.manifests.has("atomic-proj")).toBe(false);
      expect(provider.files.has("atomic-proj:key_1")).toBe(false);
      expect(provider.items.size).toBe(0);
    });
  });

  describe("Content Sanitization (SEC-7)", () => {
    it("strips javascript:, data:, and vbscript: links from board elements", () => {
      const maliciousBoard = {
        type: "excalidraw",
        version: 2,
        elements: [
          { id: "el-1", type: "rectangle", link: "javascript:alert('XSS')" },
          { id: "el-2", type: "text", link: "data:text/html,<script>alert(1)</script>" },
          { id: "el-3", type: "arrow", link: "VBSCRIPT:execute(something)" },
          { id: "el-4", type: "line", link: "https://example.com/legit" },
          { id: "el-5", type: "ellipse", link: "alpha://pdf/target-doc" },
          { id: "el-6", type: "rectangle" }, // no link
        ],
      };

      const sanitizedJson = sanitizeBoardJson(JSON.stringify(maliciousBoard));
      const parsed = JSON.parse(sanitizedJson);

      expect(parsed.elements[0].link).toBeNull();
      expect(parsed.elements[1].link).toBeNull();
      expect(parsed.elements[2].link).toBeNull();
      expect(parsed.elements[3].link).toBe("https://example.com/legit");
      expect(parsed.elements[4].link).toBe("alpha://pdf/target-doc");
      expect(parsed.elements[5].link).toBeUndefined();
    });
  });

  describe("Collision Handling & Internal Link Rewriting", () => {
    it("imports existing project ID as a copy with new IDs and rewrites internal links", async () => {
      const existingProjectId = "collision-proj-id";

      // Seed provider with existing project
      await provider.createProject({
        format: "alpha-project",
        formatVersion: 1,
        app: { name: "Aboard", version: "0.1.0" },
        project: {
          id: existingProjectId,
          title: "Existing Local Project",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        items: [],
        files: [],
      });

      const boardWithLink = {
        type: "excalidraw",
        elements: [
          { id: "el-1", link: "alpha://pdf/old-pdf-item-id" },
          { id: "el-2", link: "https://wikipedia.org" },
        ],
      };

      const importManifest = {
        format: "alpha-project",
        formatVersion: 1,
        app: { name: "Aboard", version: "0.1.0" },
        project: {
          id: existingProjectId, // Collides with existing!
          title: "Collision Project",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        items: [
          {
            id: "old-board-id",
            kind: "board",
            title: "Board 1",
            path: "boards/old-board-id.json",
          },
          {
            id: "old-pdf-item-id",
            kind: "pdf",
            title: "Document",
            path: "files/doc.pdf",
            fileKey: "doc_file_key",
          },
        ],
        files: [
          {
            key: "doc_file_key",
            path: "files/doc.pdf",
            mime: "application/pdf",
            size: 4,
            sha256: await computeBlobSha256(new Blob(["test"])),
          },
        ],
      };

      const zipBlob = await buildTestZip([
        { path: "mimetype", text: ALPHA_MIME },
        { path: "manifest.json", text: JSON.stringify(importManifest) },
        { path: "boards/old-board-id.json", text: JSON.stringify(boardWithLink) },
        { path: "files/doc.pdf", blob: new Blob(["test"]) },
      ]);

      const result = await importAlpha(zipBlob, { projectService: service });

      // 1. Result project ID must be new
      expect(result.projectId).not.toBe(existingProjectId);
      expect(result.title).toBe("Collision Project (imported)");

      // 2. Existing project remains untouched
      expect(provider.manifests.has(existingProjectId)).toBe(true);

      // 3. New project was persisted with imported manifest
      const newManifest = provider.manifests.get(result.projectId);
      expect(newManifest).toBeDefined();
      expect(newManifest!.project.title).toBe("Collision Project (imported)");

      // 4. Items were assigned new IDs
      const newPdfItem = newManifest!.items.find((i) => i.kind === "pdf");
      expect(newPdfItem).toBeDefined();
      expect(newPdfItem!.id).not.toBe("old-pdf-item-id");

      // 5. Internal link in board was rewritten to the new PDF item ID
      const newBoardItem = newManifest!.items.find((i) => i.kind === "board");
      expect(newBoardItem).toBeDefined();
      const boardPayloadStr = await provider.readItem(result.projectId, newBoardItem!.id);
      const parsedBoard = JSON.parse(boardPayloadStr);
      expect(parsedBoard.elements[0].link).toBe(`alpha://pdf/${newPdfItem!.id}`);
      expect(parsedBoard.elements[1].link).toBe("https://wikipedia.org");
    });
  });

  describe("Round-Trip Export -> Import", () => {
    it("exports a full project and imports it cleanly restoring items and files", async () => {
      // 1. Setup original project in provider using ProjectService
      const proj = await service.createProject("Robotics Architecture", "Engineering");
      const originalProjId = proj.project.id;

      await service.createItem(
        originalProjId,
        "board",
        "Schematic Whiteboard",
        JSON.stringify({ type: "excalidraw", elements: [] })
      );

      await service.createItem(
        originalProjId,
        "circuit",
        "Motor Controller",
        "$ 1 0.000005 10.6 50 5 43"
      );

      const samplePdfBlob = new Blob(["PDF binary content for roundtrip"], {
        type: "application/pdf",
      });
      const samplePdfHash = await computeBlobSha256(samplePdfBlob);

      await service.putFile(
        originalProjId,
        samplePdfBlob,
        {
          name: "datasheet.pdf",
          mime: "application/pdf",
        },
        samplePdfHash
      );

      // 2. Export project
      const exported = await exportAlpha(originalProjId, {
        streamToDisk: false,
        projectService: service,
      });
      expect(exported.blob).toBeInstanceOf(Blob);

      // 3. Clear provider to simulate a new device/browser
      await provider.deleteProject(originalProjId);
      expect(provider.manifests.size).toBe(0);
      expect(provider.items.size).toBe(0);
      expect(provider.files.size).toBe(0);

      // 4. Import the .alpha file
      const result = await importAlpha(exported.blob!, { projectService: service });
      expect(result.projectId).toBe(originalProjId);
      expect(result.title).toBe("Robotics Architecture");

      // 5. Verify restored items & files
      const restoredManifest = await provider.loadManifest(result.projectId);
      expect(restoredManifest.project.title).toBe("Robotics Architecture");
      expect(restoredManifest.project.subject).toBe("Engineering");
      expect(restoredManifest.items.length).toBeGreaterThanOrEqual(2);

      const hasRestoredFile = await provider.hasFile(result.projectId, samplePdfHash);
      expect(hasRestoredFile).toBe(true);

      const restoredPdfBlob = await provider.readFile(result.projectId, samplePdfHash);
      expect(restoredPdfBlob.size).toBe(samplePdfBlob.size);
      const restoredHash = await computeBlobSha256(restoredPdfBlob);
      expect(restoredHash).toBe(samplePdfHash);
    });
  });
});
