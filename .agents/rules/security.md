---
trigger: always_on
description: "Aboard security rules for every change: user isolation (RLS), secrets and API keys, HTTP requests, tokens, browser safety, CI checks. Full detail in docs/specs/security.md."
---

# Security rules (always on)

Principle: deny by default, least privilege, never trust the browser. These rules implement `SEC-1…SEC-12` in `docs/PRD.md`. Full specification, code and tests: `docs/specs/security.md` (§14). Read it before any change to auth, database, Drive, Edge Functions, the gateway, headers, or import/export.

## 1. User isolation — a user can never reach another user's data (SEC-1, SEC-3, SEC-4)
- Every table in `public` has `enable row level security` in the **same migration** that creates it. A table without RLS must never exist.
- Start from zero: `revoke all ... from anon, authenticated`, then grant only what the app needs. Use column lists in `grant update (...)` so `id`, `user_id`, `created_at` stay immutable.
- One policy per command (`select`, `insert`, `update`, `delete`), each `to authenticated`, each checking `user_id = (select auth.uid())`. Never `using (true)`. `anon` gets no table access.
- Server-only tables (`google_drive_links`, `oauth_states`, `rate_limits`): RLS on, **no policies**, all privileges revoked. Only Edge Functions (service role) touch them.
- `security definer` functions only when required, always with `set search_path = ''`, and `revoke execute ... from public, anon` unless clients must call them.
- IDs are random UUIDs, never sequential.
- Every new table or policy gets pgTAP cases in `supabase/tests/rls.test.sql` proving: owner can, other user cannot (select/update/delete/insert-for-other), `anon` cannot. Use skill `db-migration`.
- Local data: the IndexedDB name is `aboard:<userId>`, opened only while that user is signed in; "shared computer" sign-out deletes it after syncing.
- Google Drive: scope `https://www.googleapis.com/auth/drive.file` only. Never request `drive` or `drive.readonly`.

## 2. Secrets and API keys (SEC-5)
- Anything that reaches the browser is public. Every `NEXT_PUBLIC_*` value is inlined into the bundle: never put a secret in one.
- Public by design: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (safe only because of RLS), `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_APP_ID`, `NEXT_PUBLIC_PDF_API_URL`.
- `NEXT_PUBLIC_GOOGLE_API_KEY` (Picker) is public but must be restricted in Google Cloud: API = Picker only, HTTP referrers = our domains only.
- Secrets live only in Supabase Edge Function secrets: `GOOGLE_CLIENT_SECRET`, `TOKEN_ENC_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS). Never in the web app, Vercel env, gateway, repo, logs, tests or screenshots.
- `.env*` files are git-ignored. Never commit real values; use `.env.example` with placeholders.
- No secret may be hard-coded in any tracked file, including spikes/. Config files must read secrets from environment variables; .env.example may show placeholders only.
- Next.js server code that reads a secret imports `server-only`.
- If you find a secret in code or history, stop and tell the owner; follow the rotation runbook (`docs/specs/security.md` §14.10).

## 3. Google tokens (SEC-2)
- Access token: memory only (`DriveTokenManager`), sent only in the `Authorization` header.
- Refresh token: encrypted (AES-256-GCM) in `google_drive_links`; decrypted only inside Edge Functions.
- After Google sign-in, send `provider_refresh_token` to `drive-link-token`, then call `supabase.auth.refreshSession()` so no Google token stays in browser storage. An automated test must prove `localStorage`/IndexedDB contain no `provider_token`/`provider_refresh_token`.
- Never write tokens to `localStorage`, `sessionStorage`, IndexedDB, URLs, logs or error messages.

## 4. HTTP requests and endpoints (SEC-6)
- HTTPS only. Credentials only in the `Authorization: Bearer` header, never in URLs or query strings.
- Order in every endpoint: authenticate (`requireUser`) → rate-limit → validate input with `zod` (types, lengths, enums, reject unknown fields) → act.
- Exception: `drive-callback` has no bearer token; it is protected by a one-time `state` (10 minutes) + PKCE and an IP rate limit.
- CORS: exact origin allow-list from env; never `*`, never reflect an arbitrary `Origin`; unknown origins get no CORS headers.
- Rate-limit every endpoint (`check_rate_limit`); the limiter fails closed. Body limits: functions ≤ 64 KB, gateway per `MAX_UPLOAD_MB`. Timeouts on all outbound calls.
- Redirects only to validated relative paths (no `//`, no backslashes).
- Clients get generic errors (`{ code }`). Logs never contain tokens, request bodies, file names, Drive IDs or document text.
- No string-built SQL; use the Supabase client or `rpc`.
- Every new endpoint is added to the endpoint table in `docs/specs/security.md` §14.5 in the same change.
- Security headers come from `next.config.ts` `headers()` (CSP, HSTS, `nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP `same-origin-allow-popups`). Do not loosen the CSP for the whole app; give `/circuit/:path*` its own rule if GWT needs it.

## 5. Browser-side safety (SEC-7)
- Never use `dangerouslySetInnerHTML`, `innerHTML` or `document.write` with user or imported data. Use `textContent`/React rendering; sanitize with DOMPurify if rich text is ever added.
- Circuit SVG is used only as a `Blob`/`<img>` source, never inlined into the DOM.
- `.alpha` import treats everything as data: entry/size limits, safe paths only (`files/…`, no `..`, no absolute paths), SHA-256 check, `zod` schema. Strip `javascript:` and `data:` links from board elements.
- `localStorage` holds only the Supabase session and language/theme. No project data, no Google tokens.
- Only third-party script allowed: `https://apis.google.com` (Picker), loaded on demand.
- After every upstream merge of the CircuitJS fork run `grep -rn "eval(\|new Function\|\$wnd.eval" vendor/circuitjs1/src` and report any new hit (the iframe is same-origin).

## 6. Online PDF tools (SEC-8)
- Stirling runs only on the Docker `internal` network with no published port. The browser talks only to `services/gateway`.
- The gateway verifies the Supabase JWT, allow-lists tool names, checks file magic bytes, enforces size/rate/concurrency limits, streams bodies, and never logs file names or content.

## 7. Supply chain and CI (SEC-10)
- Exact version pins for engines, committed lockfile, `--frozen-lockfile` in CI, dependency audit, gitleaks pre-commit + CI, bundle grep for `service_role`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENC_KEY`, `-----BEGIN`.
- CI guard query must return zero rows: `select tablename from pg_tables where schemaname = 'public' and not rowsecurity;`

## 8. When to stop and ask the owner
Stop and ask before: changing RLS, grants or policies on an existing table; changing OAuth scopes; adding an endpoint or a third-party script; deleting user data; any change to token storage or encryption. Before declaring such a change done, run skill `security-review`.
