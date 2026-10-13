# Aboard spec — Storage layer (ProjectService, providers, IndexedDB, SaveQueue)

> Part of the Aboard technical specification v3.2 (Next.js 16.4 + React 19.3 + Supabase).
> Section numbers (§N) are shared across all files in `docs/specs/`; the map is in `AGENTS.md` → "Spec map".
> Requirement IDs such as `SEC-1` or `PDF-3` are defined in `docs/PRD.md`.
> Facts were checked against upstream sources, npm and official docs on 2026-10-07. Items marked **VERIFY** must be confirmed in source or docs before coding against them; record the result in `docs/PROGRESS.md` (VERIFY log), then update this file.
> If the implementation must differ from this spec, change the spec in the same commit and log the decision in `docs/PROGRESS.md`.

## 11. Storage layer (ProjectService, providers, IndexedDB, SaveQueue)

### 11.1 Provider interface
```ts
// src/core/storage/types.ts
export type ItemKind = "board" | "circuit" | "pdf" | "annotations";
export interface ItemRecord { id: string; projectId: string; kind: ItemKind; title: string; updatedAt: number }

export interface StorageProvider {
  readonly kind: "drive" | "local";
  createProject(manifest: AlphaManifest): Promise<{ driveFolderId?: string }>;
  loadManifest(projectId: string): Promise<AlphaManifest>;
  saveManifest(manifest: AlphaManifest): Promise<void>;
  readItem(projectId: string, itemId: string): Promise<string>;          // JSON or circuit text
  writeItem(projectId: string, item: ItemRecord, payload: string): Promise<void>;
  deleteItem(projectId: string, itemId: string): Promise<void>;
  hasFile(projectId: string, key: string): Promise<boolean>;
  readFile(projectId: string, key: string): Promise<Blob>;
  writeFile(projectId: string, key: string, blob: Blob, meta: { name?: string; mime: string }): Promise<void>;
  deleteProject(projectId: string): Promise<void>;
}
```
- `LocalProvider`: IndexedDB is the store.
- `DriveProvider`: Drive is the store; IndexedDB is buffer + cache.
- `ProjectService` (the only API modules use): `openProject`, `saveBoard`, `saveCircuit`, `saveAnnotations`, `putFile`, `getFile`, `createItem`, `renameItem`, `deleteItem`, `exportAlpha`, `importAlpha`, `moveProject(toMode)`.

### 11.2 IndexedDB schema (Dexie)
```ts
db.version(1).stores({
  projects: "id, storage, updatedAt",               // mirror of the index + manifest JSON
  items:    "id, projectId, [projectId+kind], dirty", // payload, driveFileId, driveRev, dirty, updatedAt
  files:    "[projectId+key], projectId, lastAccess", // blob, mime, size, sha256, driveFileId, pinned
  outbox:   "++seq, projectId, itemId",               // pending Drive writes (coalesced per item)
  meta:     "key",                                    // deviceId, settings
});
```
- **Local mode:** all rows `pinned = true`; nothing is ever evicted.
- **Drive mode:** clean files (uploaded, not dirty) are a cache. Evict least-recently-used clean files when `navigator.storage.estimate()` shows usage above 70 % of quota or above a 2 GB app cap. Never evict dirty rows or outbox entries.
- `deviceId`: random UUID created once and stored in `meta`.

### 11.3 Silent persistence (no prompts)
IndexedDB needs no permission and shows nothing to the user. Ask the browser not to evict data, but only where that request is silent:
```ts
export async function requestPersistenceSilently() {
  if (!navigator.storage?.persist || (await navigator.storage.persisted())) return;
  if (/firefox/i.test(navigator.userAgent)) return;   // Firefox may show a permission prompt
  await navigator.storage.persist();                  // Chromium/Safari decide silently
}
```
Call it after the first save in local mode.

### 11.4 SaveQueue
1. A module change → `ProjectService.saveX()` → write payload to IndexedDB (debounce 500 ms), set `dirty = true`, upsert an outbox entry for that item (latest payload wins).
2. Local mode: done (mark clean).
3. Drive mode: upload after **3 s of no changes, at most every 30 s** during continuous editing. Files upload once (content-addressed) before the item that references them.
4. Flush immediately on: tab close, project switch, `visibilitychange → hidden`, `.alpha` export.
5. Pause on `offline`, resume on `online`. Retries follow §10.10.
6. If the outbox is not empty on `beforeunload` in Drive mode, call `event.preventDefault()` so the browser shows its standard "leave site?" dialog. This is the only interruption, and only when data would otherwise be lost.
7. Emit `save:status` → a small status label in the top bar: "Saved to Google Drive" / "Saving…" / "Saved on this device" / "Waiting for connection" / "Reconnect Google Drive".

### 11.5 Project index sync (Supabase)
On create/rename/delete/move, upsert the `projects` row (title, subject, storage, `drive_folder_id`, `local_device_id`, `item_count`). The launcher lists rows from Supabase:
- Drive projects: openable on every device.
- Local projects from **this** device (`local_device_id` = this `deviceId`): openable.
- Local projects from another device: shown greyed as "On another device"; the card offers "Open a .alpha file".

### 11.6 Moving a project between modes
- **Local → Drive** ("Save to Google Drive"): create the project folder, upload manifest, items and files (resumable for big files, progress bar), update the index row (`storage='drive'`, `drive_folder_id`), unpin local files (they become cache).
- **Drive → Local** ("Keep only on this device"): download everything, pin it, update the row (`storage='local'`, `local_device_id`), then ask whether to move the Drive folder to trash.
- After the first Drive connection, if local projects exist, offer once: "Move your projects to Google Drive?".
