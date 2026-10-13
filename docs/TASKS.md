# Tasks

This document lists every task required to build Aboard from scratch, ordered by the twelve phases defined in `docs/PROGRESS.md`: throwaway spikes first, then the foundation and security baseline, then storage, the three tool modules, the `.alpha` format, Google Drive, cross-tool integration, the online PDF tools, the UI redesign, and finally launch preparation and production deployment. Security is not left to the end: every phase builds its part of the security model as it goes, and the last phase only reviews and signs it off. Each task is written as a single detailed explanation rather than short bullet points, so the agent understands exactly what to build, why it matters, and how it connects to the rest of the system. The line under each task points to the spec sections that hold the exact code and values, the requirement IDs from `docs/PRD.md` the task satisfies, and the condition that marks it done. When this file and a spec disagree, the spec wins: stop, follow the spec, and tell the owner so this file can be corrected. Work on one task at a time, in order, and never start a task from a later phase while the current phase still has failing acceptance criteria. After completing each task, and after every other request from the owner, append an entry to `UPDATE.md` in the project root (created in Task 1) stating the affected files and a brief description of the work done, then update the current task and phase status in `docs/PROGRESS.md`.

---

## Phase 0: Spikes (Throwaway Experiments)

### Task 1: Create UPDATE.md, the Log of Every Change

Before any other work, create `UPDATE.md` in the project root, because it is the permanent record of everything the agent does in this project: every request the owner makes and every change that follows it, so that the owner and any later agent session can see what was asked, what changed, where and why, without reconstructing the history from Git. Create the file with a short header explaining its purpose, followed by the entry template shown below, and then add the first entry describing this task. From this point on, after every request from the owner, whether it is a task from this file, a bug fix, a design change, a question that led to a decision, or even a request that changed no files, append a new entry at the end of the file before reporting back to the owner. Each entry records the date and a short title, the owner's request in one or two sentences, every file created, changed or deleted with a one-line description of what happened to it, the checks that were run and their results, the related task number, requirement IDs and VERIFY items, and anything left open. The file is append-only: never rewrite, reorder or delete an earlier entry, and correct a mistake by adding a new entry that says what was wrong. Do not read the whole file before every request; read only its last few entries when context is needed. Never write secrets, tokens, keys or personal data into it. Keep it separate from `docs/PROGRESS.md`, which holds only the current state of the project (active phase and task, VERIFY results, decisions and lessons), while `UPDATE.md` holds the history of changes.

```markdown
## YYYY-MM-DD — <short title>
**Request:** <what the owner asked, in one or two sentences>
**Changes:**
- `<path>` (created | changed | deleted): <what and why>
**Checks:** <commands run and results, or "none needed">
**Related:** Task <n> · <requirement IDs> · <VERIFY IDs>
**Open:** <anything left to do, or "none">
```

*Spec: AGENTS.md (Hard rules, Workflow) · Done when: `UPDATE.md` exists in the project root with its header, the template and the first entry, and is committed to Git.*

### Task 2: Prepare the Repository and Confirm the Agent Setup

Before any code is written, make sure the project's instruction system actually works, because every later task depends on the agent reading the right rules at the right time. Initialize a Git repository at the project root, confirm that `AGENTS.md`, `DESIGN.md`, the `.agents/` folder and the `docs/` folder are all present, and add a `.gitignore` that excludes `node_modules/`, `.next/`, every `.env*` file except `.env.example`, `spikes/**/node_modules`, and build output folders. Open Antigravity's Customizations panel and confirm that the five rule files in `.agents/rules/` appear, that `security.md` is listed as always on, that `frontend.md`, `backend.md`, `design.md` and `spacing.md` activate when a matching file is opened, and that the content of the root `DESIGN.md` is visible through `design.md`; if `DESIGN.md` is missing or empty, stop and ask the owner for it. In the same task, read the official Next.js 16.4 release notes and compare them against the Next.js usage rules in the architecture spec, recording any breaking change that affects those rules. Create an empty `docs/spikes/` folder for the reports written in the next tasks and a `spikes/` folder for throwaway spike code, which must never be imported by the real application.

*Spec: AGENTS.md, `docs/specs/architecture.md` §3.1 · VERIFY: V00, V01 · Done when: both VERIFY rows are recorded and the rules load as described.*

### Task 3: Spike S1 — Excalidraw Inside Next.js

Build a minimal throwaway Next.js 16.4 app in `spikes/S1-excalidraw/` to prove that `@excalidraw/excalidraw@0.18.1` behaves correctly under the exact conditions the real app will impose, since discovering a rendering or font problem later would force rework across the whole board module. Load the component from a Client Component through `next/dynamic` with server rendering disabled, import its required stylesheet, run the app with React Strict Mode enabled so the component mounts twice in development, and confirm that the editor survives this double mount without duplicated listeners or errors. Copy the package's font folder into the spike's public directory, set `window.EXCALIDRAW_ASSET_PATH` before the bundle loads, and confirm in the browser's network panel that no font is fetched from an external CDN. Place the editor inside a container that is hidden with `visibility:hidden` and then shown again or resized, and confirm that pointer positions are correct only after calling the API's `refresh()` method. Check which Content Security Policy directives the editor needs, and inspect the installed type definitions for the exact names of the persisted `appState` keys and of the CSS variables used for theming. Write the findings to `docs/spikes/S1.md` with the exact versions used.

*Spec: `docs/specs/architecture.md` §3.1, §15 · `docs/specs/modules.md` §7.1 · VERIFY: V03, V04, V14 (Excalidraw part) · Done when: `docs/spikes/S1.md` exists and the VERIFY rows are updated.*

### Task 4: Spike S2 — Build and Embed the CircuitJS1 Fork

Ask the owner to create a public fork of `github.com/pfalstad/circuitjs1` on their GitHub account, since the GPL license requires the modified source to be published and the fork must belong to the owner, not to the agent. Add that fork to the repository as a Git submodule at `vendor/circuitjs1`, then build it with Gradle 8.7 using `gradle compileGwt` followed by `gradle makeSite`, or with the fork's own `./dev.sh` scripts, and record which JDK version the GWT 2.8.2 toolchain actually requires. Copy the build output, excluding the `WEB-INF` folder, into the public folder of a throwaway Next.js app in `spikes/S2-circuit/`, load it in a same-origin iframe, and attach to `window.CircuitJS1` using both the immediate check and the `oncircuitjsloaded` hook, confirming the attachment still works after a React Strict Mode double mount. Prove that `exportCircuit()` returns the circuit text, that `importCircuit()` restores it exactly, and that `getCircuitAsSVG()` delivers an SVG string through the `onsvgrendered` callback. Confirm that the stock build registers its own service worker, which the real fork must remove. Finally, run the script-execution check from the security rules against the fork's source and record the result, together with any extra CSP directives the GWT output needs, in `docs/spikes/S2.md`.

*Spec: `docs/specs/modules.md` §7.2 · `docs/specs/setup-and-deploy.md` §5.2 · `docs/specs/security.md` §14.6 · VERIFY: V18, V14 (GWT part) · Done when: the report exists and the round-trip of a circuit works.*

### Task 5: Spike S3 — EmbedPDF Viewing and Annotation Round-Trip

Build a throwaway app in `spikes/S3-embedpdf/` that proves the PDF engine choice before the real PDF module depends on it, because the whole annotation design relies on annotations being exported and re-imported separately from the PDF file. Load the EmbedPDF core with its render, scroll, viewport, zoom, thumbnail, selection, search, annotation, history and export plugins, open a PDF of about 50 MB, and measure how long the first page takes to appear. Create highlight, freehand ink, free text and stamp annotations, export them with `exportAnnotations()`, reload the same PDF without them, and restore them with `importAnnotations()`, paying particular attention to stamps because they carry binary image data that must survive the round trip. Identify the exact event the annotation plugin emits when annotations change, since the real module will use it to trigger saving. Confirm that the PDFium WASM file and the engine's worker load correctly in both `next dev` and a production `next build`. If EmbedPDF blocks any requirement, document the fallback described in the architecture decisions and ask the owner before switching engines. Record everything in `docs/spikes/S3.md`.

*Spec: `docs/specs/modules.md` §7.3 · `docs/specs/architecture.md` §3 (ADR-5), §3.1 · VERIFY: V02, V05 · Done when: the annotation round-trip, including a stamp, works and the report exists.*

### Task 6: Spike S4 — Google Sign-In, Drive Token Exchange and Uploads

This spike carries the highest risk in the project, because it proves that Google Drive can be the main store without ever leaving a Google token in the browser. Ask the owner to complete the Google Cloud setup steps from the setup spec in *Testing* mode (project, Drive and Picker APIs, branding, the `drive.file` scope, a Web OAuth client with the Supabase redirect URIs, and a referrer-restricted Picker API key) and to create a development Supabase project, then receive the resulting IDs and secrets through the owner, never through chat logs or committed files. Deploy throwaway versions of the `drive-connect`, `drive-callback` and `drive-token` Edge Functions, sign in with Google using the Drive scope, send the `provider_refresh_token` to the server, call `supabase.auth.refreshSession()`, and then inspect `localStorage`, `sessionStorage` and IndexedDB to prove that no Google token remains. If any Google token remains, the plan switches to the server-only connection path, and the owner must be told. Using a short-lived access token from `drive-token`, create a folder, upload a small file with a multipart request, and upload a 100 MB file with a resumable session, confirming the browser can read the `Location` and `Range` headers it needs. Open the Google Picker with the restricted key, confirm the current loader and class names, and record which CSP directives sign-in and the Picker require. Write `docs/spikes/S4.md`.

*Spec: `docs/specs/setup-and-deploy.md` §5.3–5.5 · `docs/specs/google-drive.md` §10.1–10.11 · `docs/specs/security.md` §14.4–14.6 · VERIFY: V06, V08, V09, V14 (Google part) · Done when: the automated browser-storage check passes or the fallback decision is logged.*

### Task 7: Spike S5 — Large `.alpha` Export and Import

Prove that a project file can be written and read at realistic sizes before the format is built for real, because students' projects may contain hundreds of megabytes of PDFs and a memory crash during export would lose the user's trust. In `spikes/S5-alpha/`, use `@zip.js/zip.js` to write a ZIP whose first entry is the uncompressed `mimetype` file, followed by a manifest and several large PDF entries stored without compression. On Chrome desktop, stream a 500 MB export straight to disk through `showSaveFilePicker` and confirm memory stays flat. On an iPhone, export a 200 MB project through the in-memory path, download it, and confirm Safari keeps the `.alpha` extension instead of renaming the file to `.zip`. Re-import both files by reading entries directly from the selected `File` object, confirming the importer never loads the whole archive into memory. Check that a file input without an `accept` filter lets iOS select the `.alpha` file. Record the size limits that worked and the ones that failed in `docs/spikes/S5.md`.

*Spec: `docs/specs/alpha-format.md` §12.1–12.5 · VERIFY: V11 · Done when: both device tests pass and the report exists.*

### Task 8: Consolidate the Spike Results

Close Phase 0 by turning the five spike reports into binding decisions, so that no later task is built on an assumption that a spike disproved. Go through every VERIFY row resolved in Tasks 2 to 7 and, wherever a result differs from what the specs describe, edit the spec text itself so it matches reality, then add one line per change to the Decisions log in `docs/PROGRESS.md`. Present the owner with a short summary in Arabic covering what worked, what changed, and any decision that needs their approval, such as switching to the server-only Google connection path or changing a size limit. Delete nothing from `spikes/`, since the code may be useful as reference, but confirm that no file under `apps/` imports anything from it. Mark Phase 0 as done only after the owner has seen the summary.

*Spec: `docs/specs/*` (all) · Done when: specs match spike results, the decisions log is updated, and the owner has approved the summary.*

---

## Phase 1: Foundation

### Task 9: Create the Monorepo and the Next.js Application

Set up the real project structure that every later task builds on, using pnpm workspaces with the web application in `apps/web`. Create the Next.js 16.4 app with the App Router and TypeScript in strict mode, and pin `next@16.4.0`, `react@19.3.0` and `react-dom@19.3.0` exactly, together with the other versions listed in the libraries table of the setup spec, without caret ranges for the three tool engines. Create the folder layout described in the repository spec: thin route files in `apps/web/app/`, framework-free code in `apps/web/src/` split into `workspace/`, `modules/`, `integration/`, `core/`, `theme/` and `i18n/`, plus top-level `supabase/`, `services/`, `scripts/` and `vendor/`. Development tooling such as Vitest, Playwright, the ESLint plugins `eslint-plugin-react` and `eslint-plugin-no-unsanitized`, and gitleaks is not yet in the libraries table, so propose the exact tools and versions to the owner, add them to the table once approved, and only then install them. Define the package scripts named in `AGENTS.md` (`dev`, `build`, `lint`, `typecheck`, `test`, `test:e2e`, `ci:security`) so their names stay stable for the rest of the project, and configure ESLint to forbid `dangerouslySetInnerHTML` and unsanitized DOM writes from day one.

*Spec: `docs/specs/architecture.md` §3.1, §18 · `docs/specs/setup-and-deploy.md` §5.2, §5.6 · Done when: `pnpm dev`, `pnpm build`, `pnpm lint` and `pnpm typecheck` all succeed on an empty app.*

### Task 10: Set Up Environment Variables and Secret Handling

Create the environment variable files that keep every key out of the code, because a single secret committed to a repository is enough to compromise every user's data. Copy `.env.example` to `apps/web/.env.local` and ask the owner for the development values of the public variables only: the Supabase URL, the Supabase anon or publishable key, the Google OAuth client ID, the restricted Picker API key, the Google Cloud project number and the PDF API URL. Confirm that `.env.local` is ignored by Git by running `git check-ignore` against it rather than assuming the ignore rule works. The secret values, namely the Google client secret, the token encryption key and the Supabase service role key, must never be placed in any file inside `apps/web`; they are set later as Supabase Edge Function secrets through the Supabase CLI. Create a small typed module that reads the public variables, validates them with `zod` at startup, and fails with a clear error if one is missing, and make sure any future Next.js server code that reads a secret imports the `server-only` package. Plan separate Supabase projects and Google keys for development, preview and production, and record that plan in the decisions log after the owner agrees.

*Spec: `docs/specs/setup-and-deploy.md` §5.5 · `docs/specs/security.md` §14.4 · Requirements: SEC-5 · Done when: the app starts with validated variables and `git check-ignore` confirms the file is ignored.*

### Task 11: Translate DESIGN.md Into Theme Tokens and Fonts

Read the owner's `DESIGN.md` and turn every value in it into CSS custom properties in `apps/web/src/theme/tokens.css`, covering colors, typography, spacing, radii, shadows and any other scale it defines, with the light theme on `:root` and the dark theme under `[data-theme="dark"]`. These tokens are the single source for every visual decision in the project: the shell, the PDF interface, the brand accents inside Excalidraw and the colors passed to the circuit simulator will all read from them, so no component may hard-code a color, font or spacing value. If `DESIGN.md` names fonts, self-host them with `next/font/local` instead of loading them from an external CDN, both for reliability and so the Content Security Policy can stay strict. Add the `scripts/copy-excalidraw-fonts.mjs` build step that copies Excalidraw's font folder into `apps/web/public/fonts`, and set `window.EXCALIDRAW_ASSET_PATH` in the root layout using a `beforeInteractive` script, as proven in Spike S1. If a value the interface needs is missing from `DESIGN.md`, do not invent one; list it and ask the owner. Define the spacing tokens exactly as listed in `.agents/rules/spacing.md`, where every token is 8 px or a multiple of 8, and make line heights multiples of 8 as well; if `DESIGN.md` contains a spacing value that is not a multiple of 8, stop and ask the owner instead of rounding it. Finally, write `scripts/check-spacing.mjs` as a small Node script with no new dependencies and run it as part of `pnpm lint`, so that any raw length value in a margin, padding, gap or offset property, or any component size that is not a token, fails the lint step from now on.

*Spec: `.agents/rules/design.md` · `.agents/rules/spacing.md` · `docs/specs/architecture.md` §15 · `docs/specs/modules.md` §7.1 · Done when: a test page renders every token in both themes, no font loads from an external domain, and the spacing check fails on a deliberately wrong value.*

### Task 12: Implement Internationalization, RTL and the Settings Page

Build the language and theme foundation now, because retrofitting right-to-left support after the interface is built is far more expensive than designing for it from the start. Set up an i18n layer with Arabic and English message files in `apps/web/src/i18n/`, and make every user-facing string in the app come from a translation key rather than from text written inside components. Set the `lang` and `dir` attributes on the `<html>` element from the chosen language, so Arabic renders right-to-left and English left-to-right, and enforce logical CSS properties such as `margin-inline-start` throughout. Build a settings page where the user switches language and light or dark theme, and make the choice persist across visits, with `localStorage` holding only these two preferences. Switching language or theme must never reload the page in a way that would lose open work, since the workspace built in Task 18 will keep tools running in the background.

*Spec: `docs/specs/architecture.md` §15 · `docs/specs/security.md` §14.6 · Requirements: AUTH-5 · Done when: switching language flips the layout direction live and the choice survives a reload.*

### Task 13: Create the Database Schema With Row Level Security and Tests

Using the `db-migration` skill, create `supabase/migrations/0001_init.sql` with exactly the schema defined in the database spec, because the database holds only accounts, a small project index and encrypted Google tokens, and nothing in it may ever be readable by the wrong user. The migration creates the `profiles`, `projects`, `google_drive_links`, `oauth_states` and `rate_limits` tables, the `handle_new_user`, `touch_updated_at`, `check_rate_limit` and `get_drive_status` functions, and the trigger that creates a profile for each new account. In the same migration, enable Row Level Security on every table, revoke all privileges from the `anon` and `authenticated` roles, grant back only the listed privileges with column lists so that `id`, `user_id` and `created_at` stay immutable, and create one policy per command for `profiles` and `projects`, while the three server-only tables get no policies at all. Write `supabase/tests/rls.test.sql` with pgTAP, proving that a user sees and changes only their own rows, cannot insert or reassign rows for another user, cannot read the token tables, and that the `anon` role is denied everywhere. Run `supabase db reset` and `supabase test db` against the local stack, and confirm the CI guard query finds no table without RLS.

*Spec: `docs/specs/database.md` §9.1 · `docs/specs/security.md` §14.2–14.3 · Requirements: SEC-1, SEC-2 · VERIFY: V12 · Done when: all pgTAP assertions pass and the guard query returns zero rows.*

### Task 14: Implement Sign-In With Email and Google

Build authentication with the browser Supabase client only, since this app has no server-rendered private pages and `@supabase/ssr` is deliberately not used. Implement the email sign-in method the owner chose for open question Q2 in `docs/PRD.md`; if it is still undecided, ask the owner and recommend one-time email codes, which avoid password storage entirely. Implement Google sign-in with `signInWithOAuth`, redirecting to a Client Component page at `/auth/callback`, but do not request the Drive scope or offline access yet, because the server-side token storage only arrives in Phase 7 and no Google refresh token should exist before then. Even without the Drive scope, the session returned after a Google sign-in contains a Google access token that supabase-js saves to browser storage, so call `supabase.auth.refreshSession()` immediately after sign-in and add an automated test proving that no `provider_token` remains in `localStorage`. Configure Supabase Auth exactly as the security spec requires: email confirmation, the exact redirect allow-list, CAPTCHA on sign-up, sign-in and password reset using a provider the owner chooses, auth rate limits, refresh-token rotation, and anonymous sign-ins disabled. Add a sign-out action that ends the session.

*Spec: `docs/specs/google-drive.md` §10.1 · `docs/specs/security.md` §14.6–14.7 · `docs/specs/setup-and-deploy.md` §5.4 · Requirements: AUTH-1 (sign-in part), AUTH-2, SEC-2, SEC-9 · VERIFY: V15 · Done when: both sign-in methods work and the browser-storage test passes.*

### Task 15: Add Security Headers and the Content Security Policy

Configure every security header in `apps/web/next.config.ts` through the `headers()` function, because headers protect every page at once and are much harder to get right later when third-party scripts are already in use. Add the Content Security Policy from the security spec, including only the external origins the app truly needs, plus Strict-Transport-Security, `X-Content-Type-Options: nosniff`, Referrer-Policy, Permissions-Policy, and a Cross-Origin-Opener-Policy of `same-origin-allow-popups` so that Google's sign-in and Picker popups keep working. The App Router injects inline bootstrap scripts, so this release uses `'unsafe-inline'` for scripts as the spec describes, while still blocking every foreign script origin; a nonce-based policy is planned for later. Add a separate rule for `/circuit/:path*` that receives its own policy, so that if the GWT output needs extra directives they never loosen the policy for the rest of the app, and make sure the two rules cannot both match the same path. Use the directives recorded during the spikes rather than guessing, and verify the final headers on a production build.

*Spec: `docs/specs/security.md` §14.5 · Requirements: SEC-6 · VERIFY: V14 · Done when: a production build returns every header and the app, sign-in and test pages work with no CSP violations in the console.*

### Task 16: Build the CI Pipeline and Security Checks

Create the continuous integration pipeline that will guard every change from now on (GitHub Actions unless the owner uses another CI service), because rules that are not checked automatically are eventually broken. The pipeline installs dependencies with a frozen lockfile, then runs lint, typecheck, unit tests, the pgTAP suite against a fresh local Supabase stack, and the `pnpm ci:security` script. That script runs gitleaks across the repository and its history, runs a dependency audit, builds the app and searches the build output for `service_role`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENC_KEY` and private key headers, failing the build on any match. Add the RLS guard query as a separate step so a table without RLS can never be merged. Install gitleaks as a pre-commit hook as well, so a secret is stopped on the developer's machine before it reaches the remote repository. Ask the owner to enable branch protection and GitHub's secret scanning with push protection, since these require repository admin rights.

*Spec: `docs/specs/security.md` §14.3, §14.4, §14.9 · Requirements: SEC-5, SEC-10 · Done when: the pipeline runs green, and a test commit containing a fake secret is blocked.*

### Task 17: Build the Launcher and the Route Skeleton

Build the first screen the user sees after signing in: a launcher with three cards for a new whiteboard, a new PDF and a new circuit, a "Recent projects" area, and an "Open .alpha file" button, all styled with the theme tokens and labelled through i18n keys. At this stage the cards create a placeholder project and open it, and the recent list and the open button are wired to real behavior later, in Tasks 22 and 32. Create the remaining routes as thin files in `apps/web/app/`: the workspace at `/workspace?p=<projectId>`, read with `useSearchParams` inside a `<Suspense>` boundary, plus `/settings`, and static Server Component placeholders for `/privacy`, `/terms` and `/licenses`. Route guards must send signed-out users to sign-in without flashing private content, and every interactive page must be a Client Component, following the Next.js usage rules.

*Spec: `docs/specs/architecture.md` §3.1, §17, §18 · Requirements: LAUNCH-1 · Done when: a signed-in user can reach every route and a signed-out user is redirected.*

### Task 18: Build the Workspace Host With Tabs and Split View

Build the workspace host that keeps several tools alive at once, because the most important promise of the product is that switching tabs never resets a running circuit, a PDF position or a board view. Implement the layout state from the workspace spec, where each tab is a document instance with an ID, a kind and an item ID, and keep the DOM order of panes stable and separate from the order shown in the tab bar. Render every open tab exactly once, never re-key it and never move its DOM node, because moving an iframe to a new parent reloads it; switching tabs or splitting the screen only changes CSS grid placement through a `data-slot` attribute. Hide inactive panes with `visibility:hidden`, `pointer-events:none` and absolute positioning instead of `display:none`, because a canvas inside a `display:none` element collapses to zero size. Build the draggable split divider with a transparent full-screen overlay during the drag, so iframes cannot swallow pointer events, and disable split view below 768 pixels. Use placeholder panes for now, including one that contains an iframe, and write the mount-counter test that proves each pane mounts exactly once while tabs are switched, split, swapped and closed.

*Spec: `docs/specs/architecture.md` §6.1–6.3 · Requirements: WS-1, WS-2 · Done when: the mount-counter test passes and the iframe placeholder never reloads during layout changes.*

---

## Phase 2: Storage Core and Local Mode

### Task 19: Create the Per-User Browser Database

Create the IndexedDB database with Dexie exactly as the storage spec defines it, with the `projects`, `items`, `files`, `outbox` and `meta` stores, because this database is both the full store for users who do not connect Google Drive and the save buffer for those who do. Name the database `aboard:<userId>` and open it only after sign-in, because IndexedDB belongs to the browser profile rather than to the account, and two students sharing a computer must never see each other's projects. Close the database on sign-out. Add the "This is a shared computer" option to the sign-in screen: when it is selected, signing out first flushes any pending uploads, warns if something is still unsynced, and then deletes that user's local database. Generate a random device ID once and keep it in the `meta` store, since the project index uses it to know which browser holds a local project. Any later change to the schema must add a new Dexie version with an upgrade function rather than editing the existing one.

*Spec: `docs/specs/storage-layer.md` §11.2 · `docs/specs/security.md` §14.6 · Requirements: SEC-4 · Done when: an end-to-end test signs in as two users on one browser and proves neither sees the other's local data.*

### Task 20: Build the Storage Provider Interface and the Project Service

Implement the `StorageProvider` interface and the `LocalProvider` from the storage spec, and build `ProjectService` on top of them, because this service is the only door through which the tool modules may read or write anything. The modules will never know whether a project lives in the browser or in Google Drive; they call methods such as `saveBoard`, `saveCircuit`, `saveAnnotations`, `putFile` and `getFile`, and the service routes each call to the right provider. In local mode, the `LocalProvider` keeps everything in the per-user database and marks every row as pinned, so the cache eviction added for Drive mode can never delete it. Store large binary files under a content key, using a streaming SHA-256 from `hash-wasm` for PDFs so that the same file added twice is stored once. Write unit tests for every method of the service against a fake provider.

*Spec: `docs/specs/storage-layer.md` §11.1–11.2 · Requirements: STORE-1, STORE-7 · Done when: unit tests cover every `ProjectService` method and data survives a page reload in local mode.*

### Task 21: Build the Save Queue and the Save Status Indicator

Build the save queue that guarantees no work is lost, because a student who loses an hour of annotations once will not trust the product again. Every change goes to IndexedDB first, debounced to about half a second, and is marked dirty, with one coalesced outbox entry per item so that a burst of edits produces a single upload. In local mode the entry is marked clean immediately; in Drive mode it will be uploaded after three seconds without changes and at most every thirty seconds during continuous editing, using the provider added in Phase 7. Flush the queue immediately when a tab closes, when the user switches projects, when the page becomes hidden, and before an export. Show the save status in the top bar using the five states defined in the requirements, and only when the outbox still holds unsynced Drive changes, let the browser show its standard "leave site?" dialog on unload. Request persistent storage from the browser after the first local save, but skip the request in Firefox, where it may show a permission prompt and the product promises no prompts.

*Spec: `docs/specs/storage-layer.md` §11.3–11.4 · Requirements: STORE-3, STORE-9, WS-3, WS-4 · Done when: closing the tab mid-edit loses no more than the last second of work and no permission prompt appears in Chrome, Safari or Firefox.*

### Task 22: Sync the Project Index and Build the Recent Projects List

Connect the launcher to the project index in Supabase, which holds only each project's title, subject, storage mode, Drive folder ID, local device ID, item count and dates, and never any project content. Whenever a project is created, renamed, deleted or moved, upsert its row, letting the database trigger set the update time so that clock differences between devices do not matter. Build the recent projects list from these rows and show the storage badge for each one: projects stored in Google Drive open on every device, local projects from this browser open normally, and local projects from another device appear greyed out with a hint to open a `.alpha` file. Implement rename and delete, where deleting a local project removes its data after a confirmation and deleting a Drive project will move its folder to the Drive trash once Phase 7 exists.

*Spec: `docs/specs/storage-layer.md` §11.5 · `docs/specs/database.md` §9.1 · Requirements: LAUNCH-2, LAUNCH-4 · Done when: projects appear with the correct badge on two different browsers signed in to the same account.*

---

## Phase 3: Circuit Module

### Task 23: Apply the Fork Patches and Automate the Circuit Build

Turn the spike results into permanent, documented changes inside the owner's CircuitJS1 fork, keeping each patch small so that monthly merges from the upstream project stay easy. Remove the service worker registration and the manifest link from `war/circuitjs.html` and stop shipping those files, disable the Dropbox, Google Drive and short-URL features because storage belongs to the app, and add `runCommand(menu, item)` and `getCircuitAsPNG()` to the `CircuitJS1` object in `JSInterface.java` using the field and constant names already verified in the source. Add an Arabic locale file based on the fork's template, and adjust colors and fonts in `war/circuitjs.css` using values from the theme tokens. List every patch, with the files it touches and its reason, in `vendor/circuitjs1/PATCHES.md`. Write `scripts/build-circuit.sh` to build the fork and copy its output, without `WEB-INF`, into `apps/web/public/circuit/`, and finalize the `/circuit/:path*` header rule from Task 15 using the directives found in Spike S2.

*Spec: `docs/specs/modules.md` §7.2 · `docs/specs/security.md` §14.6 · Requirements: CIRC-1, CIRC-6, CIRC-7 · Done when: the build script produces a working `public/circuit/` and no extra service worker is registered.*

### Task 24: Build the Circuit Adapter and the Circuit Pane

Build the circuit pane as a Client Component that loads `/circuit/circuitjs.html` in a same-origin iframe with the URL parameters from the modules spec, and build the `CircuitAdapter` that every other part of the app uses to talk to the simulator. The adapter attaches to `window.CircuitJS1` either immediately or through the `oncircuitjsloaded` hook, owns each of the simulator's single callback slots and fans events out to any number of subscribers, and must attach and detach cleanly under React Strict Mode's double mount. Load a saved circuit after the iframe is ready by calling `importCircuit()`, never through the URL, and save on every `onanalyze` event by passing `exportCircuit()` to `ProjectService.saveCircuit`, treating the circuit text as opaque. Pass the theme's colors to the simulator through its URL parameters, and when the theme changes, export the circuit, reload the iframe with the new colors and import the circuit again. Add a per-tab "pause when hidden" option, enabled by default on mobile, that stops the simulation while its pane is hidden.

*Spec: `docs/specs/modules.md` §7.2 · Requirements: CIRC-1, CIRC-2, CIRC-3, CIRC-4 · Done when: a circuit survives a reload and a theme change, and keeps running while another tab is active.*

---

## Phase 4: Board Module

### Task 25: Build the Board Pane and Its Persistence

Build the whiteboard pane by loading Excalidraw through `next/dynamic` with server rendering disabled, exactly as proven in Spike S1, and connect it to the project service so that every board saves and restores without the user ever pressing a save button. Read the board's elements and the persisted subset of its app state from `ProjectService` and pass them once as `initialData`, then persist every change from `onChange` through `ProjectService.saveBoard`, never feeding the changes back into React state, which would re-render the editor on every stroke. Save only the app state keys confirmed in Spike S1, set `langCode` to `ar-SA` when the interface is in Arabic, follow the light or dark theme, and use `UIOptions` to hide Excalidraw's own load and save-to-disk actions because the app manages files. Attach a ResizeObserver to the pane and call `refresh()` whenever it becomes visible or changes size, so pointer positions stay correct after tab switches and split-view changes.

*Spec: `docs/specs/modules.md` §7.1 · `docs/specs/architecture.md` §6.2 · Requirements: BOARD-1, BOARD-2, BOARD-4 · Done when: a board survives a reload, drawing stays accurate after resizing the split view, and the mount-counter test still passes.*

### Task 26: Handle Images Inside Boards

Store the bytes of every image placed on a board through `ProjectService.putFile`, keyed by the image's file ID, while the board's element data keeps only that ID, so that boards stay small enough to sync quickly and large files are uploaded only once. When a board loads, ask the service for any file whose bytes are not yet in memory and pass them to `addFiles`. Excalidraw rejects images larger than four megabytes, so before the app inserts an image programmatically, such as a PDF page in Phase 8, compress it to WebP or JPEG and cap its dimensions. For images that the user inserts directly, check in the installed package whether Excalidraw already downscales them, and record the finding as a new row in the VERIFY log before deciding whether the app needs its own handling. Test with an ordinary large photo taken on a phone.

*Spec: `docs/specs/modules.md` §7.1 · Requirements: BOARD-2, BOARD-3 · Done when: a board containing several large photos survives a reload with no "file too large" error.*

### Task 27: Build the Study Templates Panel

Build a side panel that inserts ready-made study templates into the current board, such as grids, anatomy outlines and circuit-sketch frames, giving engineering and medical students a faster start than an empty canvas. Store each template as JSON inside the application bundle, insert it through `convertToExcalidrawElements` and `updateScene` so that every inserted element stays fully editable, and style the panel with the theme tokens and translation keys. Ask the owner which templates to include, rather than inventing the content. This task has lower priority than the rest of the phase, so it must not delay the phase's acceptance criteria.

*Spec: `docs/specs/modules.md` §7.1 · Requirements: BOARD-5 · Done when: each template inserts as editable elements in both languages.*

---

## Phase 5: PDF Module

### Task 28: Build the PDF Viewer

Build the PDF pane on EmbedPDF with the plugins validated in Spike S3, providing scrolling, zoom, page thumbnails, text selection and search. When the user adds a PDF from their device, compute its SHA-256 with a streaming hash, store the original bytes once through `ProjectService.putFile` under that hash, and keep the original permanently unchanged, because annotations and later versions all refer back to it. Save the current page so the PDF reopens where the student stopped. Load the PDFium WASM file only when the first PDF is opened, show a progress indicator for large files, and warn on mobile devices when a file is above about 100 megabytes. Adding a PDF from Google Drive is wired later, in Task 37.

*Spec: `docs/specs/modules.md` §7.3 · Requirements: PDF-1 (device part), PDF-2, PDF-7 · Done when: a 50 MB PDF shows its first page within about five seconds on a mid-range laptop and a 200 MB PDF opens without crashing on desktop.*

### Task 29: Store Annotations Separately From the PDF

Implement highlights, freehand ink, free text and stamps with undo and redo, and save them as JSON separate from the PDF, keyed to the PDF's content hash, because this is what lets the same annotations appear on another device as soon as the same file is added there. Listen to the annotation change event identified in Spike S3, export the annotations with `exportAnnotations()`, and save them through `ProjectService.saveAnnotations`. Stamp annotations contain image bytes, so before saving, move each stamp's bytes into `putFile` under their own hash and replace them in the JSON with a reference, reversing the process when the annotations are loaded and restored with `importAnnotations()`. Write a test that annotates a PDF, reloads the app and finds every annotation, stamps included, exactly where it was.

*Spec: `docs/specs/modules.md` §7.3 · Requirements: PDF-3, PDF-4 · Done when: annotations survive a reload and reappear when the same PDF is added as a new item.*

### Task 30: Build the Annotated Download and the Page Operations

Let the student download a PDF with their annotations burned in, since the separate JSON is invisible to other PDF readers. Import the saved annotations into the document and use the export plugin to produce a new file, without ever modifying the stored original. Implement page operations with `@cantoo/pdf-lib`, never the unmaintained `pdf-lib`: rotating, reordering and deleting pages and inserting an image as a new page. Each operation produces a new PDF with a new hash and a new version of the item, while the annotations stay attached to the version they were made on. Tell the user clearly, through a translated message, that annotations do not carry over to a restructured PDF in this release.

*Spec: `docs/specs/modules.md` §7.3 · Requirements: PDF-5, PDF-6 · Done when: the downloaded file shows its annotations in another PDF viewer, and a reordered PDF opens as a new version.*

---

## Phase 6: The `.alpha` Project File

### Task 31: Define the Manifest and Build the Export

Define the `.alpha` manifest as a `zod` schema matching the alpha-format spec, with an integer format version from the very first release so that files created today can still be opened after the format changes. Build the export with `@zip.js/zip.js`: the first entry is the uncompressed `mimetype` file containing `application/x-alpha-project`, followed by `manifest.json`, the boards, circuits, PDF descriptors and annotations, and the files under their content keys, with PDFs and images stored without compression because they are already compressed. Flush the save queue before collecting the data. On Chromium desktop browsers, stream the archive straight to disk through `showSaveFilePicker`; everywhere else, build it in memory within the caps confirmed in Spike S5 and show a clear message, with alternatives, when a project is too large. Offer the two export options from the requirements, including PDFs (on by default) and adding annotated copies (off by default), and download with the type `application/octet-stream` so Safari keeps the extension.

*Spec: `docs/specs/alpha-format.md` §12.1–12.4 · Requirements: ALPHA-1, ALPHA-5, ALPHA-6, ALPHA-8 · Done when: a 500 MB export succeeds on Chrome desktop and the archive layout matches the spec.*

### Task 32: Build the Import With Safety Checks

Build the importer and treat every imported file as untrusted data, because a `.alpha` file can come from anyone and a malformed archive must never damage the user's existing projects. Read entries directly from the selected `File` without loading the whole archive, reject the file unless its `mimetype` entry matches, enforce the entry-count and total-size limits, accept only safe paths under the expected folders with no `..` segments and no absolute paths, validate the manifest with `zod`, and verify the SHA-256 of every file. Strip `javascript:` and `data:` links from board elements. If anything fails, show a clear, translated message and leave no partial project behind. If the project ID already exists, import it as a copy with new project and item IDs and rewrite internal links accordingly. Wire the launcher's "Open .alpha file" button and drag-and-drop, without an `accept` filter on iOS, and write tests for a zip bomb, path traversal, an oversized entry, a wrong `mimetype` and a hash mismatch.

*Spec: `docs/specs/alpha-format.md` §12.5 · `docs/specs/security.md` §14.6 · Requirements: ALPHA-2, ALPHA-3, ALPHA-4, SEC-7 · Done when: a file exported in one browser imports identically in another and every malicious test file is rejected cleanly.*

---

## Phase 7: Google Drive

### Task 33: Build and Deploy the Edge Functions

Build the five Edge Functions that handle Google tokens, because the Google client secret and every refresh token must live only on the server and never reach the browser. Create the shared modules for environment, HTTP handling with exact-origin CORS, the admin Supabase client with `requireUser`, AES-256-GCM encryption, Google token requests and rate limiting, then build `drive-connect`, `drive-callback`, `drive-link-token`, `drive-token` and `drive-disconnect` exactly as specified. Every function except the callback must authenticate the user first, then apply its rate limit, then validate input. The callback has no bearer token, so it is protected by a one-time, ten-minute `state` with PKCE, an IP rate limit and strict validation of the relative return path. Ask the owner to set the secrets through `supabase secrets set`, configure `verify_jwt = false` for the callback only, and deploy. Write tests for invalid tokens, an exceeded rate limit, a request from an unknown origin, a callback with a reused `state`, and a grant missing the `drive.file` scope.

*Spec: `docs/specs/google-drive.md` §10.2–10.4, §10.6 · `docs/specs/security.md` §14.5 · Requirements: AUTH-3, SEC-2, SEC-6 · VERIFY: V07 · Done when: all five functions are deployed and every negative test returns the expected error.*

### Task 34: Build the Connection Flows and the Token Manager

Connect Google Drive in the two ways the spec defines. For path A, add the Drive scope, offline access and `include_granted_scopes` to Google sign-in. Inside the auth state listener, but outside its synchronous body to avoid a deadlock, send the `provider_refresh_token` to `drive-link-token` and then call `refreshSession()` so no Google token stays in browser storage. For path B, build the "Connect Google Drive" button that calls `drive-connect` and follows the returned URL, and handle the `?drive=connected` and `?drive=error` results on return. Build the `DriveTokenManager`, which keeps the access token in memory only, refreshes it a minute before expiry with a single request in flight, and emits the reconnect event when the server answers that the link was revoked. Show Drive status through `get_drive_status` and add connect, disconnect and reconnect actions to the settings page. Extend the automated test from Task 14 so it proves that no Google token of any kind remains in `localStorage`, `sessionStorage` or IndexedDB after either path.

*Spec: `docs/specs/google-drive.md` §10.1, §10.5 · `docs/specs/security.md` §14.6 · Requirements: AUTH-1, AUTH-3, SEC-2, SEC-3 · VERIFY: V06 (final) · Done when: both paths connect Drive and the browser-storage test passes for both.*

### Task 35: Build the Drive API Layer and the Drive Provider

Build `src/core/drive/api.ts` as the only code in the app that talks to Google Drive, with a fetch wrapper that retries once with a fresh token on 401 and backs off exponentially with jitter, up to five attempts, on rate limits and server errors. Create the folder layout from the spec under `My Drive/Aboard/`, and identify every folder and file by its `appProperties` rather than by its name, so that renaming or moving files inside Drive never breaks a project. Upload files below five megabytes with multipart requests and larger files with resumable sessions in 8 MiB chunks, writing each content-addressed file only once. Build the `DriveProvider` behind the same interface as the `LocalProvider`, with IndexedDB acting as both buffer and cache, and connect it to the save queue's upload cadence. Add cache eviction that removes least-recently-used clean files when usage passes the limits in the spec, and never evicts dirty rows or outbox entries.

*Spec: `docs/specs/google-drive.md` §10.7–10.8 · `docs/specs/storage-layer.md` §11.2, §11.4 · Requirements: STORE-2, STORE-3, STORE-7, STORE-8 · Done when: a project created in Drive mode appears in the user's Drive and opens on a second device.*

### Task 36: Handle Conflicts and Drive Errors

Make editing the same project from two devices safe, because students move between laptop and phone and silent overwrites would destroy work. Store the `headRevisionId` of every cached item and check it before each update. If it changed, merge boards with Excalidraw's `reconcileElements`, keep both versions of circuits and annotations by saving the local one as a clearly named conflict copy, and never treat content-addressed files as conflicts. Handle the errors listed in the error table. When the Drive is full, stop Drive uploads, keep saving locally and show the "Drive full" banner. When a file is missing because the user deleted it in Drive, recreate it from the cache, or mark the item missing. When access is revoked, show the reconnect banner while work continues locally. After the user reconnects, upload everything waiting in the outbox. Test each case deliberately, including revoking the app's access from the user's Google account settings.

*Spec: `docs/specs/google-drive.md` §10.9–10.10 · Requirements: STORE-4, STORE-5, STORE-6 · Done when: two devices editing one project stay consistent, and revoking access loses no data.*

### Task 37: Move Projects Between Modes and Add the Google Picker

Let users move a project between the browser and Google Drive. "Save to Google Drive" creates the project folder and uploads the manifest, items and files with a progress bar, then updates the index row and unpins the local copies so they become cache. "Keep only on this device" downloads and pins everything, then asks whether to move the Drive folder to the Drive trash. After a user connects Drive for the first time, offer once to move their existing local projects. Integrate the Google Picker, using the restricted API key and the current access token, for "Add PDF from Google Drive" and "Open .alpha from Google Drive". With the `drive.file` scope, picking a file grants access to that file only. Add "Export to Google Drive", which writes the `.alpha` file into the `Aboard/Exports/` folder, and make deleting a Drive project move its folder to the Drive trash.

*Spec: `docs/specs/storage-layer.md` §11.6 · `docs/specs/google-drive.md` §10.11 · `docs/specs/alpha-format.md` §12.4 · Requirements: LAUNCH-5, LAUNCH-6, PDF-1 (Drive part), ALPHA-2 (Drive part), ALPHA-7 · Done when: a local project moved to Drive opens on another device, and files picked through the Picker open correctly.*

---

## Phase 8: Cross-Tool Integration

### Task 38: Build the Event Bus, PDF Page to Board, and Circuit to Board

Create the typed event bus with `mitt`, carrying `Blob` payloads and converting them to data URLs only at the Excalidraw boundary, because that is the only place that requires them. Implement the PDF page to board action: render the page to WebP, re-encode it if it is still above four megabytes, store it through `putFile` with its SHA-256 as the file ID, add it to the board with `addFiles`, insert it as a locked image element so the student can write over it without moving it by accident, and scroll the board to it. Implement circuit to board by requesting the SVG through the adapter and inserting it the same way, always as an image and never inlined into the page. Choose the target board in the order the spec defines: an explicitly chosen tab, then the other visible pane if it is a board, then the most recently used board, then a new board. Test both actions in local mode and in Drive mode.

*Spec: `docs/specs/modules.md` §8 · `docs/specs/security.md` §14.6 · Requirements: INT-1, INT-2 · Done when: both actions work in split view and survive a reload in both storage modes.*

### Task 39: Build Board to PDF and Selection to Note

Implement board to PDF by exporting the board with `exportToBlob` and appending it as a new page with `@cantoo/pdf-lib`, which creates a new PDF version rather than changing the original. Implement selected PDF text to note by inserting a text element on the target board with a link of the form `alpha://pdf/<itemId>#page=<n>`. Teach the app's router to open the referenced PDF at that page when the link is clicked, and make sure links of this form survive `.alpha` export and import.

*Spec: `docs/specs/modules.md` §8 · Requirements: INT-3, INT-4 · Done when: the four cross-tool actions work across both storage modes.*

---

## Phase 9: Online PDF Tools (Release 2)

### Task 40: Deploy Stirling-PDF and the Gateway

Ask the owner for a VPS (two vCPUs and 4 GB of RAM to start) and a subdomain such as `api.<domain>`, then deploy the stack from the setup spec with Docker Compose. Caddy terminates TLS and forwards only `/pdf/*` to the gateway. The gateway is a small Node 22 and Hono service. Stirling-PDF runs as the full official image on an internal Docker network with no published port and a memory limit. Build the gateway in `services/gateway`: it verifies the Supabase JWT, maps a fixed allow-list of tool names to fixed Stirling endpoints, checks uploaded files by their magic bytes, enforces per-user size, rate and concurrency limits, streams bodies in both directions without buffering whole files, allows only the app's origin, and never logs file names or contents. Set Stirling's allowed CORS origins explicitly, disable the endpoints the app does not use, and after testing pin the image to a version tag instead of `latest`. Run an external port scan to prove Stirling cannot be reached from the internet.

*Spec: `docs/specs/setup-and-deploy.md` §13 · `docs/specs/modules.md` §7.4 · `docs/specs/security.md` §14.8 · Requirements: PDFX-4, SEC-8 · VERIFY: V13, V16 · Done when: the gateway rejects requests without a valid JWT and the port scan shows only ports 80 and 443.*

### Task 41: Build the Online PDF Tools Interface

Add OCR, Office to PDF, PDF to Office, compression, merging and splitting to the PDF module through `src/core/stirling.ts`, which sends the file to the gateway with the user's Supabase JWT, shows upload and processing progress, and allows the user to cancel. Before the first use, show the one-time notice that these tools upload the file to the app's server for processing and delete it afterwards. Save every result into the project like any other PDF, so it lands in the user's Drive or browser and never stays on the server. Show clear, translated messages when the user hits a size or rate limit.

*Spec: `docs/specs/modules.md` §7.4 · Requirements: PDFX-1, PDFX-2, PDFX-3, PDFX-5 · Done when: OCR and Office to PDF work end to end and their results are saved into the project.*

---

## Phase 10: UI Redesign (Release 3)

### Task 42: Build the Custom Circuit Toolbar

Build a React toolbar for the circuit pane, styled with the theme tokens, covering run and pause, reset, time step, and a component palette that selects tools through the `runCommand("main", "<ClassName>")` function added in the fork, using the class names listed in the fork's menu source. Keep component properties in CircuitJS1's native dialogs, which open on double-click. Add an "Advanced menu" toggle that saves the circuit, reloads the iframe with the native menu visible, and restores the circuit, so that every feature of the simulator stays reachable even when the custom toolbar does not cover it.

*Spec: `docs/specs/modules.md` §7.2 · `docs/specs/architecture.md` §2.3 · Requirements: CIRC-5 · Done when: every simulator action is reachable through the toolbar or the advanced menu.*

### Task 43: Redesign the PDF Toolbars and Unify the Interface

Redesign the PDF module's toolbars for viewing, annotation, page operations and online tools so they follow `DESIGN.md` and match the shell, the board and the circuit toolbar. Then review the entire interface for consistency, replacing any remaining hard-coded value with a token, and confirm with the browser's inspector, in both languages, that every space and component size follows the 8-point grid in `.agents/rules/spacing.md`. In the same pass, check accessibility. The shell, launcher, tab bar, dialogs and settings must be fully keyboard-operable, every control needs a label for screen readers, focus must be visible, and contrast should aim for WCAG 2.2 AA. Test every layout in Arabic and English and in both themes.

*Spec: `.agents/rules/design.md` · `.agents/rules/spacing.md` · `docs/specs/architecture.md` §15 · Requirements: A8 accessibility · Done when: the owner approves the design review and the keyboard walkthrough passes.*

---

## Phase 11: Launch Preparation and Deployment

### Task 44: Publish the Legal Pages and Implement Account Deletion

Draft the privacy policy, the terms of use and the open-source licenses page, and give the drafts to the owner for review, because the legal text is the owner's responsibility and Google's OAuth verification requires real, published pages. The privacy policy must explain that files live in the user's Google Drive or browser, that the server keeps only the project list and an encrypted Google token, how online PDF tools process files, and how the app complies with Google's Limited Use requirements. The licenses page lists every third-party notice, generated automatically at build time, and links to the public source of the CircuitJS1 fork as GPL requires. Account deletion needs a new server-side endpoint that disconnects Drive, revokes the token and deletes the account and its rows. Because it is a new endpoint, ask the owner before building it and add it to the endpoint table in the security spec. The deletion screen must explain that files in Drive or the browser are not deleted.

*Spec: `docs/specs/security.md` §14.11 · `docs/specs/architecture.md` §16 · Requirements: LEGAL-1, LEGAL-2, LEGAL-3, AUTH-4 · Done when: the owner approves the pages and account deletion removes every row belonging to the user.*

### Task 45: Run the Security Review and the Launch Checklist

Run the `security-review` skill across the whole project and then work through every item of the launch checklist in the security spec, because a public launch with a single broken isolation rule would expose every student's data. Re-run the RLS tests and the guard query, list the grants held by the `anon` and `authenticated` roles, and repeat the browser-storage test for Google tokens. Scan the production bundle and the full Git history for secrets, confirm the Picker key's restrictions, and test CORS from an unknown origin. Exceed every rate limit once. Check the security headers on production, rerun the shared-computer test and the malicious `.alpha` tests, and confirm the Stirling server cannot be reached from outside. Set up alerts for spikes in 401, 403 and 429 responses, function errors and Google API quota, and publish `/.well-known/security.txt` with a contact address. Rehearse the key-rotation runbook once on the development environment. Record every result in `docs/PROGRESS.md`; any failure blocks the launch until the owner decides.

*Spec: `docs/specs/security.md` §14.10, §14.12 · `.agents/skills/security-review/SKILL.md` · Requirements: SEC-1 to SEC-12 · VERIFY: V17 · Done when: every checklist item is checked and recorded.*

### Task 46: Deploy to Production and Verify on Real Devices

Ask the owner to create the production Supabase project, set its secrets and run the migrations against it, then create the Vercel project from the repository and add the production values of the public environment variables only. Secrets stay in Supabase and never go to Vercel. Update every allow-list for the production domain: the Google OAuth origins and redirect URIs, the Picker key's referrers, the Supabase redirect URLs, the Edge Functions' allowed origins and the gateway's allowed origin. Ask the owner to publish the Google OAuth app and submit it for brand verification, since in Testing mode refresh tokens expire after seven days and only a hundred test users are allowed. Once the site is live, walk through every user flow from the architecture spec on Chrome, Firefox and Safari on desktop, an Android phone and an iPhone. These are: sign-up with Google and with email, creating each kind of project, opening a project on a second device, exporting and importing a `.alpha` file, moving a project between modes, an expired Drive token, a full Drive, disconnecting Drive, and the online PDF tools. Write the final summary in `docs/PROGRESS.md`.

*Spec: `docs/specs/setup-and-deploy.md` §5.3–5.5, §13 · `docs/specs/architecture.md` §17 · Requirements: all R1 requirements (and R2 when Phase 9 is included) · Done when: Google verification is approved, every flow passes on every listed device, and the owner signs off.*
