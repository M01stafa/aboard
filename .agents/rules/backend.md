---
trigger: glob
globs: "supabase/**, services/**, apps/web/src/core/drive/**, apps/web/src/core/storage/**, apps/web/src/core/alpha/**, apps/web/src/core/supabase.ts, apps/web/src/core/stirling.ts, .env.example"
description: "Backend and data-layer rules for Aboard: Supabase schema and RLS, Edge Functions for Google Drive tokens, Drive API usage, ProjectService/SaveQueue/IndexedDB, .alpha format, Stirling gateway and deployment."
---

# Backend and data-layer rules

Specs: `docs/specs/database.md` (§9), `docs/specs/google-drive.md` (§10), `docs/specs/storage-layer.md` (§11), `docs/specs/alpha-format.md` (§12), `docs/specs/setup-and-deploy.md` (§5, §13), `docs/specs/security.md` (§14). Requirements: `AUTH-*`, `STORE-*`, `ALPHA-*`, `PDFX-*`, `SEC-*` in `docs/PRD.md`. Security rules in `.agents/rules/security.md` always apply.

## What lives where (do not change without the owner)
| Data | Drive mode | Local mode | Supabase |
|---|---|---|---|
| Project index (title, subject, storage, Drive folder id, dates) | — | — | yes (`projects`) |
| Boards, circuits, PDFs, images, annotations | user's Google Drive | IndexedDB | never |
| Google refresh token | — | — | encrypted, server-only (`google_drive_links`) |

User content never goes to Supabase tables, Supabase Storage, Vercel functions or logs.

## Supabase database (§9)
- Migrations in `supabase/migrations/NNNN_name.sql`, forward-only; never edit an applied migration. Use skill `db-migration` for any schema change.
- Tables: `profiles`, `projects`, `google_drive_links`, `oauth_states`, `rate_limits`. Functions: `handle_new_user`, `touch_updated_at`, `check_rate_limit`, `get_drive_status`.
- `projects.id` is generated on the client (UUID v4). `updated_at` is set by trigger (server time).
- The client reads Drive status only through `rpc('get_drive_status')`, which never returns token data.

## Edge Functions (§10.2–10.4)
- Functions: `drive-connect`, `drive-callback` (`verify_jwt = false`, protected by `state` + PKCE), `drive-link-token`, `drive-token`, `drive-disconnect`. Shared code in `supabase/functions/_shared/{env,http,supabase,crypto,google,ratelimit}.ts`.
- Each function (except `drive-callback`) starts with `requireUser(req)`, then `rateLimit(...)`, then input validation.
- Use the shared `handler()` wrapper: OPTIONS handling, exact-origin CORS, `{ code }` errors, no token logging.
- Refresh tokens are encrypted with AES-256-GCM (`TOKEN_ENC_KEY`), random 12-byte IV per write.
- Check the granted scope string: refuse to link without `drive.file`.
- `drive-token` returns only `{ access_token, expires_at }`. On Google `invalid_grant` mark the link revoked and return `409 reconnect_required`.
- Secrets via `supabase secrets set`; deploy with `supabase functions deploy <name>`.

## Google Drive API (§10.5–10.11)
- Only `src/core/drive/*` calls Google. Access token from `DriveTokenManager` (memory only, refresh 60 s before expiry, single in-flight request).
- Identify Aboard files by `appProperties` (`aboardKind`, `aboardProjectId`, `aboardItemId`, `aboardFileKey`), never by name. Layout: `My Drive/Aboard/<title> (<id>)/{project.json, boards/, circuits/, pdfs/, annotations/, files/}`.
- Uploads: multipart below 5 MB, resumable at or above 5 MB (8 MiB chunks). Files under `files/` are content-addressed by SHA-256 and written once.
- Retries: 401 → refresh token once; 429, 5xx, 403 rate-limit reasons → exponential backoff with jitter, max 5 tries. 403 `storageQuotaExceeded` → stop Drive uploads, keep saving locally, show the "Drive full" banner.
- Conflicts: compare `headRevisionId` before updating. Boards merge with `reconcileElements`; circuits/annotations save a "conflict copy"; files never conflict.
- Picker uses the restricted API key and the current access token; picking grants access to that file only.

## Storage layer (§11)
- Modules call `ProjectService` only. Providers: `LocalProvider` (IndexedDB is the store), `DriveProvider` (Drive is the store, IndexedDB is buffer + cache).
- Dexie database name `aboard:<userId>`; stores `projects`, `items`, `files`, `outbox`, `meta`. Schema changes need a new `db.version(n)` with an upgrade function.
- SaveQueue: write to IndexedDB first (500 ms debounce), mark dirty, coalesce one outbox entry per item; upload after 3 s idle, at most every 30 s; flush on tab close, project switch, `visibilitychange → hidden`, export.
- Never evict dirty rows or outbox entries. Drive-mode cache evicts least-recently-used clean files above 70 % of quota or the 2 GB app cap. Local-mode rows are pinned.
- `navigator.storage.persist()` only where it is silent (skip Firefox).
- Emit `save:status` for the top-bar indicator.

## `.alpha` format (§12)
- ZIP (ZIP64 when needed) via `@zip.js/zip.js`. First entry `mimetype` = `application/x-alpha-project`, stored uncompressed.
- `manifest.json` validated with `zod`; `formatVersion` integer; newer formats are rejected with an "update the app" message; changes need a migration function.
- Import: verify `mimetype`, limits (≤ 5,000 entries, ≤ 10 GB), safe paths, SHA-256 of each file; existing project id → import as a copy with new ids.
- Export streams to disk with `showSaveFilePicker` where available; otherwise in-memory with caps (1 GB desktop, 300 MB mobile). Download type `application/octet-stream`. No `accept` filter on iOS file inputs.

## Stirling gateway and deploy (§7.4, §13)
- `services/gateway` (Node 22 + Hono): verify Supabase JWT, allow-listed tools mapped to fixed Stirling endpoints (`/api/v1/misc/ocr-pdf`, `/api/v1/misc/compress-pdf`, `/api/v1/convert/file/pdf`; confirm others in Stirling's Swagger), per-user size/rate/concurrency limits, streaming.
- Stirling: full image, `internal` Docker network only, no `ports:`, memory limit, pinned version tag after testing.
- Caddy terminates TLS for `api.<domain>` and proxies `/pdf/*` to the gateway only.
