# Aboard spec — Errata for the three upstream reference files

> Part of the Aboard technical specification v3.2 (Next.js 16.4 + React 19.3 + Supabase).
> Section numbers (§N) are shared across all files in `docs/specs/`; the map is in `AGENTS.md` → "Spec map".
> Requirement IDs such as `SEC-1` or `PDF-3` are defined in `docs/PRD.md`.
> Facts were checked against upstream sources, npm and official docs on 2026-10-07. Items marked **VERIFY** must be confirmed in source or docs before coding against them; record the result in `docs/PROGRESS.md` (VERIFY log), then update this file.
> If the implementation must differ from this spec, change the spec in the same commit and log the decision in `docs/PROGRESS.md`.

The owner's reference files (`docs/reference/circuitjs1_architecture.md`, `excalidraw_architecture.md`, `stirling_pdf_architecture.md`) contain errors. Apply this table before trusting them. When a reference file and the upstream source disagree, the source wins; add any new discrepancy here.

## Errata for the reference files

### A.1 `circuitjs1_architecture.md`
| Section | Reference says | Correct (verified in source) |
|---|---|---|
| §3.1, §8 | Built with Apache Ant | No Ant build. `pfalstad/circuitjs1`: Gradle 8.7 (`compileGwt`, `makeSite` → `site/`), `./dev.sh compile`, or Eclipse + GWT plugin |
| Repo | `sharpie7/circuitjs1` | Inactive since Nov 2022; use `pfalstad/circuitjs1` |
| §4, §9 | `src/com/falstad/` | `src/com/lushprojects/circuitjs1/client/` |
| §9 | Register elements in `CirSim.setupMainMenu()` | Menus in `Menus.composeMainMenu()`; creation via `CirSim.createCe` / `constructElement` + `dumpTypeMap`; commands via `CommandManager.menuPerformed(menu, item)` |
| §3.2.3 | Share links `#c=` with LZMA/Pako | `?cct=` (plain) and `?ctz=` (lz-string) |
| §7 | `$` line param 1 = time step | Param 1 = flags bitmask, then maxTimeStep, sim speed, current speed, voltage range, power bar, [minTimeStep] |
| Missing | — | JS API `window.CircuitJS1` (§7.2), URL params, `war/jsinterface.html`; locales `locale_xx.txt` (no Arabic); fork ships its own `service-worker.js` + `manifest.json` |

### A.2 `excalidraw_architecture.md`
| Section | Reference says | Correct |
|---|---|---|
| §5 | `strokeSharpness` | `roundness` |
| §9 | Types from `@excalidraw/excalidraw/types/...`, no CSS import | 0.18 exports `.`, `./index.css`, `./*`; import `@excalidraw/excalidraw/index.css` |
| §9 example | `onChange` fed back into state used as `initialData` | `initialData` is read once; persist from `onChange` with debounce |
| §3.3, §7 | Collaboration part of the package | Lives in the excalidraw.com app, not the npm package |
| Missing | — | Fonts load from CDN unless `window.EXCALIDRAW_ASSET_PATH` + self-hosted fonts; 4 MB image limit |

### A.3 `stirling_pdf_architecture.md`
| Section | Reference says | Correct |
|---|---|---|
| §4 | `stirling/mail/` | `stirling/software/SPDF/` and `stirling/software/common/` |
| §5 | `/api/v1/general/ocr-pdf` | `/api/v1/misc/ocr-pdf` |
| §3.3 | PDF.js + pdf-lib, React 18 | EmbedPDF + `pdfjs-dist` + `@cantoo/pdf-lib`; React 19, Mantine 8, Tailwind 4, Vite 7; `package.json` at `frontend/`, app in `frontend/editor/` |
| §1, §4 | Non-MIT: `proprietary`, `saas` | Also `engine/` and `frontend/editor/src/{proprietary,desktop,saas,cloud,prototypes,portal,portal-saas}/` |
| §6 | `ultra-lite` ≈ 200 MB RAM | Official compose sets 1 GB; no OCR, no LibreOffice |
| §6 | `stirling-pdf:latest` | `docker.stirlingpdf.com/stirlingtools/stirling-pdf:{latest,ultra-lite,fat}` |
| Missing | — | `corsAllowedOrigins: []` allows all origins with credentials |
