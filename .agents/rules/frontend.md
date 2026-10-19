---
trigger: glob
globs: "apps/web/**/*.ts, apps/web/**/*.tsx, apps/web/**/*.css, apps/web/**/*.html, apps/web/**/*.json, vendor/circuitjs1/**, scripts/build-circuit.sh, scripts/copy-excalidraw-fonts.mjs"
description: "Frontend rules for Aboard: Next.js 16.4 usage, workspace tabs/split keep-alive, Excalidraw, CircuitJS1 fork and adapter, EmbedPDF, cross-tool actions, theme/RTL."
---

# Frontend rules

Specs: `docs/specs/architecture.md` (§3.1 Next.js rules, §6 workspace, §15 theme/RTL, §17 flows), `docs/specs/modules.md` (§7 modules, §8 integration). Visual rules: `DESIGN.md` (via `.agents/rules/design.md`). Requirements: `WS-*`, `BOARD-*`, `CIRC-*`, `PDF-*`, `INT-*` in `docs/PRD.md`.

## Next.js 16.4 (App Router)
- Interactive pages are Client Components (`"use client"`). Server Components only for static pages (privacy, terms, licenses).
- Load every tool module with `next/dynamic(() => import(...), { ssr: false })` from a Client Component.
- No Server Actions or Route Handlers for user content (boards, circuits, PDFs, Drive files).
- Supabase in the browser only (`@supabase/supabase-js`); do not add `@supabase/ssr`. `/auth/callback` is a Client Component page.
- Workspace route is `/workspace?p=<projectId>`, read with `useSearchParams` inside `<Suspense>`.
- `public/circuit/**` is static output of `scripts/build-circuit.sh`; never import it as a module and never edit it by hand.
- Middleware file is `proxy.ts` (Next.js 16 name). Security headers live in `next.config.ts` `headers()`.
- Confirm Next.js APIs in `node_modules/next` types or the official docs for 16.4; do not rely on Next.js 13–15 memory.

## Workspace host (tabs + split) — spec §6
- Render each open tab once, in a stable DOM order; tab-bar order is a separate array. Never re-key or move a pane's DOM node (an `<iframe>` reloads when moved).
- Layout is CSS grid only, panes marked `data-slot="primary|secondary|hidden"`.
- Hidden pane CSS: `visibility:hidden; pointer-events:none; position:absolute; inset:0; z-index:-1;`. Never `display:none`.
- On visibility change or resize of a board pane, call `excalidrawAPI.refresh()` (ResizeObserver).
- While dragging the divider, show a transparent full-screen overlay above all panes.
- Max 2 visible panes; split disabled below 768 px; warn above 3 open circuit tabs.
- Flush the tab's pending save before closing it.
- Keep the mount-counter test green: each module mounts exactly once across tab/split changes.

## Whiteboard — Excalidraw 0.18.1 (spec §7.1)
- `import "@excalidraw/excalidraw/index.css";` is required.
- Fonts are self-hosted: `scripts/copy-excalidraw-fonts.mjs` copies `dist/prod/fonts` to `public/fonts`; `app/layout.tsx` sets `window.EXCALIDRAW_ASSET_PATH = "/"` with `<Script strategy="beforeInteractive">`.
- Get the API via the `excalidrawAPI` prop. `initialData` is used once; never feed `onChange` back into component state. Persist from `onChange` through `ProjectService.saveBoard` (debounced by the SaveQueue).
- Element JSON stores `fileId` only; image bytes go through `ProjectService.putFile`. Images over 4 MB are rejected by Excalidraw: compress (WebP/JPEG) and cap dimensions first.
- Corners use `roundness` (not `strokeSharpness`). Helpers: `convertToExcalidrawElements`, `exportToBlob`, `exportToSvg`, `restore`, `reconcileElements`.
- In Next.js App Router, importing from `@excalidraw/excalidraw` at the top level of shared modules causes `ReferenceError: window is not defined` during SSR evaluation. Use dynamic `await import("@excalidraw/excalidraw")` inside client-only execution paths (e.g. `reconcileElements`).
- `langCode="ar-SA"` for Arabic; `UIOptions` hides Excalidraw's own load/save-to-disk.

## Circuit — fork of `pfalstad/circuitjs1` (spec §7.2)
- Same-origin iframe: `/circuit/circuitjs.html?hideMenu=true&...` (params in spec §7.2). Load circuits with `importCircuit()` after load, never via the URL.
- Verified API on `window.CircuitJS1`: `setSimRunning`, `isRunning`, `getTime`, `getTimeStep`, `setTimeStep`, `getMaxTimeStep`, `setMaxTimeStep`, `getNodeVoltage`, `setExtVoltage`, `getElements`, `getCircuitAsSVG` (async → `onsvgrendered`), `exportCircuit`, `importCircuit(text, subcircuitsOnly)`; callbacks `onupdate`, `ontimestep`, `onanalyze`, `onsvgrendered`. `runCommand` and `getCircuitAsPNG` exist only after fork patch 3.
- Adapter: on iframe `load`, use `contentWindow.CircuitJS1` if present, otherwise set `contentWindow.oncircuitjsloaded`. The adapter owns each callback slot and fans out to subscribers. It must survive a Strict Mode double mount.
- Save on `onanalyze` → `exportCircuit()` → `ProjectService.saveCircuit`. Treat the circuit text as opaque (first `$` number is a flags bitmask).
- Fork patches are listed in `vendor/circuitjs1/PATCHES.md` (remove its service worker + manifest; disable Dropbox/Drive/short URLs; add `runCommand`/`getCircuitAsPNG` in `JSInterface.java`; add `locale_ar.txt`; CSS). Keep engine code untouched otherwise.
- Build with Gradle 8.7 (`gradle compileGwt`, `gradle makeSite`) or `./dev.sh compile`. There is no Ant build.
- Theme change: `exportCircuit()` → reload iframe with new color params → `importCircuit()`.

## PDF — EmbedPDF + `@cantoo/pdf-lib` (spec §7.3)
- Viewer and annotations: `@embedpdf/core` + plugins. Annotations are saved as JSON (`exportAnnotations()` / `importAnnotations()`), separate from the PDF, keyed by the PDF's SHA-256.
- Stamp images move to `putFile` and are replaced by `{ fileKey }` in the JSON.
- Always import and use the `PdfAnnotationSubtype` enum from `@embedpdf/models` (never hardcode numeric constants; e.g. `HIGHLIGHT` is 9, `POLYLINE` is 8, `STAMP` is 13). Passing wrong subtype IDs causes EmbedPDF to mount mismatched vector renderers (e.g. Polyline) that crash on undefined properties (`vertices.map`).
- `scope.getAnnotations()` returns a dictionary keyed by page index (`{ [page: number]: Array<{ object: PdfAnnotationObject }> }`), never a flat array. Always normalize with `Object.values(scope.getAnnotations() || {}).flat()`.
- EmbedPDF `AnnotationPluginPackage` and `SelectionPluginPackage` require `InteractionManagerPluginPackage` in the batch registration array.
- The original PDF is immutable. Page operations create a new PDF item/version; warn that annotations do not carry over.
- "Download annotated PDF" builds a new file with the export plugin. Do not use `pdf-lib` (unmaintained); use `@cantoo/pdf-lib`.
- Online tools go through `src/core/stirling.ts` to the gateway with the Supabase JWT; results are saved into the project like any PDF.

## Cross-tool actions (spec §8)
- Typed `mitt` bus; payloads carry `Blob`s, converted to data URLs only at the Excalidraw boundary.
- PDF page → board: render to WebP, keep ≤ 4 MB, `putFile` with SHA-256 id, `addFiles`, then an image element with `locked: true`.
- Circuit → board: `getCircuitAsSVG()` via the adapter → `Blob image/svg+xml` → same insertion. Never inline SVG into the DOM.
- Target board: explicit tab → other visible pane if it is a board → most recent board → new board.

## Theme, RTL, i18n (spec §15)
- `<html dir>` follows the language. Use logical CSS properties only.
- All UI strings through i18n keys (Arabic + English). No hard-coded user-facing text.
- Colors and fonts only through tokens in `src/theme/tokens.css` (values defined by `DESIGN.md`); dark mode via `[data-theme="dark"]`.
- Spacing only through `--space-*` tokens on the 8-point grid (`.agents/rules/spacing.md`).
- Accessibility: keyboard-operable shell, labelled controls, visible focus (aim WCAG 2.2 AA).
