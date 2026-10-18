import { createClient } from "@supabase/supabase-js";
import { env } from "./env";
import { closeDb, deleteUserDb, getActiveUserId } from "./db";

export const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);

/**
 * Initiates email sign-in using a one-time 6-digit code (OTP).
 * Creates a new account if the user does not exist yet.
 */
export async function signInWithEmailOtp(
  email: string,
  optionsOrRedirect?: { redirectTo?: string; captchaToken?: string } | string
) {
  const opts =
    typeof optionsOrRedirect === "string"
      ? { redirectTo: optionsOrRedirect }
      : optionsOrRedirect;

  return supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo:
        opts?.redirectTo ??
        (typeof window !== "undefined"
          ? `${window.location.origin}/auth/callback`
          : undefined),
      captchaToken: opts?.captchaToken,
    },
  });
}

/**
 * Verifies the one-time 6-digit code sent to the user's email.
 */
export async function verifyEmailOtp(email: string, token: string) {
  return supabase.auth.verifyOtp({
    email,
    token,
    type: "email",
  });
}

/**
 * Initiates Google sign-in via OAuth with Google Drive scope (Path A, §10.1).
 * Requests offline access to ensure a refresh token is provided on consent.
 */
export async function signInWithGoogle(redirectTo?: string) {
  return supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo:
        redirectTo ??
        (typeof window !== "undefined"
          ? `${window.location.origin}/auth/callback`
          : undefined),
      scopes: "https://www.googleapis.com/auth/drive.file",
      queryParams: { access_type: "offline", include_granted_scopes: "true" },
    },
  });
}

/**
 * Signs out the active user and clears local Supabase session storage.
 * If "This is a shared computer" was checked:
 * 1. Captures current user ID before session is terminated
 * 2. Prepares hook for Task 21 flush
 * 3. Closes the local Dexie database
 * 4. Calls supabase.auth.signOut()
 * 5. Deletes the local Dexie database aboard:<userId>
 * 6. Clears the shared computer flag
 */
export async function signOut() {
  let userId: string | null = null;
  let isShared = false;

  if (typeof window !== "undefined") {
    isShared = sessionStorage.getItem("aboard:shared_computer") === "true";
  }

  // 1. Capture current user ID BEFORE calling supabase.auth.signOut() (after sign-out the session is gone)
  try {
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    // ignore
  }
  if (!userId) {
    userId = getActiveUserId();
  }

  // 2. Structured insertion point for Task 21: flush pending uploads before database deletion
  // Task 21 hook: if (userId) { await flushPendingUploads(userId); }

  // 3. Close the DB on sign-out before any local cleanup (Requirement 3)
  await closeDb();

  // 4. Terminate Supabase session
  const res = await supabase.auth.signOut();

  // 5. If shared-computer flag was set, delete the Dexie database aboard:<userId> after sign-out (Requirement 6)
  if (isShared && userId) {
    await deleteUserDb(userId);
  }

  // 6. Clear the flag itself as part of sign-out so it does not affect subsequent sign-outs
  if (typeof window !== "undefined" && isShared) {
    sessionStorage.removeItem("aboard:shared_computer");
  }

  return res;
}

/**
 * Refreshes the session with GoTrue to purge any Google provider tokens from browser storage (SEC-2).
 */
export async function refreshAndPurgeProviderTokens() {
  return supabase.auth.refreshSession();
}
