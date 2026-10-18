import {
  ZipReader,
  BlobReader,
  TextWriter,
  BlobWriter,
  type Entry,
  type FileEntry,
} from "@zip.js/zip.js";
import {
  ALPHA_MIME,
  CURRENT_FORMAT_VERSION,
  isSafePath,
  validateAlphaManifest,
  type AlphaManifest,
  type ManifestItem,
} from "./manifest";
import { computeBlobSha256 } from "@/core/storage/sha256";
import { projectService as defaultProjectService, projectIndex, type ProjectService } from "@/core/storage";

/**
 * Archive safety limits confirmed for Task 32 / SEC-7 and §12.5.
 */
export const MAX_ENTRIES = 5000;
export const MAX_TOTAL_UNCOMPRESSED_BYTES = 2 * 1024 * 1024 * 1024; // 2 GB
export const MAX_SINGLE_ENTRY_BYTES = 500 * 1024 * 1024; // 500 MB
export const MAX_COMPRESSION_RATIO = 100; // 100:1 ratio check
export const RATIO_CHECK_MIN_BYTES = 10 * 1024 * 1024; // 10 MB threshold before ratio check

/**
 * Specific typed error for all .alpha import failures.
 */
export class ImportError extends Error {
  code: string;

  constructor(code: string, message?: string) {
    super(message || code);
    this.name = "ImportError";
    this.code = code;
  }
}

export interface ImportOptions {
  projectService?: ProjectService;
  userId?: string;
  onProgress?: (stage: string, current: number, total: number) => void;
}

export interface ImportResult {
  projectId: string;
  title: string;
}

/**
 * Safely reads text data from a non-directory entry without whole-archive memory buffering.
 */
async function readEntryText(entry: Entry): Promise<string> {
  if (entry.directory || !("getData" in entry) || typeof entry.getData !== "function") {
    throw new ImportError("corrupted_zip", `Entry ${entry.filename} is a directory or has no data`);
  }
  const text = await (entry as FileEntry).getData(new TextWriter());
  if (text === undefined) {
    throw new ImportError("corrupted_zip", `Failed to read text from ${entry.filename}`);
  }
  return text;
}

/**
 * Safely reads binary blob data from a non-directory entry without whole-archive memory buffering.
 */
async function readEntryBlob(entry: Entry, mime: string): Promise<Blob> {
  if (entry.directory || !("getData" in entry) || typeof entry.getData !== "function") {
    throw new ImportError("corrupted_zip", `Entry ${entry.filename} is a directory or has no data`);
  }
  const blob = await (entry as FileEntry).getData(new BlobWriter(mime));
  if (!blob) {
    throw new ImportError("corrupted_zip", `Failed to read blob from ${entry.filename}`);
  }
  return blob;
}

/**
 * Sanitizes an Excalidraw board JSON payload (SEC-7).
 * Strips javascript:, data:, and vbscript: links from canvas elements.
 */
export function sanitizeBoardJson(jsonStr: string): string {
  try {
    const data = JSON.parse(jsonStr) as Record<string, unknown>;
    if (data && Array.isArray(data.elements)) {
      for (const el of data.elements) {
        if (el && typeof el === "object" && "link" in el && typeof el.link === "string") {
          const trimmed = el.link.trim().toLowerCase();
          if (
            trimmed.startsWith("javascript:") ||
            trimmed.startsWith("data:") ||
            trimmed.startsWith("vbscript:")
          ) {
            (el as { link: string | null }).link = null;
          }
        }
      }
    }
    return JSON.stringify(data);
  } catch {
    return jsonStr;
  }
}

/**
 * Asserts all structural safety limits on archive entries before extraction.
 * Protects against Zip Bombs, path traversal, and malicious file types.
 */
export function assertArchiveSafety(entries: Entry[]): void {
  if (!entries || entries.length === 0) {
    throw new ImportError("not_alpha_file", "Archive is empty");
  }

  // 1. Entry count limit
  if (entries.length > MAX_ENTRIES) {
    throw new ImportError(
      "too_many_entries",
      `Archive contains ${entries.length} entries, exceeding limit of ${MAX_ENTRIES}`
    );
  }

  // 2. First entry MUST be mimetype
  const first = entries[0];
  if (first.filename !== "mimetype") {
    throw new ImportError(
      "not_alpha_file",
      `First entry must be 'mimetype', got '${first.filename}'`
    );
  }

  // 3. Inspect entry sizes, ratios, and path safety
  let totalUncompressed = 0;

  for (const entry of entries) {
    const filename = entry.filename;

    // Reject path traversal: .., leading /, or backslashes
    if (
      filename.includes("..") ||
      filename.startsWith("/") ||
      filename.startsWith("\\") ||
      filename.includes("\\")
    ) {
      throw new ImportError("path_traversal", `Unsafe path in archive: ${filename}`);
    }

    // Single entry size limit
    if (entry.uncompressedSize > MAX_SINGLE_ENTRY_BYTES) {
      throw new ImportError(
        "entry_too_large",
        `Entry '${filename}' uncompressed size (${entry.uncompressedSize} bytes) exceeds limit of ${MAX_SINGLE_ENTRY_BYTES} bytes`
      );
    }

    totalUncompressed += entry.uncompressedSize;
    if (totalUncompressed > MAX_TOTAL_UNCOMPRESSED_BYTES) {
      throw new ImportError(
        "total_size_exceeded",
        `Total uncompressed size exceeds limit of ${MAX_TOTAL_UNCOMPRESSED_BYTES} bytes`
      );
    }

    // Zip bomb compression ratio check
    if (entry.uncompressedSize > RATIO_CHECK_MIN_BYTES) {
      const compressed = entry.compressedSize ?? 0;
      if (compressed > 0 && entry.uncompressedSize / compressed > MAX_COMPRESSION_RATIO) {
        throw new ImportError(
          "zip_bomb_detected",
          `Suspicious compression ratio on '${filename}': ${Math.round(entry.uncompressedSize / compressed)}:1`
        );
      }
    }

    // Verify allowed paths
    if (filename !== "mimetype") {
      if (entry.directory) {
        const isAllowedDir = /^(?:boards|circuits|pdfs|annotations|files|previews)\/?$/.test(filename);
        if (!isAllowedDir) {
          throw new ImportError("path_traversal", `Unexpected directory in archive: ${filename}`);
        }
      } else {
        if (!isSafePath(filename)) {
          throw new ImportError("path_traversal", `Unexpected file path in archive: ${filename}`);
        }
      }
    }
  }
}

/**
 * Core .alpha import engine implementing Task 32 / ALPHA-2, ALPHA-3, ALPHA-4, SEC-7.
 * Reads entries directly from the selected File without buffering whole archive in RAM.
 */
export async function importAlpha(
  file: File | Blob,
  options: ImportOptions = {}
): Promise<ImportResult> {
  const ps = options.projectService ?? defaultProjectService;
  const provider = ps.getProvider();

  options.onProgress?.("reading_archive", 0, 1);
  const reader = new ZipReader(new BlobReader(file));

  let entries: Entry[];
  try {
    entries = await reader.getEntries();
  } catch (err: unknown) {
    await reader.close();
    throw new ImportError(
      "corrupted_zip",
      `Failed to read archive: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Enforce strict safety checks BEFORE extracting anything
  assertArchiveSafety(entries);

  // 1. Verify mimetype content is exactly application/x-alpha-project
  const mimeEntry = entries[0];
  const mimeText = await readEntryText(mimeEntry);
  if (!mimeText || mimeText.trim() !== ALPHA_MIME) {
    await reader.close();
    throw new ImportError("not_alpha_file", `Invalid mimetype: '${mimeText?.trim()}'`);
  }

  // 2. Read and parse manifest.json
  const byPath = new Map<string, Entry>(entries.map((e) => [e.filename, e]));
  const manifestEntry = byPath.get("manifest.json");
  if (!manifestEntry) {
    await reader.close();
    throw new ImportError("missing_manifest", "Archive missing manifest.json");
  }

  const rawManifestText = await readEntryText(manifestEntry);
  if (!rawManifestText) {
    await reader.close();
    throw new ImportError("missing_manifest", "manifest.json is empty");
  }

  let rawManifest: unknown;
  try {
    rawManifest = JSON.parse(rawManifestText);
  } catch {
    await reader.close();
    throw new ImportError("invalid_manifest", "manifest.json is not valid JSON");
  }

  // Check version before full zod parse so newer versions show "update the app"
  if (
    rawManifest &&
    typeof rawManifest === "object" &&
    "formatVersion" in rawManifest &&
    typeof (rawManifest as { formatVersion: unknown }).formatVersion === "number" &&
    (rawManifest as { formatVersion: number }).formatVersion > CURRENT_FORMAT_VERSION
  ) {
    await reader.close();
    throw new ImportError(
      "newer_format",
      `Archive formatVersion ${(rawManifest as { formatVersion: number }).formatVersion} is newer than supported version ${CURRENT_FORMAT_VERSION}`
    );
  }

  let manifest: AlphaManifest;
  try {
    manifest = validateAlphaManifest(rawManifest);
  } catch (err: unknown) {
    await reader.close();
    throw new ImportError(
      "invalid_manifest",
      `manifest.json failed schema validation: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  // 3. Handle project collisions (spec §12.5)
  let targetProjectId = manifest.project.id;
  let targetTitle = manifest.project.title;
  let isCollision = false;

  try {
    await provider.loadManifest(targetProjectId);
    isCollision = true;
  } catch {
    isCollision = false;
  }

  const itemIdMap = new Map<string, string>();
  if (isCollision) {
    targetProjectId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `proj-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    targetTitle = `${manifest.project.title} (imported)`;

    for (const it of manifest.items) {
      const newItemId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `item-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      itemIdMap.set(it.id, newItemId);
    }
  }

  // Prepare rewritten manifest items
  const finalItems: ManifestItem[] = manifest.items.map((it) => {
    if (!isCollision) return { ...it };
    const newItemId = itemIdMap.get(it.id) || it.id;
    const parts = it.path.split("/");
    const folder = parts[0];
    const ext = it.path.split(".").pop();
    const newPath = `${folder}/${newItemId}.${ext}`;

    if (it.kind === "pdf") {
      return {
        ...it,
        id: newItemId,
        path: newPath,
        annotationsPath: it.annotationsPath ? `annotations/${newItemId}.json` : undefined,
      };
    }
    return {
      ...it,
      id: newItemId,
      path: newPath,
    };
  });

  const finalManifest: AlphaManifest = {
    ...manifest,
    project: {
      ...manifest.project,
      id: targetProjectId,
      title: targetTitle,
      updatedAt: new Date().toISOString(),
    },
    items: finalItems,
  };

  // 4. Extraction with atomic rollback on ANY failure
  try {
    const totalFiles = manifest.files.length;
    let fileIdx = 0;

    // Extract & verify SHA-256 for all binary files
    for (const f of manifest.files) {
      options.onProgress?.("extracting_files", fileIdx++, totalFiles);
      const entry = byPath.get(f.path);
      if (!entry) {
        throw new ImportError(
          "missing_file",
          `File ${f.path} is listed in manifest but missing from archive`
        );
      }

      const blob = await readEntryBlob(entry, f.mime || "application/octet-stream");

      // Verify SHA-256
      const computedHash = await computeBlobSha256(blob);
      if (computedHash.toLowerCase() !== f.sha256.toLowerCase()) {
        throw new ImportError(
          "hash_mismatch",
          `SHA-256 mismatch for ${f.path}: expected ${f.sha256}, got ${computedHash}`
        );
      }

      await provider.writeFile(targetProjectId, f.key, blob, { name: f.name, mime: f.mime });
    }

    // Extract, sanitize, rewrite, and persist items
    const totalItems = manifest.items.length;
    let itemIdx = 0;

    for (let i = 0; i < manifest.items.length; i++) {
      const origItem = manifest.items[i];
      const targetItem = finalItems[i];
      options.onProgress?.("extracting_items", itemIdx++, totalItems);

      const entry = byPath.get(origItem.path);
      if (!entry) {
        throw new ImportError(
          "missing_item",
          `Item ${origItem.path} is listed in manifest but missing from archive`
        );
      }

      let text = await readEntryText(entry);

      // Sanitize board links (strip javascript: and data: links)
      if (origItem.kind === "board") {
        text = sanitizeBoardJson(text);
      }

      // Rewrite internal links if imported as a copy
      if (isCollision) {
        for (const [oldId, newId] of itemIdMap.entries()) {
          text = text.replaceAll(`alpha://pdf/${oldId}`, `alpha://pdf/${newId}`);
        }
      }

      await provider.writeItem(
        targetProjectId,
        {
          id: targetItem.id,
          projectId: targetProjectId,
          kind: targetItem.kind,
          title: targetItem.title,
          updatedAt: Date.now(),
        },
        text
      );

      // Extract & rewrite linked annotations if present
      if (origItem.kind === "pdf" && origItem.annotationsPath) {
        const annoEntry = byPath.get(origItem.annotationsPath);
        if (annoEntry) {
          let annoText = await readEntryText(annoEntry);
          if (annoText) {
            if (isCollision) {
              for (const [oldId, newId] of itemIdMap.entries()) {
                annoText = annoText.replaceAll(`alpha://pdf/${oldId}`, `alpha://pdf/${newId}`);
              }
            }
            await provider.writeItem(
              targetProjectId,
              {
                id: `anno-${targetItem.id}`,
                projectId: targetProjectId,
                kind: "annotations",
                title: `${targetItem.title} Annotations`,
                updatedAt: Date.now(),
              },
              annoText
            );
          }
        }
      }
    }

    // Persist final manifest to local storage
    await provider.saveManifest(finalManifest);

    // Notify project launcher index (non-fatal if offline / no auth session)
    try {
      if (projectIndex) {
        await projectIndex.onProjectCreated({
          id: targetProjectId,
          title: finalManifest.project.title,
          subject: finalManifest.project.subject,
          storage: "local",
        });
      }
    } catch (indexErr) {
      console.warn("[Import] Project index update skipped (offline or unauthenticated):", indexErr);
    }

    options.onProgress?.("completed", 1, 1);
    return {
      projectId: targetProjectId,
      title: finalManifest.project.title,
    };
  } catch (err: unknown) {
    // Atomic rollback: clean up partial files, items, and manifest
    try {
      await provider.deleteProject(targetProjectId);
    } catch (cleanupErr) {
      console.warn("[Import] Failed to rollback project after failure:", cleanupErr);
    }
    throw err;
  } finally {
    await reader.close();
  }
}
