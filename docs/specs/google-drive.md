# Aboard spec — Google Drive integration (OAuth, Edge Functions, Drive API, Picker)

> Part of the Aboard technical specification v3.2 (Next.js 16.4 + React 19.3 + Supabase).
> Section numbers (§N) are shared across all files in `docs/specs/`; the map is in `AGENTS.md` → "Spec map".
> Requirement IDs such as `SEC-1` or `PDF-3` are defined in `docs/PRD.md`.
> Facts were checked against upstream sources, npm and official docs on 2026-10-07. Items marked **VERIFY** must be confirmed in source or docs before coding against them; record the result in `docs/PROGRESS.md` (VERIFY log), then update this file.
> If the implementation must differ from this spec, change the spec in the same commit and log the decision in `docs/PROGRESS.md`.

## 10. Google Drive integration

### 10.1 Two ways to connect (both store into the same table)
| Path | When | Consent screens |
|---|---|---|
| **A. During Google sign-in** | User clicks "Continue with Google" | **One**: login + Drive together |
| **B. "Connect Google Drive" button** | Email users, users who unticked Drive on Google's consent screen, or reconnect after revoke/expiry | One extra |

Both paths use the **same Google OAuth client**, so a refresh token from either path works with `drive-token`.

**Path A (client):**
```ts
await supabase.auth.signInWithOAuth({
  provider: "google",
  options: {
    redirectTo: `${location.origin}/auth/callback`,
    scopes: "https://www.googleapis.com/auth/drive.file",   // added to Supabase's default openid/email/profile
    queryParams: { access_type: "offline", include_granted_scopes: "true" },
  },
});

// after the redirect (PKCE exchange done by supabase-js):
supabase.auth.onAuthStateChange((event, session) => {
  if (event !== "SIGNED_IN" || !session) return;
  const refresh = session.provider_refresh_token ?? null;
  setTimeout(async () => {                       // never await other Supabase calls directly inside this callback (deadlock risk)
    if (refresh) {
      await supabase.functions.invoke("drive-link-token", { body: { refresh_token: refresh } });
      await supabase.auth.refreshSession();      // replaces the stored session with one WITHOUT Google tokens (SEC-2)
    }
    const { data } = await supabase.rpc("get_drive_status");
    driveStore.set(data?.[0] ?? { connected: false });
  }, 0);
});
```
Notes:
- `provider_refresh_token` exists only in the session created right after the OAuth redirect, **but supabase-js saves that session to browser storage as-is** (verified in `GoTrueClient._saveSession`), so the Google refresh token would sit in `localStorage` until the next session refresh. Therefore: send it to the server immediately, then call `supabase.auth.refreshSession()` (the refreshed session comes from the Supabase server and carries no provider tokens). Confirmed in Spike S4 (V06): automated storage scans of `localStorage`, `sessionStorage`, and `IndexedDB` verified 0 Google tokens remaining after `refreshSession()`. Path A is confirmed safe; fallback to Path B only is not required.
- Google returns a refresh token **only on first consent** for this client. If the user consented before and the server has no token (e.g. deleted), `get_drive_status` returns `connected=false` → show the Path B button.
- Google's consent screen lets users untick individual scopes. The server checks the granted `scope` string and refuses to link without `drive.file`.

**Path B:** client calls `drive-connect` → receives a Google URL → `location.assign(url)` → Google → `drive-callback` (Edge Function) → redirect back to `APP_URL/<return_to>?drive=connected` (or `?drive=error&reason=…`).

### 10.2 Edge Functions overview
| Function | Auth | Purpose |
|---|---|---|
| `drive-connect` | Supabase JWT | Create PKCE + state, return Google auth URL (`prompt=consent`, `access_type=offline`) |
| `drive-callback` | none (`verify_jwt = false`), protected by one-time `state` | Exchange code, check scope, encrypt and store refresh token, redirect to app |
| `drive-link-token` | Supabase JWT | Path A: validate a refresh token from the browser by refreshing once, then store it |
| `drive-token` | Supabase JWT | Return a fresh **access token** (≈1 h) |
| `drive-disconnect` | Supabase JWT | Revoke at Google, delete the row |

`supabase/config.toml`:
```toml
[functions.drive-callback]
verify_jwt = false
```
(The other functions keep the default. They also verify the user themselves via `requireUser`, so they stay safe even if the gateway setting changes — **VERIFY** current Supabase guidance for `verify_jwt` with asymmetric JWT keys.)

### 10.3 Shared code (`supabase/functions/_shared/`)

`env.ts`
```ts
export const env = {
  supabaseUrl: Deno.env.get("SUPABASE_URL")!,
  serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  googleClientId: Deno.env.get("GOOGLE_CLIENT_ID")!,
  googleClientSecret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
  tokenEncKey: Deno.env.get("TOKEN_ENC_KEY")!,
  appUrl: Deno.env.get("APP_URL")!,
  appOrigins: (Deno.env.get("APP_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
};
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
export const REDIRECT_URI = `${env.supabaseUrl}/functions/v1/drive-callback`;
```

`http.ts`
```ts
import { env } from "./env.ts";

export class HttpError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

export function cors(req: Request): HeadersInit {
  const origin = req.headers.get("Origin") ?? "";
  const h: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (env.appOrigins.includes(origin)) h["Access-Control-Allow-Origin"] = origin;   // exact match only; never "*"
  return h;
}

export function json(req: Request, status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

export function handler(fn: (req: Request) => Promise<Response>) {
  return async (req: Request) => {
    if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
    try {
      return await fn(req);
    } catch (e) {
      if (e instanceof HttpError) return json(req, e.status, { code: e.code });
      console.error(e);                                   // never log tokens
      return json(req, 500, { code: "internal_error" });
    }
  };
}
```

`supabase.ts`
```ts
import { createClient } from "npm:@supabase/supabase-js@2";
import { env } from "./env.ts";
import { HttpError } from "./http.ts";

export const admin = createClient(env.supabaseUrl, env.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function requireUser(req: Request) {
  const jwt = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
  if (!jwt) throw new HttpError(401, "missing_token");
  const { data, error } = await admin.auth.getUser(jwt);
  if (error || !data.user) throw new HttpError(401, "invalid_token");
  return data.user;
}
```

`crypto.ts`
```ts
import { env } from "./env.ts";

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const b64url = (u: Uint8Array) => b64(u).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const key = await crypto.subtle.importKey("raw", unb64(env.tokenEncKey), "AES-GCM", false, ["encrypt", "decrypt"]);

export async function encrypt(plain: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)));
  return { ct: b64(ct), iv: b64(iv) };
}

export async function decrypt(ct: string, iv: string) {
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, key, unb64(ct));
  return new TextDecoder().decode(pt);
}

export function randomToken(bytes = 32) {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function pkceChallenge(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}
```

`google.ts`
```ts
import { env, DRIVE_SCOPE, REDIRECT_URI } from "./env.ts";
import { HttpError } from "./http.ts";
import { admin } from "./supabase.ts";
import { encrypt } from "./crypto.ts";

const TOKEN_URL = "https://oauth2.googleapis.com/token";

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.googleClientId, client_secret: env.googleClientSecret, ...params }),
  });
  const body = await res.json();
  if (!res.ok) throw new HttpError(body.error === "invalid_grant" ? 409 : 502, body.error ?? "google_error");
  return body as {
    access_token: string; expires_in: number; scope: string;
    refresh_token?: string; id_token?: string; token_type: string;
  };
}

export const exchangeCode = (code: string, codeVerifier: string) =>
  tokenRequest({ grant_type: "authorization_code", code, code_verifier: codeVerifier, redirect_uri: REDIRECT_URI });

export const refreshAccessToken = (refreshToken: string) =>
  tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken });

export async function revoke(token: string) {
  await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  });
}

export function assertDriveScope(scope: string) {
  if (!scope.split(" ").includes(DRIVE_SCOPE)) throw new HttpError(403, "drive_scope_not_granted");
}

/** Email from an id_token received directly from Google's token endpoint over TLS. */
export function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(atob(idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    return typeof payload.email === "string" ? payload.email : null;
  } catch { return null; }
}

export async function saveLink(userId: string, refreshToken: string, scopes: string, email: string | null) {
  const { ct, iv } = await encrypt(refreshToken);
  const { error } = await admin.from("google_drive_links").upsert({
    user_id: userId, refresh_ct: ct, refresh_iv: iv, scopes, google_email: email,
    created_at: new Date().toISOString(), revoked_at: null,
  });
  if (error) throw new HttpError(500, "store_failed");
  await admin.from("profiles").update({ default_storage: "drive" }).eq("user_id", userId);
}
```

`ratelimit.ts`
```ts
import { admin } from "./supabase.ts";
import { HttpError } from "./http.ts";

/** Fixed-window limit backed by Postgres (`check_rate_limit`). Fails CLOSED if the check itself fails. */
export async function rateLimit(key: string, max: number, windowSeconds: number) {
  const { data, error } = await admin.rpc("check_rate_limit", { p_key: key, p_max: max, p_window_seconds: windowSeconds });
  if (error) throw new HttpError(503, "rate_limit_unavailable");
  if (!data) throw new HttpError(429, "too_many_requests");
}
```

### 10.4 Functions

`drive-connect/index.ts`
```ts
import { rateLimit } from "../_shared/ratelimit.ts";
import { handler, json } from "../_shared/http.ts";
import { requireUser, admin } from "../_shared/supabase.ts";
import { env, DRIVE_SCOPE, REDIRECT_URI } from "../_shared/env.ts";
import { randomToken, pkceChallenge } from "../_shared/crypto.ts";

Deno.serve(handler(async (req) => {
  const user = await requireUser(req);
  await rateLimit(`${user.id}:drive-connect`, 10, 600);
  const { returnTo } = await req.json().catch(() => ({}));
  const safeReturn = typeof returnTo === "string" && returnTo.length < 200 && returnTo.startsWith("/")
    && !returnTo.startsWith("//") && !returnTo.includes("\\") ? returnTo : "/";   // blocks open redirects

  await admin.from("oauth_states").delete().lt("expires_at", new Date().toISOString()); // housekeeping
  const state = randomToken();
  const verifier = randomToken(48);
  await admin.from("oauth_states").insert({
    state, user_id: user.id, code_verifier: verifier, return_to: safeReturn,
    expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  });

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: `openid email ${DRIVE_SCOPE}`,
    access_type: "offline",
    prompt: "consent",                     // guarantees a refresh token
    include_granted_scopes: "true",
    login_hint: user.email ?? "",
    state,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: "S256",
  }).toString();

  return json(req, 200, { url: url.toString() });
}));
```

`drive-callback/index.ts`
```ts
import { rateLimit } from "../_shared/ratelimit.ts";
import { admin } from "../_shared/supabase.ts";
import { env } from "../_shared/env.ts";
import { exchangeCode, assertDriveScope, emailFromIdToken, saveLink } from "../_shared/google.ts";

const back = (path: string, params: Record<string, string>) =>
  Response.redirect(`${env.appUrl}${path}?${new URLSearchParams(params)}`, 302);

Deno.serve(async (req) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  try { await rateLimit(`ip:${ip}:drive-callback`, 30, 60); }
  catch { return back("/", { drive: "error", reason: "rate_limited" }); }
  const q = new URL(req.url).searchParams;
  const state = q.get("state") ?? "";
  const { data: row } = await admin.from("oauth_states").delete().eq("state", state).select().maybeSingle(); // one-time
  if (!row || new Date(row.expires_at) < new Date()) return back("/", { drive: "error", reason: "state" });
  if (q.get("error")) return back(row.return_to, { drive: "error", reason: q.get("error")! });

  try {
    const tok = await exchangeCode(q.get("code") ?? "", row.code_verifier);
    assertDriveScope(tok.scope);
    if (!tok.refresh_token) return back(row.return_to, { drive: "error", reason: "no_refresh_token" });
    await saveLink(row.user_id, tok.refresh_token, tok.scope, emailFromIdToken(tok.id_token));
    return back(row.return_to, { drive: "connected" });
  } catch (e) {
    const reason = e instanceof Error ? e.message : "unknown";
    return back(row.return_to, { drive: "error", reason });
  }
});
```

`drive-link-token/index.ts`
```ts
import { rateLimit } from "../_shared/ratelimit.ts";
import { handler, json, HttpError } from "../_shared/http.ts";
import { requireUser } from "../_shared/supabase.ts";
import { refreshAccessToken, assertDriveScope, saveLink } from "../_shared/google.ts";

Deno.serve(handler(async (req) => {
  const user = await requireUser(req);
  await rateLimit(`${user.id}:drive-link-token`, 5, 600);
  const { refresh_token } = await req.json().catch(() => ({}));
  if (typeof refresh_token !== "string" || refresh_token.length < 20) throw new HttpError(400, "bad_request");
  const tok = await refreshAccessToken(refresh_token);   // proves it belongs to our client and is valid
  assertDriveScope(tok.scope);
  await saveLink(user.id, refresh_token, tok.scope, user.email ?? null);
  return json(req, 200, { connected: true });
}));
```

`drive-token/index.ts`
```ts
import { rateLimit } from "../_shared/ratelimit.ts";
import { handler, json, HttpError } from "../_shared/http.ts";
import { requireUser, admin } from "../_shared/supabase.ts";
import { decrypt } from "../_shared/crypto.ts";
import { refreshAccessToken, saveLink } from "../_shared/google.ts";

Deno.serve(handler(async (req) => {
  const user = await requireUser(req);
  await rateLimit(`${user.id}:drive-token`, 30, 60);
  const { data: link } = await admin.from("google_drive_links")
    .select("*").eq("user_id", user.id).is("revoked_at", null).maybeSingle();
  if (!link) throw new HttpError(404, "not_connected");

  const refresh = await decrypt(link.refresh_ct, link.refresh_iv);
  try {
    const tok = await refreshAccessToken(refresh);
    if (tok.refresh_token && tok.refresh_token !== refresh) {          // rare rotation
      await saveLink(user.id, tok.refresh_token, tok.scope, link.google_email);
    }
    await admin.from("google_drive_links").update({ last_used_at: new Date().toISOString() }).eq("user_id", user.id);
    return json(req, 200, { access_token: tok.access_token, expires_at: Date.now() + tok.expires_in * 1000 });
  } catch (e) {
    if (e instanceof HttpError && e.status === 409) {                  // invalid_grant: revoked or expired
      await admin.from("google_drive_links").update({ revoked_at: new Date().toISOString() }).eq("user_id", user.id);
      throw new HttpError(409, "reconnect_required");
    }
    throw e;
  }
}));
```

`drive-disconnect/index.ts`
```ts
import { rateLimit } from "../_shared/ratelimit.ts";
import { handler, json } from "../_shared/http.ts";
import { requireUser, admin } from "../_shared/supabase.ts";
import { decrypt } from "../_shared/crypto.ts";
import { revoke } from "../_shared/google.ts";

Deno.serve(handler(async (req) => {
  const user = await requireUser(req);
  await rateLimit(`${user.id}:drive-disconnect`, 5, 600);
  const { data: link } = await admin.from("google_drive_links").select("*").eq("user_id", user.id).maybeSingle();
  if (link) {
    await revoke(await decrypt(link.refresh_ct, link.refresh_iv)).catch(() => {});
    await admin.from("google_drive_links").delete().eq("user_id", user.id);
  }
  await admin.from("profiles").update({ default_storage: "local" }).eq("user_id", user.id);
  return json(req, 200, { connected: false });
}));
```

### 10.5 Client: token manager
```ts
// src/core/drive/tokens.ts — access token lives in memory only (never localStorage)
export class DriveTokenManager {
  private token?: { value: string; exp: number };
  private inflight?: Promise<string>;

  async get(): Promise<string> {
    if (this.token && Date.now() < this.token.exp - 60_000) return this.token.value;
    this.inflight ??= this.fetchToken().finally(() => (this.inflight = undefined));
    return this.inflight;
  }

  invalidate() { this.token = undefined; }

  private async fetchToken(): Promise<string> {
    const { data, error } = await supabase.functions.invoke("drive-token", { method: "POST" });
    if (error) {
      const status = (error as { context?: Response }).context?.status;
      if (status === 409 || status === 404) bus.emit("drive:reconnect-required", {});
      throw error;
    }
    this.token = { value: data.access_token, exp: data.expires_at };
    return data.access_token;
  }
}
```

### 10.6 Deploy commands
```bash
supabase secrets set GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... \
  TOKEN_ENC_KEY="$(openssl rand -base64 32)" \
  APP_URL=https://aboard.example APP_ORIGINS=https://aboard.example,http://localhost:3000
supabase db push
supabase functions deploy drive-connect drive-callback drive-link-token drive-token drive-disconnect
```
Key rotation: add `TOKEN_ENC_KEY_OLD`, decrypt with old/encrypt with new in `drive-token`, remove the old key after all rows are rewritten (or ask users to reconnect).

### 10.7 Drive layout
```
My Drive/
└── Aboard/                                   appProperties: aboardKind=root
    ├── <Project title> (<6-char id>)/        appProperties: aboardKind=project, aboardProjectId=<uuid>
    │   ├── project.json                      manifest (same schema as .alpha, §12.3)
    │   ├── boards/<itemId>.json              aboardKind=board, aboardItemId
    │   ├── circuits/<itemId>.txt             aboardKind=circuit, aboardItemId
    │   ├── pdfs/<itemId>.json                aboardKind=pdf (title, fileKey, lastPage)
    │   ├── annotations/<itemId>.json         aboardKind=annotations, aboardItemId
    │   └── files/<fileKey>.<ext>             aboardKind=file, aboardFileKey (written once, never updated)
    └── Exports/                              .alpha files saved to Drive
```
- **Identity comes from `appProperties`, not names**, so renaming or moving inside Drive does not break the app. Find the root with `q = "appProperties has { key='aboardKind' and value='root' } and trashed=false"`; cache its id in `profiles.drive_root_folder_id` and the project folder id in `projects.drive_folder_id`.
- Subfolder and file ids are cached in IndexedDB (`items.driveFileId`); on a cache miss, list the project folder once: `q="'<folderId>' in parents and trashed=false"`, `fields="files(id,name,mimeType,appProperties,headRevisionId,size,modifiedTime)"`.
- Drive keeps previous revisions of updated files automatically, which gives users a basic version history.

### 10.8 Drive REST calls
| Action | Request |
|---|---|
| Create folder | `POST https://www.googleapis.com/drive/v3/files` body `{name, mimeType:"application/vnd.google-apps.folder", parents:[id], appProperties}` |
| Create small file (< 5 MB) | `POST https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,headRevisionId` (`multipart/related`) |
| Update content | `PATCH https://www.googleapis.com/upload/drive/v3/files/{id}?uploadType=media&fields=id,headRevisionId` |
| Large file (≥ 5 MB) | `uploadType=resumable` session, chunks of 8 MiB (multiple of 256 KiB) |
| Read metadata | `GET https://www.googleapis.com/drive/v3/files/{id}?fields=id,headRevisionId,trashed,size` |
| Download | `GET https://www.googleapis.com/drive/v3/files/{id}?alt=media` |
| Delete (soft) | `PATCH https://www.googleapis.com/drive/v3/files/{id}` body `{trashed:true}` |

```ts
// src/core/drive/api.ts (excerpt)
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";

async function driveFetch(url: string, init: RequestInit = {}, attempt = 0): Promise<Response> {
  const token = await tokens.get();
  const res = await fetch(url, { ...init, headers: { ...init.headers, Authorization: `Bearer ${token}` } });
  if (res.status === 401 && attempt === 0) { tokens.invalidate(); return driveFetch(url, init, 1); }
  const retryable = res.status === 429 || res.status >= 500 || (res.status === 403 && (await isRateLimit(res.clone())));
  if (retryable && attempt < 5) {
    await sleep(Math.min(32_000, 2 ** attempt * 1000) + Math.random() * 1000);   // exponential backoff + jitter
    return driveFetch(url, init, attempt + 1);
  }
  return res;
}

async function isRateLimit(res: Response) {
  const body = await res.json().catch(() => ({}));
  const reason = body?.error?.errors?.[0]?.reason;
  return reason === "rateLimitExceeded" || reason === "userRateLimitExceeded";
}

function multipart(metadata: object, blob: Blob) {
  const boundary = `aboard-${crypto.randomUUID()}`;
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`, JSON.stringify(metadata),
    `\r\n--${boundary}\r\nContent-Type: ${blob.type || "application/octet-stream"}\r\n\r\n`, blob,
    `\r\n--${boundary}--`,
  ]);
  return { body, headers: { "Content-Type": `multipart/related; boundary=${boundary}` } };
}

export async function createFile(metadata: DriveMeta, blob: Blob) {
  if (blob.size >= 5 * 1024 * 1024) return resumableCreate(metadata, blob);
  const { body, headers } = multipart(metadata, blob);
  const res = await driveFetch(`${UPLOAD}/files?uploadType=multipart&fields=id,headRevisionId`, { method: "POST", headers, body });
  return ensureOk<{ id: string; headRevisionId: string }>(res);
}

export async function updateContent(fileId: string, blob: Blob) {
  const res = await driveFetch(`${UPLOAD}/files/${fileId}?uploadType=media&fields=id,headRevisionId`, {
    method: "PATCH", headers: { "Content-Type": blob.type || "application/octet-stream" }, body: blob,
  });
  return ensureOk<{ id: string; headRevisionId: string }>(res);
}

async function resumableCreate(metadata: DriveMeta, blob: Blob, onProgress?: (p: number) => void) {
  const start = await driveFetch(`${UPLOAD}/files?uploadType=resumable&fields=id,headRevisionId`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Type": blob.type || "application/octet-stream",
      "X-Upload-Content-Length": String(blob.size),
    },
    body: JSON.stringify(metadata),
  });
  const session = start.headers.get("Location");          // Confirmed in Spike S4 (V08): Location header exposed via CORS
  if (!session) throw new Error("resumable_session_missing");
  const CHUNK = 8 * 1024 * 1024;
  let offset = 0;
  while (offset < blob.size) {
    const end = Math.min(offset + CHUNK, blob.size);
    const res = await fetch(session, {
      method: "PUT",
      headers: { "Content-Range": `bytes ${offset}-${end - 1}/${blob.size}` },
      body: blob.slice(offset, end),
    });
    if (res.status === 308) {                               // chunk accepted, continue
      const range = res.headers.get("Range");               // "bytes=0-N" (confirmed readable in Spike S4)
      offset = range ? Number(range.split("-")[1]) + 1 : end;
      onProgress?.(offset / blob.size);
      continue;
    }
    if (res.ok) return res.json() as Promise<{ id: string; headRevisionId: string }>;
    // on network error or 5xx: query status with "Content-Range: bytes */<size>" and resume (implement in Spike S4)
    throw new Error(`upload_failed_${res.status}`);
  }
  throw new Error("upload_incomplete");
}
```

### 10.9 Concurrency and conflicts (Drive mode)
- Each cached item stores the `headRevisionId` it was loaded or last saved with.
- Before updating: `GET ?fields=headRevisionId`. Same → upload. Different → someone (another device) changed it:
  - board: download remote, merge with `reconcileElements` (element `version`/`versionNonce`), upload the merge;
  - circuit, annotations: keep both — upload local as `<name> (conflict <device> <date>)` and load the remote version;
  - files: never conflict (immutable, content-addressed).
- Check-then-write is not atomic; the small race window is acceptable for a single-user app across a few devices.

### 10.10 Error handling
| Drive response | Action |
|---|---|
| 401 | Invalidate token, retry once |
| 403 `rateLimitExceeded` / `userRateLimitExceeded`, 429, 5xx | Exponential backoff with jitter, max 5 tries; keep data in outbox |
| 403 `storageQuotaExceeded` | Stop Drive uploads for the user, show "Your Google Drive is full", keep saving to IndexedDB, offer `.alpha` export |
| 404 on a file | User deleted it in Drive: recreate from IndexedDB if cached, else mark item "missing" |
| `drive-token` 409/404 | Emit `drive:reconnect-required`; show reconnect banner; keep saving locally |

### 10.11 Google Picker (open existing Drive files)
Used for: "Add PDF from Google Drive" and "Open `.alpha` from Google Drive". With `drive.file`, picking a file grants the app access to that file only.
```ts
// load https://apis.google.com/js/api.js, then gapi.load("picker", …)
const view = new google.picker.DocsView(google.picker.ViewId.DOCS).setMimeTypes("application/pdf,application/zip,application/octet-stream");
new google.picker.PickerBuilder()
  .setAppId(process.env.NEXT_PUBLIC_GOOGLE_APP_ID)
  .setOAuthToken(await tokens.get())
  .setDeveloperKey(process.env.NEXT_PUBLIC_GOOGLE_API_KEY)
  .addView(view)
  .setLocale(lang)                          // "ar" | "en"
  .setCallback(onPicked)
  .build().setVisible(true);
```
Confirmed in Spike S4 (V09): loader is `window.gapi.load("picker")`; DOM class names are `.picker-dialog` (dialog container), `.picker-dialog-bg` (backdrop), and `.picker-modal-dialog` (modal frame). Picking a PDF copies nothing: the project's `pdfs/<itemId>.json` stores a reference, and the file is downloaded (and cached) on open; on save of a derived file the app writes a new file into the project folder.

Optional later: Drive "Open with" integration for `.alpha` files (Drive UI integration in the Google Cloud console). **VERIFY** current requirements (it may need the Google Workspace Marketplace SDK).
