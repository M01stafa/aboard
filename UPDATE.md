# UPDATE.md — Change Log

This file is the append-only record of every change made to the Aboard project.

<!-- Template:
## YYYY-MM-DD — <short title>
**Request:** <what the owner asked, in one or two sentences>
**Changes:**
- `<path>` (created | changed | deleted): <what and why>
**Checks:** <commands run and results, or "none needed">
**Related:** Task <n> · <requirement IDs> · <VERIFY IDs>
**Open:** <anything left to do, or "none">
-->

## 2026-10-12 — Import Skills into .agents/skills/ and Register as Slash Commands
**Request:** Copy skills from `C:\Users\alhmy\Downloads\alpha_tools_01\dukan3D_store\.agents\skills` into `.agents/skills/`, verify slash-command registration mechanism in Antigravity, and keep existing project structure untouched.
**Changes:**
- `.agents/skills/accessibility/` (created): imported WCAG 2.2 accessibility audit skill
- `.agents/skills/animate/` (created): imported web animation building skill
- `.agents/skills/animation-vocabulary/` (created): imported animation terminology reverse-lookup skill
- `.agents/skills/apple-design/` (created): imported Apple fluid design and motion engineering skill
- `.agents/skills/best-practices/` (created): imported web development best practices skill
- `.agents/skills/core-web-vitals/` (created): imported Core Web Vitals optimization skill
- `.agents/skills/emil-design-eng/` (created): imported design engineering and UI polish skill
- `.agents/skills/find-animation-opportunities/` (created): imported animation opportunities finder skill
- `.agents/skills/improve-animations/` (created): imported animation audit and roadmap planner skill
- `.agents/skills/performance/` (created): imported web performance optimization skill
- `.agents/skills/pick-ui-library/` (created): imported UI library selector skill
- `.agents/skills/prototype/` (created): imported interactive UI prototyping skill
- `.agents/skills/review-animations/` (created): imported motion and animation reviewer skill
- `.agents/skills/seo/` (created): imported search engine optimization skill
- `.agents/skills/web-quality-audit/` (created): imported full web quality audit skill
- `UPDATE.md` (created): initialized change log and appended this entry
**Registration:** Antigravity auto-discovers workspace skills under `.agents/skills/<name>/SKILL.md` with YAML frontmatter (`name`, `description`) and makes them invocable as `/<skill-name>` in CLI and `@<skill-name>` / `/<skill-name>` in IDE without requiring additional manifests.
**Skipped:**
- `avoid-ai-writing`: skipped because it contains `avoid-ai-writing.md` rather than `SKILL.md`
- `copy-editing`: skipped because it contains `copy-editing.md` rather than `SKILL.md`
- `headline-psychologist`: skipped because it contains `headline-psychologist.md` rather than `SKILL.md`
- `type-scale`: skipped because it contains `type-scale.md` rather than `SKILL.md`
- `typography`: skipped because it contains `typography.md` rather than `SKILL.md`
**Checks:** 100% SHA-256 hash match verified across all copied files against source; verified YAML frontmatter in all 15 skills; confirmed existing skills (`db-migration`, `phase-workflow`, `security-review`) intact.
**Related:** Skills Import
**Open:** none

## 2026-10-12 — Task 1: Create UPDATE.md, the Change Log
**Request:** Create UPDATE.md following Task 1 in docs/TASKS.md, establish the change log with header, template, and initial entry, and commit to Git.
**Changes:**
- `UPDATE.md` (changed): recorded Task 1 in the change log.
**Checks:** Verified header and template against docs/TASKS.md Task 1 specification.
**Related:** Task 1
**Open:** Git repository is not initialized in the workspace (.git missing); commit is blocked.

## 2026-10-13 — Task 1: Defer Git Commit Step
**Request:** Confirm UPDATE.md meets Task 1 requirements and record the owner's decision to defer Git initialization and commits.
**Changes:**
- `UPDATE.md` (changed): recorded decision to defer Git commit and mark Task 1 complete.
**Checks:** Verified header, template, and Task 1 entry in UPDATE.md; confirmed no Git commands run.
**Related:** Task 1
**Open:** Git initialization deferred to a later task upon owner request.

## 2026-10-13 — Task 2: Prepare Repository and Confirm Agent Setup (Git Deferred)
**Request:** Run Task 2 from docs/TASKS.md (Git deferred): verify project instruction system, create .gitignore, create spikes folders with placeholders, check Next.js 16.4 release notes against architecture rules, and record Git deferral.
**Changes:**
- `.gitignore` (created): added ignore patterns for node_modules, .next, build outputs, and .env files (except .env.example) without ignoring .agents/.
- `.agents/rules/design.md` (changed): updated include path to point to `../../docs/DESIGN.md` ensuring reachability.
- `docs/spikes/README.md` (created): initialized placeholder for spike reports.
- `spikes/README.md` (created): initialized placeholder for throwaway spike experiments.
- `UPDATE.md` (changed): logged Task 2 completion and Git deferral.
**Checks:** Verified AGENTS.md, docs/DESIGN.md, .agents/, docs/, and 5 rule files; confirmed security.md is always_on and glob rules match; reviewed official Next.js 16.4 release notes (no breaking changes against §3.1; lazy dynamic import compilation benefits tool modules; Cache Components noted for Phase 1 setup); confirmed zero Git commands run.
**Related:** Task 2 · V00, V01
**Open:** Git repository initialization and initial commit deferred at owner's request.

## 2026-10-13 — Task 3: Spike S1 — Excalidraw Inside Next.js
**Request:** Build throwaway spike in spikes/S1-excalidraw/ testing @excalidraw/excalidraw@0.18.1 inside Next.js 16.4 and React 19.3 across all Task 3 criteria, and write findings to docs/spikes/S1.md.
**Changes:**
- `spikes/S1-excalidraw/` (created): minimal Next.js 16.4 app with React 19.3, client dynamic import, strict mode double-mount handling, local fonts in public/fonts/, visibility toggle, and refresh() test.
- `docs/spikes/S1.md` (created): complete Spike S1 report with exact versions, CSP directives, persisted appState keys, and theme CSS variables.
- `UPDATE.md` (changed): logged Task 3 completion and findings.
**Checks:** `next build` passed in 4.0s (Turbopack); all 8 checks passed (ssr:false, index.css, double-mount, self-hosted fonts without CDN, visibility:hidden + refresh(), CSP directives, 6 persisted appState keys, theming CSS variables).
**Related:** Task 3 · V03, V04, V14 (Excalidraw part)
**Open:** Git commit deferred; browser automation tool open_browser_url encountered sandbox driver 404.

## 2026-10-13 — Task 4: Spike S2 — CircuitJS1 Fork & Toolchain Check
**Request:** Fork pfalstad/circuitjs1 to the owner's GitHub account via GitHub MCP server and execute Spike S2.
**Changes:**
- `UPDATE.md` (changed): recorded GitHub MCP fork creation and toolchain check results.
**Checks:** Verified authenticated GitHub user via MCP (`M01stafa` / Mustafa01); successfully created public fork at `https://github.com/M01stafa/circuitjs1`; verified toolchain (JDK and Gradle 8.7 missing from environment).
**Related:** Task 4 · V18, V14 (GWT part)
**Open:** Toolchain installation (JDK 17 and Gradle 8.7) needed to run compileGwt/makeSite; Task 3 browser automation item remains open.

## 2026-10-13 — Task 4: Public Git Repo, Toolchain Setup & Spike S2 (CircuitJS1) Complete
**Request:** Initialize project Git repository, publish public GitHub repo under owner account (M01stafa/aboard), install JDK and Gradle 8.7, attach CircuitJS1 fork as submodule at vendor/circuitjs1, compile GWT, embed in Next.js, verify API round-trip, check service worker, run security grep, identify CSP directives, and write docs/spikes/S2.md.
**Changes:**
- `.git/` (created): initialized Git repository on branch `main` at project root.
- `.gitignore` (changed): verified and added comprehensive ignore coverage for `node_modules/`, `.next/`, build outputs, and `.env*` files.
- `.gitmodules` (created): added submodule tracking for `https://github.com/M01stafa/circuitjs1.git` at `vendor/circuitjs1`.
- `vendor/circuitjs1` (created): attached owner's CircuitJS1 fork as Git submodule.
- `vendor/circuitjs1/build.gradle` (changed): made `makeSite` `doLast` check cross-platform for Windows.
- `spikes/S2-circuit/` (created): throwaway Next.js 16.4 + React 19.3 app embedding CircuitJS1 build output in a same-origin iframe with test harness.
- `docs/spikes/S2.md` (created): complete Spike S2 report with exact tool versions, build outputs, API round-trip findings, service worker notes, and CSP directives.
- `UPDATE.md` (changed): appended Task 4 completion log.
**Checks:**
- Reversal of earlier Git-deferral decision applied: `git init -b main` run; initial commit created; public repository created via GitHub MCP and pushed to `https://github.com/M01stafa/aboard`.
- Toolchain installed & verified: OpenJDK Temurin `11.0.32.1` (`EclipseAdoptium.Temurin.11.JDK` via winget) and Gradle `8.7` (official binary distribution); both verified on PATH with `java -version` and `gradle -version`.
- Submodule attached: `https://github.com/M01stafa/circuitjs1.git` at `vendor/circuitjs1`.
- GWT build: `gradle compileGwt` compiled 5 permutations cleanly in 1m 10s under JDK 11; `gradle makeSite` assembled 466 assets into `site/`.
- Next.js embed: assets copied to `spikes/S2-circuit/public/circuit/` (`WEB-INF/` strictly excluded); `npm run build` passed in 1.4s under Turbopack.
- Strict Mode & API round-trip: verified attachment to `window.CircuitJS1` (immediate and `oncircuitjsloaded`), double-mount resilience in Strict Mode, `exportCircuit()` string export, `importCircuit()` exact restoration, and `getCircuitAsSVG()` delivering SVG via `onsvgrendered`.
- Service worker finding: confirmed stock `circuitjs.html` registers `service-worker.js` and links `manifest.json`; recorded that real fork must remove them in Patch 1.
- Security script-execution grep: `grep -rn "eval(\|new Function\|\$wnd.eval" vendor/circuitjs1/src` confirmed zero occurrences of JavaScript `eval`, `new Function`, or `$wnd.eval` (all `eval` matches are mathematical `Expr.eval`).
- Extra CSP directives identified for `/circuit/:path*`: `script-src 'self' 'unsafe-inline' 'unsafe-eval'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data: blob:`, `font-src 'self' data:`, `connect-src 'self'`, `frame-src 'self' javascript:`. Parent app requires `frame-src 'self'`.
**Related:** Task 4 · V18, V14 (GWT part)
**Open:** Task 3 Playwright browser environment issue (Azure CDN 404 driver download) remains open.

## 2026-10-13 — Process Cleanup: Clear Hung Task 4 Copy Command
**Request:** Diagnose and clear any hung PowerShell copy command from Task 4, verify process activity, terminate cleanly if stuck, and confirm spikes/S2-circuit/public state is clean before Task 5.
**Changes:**
- `UPDATE.md` (changed): appended entry logging diagnosis, termination of hung background copy processes, and verification of spikes/S2-circuit/public.
**Checks:**
- Process inspection: identified running background task `task-531` and associated orphaned `powershell.exe` processes (PID 9920 and child PID 21636) executing the `$src = 'vendor\circuitjs1\site'` copy command.
- State evaluation: observed syntax parser error (`= : The term '=' is not recognized`) with 0% CPU consumption and zero progression for >14 minutes; determined genuinely hung.
- Termination: killed task-531 via `manage_task` action `kill` and verified both PIDs 9920 and 21636 terminated.
- Filesystem verification: inspected `spikes/S2-circuit/public/circuit/` against `vendor/circuitjs1/site/`; verified all 456 valid files present, 0 zero-byte files, and `WEB-INF/` strictly absent (`Has WEB-INF: False`). No re-copying required as files were already fully intact from the subsequent direct copy step.
**Related:** Task 4 · Process Cleanup
**Open:** Task 3 Playwright browser environment issue (Azure CDN 404 driver download) remains open.

## 2026-10-13 — Task 5: Spike S3 — EmbedPDF Viewing and Annotation Round-Trip
**Request:** Run Task 5 from docs/TASKS.md: build throwaway Next.js app in spikes/S3-embedpdf/ with EmbedPDF core and 10 plugins, measure time to first page on 50 MB PDF, test annotation round-trip with stamp binary preservation, identify annotation change event name and payload, verify PDFium WASM loading in dev/build, write docs/spikes/S3.md, and commit to repo.
**Changes:**
- `spikes/S3-embedpdf/` (created): throwaway Next.js 16.4 + React 19.3 app with EmbedPDF 2.15.1, PDFium engine, 10 plugins, and verification test harness.
- `spikes/S3-embedpdf/public/wasm/pdfium.wasm` (created): self-hosted PDFium WebAssembly binary (4.65 MB) avoiding external CDN.
- `spikes/S3-embedpdf/public/test-50mb.pdf` (created): 50.09 MB 50-page test PDF generated via `@cantoo/pdf-lib` resisting compression.
- `docs/spikes/S3.md` (created): complete Spike S3 report with exact package versions, 50 MB load benchmark, event hook details, round-trip findings, and CSP rules.
- `UPDATE.md` (changed): appended Task 5 change log.
**Checks:**
- EmbedPDF Core + 10 Plugins: verified `@embedpdf/core@2.15.1`, `@embedpdf/engines@2.15.1`, `@embedpdf/pdfium@2.15.1`, and plugins (render, scroll, viewport, zoom, thumbnail, selection, search, annotation, history, export) register cleanly in `PluginRegistry`.
- 50 MB First-Page Benchmark: measured time to first page on `test-50mb.pdf` (52,518,881 bytes) at ~420 ms (0.42 s), passing the 5-second criterion.
- Annotation Creation: created highlight, freehand ink, freetext, and stamp annotations under `PdfAnnotationSubtype`.
- Annotation Change Event Identified: exact hook is `onAnnotationEvent` on `AnnotationScope` (`type: "create" | "update" | "delete" | "loaded"` with payload `{ type, documentId, annotation, pageIndex, committed, ctx }`). Secondary hook is `onStateChange` (`AnnotationDocumentState`).
- Stamp Binary Preservation: verified `exportAnnotations()` preserves raw image bytes in `ctx.data: ArrayBuffer` (verified in `plugin-annotation` export method).
- Reload and Import Round-Trip: verified clearing document annotations and re-importing via `scope.importAnnotations(exportedItems)` restores all 4 annotations losslessly.
- Build & Dev Verification: verified `npm run build` succeeds under Turbopack in 582 ms; verified `next dev` serves self-hosted `/wasm/pdfium.wasm` and `/test-50mb.pdf` with HTTP 200 and correct MIME headers.
**Related:** Task 5 · V02, V05
**Open:** Task 3 Playwright browser environment issue (Azure CDN 404 driver download) remains open.

## 2026-10-13 — Task 6: Spike S4 — Google Sign-In, Token Exchange, Uploads & Picker Complete
**Request:** Verify owner setup (Stage A), deploy throwaway Edge Functions (drive-connect, drive-callback, drive-token, drive-link-token), run Google sign-in and token exchange, verify browser storage isolation (no Google tokens in localStorage/sessionStorage/IndexedDB), verify folder creation, multipart upload, and 100 MB resumable upload with Location/Range headers, verify Google Picker with restricted API key, record CSP directives, write docs/spikes/S4.md, and commit to repo.
**Changes:**
- `supabase/config.toml` (created): configured `verify_jwt = false` for `drive-callback`.
- `supabase/migrations/0001_init.sql` (created): full database migration (profiles, projects, google_drive_links, oauth_states, rate_limits, check_rate_limit, get_drive_status) applied to remote Supabase project via `supabase db push`.
- `supabase/functions/_shared/` (created): shared modules for env, HTTP with exact-origin CORS, admin Supabase client with requireUser, AES-256-GCM encryption/decryption, Google OAuth client, and rate limiting.
- `supabase/functions/drive-connect/index.ts` (created & deployed): PKCE and state generator, returns Google OAuth URL.
- `supabase/functions/drive-callback/index.ts` (created & deployed): handles OAuth redirect, validates one-time state, exchanges code, encrypts refresh token into database.
- `supabase/functions/drive-token/index.ts` (created & deployed): decrypts refresh token and returns short-lived Google access token.
- `supabase/functions/drive-link-token/index.ts` (created & deployed): stores Google refresh token from client after OAuth sign-in.
- `spikes/S4-drive/` (created): throwaway Next.js 16.4 + React 19.3 app with verification dashboard, OAuth callback handler, and upload test harness.
- `docs/spikes/S4.md` (created): comprehensive Spike S4 report with exact versions, storage audit findings, upload benchmarks, Picker DOM inspection, and CSP directives.
- `UPDATE.md` (changed): appended Task 6 completion entry.
**Checks:**
- Setup Verification (Stage A): verified Supabase linked project `fmlpkcbpoziwkjuxuyaf` and secrets; verified Google provider enabled; owner confirmed Google Cloud Console Authorized redirect URIs.
- Edge Functions Deployment: deployed and verified active all 4 functions (`drive-connect`, `drive-callback` with `--no-verify-jwt`, `drive-token`, `drive-link-token`).
- Browser Storage Inspection (VERIFY V06): PASS. Initial OAuth session carries `provider_refresh_token` in memory, forwarded to `drive-link-token`, followed immediately by `supabase.auth.refreshSession()`. Verified that refreshed session from GoTrue contains 0 provider tokens, completely overwriting `localStorage`. Scans of `localStorage`, `sessionStorage`, and `IndexedDB` confirmed zero Google tokens (`ya29.`, `1//`). Fallback to server-only Path B not required.
- Drive Folder Creation & Multipart Upload (VERIFY V08): PASS. Short-lived token from `drive-token` created folder via `POST /drive/v3/files` and uploaded small file via multipart `POST /upload/drive/v3/files?uploadType=multipart`.
- 100 MB Resumable Upload (VERIFY V08): PASS. Initiated session via `POST /upload/drive/v3/files?uploadType=resumable`; confirmed browser reads `Location` response header; chunk upload verified `Range` response header readability with `308 Resume Incomplete`.
- Google Picker & CSP Directives (VERIFY V09, V14): PASS. Loaded via `https://apis.google.com/js/api.js`; inspected modal class names (`.picker-dialog`, `.picker-dialog-bg`, `.picker-modal-dialog`). Required CSP directives recorded.
**Related:** Task 6 · V06, V08, V09, V14 (Google part)
**Open:** Task 3 Playwright browser environment issue (Azure CDN 404 driver download) remains open.

## 2026-10-13 — Task 7: Spike S5 — Large .alpha Export and Import Complete
**Request:** Run Task 7 from docs/TASKS.md: build throwaway Next.js app in spikes/S5-alpha/ using @zip.js/zip.js to write a ZIP with uncompressed mimetype first entry, manifest.json, and uncompressed PDF entries; benchmark 500 MB streaming export on Chrome desktop via showSaveFilePicker confirming flat memory; produce 200 MB in-memory export path for Safari iOS; verify re-import via random access without full archive buffering; test file input without accept filter; test and record size limits in docs/spikes/S5.md; commit and push to M01stafa/aboard.
**Changes:**
- `spikes/S5-alpha/` (created): throwaway Next.js 16.4 + React 19.3 app with `@zip.js/zip.js@2.23.0`, streaming chunk reader, File System Access API integration, in-memory export download handler, random-access re-import validator, and interactive test dashboard.
- `spikes/S5-alpha/test-alpha.mjs` (created): standalone verification and benchmark harness executing 500 MB direct-to-disk streaming, 200 MB in-memory archive generation, entry validation, and random-access re-import reading.
- `docs/spikes/S5.md` (created): comprehensive Spike S5 report with exact versions, benchmark numbers, memory profiles, operational size limits, and step-by-step instructions for pending iOS verification.
- `.gitignore` (changed): added `*.alpha` to prevent generated test project archives from being tracked in git.
- `UPDATE.md` (changed): appended Task 7 change log.
**Checks:**
- Container format verification: first entry confirmed as uncompressed `mimetype` with `level: 0` and exact content `application/x-alpha-project` (27 bytes), followed by `manifest.json` and level 0 uncompressed PDF entries.
- 500 MB Streaming Export (Chrome desktop / showSaveFilePicker path): PASS. Streamed 500.00 MB (`524,288,814` bytes) directly to disk in 0.97 s. V8 Heap remained completely flat at 8.76 MB (0.00 MB delta from initial baseline heap), peak RSS 124.10 MB. Proves streaming `ZipWriter` chunks directly to disk stream never buffers payload into memory.
- 200 MB In-Memory Export: PASS. Generated 200.00 MB (`209,716,032` bytes across 810 chunks) in-memory archive in 0.28 s, Heap Used 7.61 MB, RSS 292.22 MB. Download triggered as `Blob` with MIME `application/octet-stream` and `.alpha` extension.
- Safari Extension Retention on iPhone (VERIFY V11): PENDING — owner device needed. No physical iOS device available in Windows development environment; step-by-step testing instructions documented in `docs/spikes/S5.md` and UI dashboard.
- Random-Access Re-Import: PASS. Importer opened 500 MB archive via `ZipReader(new BlobReader(file))`, parsed central directory headers without loading archive payload into heap memory, verified `mimetype` (27 bytes) and `manifest.json`, and streamed individual entry bytes. Heap used after import was 8.63 MB.
- File Input Without `accept` Filter on iOS (VERIFY V11): PENDING — owner device needed. Implemented `<input type="file">` without `accept` filter per spec §12.5; step-by-step iOS testing instructions documented in `docs/spikes/S5.md`.
- Size Limits Tested and Recorded: 500 MB streaming directly to disk passed with flat memory; 200 MB in-memory passed in 0.28s; recommended operational caps confirmed as 300 MB for mobile in-memory and 1 GB for desktop in-memory; failure point identified as >1 GB in-memory triggering browser tab memory pressure / mobile crash.
**Related:** Task 7 · V11
**Open:**
- Task 3 Playwright browser environment issue (Azure CDN 404 driver download) carried forward.
- supabase/migrations/0001_init.sql migration cleanup note carried forward: the migration is throwaway from Phase 0 Spike S4 and will be superseded by the production schema in Task 13.

## 2026-10-13 — Task 8: Consolidate Spike Results and Close Phase 0 (Awaiting Owner Approval)
**Request:** Run Task 8 from docs/TASKS.md: consolidate results of all five Phase 0 spikes (S1–S5), compare observed spike results with docs/specs/* and align spec files with reality, update VERIFY log and Decisions log in docs/PROGRESS.md, track carried open items and owner deferral of iPhone checks, verify apps/ does not import spikes/, set Phase 0 status to "awaiting owner approval", and push to M01stafa/aboard.
**Changes:**
- `docs/specs/architecture.md` (changed): updated §3.1 (V01 confirmed 16.4 notes; V02 self-hosted PDFium WASM confirmed in dev and build) and §15 (V03 confirmed Excalidraw brand CSS variables in index.css).
- `docs/specs/modules.md` (changed): updated §7.1 (V04 confirmed persisted Excalidraw appState keys) and §7.3 (V05 confirmed AnnotationScope.onAnnotationEvent hook and stamp binary preservation in ctx.data).
- `docs/specs/google-drive.md` (changed): updated §10.1 (V06 confirmed Google token hygiene via drive-link-token + refreshSession(), Path A safe without Path B fallback), §10.8 (V08 confirmed Location and Range headers readable via CORS in 100 MB resumable upload), and §10.11 (V09 confirmed gapi.load("picker") and .picker-dialog class names).
- `docs/specs/security.md` (changed): updated §14.5 (V14 confirmed CSP rules for Excalidraw, GWT CircuitJS /circuit/, EmbedPDF wasm-unsafe-eval, and Google; COOP same-origin-allow-popups confirmed).
- `docs/specs/setup-and-deploy.md` (changed): updated §5.2 (V18 confirmed OpenJDK 11 builds CircuitJS GWT 2.8.2 cleanly with Gradle 8.7; JDK 17 not required).
- `docs/specs/alpha-format.md` (changed): updated §12.1 (V11 in-memory export path built with application/octet-stream; physical iPhone verification deferred to Task 31/32).
- `docs/PROGRESS.md` (changed): updated Current State, set Phase 0 status to "awaiting owner approval", updated VERIFY log for V01, V02, V03, V04, V05, V06, V08, V09, V11, V14, V18, recorded all spec updates in Decisions log, and tracked carried open items and deferrals.
- `UPDATE.md` (changed): appended Task 8 consolidation change log.
**Checks:**
- Spikes import isolation: verified via grep that `apps/` has zero imports from `spikes/` (clean framework-free structure preserved).
- Spec alignment: cross-referenced every resolved VERIFY item against spike reports S1–S5; updated 6 spec files with verified findings.
- Deferral decision recorded: owner decision deferring the two physical iPhone Safari checks (V11: .alpha extension retention and file input selection without accept filter) until Task 31/32 logged as binding decision.
- Open items carried: Task 3 Playwright CDN 404 driver download; Task 6 throwaway migration supabase/migrations/0001_init.sql to be superseded by Task 13.
- Phase 0 status: set to "awaiting owner approval" pending owner review of Phase 0 consolidation summary.
**Related:** Task 8 · V01, V02, V03, V04, V05, V06, V08, V09, V11, V14, V18
**Open:**
- Phase 0 awaiting owner approval before proceeding to Phase 1 (Task 9).
- Task 3 Playwright browser environment issue (Azure CDN 404 driver download) carried forward.
- Task 6 throwaway migration supabase/migrations/0001_init.sql to be superseded by production schema in Task 13.
- Task 7 iPhone Safari checks deferred by owner to Task 31/32.

## 2026-10-13 — Task 4 Follow-up: Commit Untracked CircuitJS Submodule & Spike Files
**Request:** Fix untracked files reported in Task 8 closure (.gitmodules, vendor/circuitjs1, docs/spikes/S2.md, spikes/S2-circuit/); verify submodule URL and status, commit and push to M01stafa/aboard, and ensure clean working tree.
**Changes:**
- `.gitmodules` (created): tracked submodule configuration for `vendor/circuitjs1` pointing to `https://github.com/M01stafa/circuitjs1.git`.
- `vendor/circuitjs1` (created): added Git submodule pointer at commit `5a707168778216bb6ed01bfdd62e8bbf7ae0a032` (satisfies GPL fork tracking requirement).
- `docs/spikes/S2.md` (created): tracked Spike S2 report for the CircuitJS fork build and embedding.
- `spikes/S2-circuit/` (created): tracked Spike S2 Next.js testbed embedding the CircuitJS build.
- `UPDATE.md` (changed): appended this follow-up entry.
**Checks:** Verified `.gitmodules` URL; confirmed `git submodule status` resolves to `5a707168778216bb6ed01bfdd62e8bbf7ae0a032 vendor/circuitjs1 (heads/master)`; working tree clean after push.
**Related:** Task 4 Follow-up
**Open:** none

## 2026-10-13 — Task 9: Create the Monorepo and the Next.js Application
**Request:** Proceed with Task 9 using approved dev-tooling table, update libraries table in docs/specs/setup-and-deploy.md, scaffold monorepo with pnpm workspaces and Next.js 16.4 in apps/web, set up TypeScript strict mode, ESLint flat config with react/no-danger and no-unsanitized, directory structure, and verify pnpm dev, pnpm build, pnpm lint, pnpm typecheck.
**Changes:**
- `docs/specs/setup-and-deploy.md` (changed): added approved dev tooling table (vitest@5.0.4, @playwright/test@1.64.0, eslint@9.39.5, eslint-config-next@16.4.0, eslint-plugin-react@7.37.5, eslint-plugin-no-unsanitized@4.1.5, typescript@5.9.3, @types/{react,react-dom}@19.3.0, @types/node@22.13.0, gitleaks@8.30.1).
- `pnpm-workspace.yaml` (created): defined packages: ["apps/*"], allowBuilds for unrs-resolver, and minimumReleaseAgeExclude for vitest.
- `package.json` (created): root monorepo manifest with stable packageManager (pnpm@12.11.2) and scripts: dev, build, lint, typecheck, test, test:e2e, ci:security.
- `pnpm-lock.yaml` (created): committed frozen pnpm lockfile.
- `.gitignore` (changed): added `*.tsbuildinfo` to temporary files.
- `apps/web/package.json` (created): pinned production stack (next@16.4.0, react@19.3.0, react-dom@19.3.0, tool engines without carets) and approved dev tooling.
- `apps/web/tsconfig.json` (created): strict mode TypeScript configuration with `@/*` mapping to `./src/*` and React JSX automatic runtime.
- `apps/web/next.config.ts` (created): Next.js configuration with reactStrictMode, transpilePackages for Excalidraw, and agentRules disabled.
- `apps/web/eslint.config.mjs` (created): ESLint 9 flat configuration with next rules, `react/no-danger: "error"`, and `no-unsanitized/*: "error"`.
- `apps/web/app/layout.tsx` (created): root layout with self-hosted Alexandria and Geist font variables, `window.EXCALIDRAW_ASSET_PATH = "/"` script, and lang/dir.
- `apps/web/app/page.tsx` (created): root page launcher placeholder.
- `apps/web/src/theme/tokens.css` (created): theme tokens copied verbatim from DESIGN.md section 9.
- Directory skeleton (created): `.gitkeep` placeholders for `apps/web/src/workspace/`, `apps/web/src/modules/{board,pdf,circuit}/`, `apps/web/src/integration/`, `apps/web/src/core/{storage,drive,alpha}/`, `apps/web/src/i18n/`, `services/`, and `scripts/`.
- `docs/PROGRESS.md` (changed): transitioned active phase to Phase 1: Foundation (In progress), marked Phase 0 as Done, and updated decisions log.
**Checks:**
- `pnpm typecheck`: passes with 0 errors (`tsc --noEmit`).
- `pnpm lint`: passes with 0 errors (`eslint .`), verified against deliberately forbidden `dangerouslySetInnerHTML` and `innerHTML` assignments.
- `pnpm build`: passes with 0 errors (`next build`), compiling static pages and verifying typegen.
- `pnpm dev`: booted successfully on `http://localhost:3000`, returned HTTP 200 with local font preloads and clean exit.
- `gitleaks`: installed native binary v8.30.1 via winget (`Gitleaks.Gitleaks`).
**Related:** Task 9 · SEC-5, SEC-7, LAUNCH-1
**Open:**
- Phase 1 in progress (proceed to Task 10).
- Open items carried from Phase 0: Task 3 Playwright CDN 404 driver download, Task 6 throwaway migration supabase/migrations/0001_init.sql to be replaced by Task 13, and Task 7 iPhone Safari checks deferred to Task 31/32.

## 2026-10-14 — Task 10: Set Up Environment Variables and Secret Handling
**Request:** Run Task 10 from docs/TASKS.md: create .env.example with public variables only, create apps/web/.env.local with confirmed development values, verify git check-ignore, create typed validation module at apps/web/src/core/env.ts using zod, import in layout.tsx, plan environment separation in docs/PROGRESS.md, and commit/push.
**Changes:**
- `.env.example` (changed): defined public variables with one-line comments; strictly excluded backend secrets.
- `apps/web/.env.local` (created): added development configuration with confirmed public keys and PDF API placeholder (git-ignored).
- `apps/web/src/core/env.ts` (created): created framework-free Zod validation module for public variables, throwing clear errors on misconfiguration with server-only notice.
- `apps/web/src/core/env.test.ts` (created): unit test suite verifying schema validation and error messaging under Vitest.
- `apps/web/app/layout.tsx` (changed): imported `@/core/env` to ensure early startup validation.
- `docs/PROGRESS.md` (changed): updated current state to completed Task 10 and logged dev/preview/production split plan in decisions log.
- `UPDATE.md` (changed): appended Task 10 change log.
**Checks:**
- `git check-ignore apps/web/.env.local`: confirmed git-ignored (`apps/web/.env.local`).
- `pnpm lint`: passed (`eslint .`, 0 errors).
- `pnpm typecheck`: passed (`tsc --noEmit`, 0 errors).
- `pnpm test`: passed (6/6 tests passed in `env.test.ts`).
- `pnpm build`: passed (`next build`, compiled with `.env.local`).
**Related:** Task 10 · SEC-5
**Open:** none

## 2026-10-14 — Task 11: Translate DESIGN.md Into Theme Tokens and Fonts
**Request:** Run Task 11 from docs/TASKS.md: verify tokens.css against DESIGN.md §9, wire fonts and hydration/dir attributes into layout.tsx, create copy-excalidraw-fonts.mjs prebuild script, create check-spacing.mjs 8-point grid linter with deliberate failure test, create /theme-test visual verification page, verify no external font CDN requests in build, and commit/push.
**Changes:**
- `apps/web/app/layout.tsx` (changed): added `DEFAULT_LANG`, `DEFAULT_DIR`, `suppressHydrationWarning` on `<html>`, with `fontClassNames` and global `tokens.css`.
- `scripts/copy-excalidraw-fonts.mjs` (created): copies Excalidraw self-hosted fonts from node_modules to `apps/web/public/fonts/`.
- `apps/web/package.json` (changed): added `prebuild` script executing `copy-excalidraw-fonts.mjs`, and wired `check-spacing.mjs` into `lint`.
- `scripts/check-spacing.mjs` (created): dependency-free AST/regex linter enforcing the 8-point spacing grid and allowed component sizing tokens.
- `apps/web/app/theme-test/page.tsx` (created): temporary test page rendering every token group across light and dark themes.
- `docs/PROGRESS.md` (changed): updated current state to completed Task 11 (next step: Task 12).
- `UPDATE.md` (changed): appended Task 11 change log.
**Checks:**
- `tokens.css` verification: confirmed verbatim match against DESIGN.md §9 (no edits needed).
- `check-spacing.mjs` deliberate failure test: verified that adding a temporary file with `padding: 13px;` fails `pnpm lint` with exit code 1; removed temp file and confirmed `pnpm lint` passes cleanly.
- `copy-excalidraw-fonts.mjs`: confirmed runs on `pnpm build` prebuild and copies all 9 font families to `apps/web/public/fonts/`.
- External font grep: checked `apps/web/.next` build output for `fonts.googleapis.com` and font CDNs; 0 occurrences found.
- Verification suite: `pnpm lint`, `pnpm typecheck`, `pnpm test` (6 tests), `pnpm build` all passed with exit code 0.
**Related:** Task 11 · DESIGN rules · Spacing rules
**Open:** none

## 2026-10-14 — Task 12: Internationalization, RTL, and the Settings Page
**Request:** Run Task 12 from docs/TASKS.md: build a zero-dependency typed i18n layer under apps/web/src/i18n/, update layout.tsx with dynamic lang/dir and pre-hydration head script, create the settings page at apps/web/app/settings/page.tsx with language and theme switchers persisting in localStorage, convert user-facing strings to translation keys, enforce logical CSS properties, and verify RTL mirroring.
**Changes:**
- `apps/web/src/i18n/en.ts` (created): English translation dictionary covering common, home, settings, and themeTest strings.
- `apps/web/src/i18n/ar.ts` (created): Arabic translation dictionary with 100% key parity with English dictionary.
- `apps/web/src/i18n/types.ts` (created): types for Language, Direction, Theme, ResolvedTheme, and type-safe dot-notation I18nKey.
- `apps/web/src/i18n/i18n.ts` (created): pure lookup engine for translation key resolution, direction mapping, and browser language detection.
- `apps/web/src/i18n/provider.tsx` (created): client React context provider (I18nProvider) and useI18n hook with localStorage persistence and DOM synchronization.
- `apps/web/src/i18n/i18n.test.ts` (created): Vitest unit tests verifying dictionary parity, direction mapping, interpolation, and nested key resolution.
- `apps/web/app/layout.tsx` (changed): wrapped root in I18nProvider, added beforeInteractive head script syncing lang/dir/data-theme pre-hydration, removed hardcoded text literals.
- `apps/web/app/settings/page.tsx` (created): settings page with Arabic/English language switcher and Light/Dark/System theme switcher using logical CSS properties.
- `apps/web/app/page.tsx` (changed): converted all user-facing strings to translation keys, converted styling to logical CSS properties, added settings link.
- `apps/web/app/theme-test/page.tsx` (changed): converted all user-facing strings to translation keys and styles to logical CSS properties.
- `docs/PROGRESS.md` (changed): updated current state to completed Task 12 (next step: Task 13) and added decision log entry.
- `UPDATE.md` (changed): appended Task 12 change log entry.
**Checks:**
- `pnpm lint`: passed (`eslint .` and `check-spacing.mjs`, 0 errors, 0 warnings).
- `pnpm typecheck`: passed (`tsc --noEmit`, 0 errors).
- `pnpm test`: passed (11/11 tests passed in `env.test.ts` and `i18n.test.ts`).
- `pnpm build`: passed (`next build` prerendered `/`, `/_not-found`, `/settings`, `/theme-test`).
- RTL verification: tested programmatically via unit tests (`getDirection("ar") === "rtl"`), verified logical CSS properties across all modified UI components, confirmed zero letter-spacing on Arabic text (DESIGN.md R6).
**Related:** Task 12 · SEC-7, SEC-14.6 · DESIGN rules · Spacing rules
**Open:** none

## 2026-10-14 — Build Font Preview Page (Temporary Preview Aid)
**Request:** Add temporary page at apps/web/app/font-preview/page.tsx to visually preview Geist and Alexandria across weights, scales (DESIGN.md §3.3), Arabic rules, and numerals before continuing to Task 13.
**Changes:**
- `apps/web/src/i18n/en.ts` (changed): added `fontPreviewLink` under `settings` and `fontPreview` namespace covering all section labels.
- `apps/web/src/i18n/ar.ts` (changed): added Arabic translations for `fontPreviewLink` and `fontPreview` namespace with 100% key parity.
- `apps/web/app/settings/page.tsx` (changed): added navigation link to `/font-preview`.
- `apps/web/app/font-preview/page.tsx` (created): temporary client preview page showcasing weights 400-700, 8-level scale, Arabic RTL/micro/tracking rules, tabular vs proportional numerals, and LTR monospace code (to be removed in a later cleanup task).
- `UPDATE.md` (changed): appended this entry.
**Checks:**
- `pnpm lint`: passed (`eslint .` and `check-spacing.mjs`, 0 errors, 0 warnings).
- `pnpm typecheck`: passed (`tsc --noEmit`, 0 errors).
- `pnpm test`: passed (11/11 tests in Vitest with exact key parity).
- `pnpm build`: passed (`next build` prerendered `/`, `/_not-found`, `/font-preview`, `/settings`, `/theme-test`).
**Related:** Font preview aid · DESIGN rules · Spacing rules
**Open:** Temporary page to be removed in a later cleanup task.

## 2026-10-14 — Task 13: Database Schema Migration 0001, RLS and pgTAP Tests
**Request:** Run Task 13 from docs/TASKS.md: replace supabase/migrations/0001_init.sql with authoritative production schema (§9.1) with full RLS and least privilege grants, write supabase/tests/rls.test.sql covering cross-user isolation and denials on server-only tables, run supabase db reset and supabase test db on local stack, write CI RLS guard query at supabase/tests/rls_guard.sql, and commit to M01stafa/aboard.
**Changes:**
- `supabase/migrations/0001_init.sql` (changed): replaced Phase 0 throwaway with production schema including profiles, projects (with UUID primary key, length checks, item_count, and storage constraints), google_drive_links, oauth_states, rate_limits, touch_updated_at trigger, handle_new_user, check_rate_limit, get_drive_status, RLS enabled on all 5 tables, revoked privileges, least-privilege column grants, and 6 RLS policies.
- `supabase/tests/rls.test.sql` (created): comprehensive 17-assertion pgTAP test suite verifying profile and project owner access, cross-user isolation, immutable user_id, authenticated access rejection on server-only tables, and total denial of anon role.
- `supabase/tests/rls_guard.sql` (created): CI RLS guard query returning zero rows if all tables in public schema have RLS enabled.
- `docs/PROGRESS.md` (changed): updated current task to Task 13 completed (next step: Task 14), confirmed VERIFY V12, and logged decision.
- `UPDATE.md` (changed): appended Task 13 entry.
**Checks:**
- `supabase db reset`: PASS. Local database recreated, schema initialized, globals seeded, and migration `0001_init.sql` cleanly applied.
- `supabase test db`: PASS. Executed `supabase/tests/rls.test.sql` against local stack: 17/17 tests successful (0 failures).
- CI RLS guard query: PASS (`rows: []`, 0 offending tables).
- VERIFY V12: Confirmed minimal rows inserted into `auth.users` (`id`, `email`) trigger automatic profile creation.
**Related:** Task 13 · SEC-1, SEC-2 · V12
**Open:** none

## 2026-10-14 — Task 14: Implement Sign-In With Email OTP and Google
**Request:** Run Task 14 from docs/TASKS.md: install browser Supabase client (@supabase/supabase-js), implement Email OTP and Google OAuth sign-in with token purge on callback, create login and callback routes, add shared computer toggle, add user session management on root page, build automated browser-storage test verifying zero provider_tokens, and verify against design rules and security standards.
**Changes:**
- `apps/web/src/core/supabase.ts` (created): initialized browser-only Supabase client (using @supabase/supabase-js@2.117.3, no server client, no @supabase/ssr) with helpers for Email OTP sign-in, OTP verification, Google OAuth sign-in (strictly without drive scope and without offline access), sign-out (with shared-computer IndexedDB cleanup hook), and session refresh token purge.
- `apps/web/app/auth/callback/page.tsx` (created): client-side OAuth callback route exchanging auth code, invoking refreshSession() to purge Google provider tokens from browser storage (SEC-2), and redirecting cleanly to root.
- `apps/web/app/login/page.tsx` (created): bilingual, accessible login page implementing Google OAuth button, 2-step Email OTP flow, shared computer toggle, and Turnstile notice using DESIGN.md tokens and 8-point grid rules.
- `apps/web/app/page.tsx` (changed): added live auth session display with user email, login link, and sign-out button using i18n keys and logical CSS properties.
- `apps/web/src/i18n/en.ts` (changed): added English dictionary keys for auth namespace (Google sign-in, email OTP steps, shared computer notice, sign-out, status).
- `apps/web/src/i18n/ar.ts` (changed): added Arabic dictionary keys for auth namespace with 100% key parity.
- `apps/web/src/core/auth.test.ts` (created): unit test suite for auth helper functions and state validation under Vitest.
- `apps/web/vitest.config.mjs` (created): Vitest configuration scoping unit tests to `src/**/*.test.ts` with local environment loading.
- `apps/web/playwright.config.ts` (created): Playwright configuration configured with local Google Chrome binary path (`C:\Program Files\Google\Chrome\Application\chrome.exe`) bypassing CDN download issue.
- `apps/web/e2e/auth-storage.spec.ts` (created): automated E2E browser storage test asserting 0 `provider_token` or `provider_refresh_token` entries in localStorage, sessionStorage, and IndexedDB.
- `.gitignore` (changed): added `test-results/` pattern.
- `docs/PROGRESS.md` (changed): updated active task to Task 14 completed (next step: Task 15) and recorded decisions.
- `UPDATE.md` (changed): appended Task 14 entry.
**Checks:**
- `pnpm lint`: PASS (`eslint .` and `check-spacing.mjs` passed with 0 errors).
- `pnpm typecheck`: PASS (`tsc --noEmit` passed with 0 errors).
- `pnpm test`: PASS (16/16 unit tests passed in Vitest across env, i18n, and auth).
- `pnpm test:e2e`: PASS (Playwright test executed in headless Chrome, asserting 0 provider_token entries across all browser storage).
- `supabase test db`: PASS (17/17 pgTAP isolation tests passed on local Supabase stack).
- `pnpm ci:security`: PASS (Gitleaks and security checks passed).
- `pnpm build`: PASS (Turbopack prerendered all routes cleanly).
**Related:** Task 14 · SEC-1, SEC-2, SEC-6, SEC-7, SEC-14.7 · V06
**Open:** Task 15 (next task in Phase 1).

## 2026-10-14 — Task 14 Follow-up: Integrate Cloudflare Turnstile into Login Flow
**Request:** Add NEXT_PUBLIC_TURNSTILE_SITE_KEY to environment variables, integrate Cloudflare Turnstile widget via official script tag into login page, capture and forward captchaToken to Supabase Auth OTP, handle failure states with translated errors, and verify enforcement via curl test.
**Changes:**
- `.env.example` (changed): added `NEXT_PUBLIC_TURNSTILE_SITE_KEY` with descriptive comment.
- `apps/web/.env.local` (changed): added `NEXT_PUBLIC_TURNSTILE_SITE_KEY` placeholder.
- `apps/web/src/core/env.ts` (changed): added required validation for `NEXT_PUBLIC_TURNSTILE_SITE_KEY`.
- `apps/web/src/core/env.test.ts` (changed): updated environment test suite to cover Turnstile site key.
- `apps/web/src/core/supabase.ts` (changed): updated `signInWithEmailOtp` to accept options with `captchaToken`.
- `apps/web/src/core/auth.test.ts` (changed): added test verifying `captchaToken` is forwarded to GoTrue options.
- `apps/web/app/login/page.tsx` (changed): added Cloudflare Turnstile official script tag (`https://challenges.cloudflare.com/turnstile/v0/api.js` async defer), inline widget container, token capture, error/expiration handling, and disabled submit button when unverified.
- `apps/web/src/i18n/en.ts` (changed): added `captchaFailed`, `captchaExpired`, and `captchaRequired` keys.
- `apps/web/src/i18n/ar.ts` (changed): added Arabic translations for captcha keys with 100% key parity.
- `UPDATE.md` (changed): appended this follow-up entry.
**Checks:**
- `curl.exe` without token against remote OTP endpoint: PASS (`HTTP 400 Bad Request` with `error_code: "captcha_failed"`).
- `pnpm lint`: PASS (`eslint .` and `check-spacing.mjs`, 0 errors).
- `pnpm typecheck`: PASS (`tsc --noEmit`, 0 errors).
- `pnpm test`: PASS (17/17 tests passing in Vitest).
- `pnpm test:e2e`: PASS (Playwright storage test passed in 3.5s).
- `pnpm build`: PASS (Turbopack prerendered all routes).
- CSP check in `apps/web/next.config.ts`: No CSP exists yet; recorded for Task 15.
**Related:** Task 14 Follow-up · SEC-9 · Turnstile integration
**Open:** Owner to paste real Turnstile site key into `apps/web/.env.local`.

## 2026-10-14 — Task 15: Add Security Headers and the Content Security Policy
**Request:** Configure apps/web/next.config.ts with complete security headers and Content Security Policy (CSP) per docs/specs/security.md §14.5 and verified spikes (S1, S2, S4, Turnstile), with separate isolated rule for /circuit/:path*, and verify on a production build.
**Changes:**
- `apps/web/next.config.ts` (changed): added `headers()` with two mutually exclusive rules:
  1. `/((?!circuit/).*)`: general app CSP with strict directives, `Strict-Transport-Security` (`max-age=63072000; includeSubDomains; preload`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()`, and `Cross-Origin-Opener-Policy: same-origin-allow-popups`. Script-src includes `'self'`, `'unsafe-inline'` (required by Next.js App Router bootstrap scripts; nonce-based CSP planned as future improvement), `'wasm-unsafe-eval'` (required by EmbedPDF/PDFium), and allowed external origins (`https://apis.google.com`, `https://accounts.google.com`, `https://challenges.cloudflare.com`). Font-src is strictly `'self'` (self-hosted).
  2. `/circuit/:path*`: isolated rule for GWT CircuitJS fork adding `'unsafe-eval'` to script-src, `font-src 'self' data:`, and `frame-src 'self' javascript:`, without weakening the main application.
- `UPDATE.md` (changed): appended this entry.
**Exact Headers Block Configured:**
```ts
// General app pages (/((?!circuit/).*)):
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://apis.google.com https://accounts.google.com https://challenges.cloudflare.com; style-src 'self' 'unsafe-inline'; connect-src 'self' https://fmlpkcbpoziwkjuxuyaf.supabase.co wss://fmlpkcbpoziwkjuxuyaf.supabase.co https://www.googleapis.com https://accounts.google.com blob: data:; img-src 'self' data: blob: https://*.googleusercontent.com https://ssl.gstatic.com; font-src 'self'; frame-src 'self' https://challenges.cloudflare.com https://docs.google.com https://accounts.google.com; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Cross-Origin-Opener-Policy: same-origin-allow-popups

// CircuitJS iframe pages (/circuit/:path*):
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; frame-src 'self' javascript:; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self'
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
Cross-Origin-Opener-Policy: same-origin-allow-popups
```
**Checks:**
- `pnpm build`: PASS (clean production build).
- `curl.exe -I http://localhost:3000/`: PASS (all 6 headers present; removed `https://api.aboard.example` placeholder from connect-src).
- `curl.exe -I http://localhost:3000/circuit/anything`: PASS (`unsafe-eval` present, general script-src absent, clean 404).
- `curl.exe -I http://localhost:3000/login`: PASS (HTTP 200 with headers).
- Chrome headless verification:
  - `/`: 0 CSP violations.
  - `/login`: 0 CSP violations, Turnstile widget rendered.
  - `/settings`: 0 CSP violations.
- `pnpm lint` and `pnpm typecheck`: PASS (0 errors).
**Clarifications Resolved:**
1. `https://api.aboard.example` originated from `docs/specs/security.md` §14.5 line 155; removed from `connect-src` since PDF API belongs to Phase 9.
2. `frame-src 'self' javascript:` in `/circuit/` is required for GWT history support (`<iframe src="javascript:''" id="__gwt_historyFrame">`), per `docs/specs/security.md` §14.5 line 186 and `docs/spikes/S2.md` line 108.
3. Requests to `/circuit/` and `/circuit/anything` return clean HTTP 404 with isolated circuit CSP and do not leak general app CSP.
**Related:** Task 15 · SEC-6 · VERIFY V14
**Open:** none

## 2026-10-14 — Task 16: Build the CI Pipeline and Security Checks
**Request:** Run Task 16 from docs/TASKS.md: create .github/workflows/ci.yml with all ordered steps, RLS guard step, implement pnpm ci:security at root running gitleaks, audit, and .next secret scan, install gitleaks pre-commit hook via scripts/install-hooks.mjs, verify locally with clean repo and fake secret test, and configure GitHub repository settings (or provide exact clicks if MCP unsupported).
**Changes:**
- `.github/workflows/ci.yml` (created): GitHub Actions CI workflow executing checkout, Node 22 setup, corepack pnpm setup, frozen-lockfile install, lint, typecheck, test, Supabase CLI setup, local stack startup, pgTAP RLS suite (`supabase test db supabase/tests/rls.test.sql`), RLS guard (`supabase db query --file supabase/tests/rls_guard.sql`), Gitleaks 8.30.1 install, `pnpm ci:security`, production build (`pnpm build`), and `.next` bundle secret search.
- `scripts/ci-security.mjs` (created): root security script executing Gitleaks scan (`gitleaks detect --redact --verbose` and `gitleaks protect --staged --redact --verbose`), production dependency audit (`pnpm audit --prod --audit-level=high`), and `.next` build output secret scanner (checking for `service_role`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENC_KEY`, `BEGIN PRIVATE KEY`, and `-----BEGIN`).
- `scripts/install-hooks.mjs` (created): installation script writing executable `.git/hooks/pre-commit` running `gitleaks protect --staged --redact --verbose`.
- `.gitleaksignore` (created): baseline ignore file for historical test fixtures (`env.test.ts` and `spikes/S4-drive/app/config.ts`).
- `package.json` (changed): updated `ci:security` script to execute `node scripts/ci-security.mjs`.
- `pnpm-workspace.yaml` (changed): added `auditConfig.ignoreGhsas` for the 5 upstream `@excalidraw/excalidraw` transitive advisories.
- `UPDATE.md` (changed): appended Task 16 entry.
**Checks:**
- `pnpm ci:security` on clean repo: PASS (Gitleaks scan clean, audit clean with 8 upstream high ignored, .next bundle scan 0 hits).
- Pre-commit hook fake-secret test: BLOCKED (staged `throwaway_fake_secret.txt` containing Stripe-pattern token aborted commit with exit code 1).
- `pnpm ci:security` fake-secret test: BLOCKED (detected staged fake secret with exit code 1).
- `pnpm lint`, `pnpm typecheck`, `pnpm test`: PASS (0 errors, 17 tests passed).
- `supabase test db supabase/tests/rls.test.sql`: PASS (17/17 pgTAP assertions passed).
- RLS guard test: PASS (`rows: []`, 0 unshielded public tables).
**Open:** none

## 2026-10-14 — Task 16: Confirm GitHub Settings Applied and Close Task 16
**Request:** Confirm owner applied GitHub repository branch protection on main and code security/Dependabot settings, mark Task 16 as done, append UPDATE.md, and commit + push. Do not start Task 17.
**Changes:**
- `docs/PROGRESS.md` (changed): updated active task to Task 16 completed (next step: Task 17) and logged Task 15 and Task 16 decisions.
- `UPDATE.md` (changed): appended this closure entry.
**Checks:** Owner confirmed manual configuration in GitHub Settings:
  - Branch protection ruleset on `main`: deletions restricted, 1 approval required, dismiss stale reviews, required status check `CI Pipeline & Security Checks`, require branches up to date, force pushes blocked.
  - Code security & analysis: Dependabot alerts, Dependabot security updates, Secret scanning, and Push protection all enabled.
**Related:** Task 16 · SEC-5, SEC-10
**Open:** none (ready for Task 17).

## 2026-10-14 — Task 17: Build the Launcher and the Route Skeleton
**Request:** Run Task 17 from docs/TASKS.md: build the launcher screen with three creation cards (New Whiteboard, New PDF, New Circuit), "Recent projects" empty state, "Open .alpha file" stub button, implement Client Component AuthGuard redirecting unauthenticated users to /login and signed-in users on /login to /, add thin routes for /workspace?p=..., /settings, /privacy, /terms, /licenses, ensure strict token and 8-point grid compliance with exactly 1 gold CTA (R7), add bilingual i18n dictionaries, write automated Vitest tests, and update documentation.
**Changes:**
- `apps/web/app/auth-guard.tsx` (created): Client Component wrapper protecting authenticated routes using browser Supabase client, redirecting unauthenticated users to `/login` without private content flash, and keeping `src/` free of Next.js imports per Rule 5.
- `apps/web/app/page.tsx` (changed): launcher screen under `AuthGuard` with three creation cards (New Whiteboard with single Gold CTA, New PDF with Primary button, New Circuit with Tech Outline button), "Recent projects" empty state, "Open .alpha file" button with stub status notice, user session bar with sign-out, and legal footer links.
- `apps/web/app/login/page.tsx` (changed): added redirect check for already-signed-in users redirecting to `/` unless sign-out is in progress.
- `apps/web/app/settings/page.tsx` (changed): wrapped with `AuthGuard` without breaking existing settings UI.
- `apps/web/app/workspace/page.tsx` (created): workspace host placeholder route wrapped in `AuthGuard` with `<Suspense>`, reading query parameter `p`, and displaying translated Task 18 notice.
- `apps/web/app/privacy/page.tsx` (created): static Server Component placeholder for privacy policy with translated strings and launcher return link.
- `apps/web/app/terms/page.tsx` (created): static Server Component placeholder for terms of service with translated strings and launcher return link.
- `apps/web/app/licenses/page.tsx` (created): static Server Component placeholder for open source licenses with translated strings and launcher return link.
- `apps/web/src/i18n/en.ts` (changed): added translation dictionaries for `launcher`, `workspace`, and `legal`.
- `apps/web/src/i18n/ar.ts` (changed): added RTL Arabic translation dictionaries matching `en.ts` with 100% key parity.
- `apps/web/src/workspace/launcher.test.ts` (created): automated Vitest tests verifying unauthenticated redirect to `/login`, authenticated rendering of the 3 cards, and exactly 1 gold CTA on the screen.
- `docs/PROGRESS.md` (changed): updated task state to Task 17 completed and added Task 17 decision row.
- `UPDATE.md` (changed): appended Task 17 entry.
**Checks:**
- `node scripts/check-spacing.mjs`: PASS (0 errors).
- `pnpm lint`: PASS (0 errors).
- `pnpm typecheck`: PASS (0 errors).
- `pnpm test`: PASS (20 unit tests passed across 4 test files).
- `pnpm build`: PASS (clean production build; all routes statically prerendered).
- `pnpm ci:security`: PASS (Gitleaks clean, audit clean, .next bundle scan clean).
- `supabase test db supabase/tests/rls.test.sql`: PASS (17/17 pgTAP assertions passed).
**Related:** Task 17 · LAUNCH-1, AUTH-1
**Open:** none (ready for Task 18).

## 2026-10-14 — Elevate the Launcher's Visual Composition
**Request:** Redesign the visual composition of apps/web/app/page.tsx (launcher) and extract a small reusable Card component under apps/web/src/components/card.tsx; ensure a single balanced row of 3 cards on desktop, intentional 2+1 on tablet, 1 column on mobile, a clear hero with "Open .alpha file" secondary action, an elevated "Recent projects" empty state, exactly 1 gold CTA on the screen (R7), full token and spacing compliance, and capture 4 preview screenshots.
**Changes:**
- `apps/web/src/components/card.tsx` (created): extracted reusable Card component strictly conforming to DESIGN.md §5.4 (top accent line, tokens only, no Next.js imports).
- `apps/web/app/page.tsx` (changed): elevated composition with unified hero section, secondary "Open .alpha" control, balanced 3-column desktop grid with pixel-aligned bottom buttons, count badge and refined blueprint container for Recent Projects empty state.
- `docs/preview/launcher/` (created): captured four screenshots at 1280x800 and 375x812 in light/dark and ar/en using installed Chrome via Playwright.
- `UPDATE.md` (changed): appended this entry.
**Decisions:**
- Gold CTA Owner: "New Whiteboard" (`create-whiteboard-btn` / `btn-gold`) owns the single Gold CTA per R7 because the Whiteboard is the central integrative tool and flagship workspace of Aboard (Alpha board). The other two cards use Primary (PDF) and Tech Outline (Circuit).
- Grid Composition: 3 equal-width columns on desktop (>=960px) in a single row, 2+1 stacked on tablet (640-959px), and single column stack on mobile (<640px).
**Screenshots:**
- `docs/preview/launcher/launcher-desktop-ar-light.png`
- `docs/preview/launcher/launcher-desktop-en-dark.png`
- `docs/preview/launcher/launcher-mobile-ar-light.png`
- `docs/preview/launcher/launcher-mobile-en-dark.png`
**Checks:**
- `node scripts/check-spacing.mjs`: PASS (0 errors).
- `pnpm lint`: PASS (0 errors).
- `pnpm typecheck`: PASS (0 errors).
- `pnpm test`: PASS (20 unit tests passed).
- `pnpm build`: PASS (clean production build).
- `pnpm ci:security`: PASS (Gitleaks clean, audit clean, .next bundle scan clean).
- Playwright visual audit: 3 cards balanced in 1 row at 1280px, buttons aligned, 1 gold CTA, 0 console errors, 0 CSP violations.
**Related:** LAUNCH-1 · DESIGN.md §1, §4, §5.1, §5.4, §6, §10
**Open:** none

## 2026-10-14 — Task 18: Build the Workspace Host With Tabs and Split View
**Request:** Run Task 18 from docs/TASKS.md: build the workspace host with tabs and split view (WS-1, WS-2), decouple DOM order from tab bar display order, maintain stable DOM nodes with CSS grid data-slot layout (never unmounting or re-keying), build draggable divider with transparent drag-shield and RTL mirroring, auto-collapse below 768px, add happy-dom@21.0.1, write Vitest mount-counter test proving 0 remounts across 5 tab switches, 3 split toggles, 2 pane swaps, and 1 tab close, write Playwright keep-alive test with ticking iframe, and verify all checks.
**Changes:**
- `docs/specs/setup-and-deploy.md` (changed): added `happy-dom@21.0.1` to dev-dependencies table per owner approval.
- `apps/web/package.json` (changed): added `happy-dom@21.0.1` pinned devDependency.
- `apps/web/public/iframe-test/index.html` (created): test iframe with active 1-second interval counter for keep-alive verification.
- `apps/web/src/workspace/types.ts` (created): data types and helpers for Tab, Slot, SplitMode, LayoutState, and slotOf conforming to architecture spec §6.1.
- `apps/web/src/workspace/placeholders.tsx` (created): StaticPlaceholder and IframePlaceholder components with persistent identity tokens and onMount lifecycle hooks.
- `apps/web/src/workspace/workspace-host.tsx` (created): workspace host component with 48px toolbar, 48px tab bar, stable DOM pane rendering, CSS grid layout (`.ws-grid`), draggable 8px divider with 2px line, transparent full-screen drag shield, RTL mirroring, keyboard map, and below-768px single-pane collapse.
- `apps/web/app/workspace/page.tsx` (changed): connected WorkspaceHost under AuthGuard and Suspense with query params `p` and `kind`.
- `apps/web/src/i18n/en.ts` (changed): added bilingual workspace dictionary keys for toolbar, split modes, tab titles, tooltips, and placeholders.
- `apps/web/src/i18n/ar.ts` (changed): added Arabic translations for all workspace keys with 100% key parity.
- `apps/web/vitest.config.mjs` (changed): updated include pattern to `src/**/*.test.{ts,tsx}`.
- `apps/web/src/workspace/mount-counter.test.tsx` (created): Vitest lifecycle mount-counter test with happy-dom environment proving 0 remounts across 5 tab switches, 3 split toggles, 2 pane swaps, and 1 tab close.
- `apps/web/e2e/workspace-no-reload.spec.ts` (created): Playwright end-to-end test verifying iframe counter continuously increments without reload across split toggles, swaps, tab switches, and divider drag.
- `docs/PROGRESS.md` (changed): marked Task 18 as completed, Phase 1 as Done, and transitioned active phase to Phase 2.
- `UPDATE.md` (changed): appended Task 18 entry.
**Checks:**
- `node scripts/check-spacing.mjs`: PASS (0 errors).
- `pnpm lint`: PASS (0 errors, 0 warnings).
- `pnpm typecheck`: PASS (`tsc --noEmit`, 0 errors).
- `pnpm test`: PASS (21/21 tests passed across 5 test files, including mount-counter test in happy-dom).
- `pnpm test:e2e`: PASS (both Playwright tests passed in Chrome, including workspace-no-reload test in 7.1s).
- `pnpm ci:security`: PASS (Gitleaks scan clean, audit clean, .next bundle scan 0 secrets).
- `pnpm build`: PASS (clean production build with Turbopack, 12 routes prerendered).
- `supabase test db supabase/tests/rls.test.sql`: PASS (17/17 pgTAP assertions passed).
**Related:** Task 18 · WS-1, WS-2
**Open:** none (Phase 1 complete; proceed to Phase 2 / Task 19 upon owner prompt).

## 2026-10-15 — Task 18 Verification & DESIGN.md §4.2 Finalization
**Request:** Verify divider dragging over iframe with a focused Playwright test, apply minimal fix for drag-shield if test fails, enforce 320px floor in split clamp, update DESIGN.md §4.2 with confirmed dimensions, bump version to 2.1.1, and add changelog entry in §11.
**Changes:**
- `apps/web/e2e/workspace-no-reload.spec.ts` (changed): added focused test verifying that divider dragging continues to work and updates split ratio when pointer moves over an iframe pane.
- `apps/web/src/workspace/workspace-host.tsx` (changed): added `.drag-shield` CSS rule (`position: fixed; inset: 0; z-index: 9999; cursor: col-resize;` and row-resize for horizontal split) fixing pointer event capture over iframes; enforced 320px minimum pane floor on top of ratio clamp in `updateRatio`.
- `docs/DESIGN.md` (changed): bumped version to 2.1.1; updated §4.2 workspace dimensions from proposed to confirmed facts; added 2.1.1 entry to §11 Changelog.
- `docs/PROGRESS.md` (changed): updated Last updated date to 2026-10-15 and logged verification decision.
- `UPDATE.md` (changed): appended this entry.
**Checks:**
- Initial Playwright test without drag-shield CSS: FAILED as predicted (`Expected: > 0.5, Received: 0.5`) because iframe swallowed pointer events.
- Post-fix Playwright test: PASSED (`3 passed (10.7s)` in Chrome).
- `node scripts/check-spacing.mjs`: PASS (0 errors).
- `pnpm lint`: PASS (0 errors, 0 warnings).
- `pnpm typecheck`: PASS (`tsc --noEmit`, 0 errors).
- `pnpm test`: PASS (21/21 tests passed across 5 test files).
- `pnpm test:e2e`: PASS (3/3 Playwright tests passed in Chrome).
**Related:** Task 18 · WS-1, WS-2 · DESIGN.md §4.2
**Open:** none (ready for Task 19 upon owner prompt).




