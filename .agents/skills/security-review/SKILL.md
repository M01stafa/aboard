---
name: security-review
description: Runs Aboard's security checks (RLS and user isolation, secrets and API keys, endpoints and CORS, tokens in browser storage, headers, import safety) on a change or before launch, and reports findings. Use before merging changes to auth, database, Edge Functions, Drive, the gateway, headers or import/export, and for the launch checklist.
---

# Security review (Aboard)

Full rules: `docs/specs/security.md` (§14). Always-on summary: `.agents/rules/security.md`. Report every finding to the owner; do not silently "fix" a security decision.

## Scope
- **Change review:** run the sections that match the files changed.
- **Launch review:** run all sections, then the launch checklist in `docs/specs/security.md` §14.12. Every box must be checked and the result logged in `docs/PROGRESS.md`.

## 1. Database isolation
- `supabase db reset && supabase test db` → all green; `plan(n)` matches the assertion count.
- Zero rows: `select tablename from pg_tables where schemaname = 'public' and not rowsecurity;`
- Review new/changed policies: `to authenticated`, `user_id = (select auth.uid())`, no `using (true)`, column-list `grant update`.
- List grants: `select grantee, table_name, privilege_type from information_schema.role_table_grants where table_schema = 'public' and grantee in ('anon','authenticated') order by 2,1;` — `anon` must have none; token tables none for both roles.
- New `security definer` functions have `set search_path = ''` and restricted `execute`.

## 2. Secrets and keys
- `pnpm ci:security` (gitleaks + bundle grep + audit) → clean.
- `grep -rn "NEXT_PUBLIC_" apps/web --include=*.ts --include=*.tsx --include=*.env*` → only the public variables listed in `.agents/rules/security.md` §2.
- No `service_role`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENC_KEY` or private keys outside `supabase/functions` env reads.
- `.env*` ignored by git; `.env.example` has placeholders only.

## 3. Endpoints and HTTP
- Each Edge Function / gateway route: `requireUser` (except `drive-callback`), `rateLimit`, `zod` validation, body size limit, generic `{ code }` errors, no logging of tokens/bodies/file names.
- CORS: exact origins only. Test: request with `Origin: https://evil.example` → no `Access-Control-Allow-Origin` header.
- Exceed a rate limit in a test → `429`.
- Redirect targets validated (relative, no `//`, no backslash).
- Endpoint table in `docs/specs/security.md` §14.5 matches the implementation.

## 4. Tokens and browser storage
- After Google sign-in (e2e): `localStorage`, `sessionStorage` and every IndexedDB store contain no `provider_token`, `provider_refresh_token` or Google access token.
- Access token only in `DriveTokenManager` memory and the `Authorization` header.
- Two accounts on one browser: B cannot see A's local projects; "shared computer" sign-out deletes A's database after syncing.

## 5. Front-end safety
- `grep -rn "dangerouslySetInnerHTML\|innerHTML\|document.write" apps/web/src apps/web/app` → no use with user or imported data.
- `.alpha` import tests: zip bomb, `../` path, absolute path, oversized entry, wrong `mimetype`, hash mismatch → all rejected with no partial project.
- Board links: `javascript:`/`data:` stripped on import.
- After a CircuitJS upstream merge: `grep -rn "eval(\|new Function\|\$wnd.eval" vendor/circuitjs1/src` → no new hits.

## 6. Headers and infrastructure
- Production response headers include CSP, HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, COOP; `/circuit/` rule correct.
- Stirling unreachable from the internet (external port scan of the VPS shows only 80/443); gateway rejects requests without a valid JWT.

## Report format
For each section: `PASS` or `FAIL` with file/line and the fix proposed. Log the review date and result in `docs/PROGRESS.md`; any FAIL blocks the merge or launch until the owner decides.
