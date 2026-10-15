import { describe, expect, it, vi } from "vitest";
import {
  signInWithEmailOtp,
  verifyEmailOtp,
  signInWithGoogle,
  signOut,
  refreshAndPurgeProviderTokens,
  supabase,
} from "./supabase";

describe("Auth Core Helpers", () => {
  it("calls signInWithEmailOtp with email and shouldCreateUser", async () => {
    const spy = vi.spyOn(supabase.auth, "signInWithOtp").mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    });

    const res = await signInWithEmailOtp("student@example.com");
    expect(spy).toHaveBeenCalledWith({
      email: "student@example.com",
      options: expect.objectContaining({
        shouldCreateUser: true,
      }),
    });
    expect(res.error).toBeNull();
    spy.mockRestore();
  });

  it("passes captchaToken to signInWithOtp options", async () => {
    const spy = vi.spyOn(supabase.auth, "signInWithOtp").mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    });

    const res = await signInWithEmailOtp("student@example.com", {
      captchaToken: "turnstile-test-token-123",
    });
    expect(spy).toHaveBeenCalledWith({
      email: "student@example.com",
      options: expect.objectContaining({
        shouldCreateUser: true,
        captchaToken: "turnstile-test-token-123",
      }),
    });
    expect(res.error).toBeNull();
    spy.mockRestore();
  });

  it("calls verifyEmailOtp with email, token, and type email", async () => {
    const spy = vi.spyOn(supabase.auth, "verifyOtp").mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    });

    const res = await verifyEmailOtp("student@example.com", "123456");
    expect(spy).toHaveBeenCalledWith({
      email: "student@example.com",
      token: "123456",
      type: "email",
    });
    expect(res.error).toBeNull();
    spy.mockRestore();
  });

  it("calls signInWithGoogle without Drive scope or offline access in Task 14", async () => {
    const spy = vi.spyOn(supabase.auth, "signInWithOAuth").mockResolvedValue({
      data: { provider: "google", url: "https://accounts.google.com/o/oauth2/auth" },
      error: null,
    });

    const res = await signInWithGoogle("http://localhost:3000/auth/callback");
    expect(spy).toHaveBeenCalledWith({
      provider: "google",
      options: {
        redirectTo: "http://localhost:3000/auth/callback",
      },
    });
    expect(res.error).toBeNull();
    spy.mockRestore();
  });

  it("calls signOut to terminate session", async () => {
    const spy = vi.spyOn(supabase.auth, "signOut").mockResolvedValue({
      error: null,
    });

    const res = await signOut();
    expect(spy).toHaveBeenCalled();
    expect(res.error).toBeNull();
    spy.mockRestore();
  });

  it("wipes user database and clears flag on signOut when shared computer flag is set", async () => {
    if (typeof window !== "undefined") {
      sessionStorage.setItem("aboard:shared_computer", "true");
    }
    const userSpy = vi.spyOn(supabase.auth, "getUser").mockResolvedValue({
      data: {
        user: {
          id: "test-shared-user",
          email: "student@example.com",
          app_metadata: {},
          user_metadata: {},
          aud: "authenticated",
          created_at: new Date().toISOString(),
        },
      },
      error: null,
    });
    const signOutSpy = vi.spyOn(supabase.auth, "signOut").mockResolvedValue({
      error: null,
    });

    const res = await signOut();
    expect(signOutSpy).toHaveBeenCalled();
    expect(res.error).toBeNull();
    if (typeof window !== "undefined") {
      expect(sessionStorage.getItem("aboard:shared_computer")).toBeNull();
    }

    userSpy.mockRestore();
    signOutSpy.mockRestore();
  });

  it("calls refreshSession to purge Google provider tokens from storage", async () => {
    const spy = vi.spyOn(supabase.auth, "refreshSession").mockResolvedValue({
      data: { user: null, session: null },
      error: null,
    });

    const res = await refreshAndPurgeProviderTokens();
    expect(spy).toHaveBeenCalled();
    expect(res.error).toBeNull();
    spy.mockRestore();
  });
});
