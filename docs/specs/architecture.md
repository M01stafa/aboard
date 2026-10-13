# Aboard spec — Architecture, decisions, workspace, flows, repo layout, risks

> Part of the Aboard technical specification v3.2 (Next.js 16.4 + React 19.3 + Supabase).
> Section numbers (§N) are shared across all files in `docs/specs/`; the map is in `AGENTS.md` → "Spec map".
> Requirement IDs such as `SEC-1` or `PDF-3` are defined in `docs/PRD.md`.
> Facts were checked against upstream sources, npm and official docs on 2026-10-07. Items marked **VERIFY** must be confirmed in source or docs before coding against them; record the result in `docs/PROGRESS.md` (VERIFY log), then update this file.
> If the implementation must differ from this spec, change the spec in the same commit and log the decision in `docs/PROGRESS.md`.

## 1. Sources of truth

| Tool / service | Use | Reference |
|---|---|---|
| Excalidraw | npm `@excalidraw/excalidraw@0.18.1` (MIT) | `excalidraw_architecture.md` + Appendix A.2 |
| CircuitJS1 | **Your fork of `github.com/pfalstad/circuitjs1`** (GPL-2.0-or-later) | `circuitjs1_architecture.md` + Appendix A.1 |
| Stirling-PDF | Docker image `docker.stirlingpdf.com/stirlingtools/stirling-pdf:latest` | `stirling_pdf_architecture.md` + Appendix A.3 |
| Google Drive API v3 | User file storage | developers.google.com/workspace/drive/api |
| Google Picker API | Let users pick existing Drive files (PDFs, `.alpha`) | developers.google.com/workspace/drive/picker |
| Supabase | Auth, Postgres (index only), Edge Functions | supabase.com/docs |

Rule: when a reference file and the upstream source disagree, the source wins.

---

## 2. Goals, storage model and scope

### 2.1 Goals
1. Web app for engineering and medical students, Arabic (RTL) and English.
2. Launcher: New Whiteboard, PDF, Circuit Simulation, Recent projects, **Open `.alpha` file**.
3. Workspace with tabs and a two-pane split view; several documents open at once with no state loss.
4. Cross-tool actions (PDF page → board, circuit → board, board → PDF, PDF selection → board note).
5. **Server-side storage cost close to zero**: user content never lives in your database.
6. **Projects portable between devices** via Google Drive or a `.alpha` file.

### 2.2 Storage model

| Data | Drive mode | Local mode | Supabase |
|---|---|---|---|
| Project index (id, title, subject, mode, Drive folder id, dates) | — | — | ✅ (≈ 300 bytes per project) |
| Boards (Excalidraw elements JSON) | ✅ Drive | ✅ IndexedDB | ❌ |
| Circuits (CircuitJS text) | ✅ Drive | ✅ IndexedDB | ❌ |
| PDF files | ✅ Drive | ✅ IndexedDB | ❌ |
| Board images | ✅ Drive | ✅ IndexedDB | ❌ |
| PDF annotations (JSON) | ✅ Drive | ✅ IndexedDB | ❌ |
| Google refresh token | — | — | ✅ encrypted, server-only |
| IndexedDB cache of Drive files | ✅ (cache, evictable) | — | — |

Users choose nothing up front: Google sign-in with Drive consent → **Drive mode**; email sign-in or declined Drive consent → **Local mode**. A project can move between modes later.

### 2.3 Feature-parity policy
| Tool | Policy |
|---|---|
| Excalidraw | Full package feature set. Live collaboration is out of scope (it lives in the excalidraw.com app, not the npm package). |
| CircuitJS1 | Custom toolbar for common actions + an "Advanced menu" toggle that re-shows the native menu (`hideMenu=false`), so every engine feature stays reachable. Dropbox, Google Drive loaders and short URLs inside CircuitJS are disabled (the app handles storage). |
| Stirling-PDF | Curated tools first (OCR, Office→PDF, PDF→Office, compress, merge, split, PDF/A); later, forms generated from Stirling's OpenAPI spec. |

### 2.4 Non-goals (this version)
Offline use, real-time multi-user editing, embedding Stirling's own UI, sharing projects with other users inside the app (users share `.alpha` files instead).

---

## 3. Architectural decisions

| ID | Decision | Rationale |
|---|---|---|
| ADR-1 | **Next.js 16.4 (App Router) + React 19.3 + TypeScript**, used as a client-side app, deployed on Vercel | Owner's chosen stack; routing, headers, preview deploys. Tool modules are client-only (`ssr:false`); user content never passes through the Next.js server (rules in §3.1) |
| ADR-2 | Each tool is a module behind a typed adapter; no code merging | Three toolchains (TS/React, Java/GWT, Java/Spring) |
| ADR-3 | Excalidraw as a React component | Same stack, imperative API |
| ADR-4 | CircuitJS1 as a same-origin iframe (`/circuit/`) built from your fork | GWT owns its DOM; clean isolation and GPL boundary |
| ADR-5 | PDF engine: EmbedPDF (PDFium WASM, MIT) + `@cantoo/pdf-lib` | Same stack as Stirling's current frontend; portable annotation import/export API |
| ADR-6 | Stirling on a private network behind an auth gateway | Needs LibreOffice/OCRmyPDF/Tesseract; must not be publicly callable |
| ADR-7 | **Storage behind a `StorageProvider` interface** with `DriveProvider` and `LocalProvider` | Modules never know where data lives; a future provider (e.g. Supabase for small items) plugs in without touching modules |
| ADR-8 | **Google OAuth scope `drive.file` only** | Non-sensitive scope with streamlined verification; the app sees only files it created or the user picked |
| ADR-9 | **Refresh tokens stored server-side, encrypted (AES-256-GCM), in a table with no client access**; exchanged by Supabase Edge Functions | The client secret and long-lived tokens never reach the browser |
| ADR-10 | **Every save goes to IndexedDB first, then to Drive** through an outbox | A dropped connection or closed tab does not lose work |
| ADR-11 | Large files are **content-addressed** (SHA-256) | Deduplication, integrity check on import, re-linking a PDF on another device |
| ADR-12 | `.alpha` = ZIP container (written/read with zip.js) with a fixed layout and a versioned manifest | Universal, streamable, inspectable; same idea as `.docx`/`.epub`; ZIP64 removes the 4 GB limit |
| ADR-13 | Tabs are document instances (`{id, kind, itemId}`) | Two boards or two PDFs open at once |
| ADR-14 | **Security by default:** RLS on every table, least-privilege grants, no client access to token tables, automated RLS tests in CI | A user must never reach another user's data (§14) |
| ADR-15 | **Per-user local databases** (`aboard:<userId>`) | IndexedDB is per browser profile, not per account; shared computers must not leak projects |

### 3.1 Next.js usage rules (mandatory)
0. **Versions:** pin `next@16.4.0` and `react`/`react-dom@19.3.0` (latest on npm on 2026-10-07; 16.4.0 was published 2026-10-06). 16.4 release notes verified: no breaking changes vs these rules (V01 confirmed in Task 2).
1. **Client Components for everything interactive.** Pages that touch tool modules, Dexie, Drive or `window` start with `"use client"`. Server Components only for static pages (privacy, terms, licenses).
2. **Tool modules load with `next/dynamic(..., { ssr: false })`** from a Client Component (Excalidraw, EmbedPDF, the circuit iframe wrapper).
3. **User content never passes through the Next.js server:** no Server Actions or Route Handlers for boards, circuits, PDFs or Drive files.
4. **Supabase: browser client only** (`@supabase/supabase-js`, session in the browser, authorization by RLS). Do not add `@supabase/ssr` unless server-rendered private pages are introduced later. `/auth/callback` is a Client Component page.
5. **Workspace route uses a query parameter** (`/workspace?p=<projectId>`), read with `useSearchParams` inside a `<Suspense>` boundary. Keeps the app compatible with static export if ever needed.
6. **`/circuit/**` is plain static files in `public/`** produced by `scripts/build-circuit.sh`; never import them as modules.
7. **React Strict Mode double-mounts components in development.** Adapters (`CircuitAdapter`, board adapter, PDF engine) must be idempotent: attach/detach cleanly, never register callbacks twice, and treat the first iframe load as disposable.
8. **Turbopack/webpack:** self-hosted PDFium `.wasm` (`/wasm/pdfium.wasm`) and EmbedPDF workers load cleanly in both `next dev` and `next build` (V02 confirmed in Spike S3).
9. **Drive functions stay Supabase Edge Functions** (host-independent, already specified in §10). Alternative for a single codebase: the same five functions as Next.js Route Handlers in `app/api/drive/*` (Node runtime); then the Google redirect URI becomes `https://aboard.example/api/drive/callback` and the secrets move to Vercel environment variables.
10. **Keep the engine layers framework-free** (rule in §21): moving off Next.js later must not touch modules or core.

---

## 4. Overall architecture

```
┌────────────────────────────── Web app (Next.js 16.4 + React 19.3)    ─────────────────────────────┐
│ Launcher │ Workspace host (tabs, CSS-grid split, keep-alive) │ Theme / RTL / i18n │ Save status UI │
├──────────────────┬──────────────────────────┬──────────────────────────────────────────────────────┤
│ Board module     │ PDF module               │ Circuit module                                       │
│ Excalidraw 0.18  │ EmbedPDF + cantoo/pdf-lib│ iframe /circuit/ (fork) + CircuitAdapter              │
├──────────────────┴──────────────────────────┴──────────────────────────────────────────────────────┤
│ Project service ── StorageProvider ──┬── DriveProvider ── DriveApi ── DriveTokenManager            │
│                                      └── LocalProvider                                             │
│ SaveQueue (outbox) │ Dexie (IndexedDB: buffer + cache + local mode) │ .alpha exporter/importer     │
│ App bus (mitt) │ Zustand stores │ Stirling client                                                  │
└─────────┬───────────────────────────────┬──────────────────────────────┬───────────────────────────┘
          │ supabase-js                   │ Bearer access token          │ Bearer Supabase JWT
          ▼                               ▼                              ▼
  Supabase                         Google Drive API v3             VPS: Caddy → pdf-gateway
  ├ Auth (email, Google)           (user's own Drive:              → Stirling-PDF (private network)
  ├ Postgres: profiles, projects    My Drive/Aboard/...)
  │   index, google_drive_links
  └ Edge Functions: drive-connect, drive-callback, drive-link-token,
                    drive-token, drive-disconnect
                          │
                          ▼
                 Google OAuth 2.0 (token, revoke)
```

---

## 6. Workspace host (tabs, split view, keep-alive)

### 6.1 Data model
```ts
type ModuleKind = "board" | "pdf" | "circuit";
interface Tab { id: string; kind: ModuleKind; itemId: string; title: string }
type Slot = "primary" | "secondary" | "hidden";
interface LayoutState {
  tabs: Tab[];                    // stable order = DOM order, never re-sorted
  tabBarOrder: string[];          // what the user sees in the tab bar (separate from DOM order)
  primary: string | null;
  secondary: string | null;
  split: "none" | "vertical" | "horizontal";
  ratio: number;                  // 0.2 … 0.8
}
```

### 6.2 Mandatory rules
1. **Render every open tab once, in stable order, and never move its DOM node.** Moving an `<iframe>` to another parent reloads it; re-keying a React subtree remounts it.
2. **Layout is pure CSS:** a CSS grid; each pane gets `data-slot="primary|secondary|hidden"`.
3. **Hidden panes:** `visibility:hidden; pointer-events:none; position:absolute; inset:0; z-index:-1;` — never `display:none` (canvases would get zero size).
4. **After a pane becomes visible or resizes:** call `excalidrawAPI.refresh()` for boards (ResizeObserver on the pane).
5. **Hidden circuits** keep running by default; per-tab "Pause when hidden" (default on for mobile) via `setSimRunning`.
6. **Split divider drag:** show a transparent full-screen overlay above all panes during the drag (iframes otherwise swallow pointer events).
7. **Limits:** 2 visible panes; split disabled below 768 px width; soft cap of 3 circuit tabs.
8. **Before closing a tab:** flush its pending save (§11.4).

### 6.3 Sketch
```tsx
<div className="ws-grid" data-split={layout.split} style={{ "--ratio": layout.ratio } as React.CSSProperties}>
  {layout.tabs.map((t) => (
    <section key={t.id} className="pane" data-slot={slotOf(layout, t.id)}>
      <ModuleHost tab={t} visible={slotOf(layout, t.id) !== "hidden"} />
    </section>
  ))}
  {dragging && <div className="drag-shield" />}
</div>
```
CI test: a mount counter per module must stay at 1 while switching tabs, splitting and swapping panes.

---

## 15. Theme, RTL, i18n
- `theme/tokens.css` with CSS variables and `[data-theme="dark"]` overrides for shell and PDF UI.
- Excalidraw: `theme` prop; `langCode="ar-SA"` (RTL); brand accents via its CSS variables scoped to the board container (`--color-primary`, `--color-primary-hover`, `--color-brand-hover`, `--color-selection`, `--focus-highlight-color`, confirmed in `index.css` via Spike S1 / V03).
- CircuitJS1: canvas colors through URL params; chrome via the fork's CSS; theme change = `exportCircuit()` → reload iframe → `importCircuit()`. Arabic needs `locale_ar.txt` (fork patch 4); canvas labels stay left-to-right.
- Shell: `<html dir>` follows language; logical CSS properties; Picker `setLocale`.

---

## 16. Licenses (not legal advice)

| Component | License | Obligation |
|---|---|---|
| Excalidraw | MIT | Notice |
| CircuitJS1 fork | GPL-2.0-or-later | Publish complete source of the fork (link in About), keep notices. Whether the shell + iframe form a combined work is a gray area; simplest safe path is open-sourcing the whole app under a GPL-compatible license |
| Stirling-PDF (unmodified image as a service) | MIT except `app/proprietary/`, `app/saas/`, `engine/`, `frontend/editor/src/{proprietary,desktop,saas,cloud,prototypes,portal,portal-saas}/` | Do not copy code from excluded directories; do not use Stirling branding |
| EmbedPDF, `@cantoo/pdf-lib`, `hash-wasm`, supabase-js, zustand, mitt | MIT | Notices |
| `@zip.js/zip.js` | BSD-3-Clause | Notice |
| `dexie` | Apache-2.0 | Notice |
| Google APIs | Google APIs Terms of Service + User Data Policy | Privacy policy, Limited Use |

Generate the third-party notices file at build time (e.g. `rollup-plugin-license`).

---

## 17. User flows

| Flow | Steps |
|---|---|
| **Sign up with Google** | "Continue with Google" → one Google consent (login + Drive) → `drive-link-token` stores token → default storage = Drive → launcher. If Drive was unticked: default = local, a dismissible "Connect Google Drive" card appears. |
| **Sign up with email** | Default storage = local (silent). Launcher shows a dismissible "Connect Google Drive to use your projects on any device" card. |
| **Create project** | Uses default storage; Drive mode creates `Aboard/<title> (<id>)/`. |
| **Open on another device** | Drive projects open normally (files download into cache on demand). Local projects from another device show "On another device" + "Open .alpha". |
| **Export** | Project menu → "Export .alpha" (options: include PDFs, annotated copies) → disk (or "Export to Google Drive"). |
| **Import** | Launcher → "Open .alpha" / drag-and-drop / "Open from Google Drive" → progress → project opens. |
| **Move project** | Project menu → "Save to Google Drive" or "Keep only on this device" (§11.6). |
| **Token expired / revoked** | Banner "Reconnect Google Drive" → Path B; saving continues locally meanwhile. |
| **Drive full** | Banner "Your Google Drive is full"; saving continues locally; suggest export. |
| **Disconnect Drive** | Settings → "Disconnect" → offer "Export all projects as .alpha first" → `drive-disconnect`. Projects remain in the user's Drive and reappear after reconnecting. |

---

## 18. Repository layout
```
aboard/
├── AGENTS.md                          # agent entry point (always loaded)
├── DESIGN.md                          # design system (owner-provided; loaded by .agents/rules/design.md)
├── .agents/
│   ├── rules/                         # security.md (always on), frontend.md, backend.md, design.md (glob)
│   └── skills/                        # db-migration, phase-workflow, security-review
├── apps/web/                          # Next.js 16.4 app (App Router)
│   ├── next.config.ts                 # headers() with CSP; no server handling of user content
│   ├── public/{fonts/, circuit/, icons/}
│   ├── app/                           # layout.tsx (dir/lang, EXCALIDRAW_ASSET_PATH), page.tsx (launcher),
│   │                                  # auth/callback/, workspace/ (?p=<projectId>), settings/, privacy/, terms/, licenses/
│   └── src/                           # framework-free code (modules, core, workspace) imported by app/
│       ├── workspace/                 # TabHost, layout store, SplitDivider
│       ├── modules/{board,pdf,circuit}/
│       ├── integration/               # cross-tool actions
│       ├── core/
│       │   ├── bus.ts
│       │   ├── supabase.ts
│       │   ├── storage/               # types, ProjectService, LocalProvider, DriveProvider, SaveQueue, db.ts (Dexie)
│       │   ├── drive/                 # tokens.ts, api.ts, layout.ts (folders/appProperties), picker.ts, conflicts.ts
│       │   ├── alpha/                 # manifest.ts (zod), export.ts, import.ts, limits.ts
│       │   └── stirling.ts
│       ├── theme/  └── i18n/
├── supabase/
│   ├── config.toml
│   ├── migrations/0001_init.sql
│   ├── tests/rls.test.sql             # pgTAP suite (§14.3), runs in CI
│   └── functions/
│       ├── _shared/{env,http,supabase,crypto,google,ratelimit}.ts
│       ├── drive-connect/index.ts
│       ├── drive-callback/index.ts
│       ├── drive-link-token/index.ts
│       ├── drive-token/index.ts
│       └── drive-disconnect/index.ts
├── vendor/circuitjs1/                 # git submodule → your fork of pfalstad/circuitjs1 (+ PATCHES.md)
├── services/{gateway/, deploy/, stirling/}
├── scripts/{build-circuit.sh, copy-excalidraw-fonts.mjs}
└── docs/
    ├── PRD.md                         # product requirements (what/why)
    ├── PROGRESS.md                    # phase status, VERIFY log, decisions (project memory)
    ├── specs/                         # technical specification split by topic
    └── reference/                     # the three upstream architecture files (read with specs/reference-errata.md)
```

---

## 20. Risks

| Risk | Mitigation |
|---|---|
| Testing-mode refresh tokens expire after 7 days | Publish the OAuth app before real users; reconnect flow handles expiry |
| User revokes access or deletes files in Drive | `reconnect_required` handling; recreate files from cache; appProperties-based lookup |
| Drive API rate limits | 3 s / 30 s save cadence, coalesced outbox, backoff with jitter |
| Large PDFs on mobile | Download on open with progress; cache eviction policy; in-memory export caps |
| Browser storage cleared in local mode | Persistence request; "Save to Google Drive" offer; `.alpha` export |
| Resumable upload headers not readable from the browser | Verified in Spike S4; fallback: proxy only the session start through an Edge Function |
| Excalidraw 4 MB image limit | Compress/cap before `addFiles` |
| State loss on tab switch/split | §6 rules + mount-counter CI test |
| CircuitJS fork drift | Small isolated patches, monthly upstream merge |
| GPL obligations | Public fork source; consider open-sourcing the whole app |
| Library API drift | Exact version pins, adapters, re-run spikes on upgrade |
| XSS leading to session or token theft | CSP, no unsanitized HTML, import validation, `eval` check on the circuit fork, short-lived tokens (§14.5–14.6) |
| Another person on the same computer sees local projects | Per-user local databases + "shared computer" option (§14.6) |
| Secret key leaked | Secret scanning, key table, rotation runbook (§14.4, §14.10) |
| Missing RLS on a new table | CI guard + pgTAP suite on every migration (§14.3) |
