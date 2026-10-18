import { env, DRIVE_SCOPE, REDIRECT_URI } from "./env.ts";
import { HttpError } from "./http.ts";
import { admin } from "./supabase.ts";
import { encrypt } from "./crypto.ts";

const TOKEN_URL = "https://oauth2.googleapis.com/token";

async function tokenRequest(params: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      ...params,
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new HttpError(
      body.error === "invalid_grant" ? 409 : 502,
      body.error ?? "google_error"
    );
  }
  return body as {
    access_token: string;
    expires_in: number;
    scope: string;
    refresh_token?: string;
    id_token?: string;
    token_type: string;
  };
}

export const exchangeCode = (code: string, codeVerifier: string) =>
  tokenRequest({
    grant_type: "authorization_code",
    code,
    code_verifier: codeVerifier,
    redirect_uri: REDIRECT_URI,
  });

export const refreshAccessToken = (refreshToken: string) =>
  tokenRequest({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

export async function revoke(token: string) {
  await fetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  }).catch(() => {});
}

export function assertDriveScope(scope: string) {
  if (!scope || !scope.split(" ").includes(DRIVE_SCOPE)) {
    throw new HttpError(403, "drive_scope_not_granted");
  }
}

export function emailFromIdToken(idToken?: string): string | null {
  if (!idToken) return null;
  try {
    const parts = idToken.split(".");
    if (parts.length < 2) return null;
    const payload = JSON.parse(
      atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))
    );
    return typeof payload.email === "string" ? payload.email : null;
  } catch {
    return null;
  }
}

export async function saveLink(
  userId: string,
  refreshToken: string,
  scopes: string,
  email: string | null
) {
  const { ct, iv } = await encrypt(refreshToken);
  const { error } = await admin.from("google_drive_links").upsert({
    user_id: userId,
    refresh_ct: ct,
    refresh_iv: iv,
    scopes,
    google_email: email,
    created_at: new Date().toISOString(),
    revoked_at: null,
  });
  if (error) throw new HttpError(500, "store_failed");
  await admin
    .from("profiles")
    .update({ default_storage: "drive" })
    .eq("user_id", userId);
}
