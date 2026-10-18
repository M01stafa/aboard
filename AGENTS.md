# AGENTS.md — Aboard

Aboard ("Alpha board") is a web app for engineering and medical students. It combines three tools in one workspace with tabs and split view: a whiteboard (Excalidraw), a PDF reader/annotator (EmbedPDF, plus online tools via Stirling-PDF) and a circuit simulator (CircuitJS1).
User content is stored in the user's own Google Drive or only in their browser. Our Supabase project stores accounts, a small project index and encrypted Google tokens, nothing else.
A project exports to a single `.alpha` file that opens on any device.

## Read first, every task
1. `docs/PROGRESS.md`: active phase and task, decisions already made, VERIFY results, lessons. Do not redo or re-open what it records.
2. Your current task in `docs/TASKS.md` (one task at a time, in order).
3. The `docs/specs/` file(s) for the area you will touch (see "Where to look").
4. The matching requirement IDs in `docs/PRD.md` (e.g. `BOARD-2`, `SEC-1`). Cite them in plans, commits and tests.
Design system: docs/DESIGN.md — read it before any UI work.

## Instruction files (how this project is set up for agents)
| Path | Loads | Purpose |
|---|---|---|
| `AGENTS.md` (this file) | Always | Project map and hard rules |
| `.agents/rules/security.md` | Always (`always_on`) | Security rules for every change |
| `.agents/rules/frontend.md` | When editing `apps/web/**`, `vendor/circuitjs1/**` (`glob`) | Next.js, workspace, tool modules, UI |
| `.agents/rules/backend.md` | When editing `supabase/**`, `services/**`, data-layer code (`glob`) | Database, Edge Functions, Drive, storage, `.alpha`, gateway |
| `.agents/rules/design.md` | When editing UI files (`glob`) | Inlines the design system from `docs/DESIGN.md` |
| `.agents/rules/spacing.md` | When editing UI files (`glob`) | 8-point grid: every interface space and size is a multiple of 8 |
| `.agents/skills/db-migration/` | On demand | Steps for any database table, column, policy or function change |
| `.agents/skills/phase-workflow/` | On demand | Steps to start, continue and finish a phase; updating `docs/PROGRESS.md` |
| `.agents/skills/security-review/` | On demand | Security checks before merging risky changes and before launch |
| `docs/DESIGN.md` | Via `.agents/rules/design.md` | Colors, type, spacing, components (owner-maintained) |
| `docs/PRD.md` | Read on demand | Requirements with IDs, priorities, acceptance criteria |
| `docs/TASKS.md` | Read every task | Ordered build tasks (46), each with spec refs, requirement IDs and done criteria |
| `UPDATE.md` | Append after every request | History of every change (created by Task 1; append-only) |
| `docs/PROGRESS.md` | Read every task | Project memory: current state, phases, VERIFY log, decisions, lessons |
| `docs/specs/*.md` | Read on demand | Technical specification split by topic |
| `docs/reference/*_architecture.md` | Read on demand | Upstream tool notes; contain errors, read with `docs/specs/reference-errata.md` |

If you are about to work in an area and its rule file did not load, open it yourself before planning.

## Where to look (task → files)
| Task | Read |
|---|---|
| Next.js setup, routing, layout, workspace tabs/split | `docs/specs/architecture.md` (§3.1, §6, §18) |
| Whiteboard, circuit, PDF modules, Stirling client | `docs/specs/modules.md` (§7) |
| Cross-tool actions (PDF → board, circuit → board…) | `docs/specs/modules.md` (§8) |
| Tables, RLS, grants, SQL functions | `docs/specs/database.md` (§9) + skill `db-migration` |
| Google sign-in, Drive connect, Edge Functions, Drive API, Picker | `docs/specs/google-drive.md` (§10) |
| ProjectService, providers, IndexedDB, SaveQueue, local mode | `docs/specs/storage-layer.md` (§11) |
| `.alpha` export/import | `docs/specs/alpha-format.md` (§12) |
| Security details, RLS tests, keys, headers, launch checklist | `docs/specs/security.md` (§14) |
| Accounts, env vars, library versions, Docker deploy | `docs/specs/setup-and-deploy.md` (§5, §13) |
| Theme, RTL/i18n, licenses, user flows, risks | `docs/specs/architecture.md` (§15–17, §20) |
| Upstream tool details | `docs/reference/*` + `docs/specs/reference-errata.md` |

## Spec map (§ numbers used across all docs)
§1–4, §6, §15–18, §20 → `architecture.md` · §5, §13 → `setup-and-deploy.md` · §7–8 → `modules.md` · §9 → `database.md` · §10 → `google-drive.md` · §11 → `storage-layer.md` · §12 → `alpha-format.md` · §14 → `security.md` · §19 phases → `docs/PROGRESS.md` · "Tech §N" in `docs/PRD.md` uses the same numbers.

## Stack (pin exact versions)
- Next.js `16.4.0` (App Router) + React `19.3.0` + TypeScript, deployed on Vercel. pnpm workspaces.
- Supabase: Auth, Postgres (RLS), Edge Functions (Deno). No Supabase Storage, no Realtime.
- `@excalidraw/excalidraw@0.18.1` · EmbedPDF `2.15.x` (PDFium WASM) · `@cantoo/pdf-lib@2.11.x` · `dexie@4.4.x` · `@zip.js/zip.js@2.23.x` · `hash-wasm` · `zod` · `zustand@5` · `mitt@3`.
- CircuitJS1: your fork of `pfalstad/circuitjs1` in `vendor/circuitjs1` (Gradle 8.7, GWT 2.8.2). Never `sharpie7/circuitjs1`, never Ant.
- Stirling-PDF: official Docker image `docker.stirlingpdf.com/stirlingtools/stirling-pdf` (full image) on a private network behind `services/gateway`.
- Full version table: `docs/specs/setup-and-deploy.md` §5.6. Do not upgrade a pinned engine without re-running its spike.

## Repository layout (short)
```
AGENTS.md  DESIGN.md  UPDATE.md  .agents/{rules,skills}/
apps/web/app/            Next.js routes only (thin)
apps/web/src/            framework-free: workspace/, modules/{board,pdf,circuit}/, integration/,
                         core/{storage,drive,alpha}/, core/{bus,supabase,stirling}.ts, theme/, i18n/
apps/web/public/         fonts/ (Excalidraw), circuit/ (built fork output), icons/
supabase/                migrations/, tests/rls.test.sql, functions/{_shared,drive-*}/
services/                gateway/, deploy/ (compose, Caddyfile), stirling/
vendor/circuitjs1/       fork (git submodule) + PATCHES.md
scripts/                 build-circuit.sh, copy-excalidraw-fonts.mjs
docs/                    PRD.md, TASKS.md, PROGRESS.md, specs/, reference/, spikes/
```

## Commands
Define these scripts in Phase 1 and keep the names stable (update this list if a command changes):
- `pnpm dev` · `pnpm build` · `pnpm lint` · `pnpm typecheck` · `pnpm test` (unit) · `pnpm test:e2e`
- `pnpm ci:security` → gitleaks + bundle secret grep + dependency audit (`.agents/rules/security.md`)
- `supabase start` · `supabase db reset` · `supabase test db` (pgTAP RLS suite) · `supabase functions serve`
- `scripts/build-circuit.sh` (builds the fork, copies output without `WEB-INF/` to `apps/web/public/circuit/`)
- Before saying a task is done: `pnpm lint && pnpm typecheck && pnpm test && supabase test db && pnpm ci:security`, push, and verify that the GitHub Actions CI run for the pushed commit hash passes.

## Hard rules
Architecture
1. Work one phase at a time (`docs/PROGRESS.md`). Do not start the next phase until every acceptance criterion of the current one passes.
2. Modules call `ProjectService` only. Only `src/core/drive/*` talks to Google; only `supabase/functions/*` sees the Google client secret and refresh tokens.
3. Never unmount or re-parent a module pane to change layout. Panes render once, hidden with `visibility:hidden` (never `display:none`); layout changes are CSS grid only (spec §6.2).
4. Tool modules load client-side only: `"use client"` + `next/dynamic(..., { ssr: false })`. No Server Actions or Route Handlers for boards, circuits, PDFs or Drive files.
5. Keep `src/modules`, `src/core`, `src/workspace` free of Next.js imports; Next.js code stays in `apps/web/app`.
6. Adapters (circuit, board, PDF) must be idempotent: React Strict Mode mounts twice in development.
7. Every save goes to IndexedDB first, then to Drive through the SaveQueue outbox. Never write to Drive directly from a module.

Data and security (details: `.agents/rules/security.md`)
8. Every new table ships with RLS, least-privilege grants and pgTAP tests in the same migration (skill `db-migration`). Never disable or bypass RLS.
9. Secrets never get a `NEXT_PUBLIC_` prefix and never appear in client code, logs or the repo. Google tokens never go to `localStorage`, `sessionStorage` or IndexedDB.
10. User content never goes to our database or servers (except transient Stirling processing).

Correctness
11. Never guess an API or enum values. Confirm signatures and enum numbers in `node_modules/<pkg>` type definitions, the fork's Java source, or official docs. Never substitute numeric literals for imported TypeScript enums. Items marked **VERIFY** in the specs must be confirmed and logged in `docs/PROGRESS.md` before code depends on them.
12. The upstream reference files contain errors: apply `docs/specs/reference-errata.md` first. When docs and source disagree, the source wins.
13. If the code must differ from a spec, update the spec in the same change and add a line to the decisions log in `docs/PROGRESS.md`.
14. Do not add or declare dependencies without asking the owner. Even if a peer dependency already exists in `pnpm-lock.yaml`, stop and ask before adding it to `package.json`.
15. Do not change product decisions in `docs/PROGRESS.md` → "Decisions log" without the owner.
16. After **every** owner request, even one that changes no files, append an entry to `UPDATE.md`. Append only; never edit past entries; never write secrets there.
17. Always reply in English in all conversations and reports, regardless of the language used by the user or the UI. The only exceptions are literal UI strings, translation files (i18n), or Arabic text explicitly requested as content.

## Conventions
- TypeScript strict; no `any` without a comment explaining why. Validate external input with `zod`.
- File names: kebab-case; React components PascalCase; one component per file.
- UI text through i18n keys only (Arabic and English); use logical CSS properties (`margin-inline-start`, not `margin-left`).
- Styling and visual decisions follow `DESIGN.md`; colors only through theme tokens in `src/theme/tokens.css`.
- Interface spacing and component sizes are 8 px or multiples of 8, only through `--space-*` tokens (`.agents/rules/spacing.md`).
- Code, comments, commit messages, docs and all conversations with the owner in English.
- Commits: small, one concern each, message starts with the area (e.g. `board: persist images via putFile`) and cites requirement IDs when relevant.
- Tests live next to the code (`*.test.ts`); e2e in `apps/web/e2e/`; RLS tests in `supabase/tests/`.

## Workflow for every task
1. Read `docs/PROGRESS.md`, the current task in `docs/TASKS.md`, the relevant spec files and requirement IDs.
2. Write a short plan (files to change, requirement IDs, tests, any VERIFY items) and wait for the owner's approval when the change touches the database, auth, Drive, security, or more than one module.
3. Implement in small steps; run the checks in "Commands".
4. Append an entry to `UPDATE.md` (format in Task 1 of `docs/TASKS.md`), then update `docs/PROGRESS.md` (current task, phase status, VERIFY results, decisions, lessons). Skill `phase-workflow` has the steps.
5. Report to the owner in English: what changed, what was tested, what is still open. Every future task's Return line must include the GitHub Actions CI run URL and its conclusion for the pushed commit hash.

## Ask the owner before
- Changing a decision in the decisions log, a requirement in `docs/PRD.md`, or a pinned version.
- Adding or modifying dependencies in `package.json`, even for workspace peer packages already in `pnpm-lock.yaml`.
- Anything that deletes user data, changes RLS/grants, changes OAuth scopes, or exposes a new endpoint.
- Adding a paid service, a new third-party script, or analytics.

## Keeping these instructions healthy
- `AGENTS.md` stays under 200 lines; detail goes to `.agents/rules/` (one topic per file) or `docs/specs/`.
- When the owner corrects the same thing twice, add a short, concrete rule here or in the matching rule file, and log it in `docs/PROGRESS.md` → "Lessons".
- Rule files in `.agents/rules/` must keep valid YAML frontmatter (`trigger: always_on | glob | model_decision | manual`) and stay under 24,000 bytes, or Antigravity drops or truncates them.
- Remove instructions that become outdated; contradictory instructions cause random behaviour.
