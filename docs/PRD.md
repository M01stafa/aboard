# Aboard — Product Requirements Document (PRD)

| | |
|---|---|
| **Product** | **Aboard** — short for “Alpha board” (earlier drafts: StudyHub, Alpha) |
| **Document version** | 4.1 (requirements part; split from `aboard_PRD.md` on 2026-10-08) |
| **Status** | Draft for owner review |
| **Stack** | Next.js 16.4 (App Router) + React 19.3 + TypeScript + Supabase |
| **Agent entry point** | `AGENTS.md` (project root) |

**How to read this file.** This file says *what* we build and *why*: requirements with IDs, priorities and acceptance criteria. The *how* lives in `docs/specs/`. "Tech §N" means section N of the technical specification; `AGENTS.md` → "Spec map" says which file in `docs/specs/` holds it. Requirement IDs (e.g. `PDF-3`) are the contract: cite them in plans, commits and tests.

---

## A1. Summary
Aboard is a web app for engineering and medical students that puts three study tools in one workspace: a **whiteboard** (Excalidraw), a **PDF reader/annotator** (with optional online tools such as OCR), and an **electronic circuit simulator** (CircuitJS1). Tools open side by side in tabs or a split view, and content moves between them (for example, a PDF page becomes a whiteboard background to write on).

Student content is stored **in the student's own Google Drive** (or only in their browser). Our servers keep just accounts and a small project list, so storage cost does not grow with usage. Any project can be exported as a single **`.alpha`** file and opened on another device.

## A2. Problem
Students juggle separate apps for lecture PDFs, sketching/explaining, and circuit simulation, and copy screenshots between them. Existing all-in-one tools store files on the vendor's servers (cost, privacy concerns, limits), and files stay locked inside the vendor's app.

## A3. Goals and non-goals

**Goals**
1. One workspace where whiteboard, PDF and circuit tools run together without losing state when switching.
2. Cross-tool actions that save real time (PDF page → board, circuit → board).
3. Students own their data: it lives in their Google Drive or browser and can be exported as `.alpha`.
4. Near-zero storage cost on our side, independent of the number of users and the size of their files.
5. Arabic (RTL) and English interface from day one.
6. A consistent visual identity across the shell and tools.

**Non-goals (this release)**
- Offline use (no service worker; browser storage is only a save buffer and cache).
- Real-time collaboration or sharing inside the app (users share `.alpha` files or Drive links).
- Embedding Stirling-PDF's own interface; mobile/desktop native apps.
- Storing user files on our servers (except transient processing in online PDF tools).
- Re-implementing any tool engine. We integrate, we do not rewrite.

## A4. Users
*(Assumptions, to be validated in beta.)*

| Persona | Needs | Typical session |
|---|---|---|
| **Engineering student** | Annotate lecture PDFs, sketch derivations, simulate circuits from assignments | PDF on the left, circuit on the right; paste circuit image into a board |
| **Medical student** | Annotate large slide/atlas PDFs with images, draw diagrams, keep notes per subject | PDF + board; many large files; uses several devices |
| **Both** | Phone/tablet/laptop use, Arabic UI, free to use, files kept safe | Opens the same project on two devices |

Primary device: laptop/desktop (full workspace). Phone/tablet: single-pane viewing and light editing (split view is disabled below 768 px).

## A5. Release plan

| Release | Contents | Phases (`docs/PROGRESS.md`) |
|---|---|---|
| **R1 — Beta/MVP** | Accounts, launcher, workspace (tabs + split), board, circuit (native UI with brand colors), PDF viewer + annotations, local storage, Google Drive storage, `.alpha` export/import, PDF→board and circuit→board, legal pages, security controls (`SEC`) | 0–8, 11 |
| **R2** | Online PDF tools (OCR, Office↔PDF, compress, merge/split) via Stirling | 9 |
| **R3** | Custom circuit toolbar and redesigned PDF toolbars, study templates | 10 |
| **Later** | Guest mode, project duplication/search, sharing, offline mode, more languages | — |

A private beta can run while the Google OAuth app is in *Testing* (max 100 test users; Drive links expire after 7 days). Public launch requires the OAuth app to be published and verified (Tech §5.3, §20).

Priorities: **P0** = required for R1; **P1** = R2/R3 or first update after R1; **P2** = later.

## A6. Functional requirements

### A6.1 Accounts and settings (`AUTH`)
| ID | Requirement | Pri | Acceptance criteria |
|---|---|---|---|
| AUTH-1 | Sign in/up with Google; the same consent screen grants Drive access (scope `drive.file`) | P0 | New user reaches the launcher after one consent screen; Drive shows as connected when the scope was granted; if the user unticks Drive, the app continues in local mode and offers "Connect Google Drive" |
| AUTH-2 | Sign in/up with email | P0 | User can create an account and sign in; default storage is local; a dismissible card offers "Connect Google Drive" |
| AUTH-3 | Connect, disconnect and reconnect Google Drive from Settings | P0 | After disconnect, the token is deleted server-side and revoked at Google; projects remain in the user's Drive; reconnecting shows them again |
| AUTH-4 | Delete account | P0 (launch) | Removes account, project index and token; the screen states that files in Drive/browser are not deleted |
| AUTH-5 | Language (Arabic/English) and theme (light/dark) settings | P0 | Switching language flips `dir` (RTL/LTR) without reload loss of state; choice persists |
| AUTH-6 | Guest use without an account | P2 | — |

### A6.2 Launcher and projects (`LAUNCH`)
| ID | Requirement | Pri | Acceptance criteria |
|---|---|---|---|
| LAUNCH-1 | Launcher with three cards: New Whiteboard, PDF, Circuit | P0 | Each card creates a project (or item) and opens the workspace in ≤ 2 clicks |
| LAUNCH-2 | Recent projects list with storage badge: Google Drive / This device / On another device | P0 | Projects from the user's index appear on every device; local projects from another device are greyed with the hint "Open a .alpha file" |
| LAUNCH-3 | Open a `.alpha` file (button, drag-and-drop, Google Drive picker) | P0 | See `ALPHA-*` |
| LAUNCH-4 | Rename and delete project | P0 | Delete moves Drive files to Drive trash; local data is removed after confirmation |
| LAUNCH-5 | Move project: "Save to Google Drive" | P0 | Progress bar; after completion the project opens from Drive on another device |
| LAUNCH-6 | Move project: "Keep only on this device" | P1 | Files downloaded and pinned locally; optional prompt to trash the Drive folder |
| LAUNCH-7 | Search/filter by subject; duplicate project | P2 | — |

### A6.3 Workspace (`WS`)
| ID | Requirement | Pri | Acceptance criteria |
|---|---|---|---|
| WS-1 | Tabs: open several documents (board, PDF, circuit), add with `+`, close, reorder | P0 | Switching tabs never resets a tool: the circuit keeps its state, the PDF keeps its page and zoom, the board keeps its view. Verified by an automated mount-counter test |
| WS-2 | Split view: two panes, vertical or horizontal, draggable divider | P0 | Dragging works over embedded tools; swapping panes or changing layout does not reload any tool; disabled below 768 px width |
| WS-3 | Save status indicator | P0 | Shows one of: Saved to Google Drive · Saving… · Saved on this device · Waiting for connection · Reconnect Google Drive |
| WS-4 | Warn before leaving when unsaved Drive changes exist | P0 | Browser's standard "leave site?" dialog appears only if data would otherwise be lost |
| WS-5 | Restore tab layout when reopening a project | P1 | — |
| WS-6 | Keyboard shortcuts for tabs and split | P2 | — |

### A6.4 Whiteboard (`BOARD`)
| ID | Requirement | Pri | Acceptance criteria |
|---|---|---|---|
| BOARD-1 | Full Excalidraw editing feature set (shapes, freehand, text, images, export PNG/SVG) | P0 | Matches the package's built-in UI |
| BOARD-2 | Automatic saving and restore of the board, including images | P0 | Reload or open on another device → identical board |
| BOARD-3 | Images larger than 4 MB are compressed/resized automatically before insertion | P0 | No "file too large" error for normal photos and PDF pages |
| BOARD-4 | Arabic UI strings and RTL | P0 | Excalidraw runs in `ar-SA` when the app language is Arabic |
| BOARD-5 | Study templates panel (grids, anatomy outlines, circuit-sketch frames) | P1 | Template inserts as editable elements |
| BOARD-6 | Live collaboration | Not planned | — |

### A6.5 Circuit simulator (`CIRC`)
| ID | Requirement | Pri | Acceptance criteria |
|---|---|---|---|
| CIRC-1 | Full CircuitJS1 simulation engine and editor inside the workspace | P0 | All native features reachable (native menu visible in R1) |
| CIRC-2 | Automatic saving and restore of circuits | P0 | Reload/other device → identical circuit |
| CIRC-3 | Brand colors for canvas and chrome | P0 | Light/dark variants applied; applying a theme does not lose the circuit |
| CIRC-4 | Pause simulation when the tab is hidden (option; default on for mobile) | P1 | CPU use drops when hidden |
| CIRC-5 | Custom toolbar (run/pause, reset, timestep, component palette) with "Advanced menu" toggle | P1 (R3) | Every action still reachable via custom UI or advanced menu |
| CIRC-6 | Arabic interface strings | P1 | `locale_ar` added to the fork |
| CIRC-7 | Dropbox/Drive/short-URL features of CircuitJS1 | Removed | Storage is handled by the app |

### A6.6 PDF reader and annotator (`PDF`)
| ID | Requirement | Pri | Acceptance criteria |
|---|---|---|---|
| PDF-1 | Add a PDF from the device or from Google Drive (Picker) | P0 | A 50 MB PDF opens; first page visible within 5 s on a mid-range laptop and broadband |
| PDF-2 | View: scroll, zoom, page thumbnails, text selection, search | P0 | — |
| PDF-3 | Annotate: highlight, freehand ink, text, stamp/image, with undo/redo | P0 | Annotations persist after reload and appear on another device |
| PDF-4 | Annotations are stored separately from the PDF, linked to the PDF by its content hash | P0 | The same PDF added on another device shows the same annotations |
| PDF-5 | Download an annotated PDF | P0 | Highlights/ink/text visible in another PDF viewer |
| PDF-6 | Page operations: rotate, reorder, delete, insert image page | P1 | Result is a new PDF version; user is told annotations do not carry over to a restructured PDF |
| PDF-7 | Large-file handling (warn above ~100 MB on mobile; progress when downloading from Drive) | P0 | No crash on 200 MB PDF on desktop |

### A6.7 Cross-tool actions (`INT`)
| ID | Requirement | Pri | Acceptance criteria |
|---|---|---|---|
| INT-1 | PDF page → board | P0 | Page appears as a locked, resizable image the user can draw over; target board is chosen automatically (other visible pane, else latest board, else new board) |
| INT-2 | Circuit → board | P0 | Circuit appears as an image/SVG on the board |
| INT-3 | Board → PDF (append as a page) | P1 | New PDF version created |
| INT-4 | Selected PDF text → text note on board with link back to the page | P1 | Clicking the link opens the PDF at that page |

### A6.8 Storage and Google Drive (`STORE`)
| ID | Requirement | Pri | Acceptance criteria |
|---|---|---|---|
| STORE-1 | **Local mode:** everything saves silently to the browser; no consent banners or prompts | P0 | No dialog appears in Chrome, Safari or Firefox while saving |
| STORE-2 | **Drive mode:** everything saves to `My Drive/Aboard/<project>/` in the user's Drive | P0 | Files visible in Drive; renaming/moving files in Drive does not break the project |
| STORE-3 | Every change is written to the browser first, then uploaded to Drive | P0 | Closing the tab or losing the connection loses no more than the last second of work; pending uploads resume |
| STORE-4 | Editing the same project from two devices does not silently overwrite work | P0 | Boards merge; circuits/annotations produce a "conflict copy"; files never conflict |
| STORE-5 | Expired/revoked Drive access: banner "Reconnect Google Drive"; work continues locally | P0 | No data loss; after reconnect, pending changes upload |
| STORE-6 | Google Drive full: banner; work continues locally; export suggested | P0 | — |
| STORE-7 | Large files uploaded once, deduplicated by content hash | P0 | Adding the same PDF twice stores it once |
| STORE-8 | Browser cache of Drive files with automatic eviction | P1 | Cache stays under the app cap; unsynced data is never evicted |
| STORE-9 | Request protection from browser auto-eviction in local mode, only where it is silent | P0 | No permission prompt in Firefox |

### A6.9 `.alpha` project file (`ALPHA`)
| ID | Requirement | Pri | Acceptance criteria |
|---|---|---|---|
| ALPHA-1 | Export the whole project as one `.alpha` file (boards, circuits, PDFs, annotations, images) | P0 | File opens on another device/browser with an identical project |
| ALPHA-2 | Import by button, drag-and-drop, or Google Drive picker | P0 | Progress bar; works on iPhone (no file-type filter that greys out the file) |
| ALPHA-3 | Integrity and safety checks on import (format check, hash check, size/entry limits, safe paths) | P0 | A tampered or malformed file is rejected with a clear message and no partial project remains |
| ALPHA-4 | If the project already exists, import as a copy with new IDs | P0 | Original untouched |
| ALPHA-5 | Versioned format with migration path | P0 | Newer-format files show "update the app" message |
| ALPHA-6 | Export options: include PDFs (default on), include annotated copies (default off) | P1 | — |
| ALPHA-7 | Export directly to Google Drive | P1 | — |
| ALPHA-8 | Large exports stream to disk where the browser allows (Chromium desktop); capped in-memory export elsewhere with a clear message | P0 | 500 MB export succeeds on Chrome desktop |

### A6.10 Online PDF tools (`PDFX`) — R2
| ID | Requirement | Pri | Acceptance criteria |
|---|---|---|---|
| PDFX-1 | OCR (make scanned PDF searchable) | P1 | Result saved into the project as a new PDF |
| PDFX-2 | Office → PDF and PDF → Office conversion | P1 | — |
| PDFX-3 | Compress, merge, split | P1 | — |
| PDFX-4 | Only signed-in users; per-user limits (size, rate, concurrency); progress and cancel | P1 | Requests without a valid login are rejected; Stirling is not reachable from the internet |
| PDFX-5 | One-time notice that these tools upload the file to our server for processing | P1 | Notice shown before first use |

### A6.11 Legal and compliance (`LEGAL`)
| ID | Requirement | Pri |
|---|---|---|
| LEGAL-1 | Privacy policy and terms of use pages (required for Google verification); describe Drive usage and Limited Use compliance | P0 (launch) |
| LEGAL-2 | Open-source licenses page and link to the public source of the CircuitJS1 fork (GPL) | P0 (launch) |
| LEGAL-3 | Account and data deletion instructions | P0 (launch) |

### A6.12 Security and privacy (`SEC`)
| ID | Requirement | Pri | Acceptance criteria |
|---|---|---|---|
| SEC-1 | **Strict per-user isolation in the database:** row-level security (RLS) enabled on every table, least-privilege grants, no access for the anonymous role | P0 | Automated RLS test suite passes in CI; a signed-in user cannot read, change, delete or create rows for another user even when they know the other user's IDs; a CI guard finds no table without RLS |
| SEC-2 | **Google tokens unreachable** from other users and from browser storage | P0 | Token tables return "permission denied" to clients; after Google sign-in no Google token exists in `localStorage`/IndexedDB (automated check); refresh tokens encrypted at rest and never logged |
| SEC-3 | Drive access limited to the user's own Drive and only to files the app created or the user picked | P0 | Scope is `drive.file` only; a two-account test shows no cross-access |
| SEC-4 | **Local data isolated per account** on shared computers | P0 | Two accounts in one browser cannot see each other's local projects; a "shared computer" option deletes local data on sign-out after syncing |
| SEC-5 | **API keys and secrets protected:** no secret in the browser bundle or repository; public keys restricted; documented rotation | P0 | Bundle grep and secret scanning pass in CI; Picker key restricted by API and referrer; rotation runbook rehearsed once |
| SEC-6 | **HTTP requests secured:** every endpoint authenticated (except the OAuth callback), input-validated, size-limited and rate-limited; exact-origin CORS; HTTPS with security headers and CSP | P0 | Endpoint inventory (Tech §14.5) matches the implementation; exceeding a limit returns 429; unknown origins receive no CORS headers; a security-header scan passes |
| SEC-7 | Imported and embedded content is treated as data, never as code | P0 | Zip bomb, path traversal and oversized `.alpha` files are rejected; project titles, element text and links cannot inject HTML or script; circuit SVG is never inlined into the page |
| SEC-8 | Online PDF tools isolated from the internet and from other users | P1 (R2) | Stirling is unreachable externally; no file names or content in logs; per-user limits enforced |
| SEC-9 | Account protection: email confirmation, CAPTCHA, auth rate limits; MFA optional | P0 (MFA P1) | Settings applied as listed in Tech §14.7 |
| SEC-10 | Supply-chain controls | P0 | Pinned versions, lockfile, dependency audit and secret scanning in CI; script-execution check on every CircuitJS1 merge |
| SEC-11 | Incident readiness | P0 | Key-rotation runbook, alerts on authentication/error spikes, published security contact |
| SEC-12 | Security review before public launch | P0 | The checklist in Tech §14.12 is fully checked |

## A7. Key user flows
The step-by-step flows (sign-up with Google, sign-up with email, create, open on another device, export, import, move project, token expiry, Drive full, disconnect) are in **Tech §17**. They are normative: UI work follows them.

## A8. Non-functional requirements

| Area | Requirement |
|---|---|
| **Data safety** | No silent data loss: every edit reaches browser storage within ~1 s; Drive upload within ~30 s of the last edit under normal conditions; unsynced changes never evicted |
| **Performance** *(proposed)* | Workspace interactive within 3 s on a mid-range laptop with broadband; autosave never blocks typing/drawing; first PDF page within 5 s for a 50 MB file |
| **Compatibility** | Latest two versions of Chrome, Edge, Firefox, Safari (macOS and iOS), Chrome on Android. Split view only ≥ 768 px |
| **Security** | Requirements `SEC-1…SEC-12` and Tech §14: per-user isolation through RLS and least-privilege grants; secrets never in the browser; Google tokens encrypted on the server and never stored in the browser; Google access tokens in memory only; authenticated, validated and rate-limited endpoints; exact-origin CORS; security headers and CSP |
| **Privacy** | User content is not stored on our servers; files sent to online PDF tools are processed and deleted; no Drive content, file names or PDF text sent to analytics or logs |
| **Accessibility** | App shell (launcher, tabs, dialogs, settings) keyboard-operable and screen-reader labelled, aiming at WCAG 2.2 AA; embedded tools follow their upstream accessibility |
| **Internationalization** | Arabic (RTL) and English; logical CSS properties; dates/numbers localized |
| **Scalability and cost** | Server cost independent of stored content; Supabase load limited to the project index and token calls; Stirling cost bounded by per-user limits |
| **Maintainability** | Each tool behind an adapter; exact version pins; CircuitJS1 patches isolated and listed; upstream merge monthly |
| **Licensing** | Compliance with MIT/GPL/Apache/BSD terms (Tech §16) |

## A9. Success metrics
*(Proposed targets; calibrate after the first beta cohort.)*

| Metric | Definition | Target |
|---|---|---|
| Activation | New users who create a project and make an edit in their first session | ≥ 60 % |
| Drive adoption | Google sign-ups with Drive connected | ≥ 85 % |
| Multi-tool use | Sessions that have ≥ 2 tools open | ≥ 40 % |
| Retention | Users active in week 4 after sign-up | ≥ 25 % |
| Save reliability | Successful Drive saves / attempts (after retries) | ≥ 99.5 % |
| Data loss | Confirmed data-loss reports | 0 |
| `.alpha` round-trip | Import success of files exported by the app | ≥ 99 % |
| Reconnect friction | Users who reconnect Drive within 24 h of a reconnect banner | ≥ 70 % |

## A10. Analytics
Collect only aggregate, content-free events (sign-up, project created, tool opened, save state transitions, export/import success/failure, error codes). Never send file names, titles, Drive IDs or document content. Tool choice: see Open Question Q9.

## A11. Dependencies, assumptions, constraints
- **Google:** OAuth app verification (basic, because `drive.file` is non-sensitive), a domain with privacy policy and terms; Drive API rate limits; Picker API.
- **Supabase:** Auth, Postgres, Edge Functions.
- **Upstream projects:** Excalidraw 0.18.1 (MIT), CircuitJS1 fork of `pfalstad/circuitjs1` (GPL-2.0-or-later), EmbedPDF (MIT), Stirling-PDF official image (MIT core).
- **Assumption:** most users have a Google account; many students use it already.
- **Assumption:** students accept that local-only projects live in one browser unless exported or moved to Drive.
- **Constraint:** the CircuitJS1 fork's source must be published.
- **Constraint:** Google's Limited Use rules forbid using Drive data for ads or selling it.

## A12. Product risks
| Risk | Impact | Mitigation |
|---|---|---|
| Google verification delay | Cannot onboard beyond 100 test users | Start verification during Phase 7; legal pages ready early |
| Users confused between local and Drive projects | Think files are lost | Clear storage badges (LAUNCH-2), persistent save status (WS-3), one-click "Save to Google Drive" |
| Browser data cleared in local mode | Lost projects | Silent persistence request, Drive offer after first project, periodic export reminder |
| Online PDF tools abused or costly | Server cost | Auth, per-user limits, size caps (PDFX-4) |
| Medical students upload patient-identifiable material | Privacy/legal exposure | Terms clause and in-app notice for online tools; decision in Q11 |
| GPL obligations misunderstood | Legal risk | Public fork, licenses page; legal review before launch (Q6) |
| Three engines in one app is heavy on phones | Poor mobile experience | Lazy-load modules, pause hidden circuits, disable split on small screens |
| Scope creep | Delay | P0/P1 split in A5; R2/R3 gated |
| Security incident (one user reaching another user's data, key leak) | Loss of trust, legal exposure | `SEC-*` requirements, RLS test suite in CI, secret scanning, launch checklist (Tech §14) |

## A13. Open questions (decisions needed from the owner)

| # | Question | Recommended default |
|---|---|---|
| Q1 | Final product name | **Decided: Aboard** (short for “Alpha board”). The `.alpha` file extension is kept as chosen by the owner |
| Q2 | Email sign-in method | Email one-time link/code (no passwords to manage) |
| Q3 | Guest mode without account | Not in R1 |
| Q4 | Business model and limits | Free in R1; per-user daily limits on online PDF tools |
| Q5 | Include online PDF tools in R1? | No, R2 |
| Q6 | Open-source the whole app (GPL-compatible) or only the CircuitJS fork? | Decide with legal advice before launch; simplest safe path is open-sourcing the whole app |
| Q7 | Hosting for the Next.js app | Vercel |
| Q8 | Target beta date and first cohort size | Needed to schedule Google verification |
| Q9 | Analytics tool | A privacy-friendly tool, events per A10 only |
| Q10 | Languages beyond Arabic and English | None in R1 |
| Q11 | Policy for patient-identifiable data | Terms clause + warning in online tools; no scanning |
| Q12 | Require MFA (optional or mandatory)? | Optional in R1 (SEC-9); reconsider after launch |

## A14. Glossary
- **Project:** a named collection of items (boards, circuits, PDFs) shown as one entry in the launcher.
- **Item:** one board, circuit or PDF inside a project.
- **Local mode / Drive mode:** where a project's content is stored (browser vs the user's Google Drive).
- **`.alpha`:** single-file export of a project (ZIP container, Tech §12).
- **Content hash (SHA-256):** fingerprint used to identify a file regardless of its name or location.
- **Outbox:** queue of changes waiting to be uploaded to Drive.

## A15. Traceability (requirements → spec files)
| Area | Spec sections | Files in `docs/specs/` |
|---|---|---|
| AUTH | §5.3–5.4, §9, §10 | setup-and-deploy.md, database.md, google-drive.md |
| LAUNCH | §11.5, §11.6, §17 | storage-layer.md, architecture.md |
| WS | §6 | architecture.md |
| BOARD | §7.1 | modules.md |
| CIRC | §7.2 | modules.md |
| PDF | §7.3 | modules.md |
| INT | §8 | modules.md |
| STORE | §10, §11 | google-drive.md, storage-layer.md |
| ALPHA | §12 | alpha-format.md |
| PDFX | §7.4, §13 | modules.md, setup-and-deploy.md |
| SEC | §9, §10, §14 | database.md, google-drive.md, security.md |
| LEGAL | §14.11, §16 | security.md, architecture.md |
| Release plan | §19 | `docs/PROGRESS.md` |
