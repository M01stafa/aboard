# Aboard spec — The .alpha project file

> Part of the Aboard technical specification v3.2 (Next.js 16.4 + React 19.3 + Supabase).
> Section numbers (§N) are shared across all files in `docs/specs/`; the map is in `AGENTS.md` → "Spec map".
> Requirement IDs such as `SEC-1` or `PDF-3` are defined in `docs/PRD.md`.
> Facts were checked against upstream sources, npm and official docs on 2026-10-07. Items marked **VERIFY** must be confirmed in source or docs before coding against them; record the result in `docs/PROGRESS.md` (VERIFY log), then update this file.
> If the implementation must differ from this spec, change the spec in the same commit and log the decision in `docs/PROGRESS.md`.

## 12. The `.alpha` project file

### 12.1 Container
- ZIP archive (ZIP64 when needed), written and read with `@zip.js/zip.js`.
- Extension **`.alpha`**. Download `Blob` type `application/octet-stream` (avoids Safari renaming to `.zip` — **VERIFY** on iOS in Spike S5).
- First entry **`mimetype`**, stored uncompressed, content exactly `application/x-alpha-project` (lets the app identify the file from its first bytes, like EPUB/ODF).

### 12.2 Layout
```
project.alpha
├── mimetype                     "application/x-alpha-project" (stored, first entry)
├── manifest.json                AlphaManifest (§12.3)
├── thumbnail.png                optional preview
├── boards/<itemId>.json         { "type": "alpha-board", "version": 1, "elements": [...], "appState": {...} }
├── circuits/<itemId>.txt        CircuitJS text from exportCircuit()
├── pdfs/<itemId>.json           { "type": "alpha-pdf", "version": 1, "fileKey": "...", "lastPage": 1 }
├── annotations/<itemId>.json    { "type": "alpha-annotations", "version": 1, "engine": "embedpdf", "items": [...] }
└── files/<fileKey>.<ext>        PDFs, board images, stamp images (stored, level 0, for already-compressed types)
```

### 12.3 Manifest schema (also used as `project.json` in Drive)
```ts
export const ALPHA_MIME = "application/x-alpha-project";
export interface AlphaManifest {
  format: "alpha-project";
  formatVersion: 1;
  app: { name: "Aboard"; version: string };
  exportedAt?: string;                             // ISO, only in .alpha files
  project: { id: string; title: string; subject?: string; createdAt: string; updatedAt: string };
  items: Array<
    | { id: string; kind: "board";   title: string; path: string }
    | { id: string; kind: "circuit"; title: string; path: string }
    | { id: string; kind: "pdf";     title: string; path: string; fileKey: string; annotationsPath?: string }
  >;
  files: Array<{ key: string; path: string; name?: string; mime: string; size: number; sha256: string }>;
  layout?: { tabs: string[]; split?: "none" | "vertical" | "horizontal" };
}
```
Validate with `zod` on import. Any change to the layout or schema increments `formatVersion` and adds a migration function `migrate_v1_to_v2(manifest, reader)`.

### 12.4 Export
```ts
import { ZipWriter, BlobReader, TextReader } from "@zip.js/zip.js";

const STORED = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "image/avif", "image/gif"]);

export async function exportAlpha(projectId: string) {
  await saveQueue.flush(projectId);
  const bundle = await projectService.collect(projectId);         // manifest + item payloads + file getters (downloads missing Drive files)
  const name = `${safeFileName(bundle.manifest.project.title)}.alpha`;
  const sink = await openSink(name);                               // see below
  const zip = new ZipWriter(sink.writable, { zip64: bundle.totalBytes > 3.5e9 });

  await zip.add("mimetype", new TextReader(ALPHA_MIME), { level: 0 });
  await zip.add("manifest.json", new TextReader(JSON.stringify({ ...bundle.manifest, exportedAt: new Date().toISOString() }, null, 2)));
  for (const t of bundle.textEntries) await zip.add(t.path, new TextReader(t.text));
  for (const f of bundle.files) {
    await zip.add(f.path, new BlobReader(await f.getBlob()), { level: STORED.has(f.mime) ? 0 : 6 });
    progress(f);
  }
  await zip.close();
  await sink.finish();
}

async function openSink(name: string) {
  if ("showSaveFilePicker" in window) {                            // Chromium desktop: stream straight to disk
    const handle = await (window as any).showSaveFilePicker({
      suggestedName: name,
      types: [{ description: "Aboard project", accept: { "application/octet-stream": [".alpha"] } }],
    });
    const writable: WritableStream = await handle.createWritable();
    return { writable, finish: async () => {} };                   // zip.close() closes the stream
  }
  const chunks: Uint8Array[] = [];                                 // other browsers: build in memory
  const writable = new WritableStream<Uint8Array>({ write: (c) => { chunks.push(c); } });
  return {
    writable,
    finish: async () => downloadBlob(new Blob(chunks, { type: "application/octet-stream" }), name),
  };
}
```
- In-memory exports are capped (1 GB desktop, 300 MB mobile); above the cap, offer "Export to Google Drive" or exporting without PDFs.
- Options in the export dialog: include PDF files (default on); also add annotated copies of PDFs (default off).
- "Export to Google Drive": same writer into a `BlobWriter`, then resumable upload to `Aboard/Exports/`.
- The current project in Drive mode can also be shared by sharing the Drive file of an export.

### 12.5 Import
```ts
import { ZipReader, BlobReader, TextWriter, BlobWriter } from "@zip.js/zip.js";

export async function importAlpha(file: File) {
  const reader = new ZipReader(new BlobReader(file));              // random access: no full load into memory
  const entries = await reader.getEntries();
  assertLimits(entries);                                           // ≤ 5,000 entries, ≤ 10 GB total, ratio checks
  const byPath = new Map(entries.map((e) => [e.filename, e]));

  const mime = await byPath.get("mimetype")?.getData?.(new TextWriter());
  if (mime?.trim() !== ALPHA_MIME) throw new ImportError("not_alpha_file");
  const manifest = AlphaManifestSchema.parse(JSON.parse(await byPath.get("manifest.json")!.getData!(new TextWriter())));
  if (manifest.formatVersion > SUPPORTED_FORMAT) throw new ImportError("newer_format");

  const target = await projectService.prepareImport(manifest);     // copy with new ids if project id already exists
  for (const f of manifest.files) {
    assertSafePath(f.path);                                        // only "files/…", no "..", no absolute paths
    const blob = await byPath.get(f.path)!.getData!(new BlobWriter(f.mime));
    if ((await sha256Hex(blob)) !== f.sha256) { target.markMissing(f.key); continue; }
    await target.putFile(f.key, blob, f);
  }
  for (const it of manifest.items) {
    assertSafePath(it.path);
    await target.putItem(it, await byPath.get(it.path)!.getData!(new TextWriter()));
  }
  await reader.close();
  return target.finish();                                          // writes to the user's default storage + index row
}
```
- Entry points: "Open .alpha" button (`<input type="file">`; **no `accept` filter on iOS/iPadOS**, because Safari greys out unknown extensions), drag-and-drop onto the launcher, and the Google Picker ("Open from Google Drive").
- Import goes to the user's default storage (Drive or local), with a progress bar.
- If the same project id already exists: import as a copy named "<title> (imported)" with new project and item ids; rewrite `alpha://pdf/<itemId>` links. File keys stay the same (content hashes).
- `sha256Hex` for large blobs uses `hash-wasm` incrementally over `blob.stream()`.
