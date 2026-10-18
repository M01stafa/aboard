import { ZipWriter, BlobReader, TextReader } from "@zip.js/zip.js";
import { projectService as defaultProjectService, type ProjectService } from "@/core/storage";
import { ALPHA_MIME, type AlphaManifest } from "./manifest";

/**
 * Pre-compressed binary MIME types stored with level 0 (no compression) per §12.4.
 * Eliminates CPU waste recompressing already-compressed formats.
 */
export const STORED_MIMES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/avif",
  "image/gif",
]);

/**
 * In-memory memory caps confirmed in Spike S5 report.
 */
export const IN_MEMORY_CAP_DESKTOP_BYTES = 1024 * 1024 * 1024; // 1 GB
export const IN_MEMORY_CAP_MOBILE_BYTES = 300 * 1024 * 1024; // 300 MB

export interface ExportOptions {
  includePdfs?: boolean;
  includeAnnotated?: boolean;
  streamToDisk?: boolean; // If true and available, streams via showSaveFilePicker
  projectService?: ProjectService;
  onProgress?: (stage: string, current: number, total: number) => void;
}

export interface ExportResult {
  fileName: string;
  blob?: Blob;
  isStreaming: boolean;
  manifest: AlphaManifest;
  totalBytes: number;
}

export class ExportCapExceededError extends Error {
  constructor(public totalBytes: number, public capBytes: number, public isMobile: boolean) {
    super(
      `Project size (${(totalBytes / (1024 * 1024)).toFixed(1)} MB) exceeds in-memory export limit (${(capBytes / (1024 * 1024)).toFixed(0)} MB)`
    );
    this.name = "ExportCapExceededError";
  }
}

/**
 * Sanitizes filename to conform to desktop and mobile file system restrictions.
 */
export function safeFileName(name: string): string {
  const sanitized = name
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "_")
    .trim()
    .replace(/\s+/g, "_");
  return sanitized.length > 0 ? sanitized : "project";
}

/**
 * Detects whether the current environment is a coarse-pointer mobile device.
 */
export function isMobileEnvironment(): boolean {
  if (typeof window === "undefined") return false;
  const isCoarse = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const isSmallScreen = window.innerWidth <= 768;
  const isMobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent || ""
  );
  return isCoarse || isSmallScreen || isMobileUA;
}

/**
 * Triggers native browser download for a Blob with application/octet-stream MIME.
 * Using application/octet-stream prevents iOS Safari from auto-renaming .alpha to .zip (Spike S5).
 */
export function downloadBlob(blob: Blob, fileName: string): void {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/**
 * Opens a WritableStream sink: either native direct-to-disk stream (Chromium showSaveFilePicker)
 * or in-memory chunks WritableStream.
 */
async function openSink(
  fileName: string,
  streamToDisk: boolean = true
): Promise<{
  writable: WritableStream<Uint8Array>;
  isStreaming: boolean;
  finish: () => Promise<Blob | undefined>;
}> {
  if (streamToDisk && typeof window !== "undefined" && "showSaveFilePicker" in window) {
    try {
      const handle = await (window as unknown as {
        showSaveFilePicker: (opts: unknown) => Promise<FileSystemFileHandle>;
      }).showSaveFilePicker({
        suggestedName: fileName,
        types: [
          {
            description: "Aboard Project Archive (.alpha)",
            accept: { "application/octet-stream": [".alpha"] },
          },
        ],
      });
      const writable = await handle.createWritable();
      return {
        writable: writable as unknown as WritableStream<Uint8Array>,
        isStreaming: true,
        finish: async () => undefined,
      };
    } catch (err: unknown) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error("Export cancelled by user");
      }
      console.warn("[Export] showSaveFilePicker unavailable or aborted, falling back to in-memory:", err);
    }
  }

  // In-memory fallback (Safari, Firefox, Mobile, or programmatic)
  const chunks: Uint8Array[] = [];
  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      chunks.push(chunk);
    },
  });

  return {
    writable,
    isStreaming: false,
    finish: async () => {
      const blob = new Blob(chunks as unknown as BlobPart[], { type: "application/octet-stream" });
      if (typeof window !== "undefined") {
        downloadBlob(blob, fileName);
      }
      return blob;
    },
  };
}

/**
 * Core export engine executing Tasks 31 / ALPHA-1, ALPHA-5, ALPHA-6, ALPHA-8.
 */
export async function exportAlpha(
  projectId: string,
  options: ExportOptions = {}
): Promise<ExportResult> {
  const ps = options.projectService ?? defaultProjectService;

  options.onProgress?.("collecting_items", 0, 1);
  const bundle = await ps.collect(projectId, {
    includePdfs: options.includePdfs !== false,
    includeAnnotated: options.includeAnnotated === true,
  });

  const baseTitle = bundle.manifest.project.title || "Project";
  const fileName = `${safeFileName(baseTitle)}.alpha`;

  // Check in-memory memory boundaries if direct-to-disk streaming is not available
  const canStreamToDisk =
    (options.streamToDisk !== false) && typeof window !== "undefined" && "showSaveFilePicker" in window;

  if (!canStreamToDisk) {
    const isMobile = isMobileEnvironment();
    const cap = isMobile ? IN_MEMORY_CAP_MOBILE_BYTES : IN_MEMORY_CAP_DESKTOP_BYTES;
    if (bundle.totalBytes > cap) {
      throw new ExportCapExceededError(bundle.totalBytes, cap, isMobile);
    }
  }

  const sink = await openSink(fileName, options.streamToDisk !== false);

  const zip = new ZipWriter(sink.writable, {
    zip64: bundle.totalBytes > 3.5e9, // Use ZIP64 for multi-gigabyte exports
  });

  // 1. MUST be the very first entry: "mimetype" uncompressed (level: 0)
  options.onProgress?.("writing_mimetype", 0, 1);
  await zip.add("mimetype", new TextReader(ALPHA_MIME), { level: 0 });

  // 2. Second entry: manifest.json
  options.onProgress?.("writing_manifest", 0, 1);
  const manifestData: AlphaManifest = {
    ...bundle.manifest,
    exportedAt: new Date().toISOString(),
  };
  await zip.add(
    "manifest.json",
    new TextReader(JSON.stringify(manifestData, null, 2))
  );

  // 3. Text entries (boards, circuits, pdfs metadata, annotations)
  const totalEntries = bundle.textEntries.length + bundle.files.length;
  let processedEntries = 0;

  for (const t of bundle.textEntries) {
    await zip.add(t.path, new TextReader(t.text));
    processedEntries++;
    options.onProgress?.("writing_entries", processedEntries, totalEntries);
  }

  // 4. Binary files (PDFs, images, stamps)
  for (const f of bundle.files) {
    const blob = await f.getBlob();
    const level = STORED_MIMES.has(f.mime) ? 0 : 6;
    await zip.add(f.path, new BlobReader(blob), { level });
    processedEntries++;
    options.onProgress?.("writing_entries", processedEntries, totalEntries);
  }

  // Finalize zip archive
  await zip.close();
  const exportedBlob = await sink.finish();

  return {
    fileName,
    blob: exportedBlob,
    isStreaming: sink.isStreaming,
    manifest: manifestData,
    totalBytes: bundle.totalBytes,
  };
}
