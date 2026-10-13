# Aboard spec — Tool modules (board, circuit, PDF, Stirling) and cross-tool integration

> Part of the Aboard technical specification v3.2 (Next.js 16.4 + React 19.3 + Supabase).
> Section numbers (§N) are shared across all files in `docs/specs/`; the map is in `AGENTS.md` → "Spec map".
> Requirement IDs such as `SEC-1` or `PDF-3` are defined in `docs/PRD.md`.
> Facts were checked against upstream sources, npm and official docs on 2026-10-07. Items marked **VERIFY** must be confirmed in source or docs before coding against them; record the result in `docs/PROGRESS.md` (VERIFY log), then update this file.
> If the implementation must differ from this spec, change the spec in the same commit and log the decision in `docs/PROGRESS.md`.

## 7. Modules

All modules read and write through `ProjectService` (§11). None of them calls Drive, Dexie or Supabase directly.

### 7.1 Board — Excalidraw 0.18.1
- `import "@excalidraw/excalidraw/index.css";` (required in 0.18).
- Load on the client only: inside a Client Component (`"use client"`), `const Excalidraw = dynamic(() => import("@excalidraw/excalidraw").then(m => m.Excalidraw), { ssr: false });` (`next/dynamic`).
- Fonts: online-only means the default CDN works, but **self-host anyway** (reliability and a strict CSP): copy `node_modules/@excalidraw/excalidraw/dist/prod/fonts` → `public/fonts` at build time and set `window.EXCALIDRAW_ASSET_PATH = "/"` before the bundle loads, in `app/layout.tsx`: `<Script id="excalidraw-asset-path" strategy="beforeInteractive">{`window.EXCALIDRAW_ASSET_PATH = "/";`}</Script>` (`next/script`).
- API via `excalidrawAPI={(api) => adapter.attach(api)}`. `initialData` is used once; never feed `onChange` back into component state.
- Props: `langCode="ar-SA" | "en"`, `theme`, `UIOptions` (hide "save to disk"/"load" because the app manages files), `renderTopRightUI`.
- **Saving:** `onChange` → `ProjectService.saveBoard(itemId, { elements, appState: pick(appState, PERSISTED_KEYS) })` (debounced inside the SaveQueue). `PERSISTED_KEYS`: `viewBackgroundColor`, `gridSize`, `gridModeEnabled`, `zoom`, `scrollX`, `scrollY` (confirmed in `@excalidraw/excalidraw` `types.d.ts` via Spike S1 / V04).
- **Images:** element JSON stores only `fileId`. Bytes go to `ProjectService.putFile(projectId, fileKey=fileId, blob)`. On load, the module asks for missing files and calls `api.addFiles([...])`.
- **4 MB limit per image** (`MAX_ALLOWED_FILE_BYTES`): compress and cap dimensions before `addFiles`. Allowed types include png, jpeg, webp, svg, gif, avif.
- Element field for corners is `roundness` (not `strokeSharpness`).
- Helpers: `convertToExcalidrawElements`, `exportToBlob`, `exportToSvg`, `serializeAsJSON`, `restore`, `reconcileElements`.

### 7.2 Circuit — fork of `pfalstad/circuitjs1`

**Build:** `gradle compileGwt` then `gradle makeSite` (output `site/`), or `./dev.sh compile` (output `war/`). Gradle 8.7 exactly. `scripts/build-circuit.sh` copies the output **except `WEB-INF/`** to `apps/web/public/circuit/`.

**Fork patches** (keep in `vendor/PATCHES.md`):
1. `war/circuitjs.html`: remove the `navigator.serviceWorker.register('service-worker.js')` block and the `<link rel="manifest" …>` line; do not ship `service-worker.js`/`manifest.json`.
2. Disable Dropbox / Google Drive loaders and `shortrelay.php` usage.
3. `JSInterface.java` — add to the `CircuitJS1` object:
   - `runCommand(menu, item)` → `app.commands.menuPerformed(menu, item)` (`CirSim.commands` is the `CommandManager`). Example: `runCommand("main", "ResistorElm")` selects "Add Resistor" (item ids = class names in `Menus.composeMainMenu`).
   - `getCircuitAsPNG()` → `app.imageExporter.getCircuitAsCanvas(ImageExporter.CAC_IMAGE).toDataUrl()` (`CAC_PRINT=0`, `CAC_IMAGE=1`, `CAC_SVG=2`).
4. Add `src/com/lushprojects/circuitjs1/public/locale_ar.txt` (template `lang/locale_template.txt`), loaded with `?lang=ar`.
5. Colors/fonts of the chrome in `war/circuitjs.css`.

**Iframe URL** (params verified in upstream README):
`/circuit/circuitjs.html?hideMenu=true&hideSidebar=false&hideInfoBox=false&whiteBackground=true&positiveColor=%23…&negativeColor=%23…&selectColor=%23…&currentColor=%23…&running=true&lang=ar&editable=true`
Load saved circuits with `importCircuit()` after load, never through the URL.

**JavaScript API** (verified in `JSInterface.java`):
```ts
export interface CircuitJS1Api {
  setSimRunning(run: boolean): void;  isRunning(): boolean;
  getTime(): number;
  getTimeStep(): number;    setTimeStep(dt: number): void;
  getMaxTimeStep(): number; setMaxTimeStep(dt: number): void;
  getNodeVoltage(labelName: string): number;
  setExtVoltage(name: string, v: number): void;
  getElements(): unknown[];
  getCircuitAsSVG(): void;                        // async → onsvgrendered(sim, svg)
  exportCircuit(): string;
  importCircuit(text: string, subcircuitsOnly: boolean): void;
  onupdate?: (sim: CircuitJS1Api) => void;
  ontimestep?: (sim: CircuitJS1Api) => void;
  onanalyze?: (sim: CircuitJS1Api) => void;
  onsvgrendered?: (sim: CircuitJS1Api, svg: string) => void;
  runCommand?(menu: string, item: string): void;  // fork patch 3
  getCircuitAsPNG?(): string;                      // fork patch 3
}
```
**Adapter:** on iframe `load`, use `contentWindow.CircuitJS1` if present, else set `contentWindow.oncircuitjsloaded = attach`. The adapter owns the single callback slots and fans out to subscribers. **Saving:** `onanalyze` → `ProjectService.saveCircuit(itemId, exportCircuit())` (debounced by the SaveQueue).

**Circuit text format:** first line `$ <flags> <maxTimeStep> <simSpeed> <currentSpeed> <voltageRange> <powerBar> [<minTimeStep>]` (first number = flags bitmask). Treat the text as opaque; produce it only with `exportCircuit()`.

### 7.3 PDF — local engine
| Concern | Library |
|---|---|
| Render, scroll, zoom, thumbnails, text selection, search | `@embedpdf/core` + plugins (PDFium WASM) |
| Annotations (highlight, ink, free text, stamps), undo | `@embedpdf/plugin-annotation`, `@embedpdf/plugin-history` |
| Annotated export | `@embedpdf/plugin-export` |
| Page operations (rotate, reorder, delete, insert image page, merge small files) | `@cantoo/pdf-lib` |

**Annotations are stored separately from the PDF:**
- The original PDF bytes are immutable, stored once under `fileKey = sha256(pdf)`.
- `AnnotationPlugin.exportAnnotations()` returns portable `AnnotationTransferItem[]`; `importAnnotations(items)` restores them (both verified in the package types). Save the array as JSON via `ProjectService.saveAnnotations(itemId, json)`.
- Stamp annotations carry binary data (`ctx.data: ArrayBuffer`). Before saving, move each stamp's bytes to `putFile(projectId, sha256(bytes), blob)` and replace them in the JSON with `{ fileKey }`; reverse on load.
- Save trigger: annotation change events via `AnnotationScope.onAnnotationEvent` (`type: "create" | "update" | "delete"`, confirmed in Spike S3 / V05; stamp binary data preserved in `ctx.data: ArrayBuffer`) → debounced save.
- "Download annotated PDF": import annotations into the document and use the export plugin to produce a new file (or save it into the project as a new PDF item).
- Page operations (rotate, reorder…) produce a **new PDF file** (new hash) and a new item version; annotations of the old version stay attached to it. Warn the user that annotations do not carry over to a restructured PDF in this version.
- Precompute nothing: the PDFium `.wasm` is loaded on first PDF open.

### 7.4 PDF — heavy operations via Stirling (online)
Flow: `browser → https://api.aboard.example/pdf/<tool> (Authorization: Bearer <Supabase JWT>) → pdf-gateway → http://stirling:8080/api/v1/... (private network)`.

pdf-gateway (Node 22 + Hono): verify Supabase JWT; allow-list of tools; max upload size; per-user rate and concurrency limits; stream bodies both ways; CORS only for the app origin. The result returns to the browser, which saves it into the project like any other PDF (so it lands in the user's Drive or browser, not on your server).

Verified endpoints (confirm others in the deployed Swagger UI):
| Tool | Endpoint |
|---|---|
| OCR | `POST /api/v1/misc/ocr-pdf` |
| Compress | `POST /api/v1/misc/compress-pdf` |
| Office/other → PDF | `POST /api/v1/convert/file/pdf` |

---

## 8. Cross-tool integration

Typed bus (`mitt`); payloads carry `Blob`s, converted to data URLs only at the Excalidraw boundary.
```ts
type AppEvents = {
  "pdf:page-to-board": { docItemId: string; page: number; image: Blob; width: number; height: number; targetBoardTabId?: string };
  "circuit:to-board":  { circuitItemId: string; svg: string; targetBoardTabId?: string };
  "board:to-pdf":      { boardItemId: string; image: Blob; targetPdfItemId?: string };
  "pdf:selection":     { docItemId: string; page: number; text: string; targetBoardTabId?: string };
  "save:status":       { projectId: string; state: SaveState };
  "drive:reconnect-required": {};
};
```
Target board: explicit tab → other visible pane if it is a board → most recent board → new board.

**PDF page → board**
```ts
const blob = await renderPageToBlob(doc, page, { scale: 2, type: "image/webp", quality: 0.85, maxSide: 3000 }); // re-encode if > 4 MB
const fileId = (await sha256Hex(blob)) as FileId;
await projectService.putFile(projectId, fileId, blob);
api.addFiles([{ id: fileId, dataURL: await blobToDataURL(blob), mimeType: "image/webp", created: Date.now() }]);
const [img] = convertToExcalidrawElements([{ type: "image", fileId, x, y, width: w, height: h, locked: true }]);
api.updateScene({ elements: [...api.getSceneElements(), img] });
api.scrollToContent(img, { fitToContent: true });
```
**Circuit → board:** `adapter.requestSVG()` (wraps `getCircuitAsSVG` + `onsvgrendered`) → `Blob` `image/svg+xml` → same insertion.
**Board → PDF:** `exportToBlob({ elements, appState, files, mimeType: "image/png" })` → `@cantoo/pdf-lib` `embedPng` + `addPage` → new PDF item (or appended version of an existing one).
**PDF selection → note:** `convertToExcalidrawElements([{ type: "text", text, x, y }])` with `link: "alpha://pdf/<itemId>#page=<n>"`, handled by the app router.
