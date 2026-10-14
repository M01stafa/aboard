import { createClient } from "@supabase/supabase-js";
import { env } from "./env";

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
 * Initiates Google sign-in via OAuth.
 * Scope is standard profile/email only. Drive scope and offline access are NOT requested in Task 14.
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
    },
  });
}

/**
 * Signs out the active user and clears local Supabase session storage.
 */
export async function signOut() {
  if (typeof window !== "undefined") {
    const isShared = sessionStorage.getItem("aboard:shared_computer") === "true";
    if (isShared) {
      sessionStorage.removeItem("aboard:shared_computer");
    }
  }
  return supabase.auth.signOut();
}

/**
 * Refreshes the session with GoTrue to purge any Google provider tokens from browser storage (SEC-2).
 */
export async function refreshAndPurgeProviderTokens() {
  return supabase.auth.refreshSession();
}
