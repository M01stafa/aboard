# Aboard — Progress, decisions and VERIFY log

This file is the project's memory between agent sessions.
- **Read it at the start of every task.** It says which phase is active and what is already decided or verified.
- **Update it before you finish any task** (skill `phase-workflow`): current task, phase status, VERIFY results, decisions, lessons.
- The **history of changes** lives in `UPDATE.md` (project root, created by Task 1), not here.
- Keep entries short: one line each, newest at the bottom of each table, dates as `YYYY-MM-DD`.

## Current state

| Field | Value |
|---|---|
| Active phase | 5 — PDF Module (In progress) |
| Current task | Task 29 — Store Annotations Separately From the PDF (completed) |
| Last updated | 2026-10-18 |
| Next step | Task 30 — Implement PDF Page Operations and Annotated Download |
| Blockers | None (carried open items tracked below) |

## Phases

One phase at a time. A phase is `Done` only when every acceptance criterion passes on Chrome, Firefox, Safari (desktop), an Android phone and an iPhone, and the CI security suite is green (`.agents/rules/security.md`).

Status values: `Not started` · `In progress` · `Blocked (<reason>)` · `Done (YYYY-MM-DD)` · `awaiting owner approval`

| Phase | Status | Tasks | Acceptance criterion |
|---|---|---|---|
| **0. Spikes** | Done (2026-10-13) | **S1** Excalidraw in Next.js (`dynamic` + `ssr:false`, CSS import, React Strict Mode double mount, self-hosted fonts, `refresh()`). **S2** Build the CircuitJS fork with Gradle 8.7, `/circuit/`, API attach, export/import, SVG, served from `public/circuit/` inside the Next.js app and attached correctly after a Strict Mode double mount. **S3** EmbedPDF: 50 MB PDF, highlights, `exportAnnotations`/`importAnnotations` round-trip including a stamp. **S4** Google: test-mode OAuth client, `drive-connect`/`callback`/`token` deployed, create folder + multipart + **resumable 100 MB upload from the browser** (Location/Range headers readable), Picker opens; no Google token left in browser storage after sign-in (§10.1). **S5** `.alpha`: export/import 500 MB on Chrome (stream) and 200 MB on iPhone; check file name keeps `.alpha`. | Written spike report (`docs/spikes/S<n>.md`) with versions and open issues |
| **1. Foundation** | Done (2026-10-14) | Next.js app, routes, theme, RTL/i18n, Supabase Auth (email + Google), migration 0001, workspace host with placeholder panes, **hardened migration + pgTAP RLS suite + CI guards (gitleaks, bundle grep) (§9, §14.3, §14.9)** | Mount counter stays 1 during tab/split changes; RLS test: user A cannot read B's `projects`; client cannot read `google_drive_links` |
| **2. Storage core + local mode** | In progress | Dexie schema, `LocalProvider`, `ProjectService`, SaveQueue, save status, silent persistence, project index sync | Create project → reload → data intact; no prompt appears in Chrome/Safari/Firefox |
| **3. Circuit module** | In progress | Fork patches a–e, build script, adapter, saving via ProjectService | Circuit survives reload; no extra service worker registered |
| **4. Board module** | Done (2026-10-17) | Excalidraw pane, files via `putFile`, templates panel | Board with images survives reload |
| **5. PDF module** | In progress | Viewer, annotations JSON, page operations, annotated download | Annotations survive reload; annotated download opens with highlights in another viewer |
| **6. `.alpha` export/import** | Not started | §12 complete, limits, iOS handling | Export on device A, import on device B (different browser): identical project; tampered file rejected |
| **7. Google Drive** | Not started | Edge Functions (§10), Path A + B, `DriveProvider`, cache + eviction, conflicts, error handling, mode moves, Picker, rate limits (§10.4), provider-token handling (§10.1) | Same project edited on two devices stays consistent; revoking access in Google account → reconnect banner, no data loss; Drive full simulated → local saving continues; automated check: no Google token in `localStorage`/IndexedDB; exceeding a rate limit returns 429 |
| **8. Integration** | Not started | §8 actions | All four actions work across modes |
| **9. Stirling** | Not started | Compose stack, gateway, UI with progress/cancel, results saved into project | OCR and Office→PDF work; Stirling unreachable from the internet |
| **10. UI redesign** | Not started | Circuit toolbar via `runCommand`, advanced menu toggle, PDF toolbars, unified styling | Every circuit action reachable |
| **11. Launch prep** | Not started | **§14.12 security checklist signed off**, security headers/CSP, privacy policy, terms, third-party notices, fork source published, Google app published + brand verification, monitoring | Google verification approved; refresh tokens no longer expire after 7 days |

Release mapping (`docs/PRD.md` A5): R1 = phases 0–8 and 11 · R2 = phase 9 · R3 = phase 10.

## VERIFY log

Every **VERIFY** in `docs/specs/` must be confirmed against the installed package types, the fork's source, or the official docs before code depends on it. Record the result here, then update the spec text.

Status values: `Open` · `Confirmed` · `Changed (spec updated)`

| ID | Item | Where | Phase | Status | Result / date |
|---|---|---|---|---|---|
| V00 | Antigravity loads all five `.agents/rules/*.md` (Customizations → Rules), glob rules activate on matching files, and the `DESIGN.md` include in `design.md` resolves | `.agents/rules/` | 0 | Confirmed | Verified all 5 rules and updated include to `docs/DESIGN.md` / 2026-10-13 |
| V01 | Next.js 16.4 release notes: breaking changes vs the rules in §3.1 | architecture.md §3.1 | 0 | Changed (spec updated) | Verified official 16.4 notes: no breaking changes vs §3.1; spec updated / 2026-10-13 |
| V02 | PDFium `.wasm` and EmbedPDF workers load in `next dev` and `next build` | architecture.md §3.1 | 0 (S3) | Changed (spec updated) | Confirmed in Spike S3: `/wasm/pdfium.wasm` in `public/` loads cleanly in dev & build; spec updated / 2026-10-13 |
| V03 | Excalidraw CSS variable names for brand accents | architecture.md §15 | 4 | Changed (spec updated) | Confirmed in Spike S1: `--color-primary`, `--color-brand-hover`, `--color-selection`, `--focus-highlight-color` in `index.css`; spec updated / 2026-10-13 |
| V04 | Excalidraw persisted `appState` key names | modules.md §7.1 | 4 | Changed (spec updated) | Confirmed in Spike S1: `viewBackgroundColor`, `scrollX`, `scrollY`, `zoom`, `gridSize`, `gridModeEnabled` in `types.d.ts`; spec updated / 2026-10-13 |
| V05 | EmbedPDF annotation change event name | modules.md §7.3 | 5 | Changed (spec updated) | Confirmed in Spike S3: `onAnnotationEvent` hook on `AnnotationScope`; stamp binary `ctx.data` preserved; spec updated / 2026-10-13 |
| V06 | No `provider_token`/`provider_refresh_token` in browser storage after Google sign-in + `refreshSession()`; else switch to Path B only | google-drive.md §10.1 | 0 (S4) | Changed (spec updated) | Confirmed in Spike S4: `drive-link-token` + `refreshSession()` purges tokens; 0 tokens in storage; Path A confirmed; spec updated / 2026-10-13 |
| V07 | Supabase `verify_jwt` guidance with asymmetric JWT keys | google-drive.md §10.2 | 7 | Open | |
| V08 | Resumable upload `Location`/`Range` headers readable from the browser (CORS) | google-drive.md §10.8 | 0 (S4) | Changed (spec updated) | Confirmed in Spike S4: `Location` and `Range` headers exposed via CORS; 100 MB resumable upload works; spec updated / 2026-10-13 |
| V09 | Google Picker loader and class names | google-drive.md §10.11 | 0 (S4) | Changed (spec updated) | Confirmed in Spike S4: `gapi.load("picker")`, `.picker-dialog`, `.picker-dialog-bg`, `.picker-modal-dialog`; spec updated / 2026-10-13 |
| V10 | Drive "Open with" integration requirements | google-drive.md §10.11 | Later | Open | |
| V11 | `.alpha` download keeps its extension on iOS Safari | alpha-format.md §12.1 | 0 (S5) | Changed (spec updated) | In-memory path built; physical iPhone Safari checks deferred by owner to Task 31/32; spec updated / 2026-10-13 |
| V12 | pgTAP: inserting minimal rows into `auth.users` works in the local stack | security.md §14.3 | 1 | Confirmed | Confirmed in Task 13: minimal rows into auth.users (id, email) trigger profile creation; all 17 pgTAP assertions pass / 2026-10-14 |
| V13 | Gateway JWT verification: JWKS vs legacy JWT secret | security.md §14.4, setup-and-deploy.md §13 | 9 | Open | |
| V14 | CSP needs of Picker, Supabase and GWT; `headers()` precedence; COOP with Google popups | security.md §14.5 | 0 (S1/S4) | Changed (spec updated) | Confirmed in Spikes S1, S2, S4: CSP directives for Excalidraw, GWT `/circuit/`, EmbedPDF, Google; COOP verified; spec updated / 2026-10-13 |
| V15 | Supabase Auth: refresh-token rotation/reuse detection default; leaked-password protection availability | security.md §14.7 | 1 | Open | |
| V16 | Stirling setting name to disable unneeded endpoints | security.md §14.8 | 9 | Open | |
| V17 | Supabase API key rotation procedure | security.md §14.10 | 11 | Open | |
| V18 | JDK version for the CircuitJS fork build (GWT 2.8.2) | setup-and-deploy.md §5.2 | 0 (S2) | Changed (spec updated) | Confirmed in Spike S2: OpenJDK 11 builds GWT 2.8.2 cleanly with Gradle 8.7; JDK 17 not required; spec updated / 2026-10-13 |
| V19 | Current `zod` major version | setup-and-deploy.md §5.6 | 1 | Open | |
| V20 | Excalidraw user image auto-downscale behavior | modules.md §7.1 | 4 | Confirmed | Yes: downscales to 1440px via resizeImageFile (pica/image-blob-reduce), checks MAX_ALLOWED_FILE_BYTES (4MB) / 2026-10-17 |

## Decisions log

Owner decisions already made. Do not re-open them without the owner.

| Date | Decision |
|---|---|
| 2026-10-06 | Shell + independent tool modules; no code merging between Excalidraw, CircuitJS1 and Stirling-PDF |
| 2026-10-07 | Online-only for this version (no service worker / offline mode) |
| 2026-10-07 | User content lives in the user's Google Drive (scope `drive.file`) or only in the browser (IndexedDB); Supabase holds accounts, a small project index and encrypted Google tokens only |
| 2026-10-07 | Project export format is `.alpha` (ZIP container); it must work in both storage modes |
| 2026-10-07 | Stack: Next.js 16.4 (App Router) + React 19.3 + TypeScript + Supabase; app deployed on Vercel |
| 2026-10-07 | Product name: **Aboard** (short for “Alpha board”); the `.alpha` extension stays |
| 2026-10-07 | Security is a P0 requirement set (`SEC-1…12`); RLS on every table with automated tests |
| 2026-10-08 | Agent instructions: root `AGENTS.md` + `.agents/rules/` + `.agents/skills/`; design system in root `DESIGN.md` |
| 2026-10-09 | Interface spacing follows an 8-point grid (`.agents/rules/spacing.md`); every change is logged in root `UPDATE.md` |
| 2026-10-13 | Git deferral reversed; public GitHub repo created at `https://github.com/M01stafa/aboard` with CircuitJS fork submodule |
| 2026-10-13 | V01: Next.js 16.4 release notes confirmed; no breaking changes vs §3.1 rules |
| 2026-10-13 | V02: Self-host `@embedpdf/pdfium` WASM at `/wasm/pdfium.wasm` in public/ to satisfy strict CSP (Spike S3) |
| 2026-10-13 | V03 & V04: Excalidraw CSS variables and persisted `appState` keys confirmed in `@excalidraw/excalidraw` types (Spike S1) |
| 2026-10-13 | V05: EmbedPDF annotation save hook is `onAnnotationEvent` on `AnnotationScope`; stamp binary preserved in `ctx.data` (Spike S3) |
| 2026-10-13 | V06: Google token hygiene verified via `drive-link-token` + `refreshSession()`; zero tokens in browser storage; Path A confirmed safe without Path B fallback (Spike S4) |
| 2026-10-13 | V08: Google Drive resumable upload endpoint exposes `Location` and `Range` headers to browser; chunked uploads work up to 100 MB+ directly (Spike S4) |
| 2026-10-13 | V09: Google Picker API loaded via `gapi.load("picker")`; class names `.picker-dialog`, `.picker-dialog-bg`, `.picker-modal-dialog` confirmed (Spike S4) |
| 2026-10-13 | V14: CSP directives confirmed for Excalidraw, GWT `/circuit/` (`unsafe-eval`), EmbedPDF (`wasm-unsafe-eval`), and Google; COOP `same-origin-allow-popups` confirmed (Spikes S1/S2/S4) |
| 2026-10-13 | V18: CircuitJS fork toolchain validated with OpenJDK 11 and Gradle 8.7; JDK 17 not required (Spike S2) |
| 2026-10-13 | V11: `.alpha` format uses uncompressed `mimetype` first entry and level 0 PDFs; streaming export supports 500 MB+ with flat memory; in-memory export capped at 300 MB mobile / 1 GB desktop (Spike S5) |
| 2026-10-13 | Deferral: Task 7 physical iPhone Safari checks (.alpha extension on download & `<input>` without accept filter) deferred by owner until Task 31/32 |
| 2026-10-13 | Open item carried: Task 3 Playwright browser download issue (Azure CDN 404); interactive browser verification pending |
| 2026-10-13 | Open item carried: `supabase/migrations/0001_init.sql` is a throwaway Phase 0 migration to be replaced by the production schema in Task 13 |
| 2026-10-13 | Task 9 development tooling pinned: vitest@5.0.4, @playwright/test@1.64.0, eslint@9.39.5, eslint-config-next@16.4.0, eslint-plugin-react@7.37.5, eslint-plugin-no-unsanitized@4.1.5, typescript@5.9.3, @types/{react,react-dom}@19.3.0, @types/node@22.13.0, gitleaks@8.30.1 via winget |
| 2026-10-13 | Next.js 16 CLI deprecates `next lint` in favor of `eslint .`; ESLint 9 configured with react/no-danger and no-unsanitized/* for SEC-7 |
| 2026-10-14 | Environment separation plan (Task 10 / SEC-5): Dev uses testing Supabase project (fmlpkcbpoziwkjuxuyaf) and Google test OAuth client (localhost URIs) with dev Picker key; Preview uses staging Supabase project and preview Google OAuth client (*.vercel.app URIs); Prod uses dedicated production Supabase project and verified Google OAuth client (aboard.example) with domain-restricted Picker key |
| 2026-10-14 | Built custom zero-dependency typed i18n layer under apps/web/src/i18n/ with ar/en support, RTL mirroring, theme/language persistence in localStorage, and pre-hydration head script (Task 12) |
| 2026-10-14 | Replaced Phase 0 throwaway migration 0001_init.sql with authoritative production schema (§9.1) with full RLS, least-privilege column grants, and pgTAP isolation test suite (Task 13) |
| 2026-10-14 | Email sign-in method chosen as Email One-Time Code (OTP) per PRD Q2; CAPTCHA chosen as Cloudflare Turnstile; Google OAuth configured without Drive scopes; automated browser storage test verified 0 provider tokens (Task 14) |
| 2026-10-14 | Added Content-Security-Policy with isolated /circuit/:path* rule and complete security headers (Task 15 / SEC-6) |
| 2026-10-14 | CI pipeline (.github/workflows/ci.yml), pnpm ci:security, gitleaks pre-commit hook, and branch protection / security scanning enabled (Task 16 / SEC-5, SEC-10) |
| 2026-10-14 | Built launcher (3 cards, recent projects empty state, open alpha stub), Client Component AuthGuard wrapper, /workspace?p=... placeholder, and static Server Component legal pages (/privacy, /terms, /licenses) (Task 17 / LAUNCH-1) |
| 2026-10-14 | Built WorkspaceHost with stable DOM panes, CSS grid data-slot layout, draggable divider with transparent drag shield, RTL mirroring, below-768px auto-collapse, Vitest happy-dom mount-counter test (0 remounts across 5 tab switches, 3 split toggles, 2 pane swaps, 1 close), and Playwright keep-alive test with active iframe (Task 18 / WS-1, WS-2) |
| 2026-10-15 | Verified drag over iframe with Playwright; added .drag-shield CSS rule (position: fixed; inset: 0; z-index: 9999); enforced 320px floor in split clamp; updated DESIGN.md §4.2 and bumped version to 2.1.1 (Task 18 follow-up) |
| 2026-10-15 | Task 19: Built per-user IndexedDB schema (projects, items, files, outbox, meta) via Dexie@4.4.1 under aboard:<userId>; deviceId stored in meta; shared-computer flag stored in sessionStorage under aboard:shared_computer; extended signOut closes DB and wipes aboard:<userId> if flag set; extracted E2E helper mockSignIn/mockSignOut; verified SEC-4 via Playwright (Task 19 / SEC-4) |
| 2026-10-15 | Task 20: Built StorageProvider interface, LocalProvider (with pinned=true on every write), ProjectService (single gateway for tools), streaming SHA-256 via hash-wasm for content-addressed binary files, architectural boundary test, and 13 unit tests across ProjectService and LocalProvider (Task 20 / STORE-1, STORE-7) |
| 2026-10-15 | Task 21: Built framework-agnostic SaveQueue with 500 ms debounce, per-item coalescing, dirty→clean local transition, structured Drive cadence (3s/30s), flush hooks, beforeunload gating (never prompts in local mode), silent persistence via navigator.storage.persist() skipping Firefox per STORE-9, top bar SaveStatusIndicator with 5 states (WS-3) via theme tokens/i18n, and Playwright test proving STORE-1 |
| 2026-10-16 | Task 22: Connected launcher to Supabase project index with touch_updated_at trigger handling updatedAt; storage badges mapped to theme tokens (--badge-tech for Drive, --badge-primary for this device, --badge-bronze for another device); rename & delete implemented (local path deletes Dexie + Supabase row, Drive delete stubbed with notice); Playwright E2E test verified create/reload/rename/delete lifecycle |
| 2026-10-16 | Owner decision: keep the repository public and keep the same Google API key. The historical commit that contains the key is accepted; the key will be hidden from the current tree only. Rotation deferred. |
| 2026-10-17 | Task 23: Applied Aboard fork patches a–e in M01stafa/circuitjs1 (commit 53c63bf4) and documented in PATCHES.md; built cross-platform automation scripts/build-circuit.mjs; verified apps/web/public/circuit/ without WEB-INF or service worker; finalized /circuit/:path* CSP with worker-src 'none'. |
| 2026-10-17 | Task 24: Built framework-agnostic CircuitAdapter (dual attachment, callback fanning, Strict Mode detach) and CircuitPane embedding /circuit/circuitjs.html with theme tokens, state persistence via ProjectService on onanalyze, theme switching without loss via export -> iframe reload -> import, and CIRC-4 pause-when-hidden (default ON for mobile, OFF for desktop). Playwright verified persistence across tab switch, theme change, and page reload. |
| 2026-10-17 | Task 25: Built BoardPane with Excalidraw loaded via next/dynamic with ssr: false, silent persistence via useBoardPersistence and ProjectService.saveBoard debounced by SaveQueue with 6 confirmed AppState keys, ResizeObserver + visibility refresh(), brand accent styling per DESIGN.md R1, and zero React re-render loops on drawing. Playwright verified persistence across tab switch, split divider drag, and full page reload. |
| 2026-10-17 | Task 26: Excalidraw auto-downscale confirmed (V20); client-side Canvas compression implemented for programmatic & >4MB images; content-addressed image blobs stored via ProjectService.putFile; board JSON stores only fileId -> SHA-256 key mapping without raw base64. |
| 2026-10-17 | Task 27: Built Study Templates Panel (BOARD-5) with 8 static JSON templates in templates.ts (Diagnosis Tree, X-Y Axes, Graph Paper, Dotted Circuit Frame, Cornell Notes, Comparison Table, Mind Map, Flowchart); rendered unobtrusive toggleable drawer in BoardPane; inserted templates via convertToExcalidrawElements without overwriting existing canvas elements; RTL handled for Arabic |
| 2026-10-18 | Task 28: Built PdfPane with EmbedPDF (Render, Scroll, Viewport, Zoom, Thumbnail plugins), lazy-loading self-hosted PDFium WASM from /wasm/pdfium.wasm on first open, streaming SHA-256 computation via hash-wasm, immutable blob storage via ProjectService.putFile, page restoration via scrollScope layout listener, and mobile >100MB warning dialog (PDF-1, PDF-2, PDF-7) |
| 2026-10-18 | Task 29: PDF annotations (highlight, ink, free text, stamp) stored separately as lightweight JSON linked by PDF hash (PDF-3, PDF-4); stamp images extracted to SHA-256 binary blobs via ProjectService.putFile; zero base64 in annotation JSON; undo/redo capability integrated with SaveQueue debouncing. |

## Lessons and corrections

When the owner corrects the same thing twice, or a review finds something the agent should have known, add one line here **and** turn it into a rule in `AGENTS.md` or `.agents/rules/` (keep `AGENTS.md` under 200 lines).

| Date | Lesson | Promoted to |
|---|---|---|
| 2026-10-16 | Local checks passing is not the same as CI passing. Every task report must verify the GitHub Actions run for the pushed commit and report its conclusion, not just the local test result. | AGENTS.md |
| 2026-10-16 | Throwaway spike code is still tracked and scanned. Hard-coded secrets belong in environment variables even in spikes/. | .agents/rules/security.md |

