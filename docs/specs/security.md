# Aboard spec — Security and privacy (full specification)

> Part of the Aboard technical specification v3.2 (Next.js 16.4 + React 19.3 + Supabase).
> Section numbers (§N) are shared across all files in `docs/specs/`; the map is in `AGENTS.md` → "Spec map".
> Requirement IDs such as `SEC-1` or `PDF-3` are defined in `docs/PRD.md`.
> Facts were checked against upstream sources, npm and official docs on 2026-10-07. Items marked **VERIFY** must be confirmed in source or docs before coding against them; record the result in `docs/PROGRESS.md` (VERIFY log), then update this file.
> If the implementation must differ from this spec, change the spec in the same commit and log the decision in `docs/PROGRESS.md`.

## 14. Security and privacy

Principle: **deny by default, least privilege, never trust the browser.** Every rule here maps to a `SEC-*` requirement in `docs/PRD.md`. The always-on summary of these rules is `.agents/rules/security.md`.

### 14.1 Assets and threats
| Asset | Main threats | Main controls |
|---|---|---|
| Other users' projects and files | User A reading/changing user B's data (broken access control) | RLS on every table + least-privilege grants (§9.1), RLS test suite in CI (§14.3), Drive scope `drive.file`, per-user local databases (§14.6) |
| Google refresh tokens | Database leak, XSS, logs | Encrypted at rest (AES-256-GCM), table unreachable by clients, never in browser storage or logs (§10.1, §14.6) |
| Secret keys (client secret, encryption key, service role) | Leak via bundle, repo, logs, CI | Secret/public key table (§14.4), secret scanning, rotation runbook (§14.10) |
| Accounts | Credential stuffing, fake sign-ups, session theft | Email confirmation, CAPTCHA, rate limits, optional MFA (§14.7) |
| HTTP endpoints | Abuse, CSRF, open redirect, injection, DoS | Auth on every endpoint, input validation, size/rate limits, exact CORS (§14.5) |
| Online PDF tools / server | Public exposure, data retention | Private network, gateway (§14.8) |
| Imported `.alpha` / PDFs / circuits | Malicious files (zip bombs, path traversal, script injection) | Import limits and validation (§12.5), safe rendering (§14.6) |
| Supply chain | Malicious or vulnerable dependency | Pins, lockfile, audit, secret scanning (§14.9) |

### 14.2 User isolation matrix — "user A can never reach user B's data"
| Store | Isolation mechanism | Verified by |
|---|---|---|
| Supabase `profiles`, `projects` | RLS: every policy `user_id = auth.uid()`; `anon` has no privileges; users cannot change `id`, `user_id`, `created_at` | pgTAP suite (§14.3) |
| Supabase `google_drive_links`, `oauth_states`, `rate_limits` | RLS enabled with **no policies** and all privileges revoked: clients get "permission denied"; only Edge Functions (service role) touch them | pgTAP suite |
| Google Drive | Each user's own Drive, accessed with that user's token; scope `drive.file` (only files the app created or the user picked) | Spike S4 test with two accounts |
| IndexedDB (local mode and Drive cache) | Database name includes the user id (`aboard:<userId>`); opened only while that user is signed in (§14.6) | e2e test: sign in as A, create project, sign out, sign in as B → project not visible |
| Stirling / gateway | No persistence; per-request temp files; results returned only to the requester; JWT required | Gateway integration test |
| Supabase Auth sessions | Short-lived JWT; refresh-token rotation and reuse detection (§14.7) | Supabase settings checklist |

### 14.3 RLS rules and automated verification
Rules (mandatory):
1. Every table in `public` has `enable row level security` **in the same migration that creates it**. A table without RLS must never exist; CI fails if one does (query below).
2. Every policy names the role (`to authenticated`) and checks `user_id = (select auth.uid())`. No `using (true)`.
3. Tables that must be invisible to clients get RLS **and** `revoke all ... from anon, authenticated`.
4. The service role key (bypasses RLS) is used only inside Edge Functions.
5. New columns that clients must not edit are left out of the `grant update (...)` lists.
6. IDs are random UUIDs (client-generated v4), never sequential.

CI guard (must return zero rows):
```sql
select schemaname, tablename from pg_tables
where schemaname = 'public' and not rowsecurity;
```

`supabase/tests/rls.test.sql` (run with `supabase test db`; **VERIFY** that inserting minimal rows into `auth.users` works in the local stack):
```sql
begin;
select plan(11);

insert into auth.users (id, email) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'a@test.local'),
  ('bbbbbbbb-0000-0000-0000-000000000002', 'b@test.local');      -- trigger creates profiles

-- user A creates a project
set local role authenticated;
set local request.jwt.claims = '{"sub":"aaaaaaaa-0000-0000-0000-000000000001","role":"authenticated"}';
insert into public.projects (id, title, storage) values ('11111111-1111-1111-1111-111111111111', 'A project', 'local');
select is((select count(*)::int from public.projects), 1, 'A sees own project');

-- user B cannot see, update or delete it
set local request.jwt.claims = '{"sub":"bbbbbbbb-0000-0000-0000-000000000002","role":"authenticated"}';
select is((select count(*)::int from public.projects), 0, 'B sees nothing of A');
with u as (update public.projects set title = 'hacked' where id = '11111111-1111-1111-1111-111111111111' returning 1)
  select is((select count(*)::int from u), 0, 'B cannot update A project');
with d as (delete from public.projects where id = '11111111-1111-1111-1111-111111111111' returning 1)
  select is((select count(*)::int from d), 0, 'B cannot delete A project');

-- B cannot insert a row owned by A
select throws_ok($$insert into public.projects (id, user_id, title, storage)
  values (gen_random_uuid(), 'aaaaaaaa-0000-0000-0000-000000000001', 'x', 'local')$$,
  '42501', null, 'B cannot insert for A');

-- B cannot change ownership of its own row
insert into public.projects (id, title, storage) values ('22222222-2222-2222-2222-222222222222', 'B project', 'local');
select throws_ok($$update public.projects set user_id = 'aaaaaaaa-0000-0000-0000-000000000001'
  where id = '22222222-2222-2222-2222-222222222222'$$, '42501', null, 'user_id is immutable');

-- token tables are unreachable for signed-in users
select throws_ok($$select * from public.google_drive_links$$, '42501', null, 'tokens table: permission denied');
select throws_ok($$select * from public.oauth_states$$,       '42501', null, 'oauth_states: permission denied');
select throws_ok($$select * from public.rate_limits$$,        '42501', null, 'rate_limits: permission denied');

-- anonymous role has no access at all
set local role anon;
select throws_ok($$select * from public.projects$$, '42501', null, 'anon: permission denied on projects');
select throws_ok($$select * from public.profiles$$, '42501', null, 'anon: permission denied on profiles');

select * from finish();
rollback;
```
The suite runs in CI on every pull request and before every deploy of a migration. Add a case for every new table. (The plan count must equal the number of assertions: update it when adding cases.)

### 14.4 Secrets and API keys
**Rule: anything that reaches the browser is public.** Every `NEXT_PUBLIC_*` variable is inlined into the JavaScript bundle; never put a secret in one. `.env*` files are git-ignored; real values live only in the host's secret stores.

| Key / secret | Public or secret | Lives in | Protection |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | Browser bundle | — |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable) | Public by design | Browser bundle | Safe **only because of RLS and revoked grants**; it grants nothing beyond the `anon` role (which has no table access) |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_GOOGLE_APP_ID` | Public | Browser bundle | — |
| `NEXT_PUBLIC_GOOGLE_API_KEY` (Picker) | Public, **restricted** | Browser bundle | Google Cloud restrictions: **API restriction = Picker API only** + **HTTP referrer = your domains only**; separate key for dev and prod; quota alert |
| `NEXT_PUBLIC_PDF_API_URL` | Public | Browser bundle | — |
| `GOOGLE_CLIENT_SECRET` | **Secret** | Supabase Edge Function secrets only | Never in repo, Vercel, browser or logs; rotate on exposure |
| `TOKEN_ENC_KEY` | **Secret** | Supabase Edge Function secrets; backup in a password manager | Rotation procedure §14.10 |
| `SUPABASE_SERVICE_ROLE_KEY` | **Secret (bypasses RLS)** | Edge Functions only (injected by Supabase) | Never in the web app, Vercel env, gateway, CI logs or screenshots |
| Supabase DB password, CLI access token | **Secret** | Developer machine / CI secret store | Rotate when a team member leaves |
| Gateway: `SUPABASE_URL`, `STIRLING_URL` | Not secret | Server env | Gateway verifies JWTs with the project's **public** JWKS, so it holds no signing secret (if the legacy JWT secret is used instead, treat it as a secret — **VERIFY**) |
| Google user access/refresh tokens | **Secret (user data)** | Access token: browser memory only. Refresh token: encrypted in `google_drive_links` | Never `localStorage`, IndexedDB, URL, logs (§14.6) |
| Stirling | No API key is exposed to the browser | Private network | The browser never talks to Stirling |

Controls:
- **Secret scanning:** `gitleaks` as a pre-commit hook and a CI step; enable GitHub secret scanning and push protection.
- **Bundle check in CI:** build, then grep the output for `service_role`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENC_KEY` and `-----BEGIN`; fail on any match.
- **Server-only modules:** any Next.js server code that reads a secret imports the `server-only` package so a client import fails the build.
- **Environment separation:** distinct Supabase projects and Google keys for development, preview and production; Vercel variables scoped per environment and marked sensitive.
- **Least privilege on accounts:** 2-factor authentication on GitHub, Vercel, Supabase, Google Cloud, the domain registrar and the VPS; no shared logins.

### 14.5 HTTP request and API security
**Endpoint inventory**
| Endpoint | Authentication | CORS | Rate limit | Input |
|---|---|---|---|---|
| Supabase REST (`/rest/v1`) | anon key + user JWT; **RLS decides** | Supabase | Supabase built-in | PostgREST |
| `drive-connect` | Supabase JWT | exact origin | 10 / 10 min / user | `returnTo` validated |
| `drive-callback` | none (Google redirect); protected by one-time `state` + PKCE | none | 30 / min / IP | query validated; generic error redirect |
| `drive-link-token` | Supabase JWT | exact origin | 5 / 10 min / user | token string length-checked and proven valid by a refresh call |
| `drive-token` | Supabase JWT | exact origin | 30 / min / user | none |
| `drive-disconnect` | Supabase JWT | exact origin | 5 / 10 min / user | none |
| `pdf-gateway /pdf/*` | Supabase JWT (JWKS) | exact origin | size cap, 2 concurrent jobs, hourly quota per user | allow-listed tool names, magic-byte file check |
| Google Drive API | user's access token in `Authorization` header | Google | exponential backoff | — |

**Rules (all mandatory)**
1. **HTTPS only**; HSTS with `includeSubDomains`; no mixed content.
2. **Credentials only in the `Authorization` header** — never in URLs, query strings, `localStorage` keys, logs or error messages. The OAuth callback URL carries only `code` and `state`.
3. **CORS: exact origin allow-list**, never `*`, never reflect an arbitrary `Origin`; unknown origins get no CORS headers (implemented in `_shared/http.ts`).
4. **Authenticate first, then validate, then act.** Every function calls `requireUser` (verifies the JWT with Supabase) before touching data.
5. **Validate all input** with `zod` (types, lengths, enums); reject unknown fields; request body size limits (functions ≤ 64 KB; gateway per `MAX_UPLOAD_MB`); timeouts on all outbound calls.
6. **Rate-limit every endpoint** (table above); the limiter fails **closed**.
7. **No cookie auth → no CSRF surface** for the JSON endpoints (Bearer tokens only). The one browser redirect without a bearer token (`drive-callback`) is protected by `state` + PKCE.
8. **Redirects only to relative paths** after validation (blocks open redirects: no `//`, no backslashes).
9. **Generic error messages** to clients (`{ code }` only); details only in server logs, which never contain tokens, bodies or file names.
10. **Parameterized access only:** no string-built SQL; use the Supabase client or `rpc`; database functions are `security definer` only when required, always with `set search_path = ''`.
11. **Bounded work:** pagination limits on list calls; no unbounded loops over user input.

**Security headers** — `next.config.ts`:
```ts
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://apis.google.com${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self' https://<ref>.supabase.co https://www.googleapis.com https://api.aboard.example",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "frame-src 'self' https://docs.google.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },   // keeps OAuth/Picker popups working; do NOT add COEP
];

export default {
  async headers() {
    return [
      { source: "/((?!circuit/).*)", headers: securityHeaders },             // app pages
      { source: "/circuit/:path*", headers: circuitHeaders },                // §14.6 (own CSP if GWT needs it)
    ];
  },
};
```
- The App Router emits inline bootstrap scripts, so `script-src 'self'` alone breaks the app. **R1:** `'unsafe-inline'` as above (still blocks foreign script origins). **Later:** nonce-based CSP through `proxy.ts` (Next.js 16's name for middleware; per Next.js docs, nonces force dynamic rendering).
- **VERIFY** in Spike S1/S4: what the Picker, Supabase and GWT need; header precedence when two `headers()` rules match (the negative-lookahead source avoids overlap); the COOP value with Google sign-in and Picker popups.
- Edge Functions and the gateway also send `X-Content-Type-Options: nosniff` and `Cache-Control: no-store` on token responses.

### 14.6 Browser-side protections
1. **Tokens:** the Google access token lives only in memory (`DriveTokenManager`). The refresh token never persists in the browser (§10.1: send once, then `refreshSession()`, with an automated check). The Supabase session in `localStorage` is the one unavoidable browser credential, which is why the XSS rules below matter.
2. **XSS prevention:** no `dangerouslySetInnerHTML`; no `innerHTML`/`document.write` with user or imported data (ESLint rules `react/no-danger` and `no-unsanitized` in CI). Circuit SVG is only ever used as a `Blob`/`<img>` source, never inlined into the DOM. Markdown or rich text, if added later, goes through a sanitizer (DOMPurify).
3. **Imported content is data, never code:** `.alpha` import enforces entry/size limits, safe paths (only `files/…`, no `..`, no absolute paths), SHA-256 checks and zod schema validation (§12.5). Element `link` fields from boards are restricted to `https:`, `http:`, `mailto:` and `alpha://`; `javascript:` and `data:` links are stripped on import.
4. **Circuit iframe:** same origin as the app, so a script-execution path inside it would reach the app's memory. Checked on 2026-10-07: the fork's Java sources contain no JavaScript `eval`/`new Function` (the only `eval` is the numeric expression evaluator `Expr.eval`). **Repeat this check on every upstream merge** (`grep -rn "eval(\|new Function\|\$wnd.eval"`). If a script path ever appears, serve `/circuit/` from a separate origin (e.g. `circuit.aboard.example`) and talk to it through an origin-checked `postMessage` bridge. Do not use `sandbox="allow-scripts allow-same-origin"` expecting isolation.
5. **Shared-computer isolation (local data):** the IndexedDB name is `aboard:<userId>` and it is opened only while that user is signed in; sign-out closes it. The sign-in screen offers **"This is a shared computer"**: on sign-out the app flushes pending uploads, then deletes that user's local database (and warns if something is unsynced). On Drive disconnect the local Drive cache is cleared.
6. **Local storage hygiene:** only language/theme and the Supabase session may use `localStorage`; no project data, no Google tokens.
7. **Third-party scripts:** only Google's `apis.google.com` (Picker), loaded on demand; no analytics script that can read page content (A10).

### 14.7 Account and session hardening (Supabase Auth settings)
- Email confirmation required; exact redirect URLs allow-listed (no wildcards); Site URL set.
- **CAPTCHA** (Cloudflare Turnstile or hCaptcha) on sign-up, sign-in and password reset.
- Auth rate limits configured; refresh-token rotation and reuse detection enabled (default; **VERIFY**).
- JWT expiry 1 hour (default).
- If passwords are used: minimum length ≥ 12 and leaked-password protection where the plan offers it (**VERIFY** availability); prefer one-time email codes.
- Unused providers and anonymous sign-ins disabled (until a guest mode exists).
- Optional TOTP MFA (P1).
- Account deletion cascades to `projects`, `profiles`, `google_drive_links`; the deletion screen explains that Drive/browser files remain with the user.
- Unused Supabase features switched off (Realtime, Storage buckets) and only the `public` schema exposed through the Data API.

### 14.8 Stirling and the gateway
- Stirling only on the Docker `internal` network (no published port); the browser talks to the gateway only.
- Gateway: JWT check, tool allow-list, magic-byte validation, size/rate/concurrency limits, streaming, exact-origin CORS, no logging of file names or content.
- Stirling runs `SECURITY_ENABLELOGIN=false` **only because it is unreachable from outside**; set `corsAllowedOrigins` explicitly anyway; disable unneeded endpoints in Stirling's settings (**VERIFY** setting name); pin the image to a tested version tag and update regularly; container memory/CPU limits; no host volume for uploads.
- Users are told before first use that these tools upload the file for processing (PDFX-5).

### 14.9 Supply chain and CI
- Exact version pins for the three engines; lockfile committed; `pnpm audit` (or `npm audit`) and Dependabot/Renovate with review; `--frozen-lockfile` in CI.
- CircuitJS1 fork: public repo, patches listed in `vendor/PATCHES.md`, monthly upstream merge with the `eval` check of §14.6.
- Branch protection on `main`; required reviews and CI.
- CI jobs: lint (including the security rules), typecheck, unit/e2e, **pgTAP RLS suite**, gitleaks, bundle secret grep, dependency audit.

### 14.10 Logging, monitoring, incident response
- Logs never contain tokens, request bodies, file names, Drive IDs or document text.
- Alerts (Supabase/Vercel/VPS): spikes of 401/403/429, function error rates, Google API quota, VPS disk/RAM.
- **Runbook — key leaked:**
  - *`GOOGLE_CLIENT_SECRET`*: create a new secret in Google Cloud, update the Edge Function secret, delete the old secret.
  - *`TOKEN_ENC_KEY`* (alone): add the new key, re-encrypt all rows (script), remove the old key. If the database was also exposed: revoke every refresh token at Google, delete the rows and ask users to reconnect.
  - *`SUPABASE_SERVICE_ROLE_KEY`*: rotate the project API keys in the Supabase dashboard (**VERIFY** current procedure), redeploy functions, review logs for the exposure window.
  - *Picker API key*: regenerate, re-apply restrictions, update the environment variable.
  - *Account takeover report*: disconnect Drive (revokes the token), sign out all sessions, advise a credential reset.
- Data-breach process: contain, assess, notify affected users and Google as required, document.
- A security contact address and `/.well-known/security.txt`.

### 14.11 Privacy
- The privacy policy states: files are stored in the user's Google Drive or browser; our server stores only the project list and an encrypted Google token; files sent to online PDF tools are processed and deleted; how to disconnect Drive and delete the account. Comply with Google's Limited Use requirements (no ads, no sale, no human reading of Drive data).
- Analytics: content-free aggregate events only (A10).
- Account deletion: `drive-disconnect`, then delete the Supabase rows (cascade).

### 14.12 Launch security checklist (all must be checked before public launch)
- [ ] `select ... from pg_tables where schemaname='public' and not rowsecurity` returns no rows
- [ ] pgTAP RLS suite green; manual test with two real accounts (cannot see, edit or delete each other's projects)
- [ ] `anon` role: permission denied on every table
- [ ] Token tables unreachable from a signed-in client (tested)
- [ ] No Google token in `localStorage`/IndexedDB after sign-in (automated check)
- [ ] Production bundle grep shows no secret; gitleaks clean; repository history scanned
- [ ] All `NEXT_PUBLIC_*` values reviewed; Picker key restricted by API and referrer
- [ ] CORS exact origins on Edge Functions and gateway; no `*`
- [ ] Rate limits active on all endpoints (tested by exceeding them)
- [ ] Security headers present on all pages (scanner run); `/circuit/` header rule verified
- [ ] Supabase Auth: email confirmation, CAPTCHA, redirect allow-list, rate limits
- [ ] Stirling unreachable from the internet (external port scan)
- [ ] 2-factor authentication on every infrastructure account
- [ ] Shared-computer test: two accounts on one browser cannot see each other's local projects
- [ ] `.alpha` import limit tests (zip bomb, path traversal, oversized entries)
- [ ] Key-rotation runbook rehearsed once
- [ ] Privacy policy, terms and licenses pages published; Google OAuth app published and verified
