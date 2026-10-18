import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { env, DRIVE_SCOPE, REDIRECT_URI } from "./_shared/env.ts";
import {
  encrypt,
  decrypt,
  randomToken,
  pkceChallenge,
  getKey,
} from "./_shared/crypto.ts";
import { cors, json, handler, HttpError } from "./_shared/http.ts";
import { admin, requireUser } from "./_shared/supabase.ts";
import { rateLimit } from "./_shared/ratelimit.ts";
import {
  assertDriveScope,
  emailFromIdToken,
  saveLink,
} from "./_shared/google.ts";
import { handleDriveConnect } from "./drive-connect/index.ts";
import { handleDriveCallback } from "./drive-callback/index.ts";
import { handleDriveLinkToken } from "./drive-link-token/index.ts";
import { handleDriveToken } from "./drive-token/index.ts";
import { handleDriveDisconnect } from "./drive-disconnect/index.ts";

describe("Supabase Edge Functions & Shared Modules (Task 33 / AUTH-3, SEC-2, SEC-6)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Configure default mock environment
    (env as any).supabaseUrl = "https://mock-project.supabase.co";
    (env as any).serviceRoleKey = "mock-service-role-key";
    (env as any).googleClientId = "mock-google-client-id";
    (env as any).googleClientSecret = "mock-google-client-secret";
    (env as any).tokenEncKey = "mock-32-byte-token-encryption-key-for-tests";
    (env as any).appUrl = "https://mock.aboard.example";
  });

  describe("1. Cryptography & Key Derivation (_shared/crypto.ts)", () => {
    it("derives a 32-byte AES-GCM key from string secret via SHA-256", async () => {
      const key = await getKey("custom-secret-seed");
      expect(key).toBeInstanceOf(CryptoKey);
      expect(key.algorithm.name).toBe("AES-GCM");
    });

    it("encrypts and decrypts UTF-8 plain text cleanly", async () => {
      const plain = "user-google-refresh-token-12345!@#$%^&*()";
      const { ct, iv } = await encrypt(plain);
      expect(ct).toBeTruthy();
      expect(iv).toBeTruthy();

      const decrypted = await decrypt(ct, iv);
      expect(decrypted).toBe(plain);
    });

    it("produces distinct random IVs on subsequent encrypt calls", async () => {
      const plain = "same-input-data";
      const res1 = await encrypt(plain);
      const res2 = await encrypt(plain);
      expect(res1.iv).not.toBe(res2.iv);
      expect(res1.ct).not.toBe(res2.ct);
    });

    it("generates url-safe random tokens without +, /, or =", () => {
      const tok = randomToken(32);
      expect(tok.length).toBeGreaterThanOrEqual(32);
      expect(tok).not.toMatch(/[+/=]/);
    });

    it("generates valid base64url PKCE SHA-256 challenges", async () => {
      const verifier = "test_code_verifier_1234567890_abcdefghijklmnopqrstuvwxyz";
      const challenge = await pkceChallenge(verifier);
      expect(challenge).toBeTruthy();
      expect(challenge).not.toMatch(/[+/=]/);
    });
  });

  describe("2. HTTP Security & Exact-Origin CORS (_shared/http.ts)", () => {
    it("allows registered app origin and returns exact CORS headers", () => {
      const req = new Request("https://mock-project.supabase.co/functions/v1/drive-connect", {
        headers: { Origin: "http://localhost:3000" },
      });
      const headers = cors(req);
      expect(headers["Access-Control-Allow-Origin"]).toBe("http://localhost:3000");
      expect(headers["Vary"]).toBe("Origin");
    });

    it("rejects unknown origins by omitting Access-Control-Allow-Origin", () => {
      const req = new Request("https://mock-project.supabase.co/functions/v1/drive-connect", {
        headers: { Origin: "https://evil-attacker.example" },
      });
      const headers = cors(req);
      expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
    });

    it("handles OPTIONS preflight requests returning 204", async () => {
      const wrapped = handler(async () => new Response("ok"));
      const req = new Request("https://mock-project.supabase.co/functions/v1/drive-connect", {
        method: "OPTIONS",
        headers: { Origin: "http://localhost:3000" },
      });
      const res = await wrapped(req);
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:3000");
    });

    it("catches HttpError and formats JSON error code response", async () => {
      const wrapped = handler(async () => {
        throw new HttpError(403, "drive_scope_not_granted");
      });
      const req = new Request("https://mock-project.supabase.co/functions/v1/drive-connect");
      const res = await wrapped(req);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data).toEqual({ code: "drive_scope_not_granted" });
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    });

    it("catches generic errors and sanitizes output as 500 internal_error", async () => {
      const wrapped = handler(async () => {
        throw new Error("sensitive secret leak: abcdef");
      });
      const req = new Request("https://mock-project.supabase.co/functions/v1/drive-connect");
      const res = await wrapped(req);
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data).toEqual({ code: "internal_error" });
    });
  });

  describe("3. Rate Limiting (_shared/ratelimit.ts)", () => {
    it("passes when RPC returns true", async () => {
      vi.spyOn(admin, "rpc").mockResolvedValueOnce({ data: true, error: null } as any);
      await expect(rateLimit("user:test", 10, 60)).resolves.toBeUndefined();
    });

    it("fails with 429 too_many_requests when RPC returns false", async () => {
      vi.spyOn(admin, "rpc").mockResolvedValueOnce({ data: false, error: null } as any);
      await expect(rateLimit("user:test", 10, 60)).rejects.toMatchObject({
        status: 429,
        code: "too_many_requests",
      });
    });

    it("fails closed with 503 rate_limit_unavailable on database RPC error", async () => {
      vi.spyOn(admin, "rpc").mockResolvedValueOnce({
        data: null,
        error: { message: "db timeout" },
      } as any);
      await expect(rateLimit("user:test", 10, 60)).rejects.toMatchObject({
        status: 503,
        code: "rate_limit_unavailable",
      });
    });
  });

  describe("4. Google Helpers & Scope Validation (_shared/google.ts)", () => {
    it("asserts drive.file scope and passes when present", () => {
      expect(() =>
        assertDriveScope(`openid email ${DRIVE_SCOPE}`)
      ).not.toThrow();
    });

    it("throws 403 drive_scope_not_granted when drive.file scope is missing", () => {
      expect(() => assertDriveScope("openid email")).toThrowError(
        expect.objectContaining({ status: 403, code: "drive_scope_not_granted" })
      );
    });

    it("extracts email claim safely from an id_token", () => {
      const payload = btoa(JSON.stringify({ email: "student@example.com" }));
      const fakeIdToken = `header.${payload}.signature`;
      expect(emailFromIdToken(fakeIdToken)).toBe("student@example.com");
    });
  });

  describe("5. Function: drive-connect", () => {
    it("rejects unauthenticated requests with 401 missing_token", async () => {
      const req = new Request("https://mock/functions/v1/drive-connect", {
        method: "POST",
      });
      await expect(handleDriveConnect(req)).rejects.toMatchObject({
        status: 401,
        code: "missing_token",
      });
    });

    it("rejects invalid Bearer JWT with 401 invalid_token", async () => {
      vi.spyOn(admin.auth, "getUser").mockResolvedValueOnce({
        data: { user: null },
        error: { message: "bad jwt" },
      } as any);

      const req = new Request("https://mock/functions/v1/drive-connect", {
        method: "POST",
        headers: { Authorization: "Bearer bad-jwt" },
      });
      await expect(handleDriveConnect(req)).rejects.toMatchObject({
        status: 401,
        code: "invalid_token",
      });
    });

    it("generates state and valid Google consent URL with PKCE challenge", async () => {
      vi.spyOn(admin.auth, "getUser").mockResolvedValueOnce({
        data: { user: { id: "user-123", email: "user@example.com" } },
        error: null,
      } as any);
      vi.spyOn(admin, "rpc").mockResolvedValueOnce({ data: true, error: null } as any);

      const mockFrom = vi.spyOn(admin, "from").mockReturnValue({
        delete: () => ({ lt: () => Promise.resolve({ error: null }) }),
        insert: () => Promise.resolve({ error: null }),
      } as any);

      const req = new Request("https://mock/functions/v1/drive-connect", {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-jwt",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ returnTo: "/workspace?p=123" }),
      });

      const res = await handleDriveConnect(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.url).toContain("https://accounts.google.com/o/oauth2/v2/auth");
      expect(data.url).toContain("code_challenge_method=S256");
      expect(data.url).toContain("prompt=consent");
      expect(data.url).toContain("access_type=offline");
      expect(data.url).toContain(encodeURIComponent(DRIVE_SCOPE));
    });

    it("sanitizes open-redirect attempts in returnTo", async () => {
      vi.spyOn(admin.auth, "getUser").mockResolvedValueOnce({
        data: { user: { id: "user-123", email: "user@example.com" } },
        error: null,
      } as any);
      vi.spyOn(admin, "rpc").mockResolvedValueOnce({ data: true, error: null } as any);

      let insertedReturnTo: string | undefined;
      vi.spyOn(admin, "from").mockReturnValue({
        delete: () => ({ lt: () => Promise.resolve({ error: null }) }),
        insert: (row: any) => {
          insertedReturnTo = row.return_to;
          return Promise.resolve({ error: null });
        },
      } as any);

      const req = new Request("https://mock/functions/v1/drive-connect", {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-jwt",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ returnTo: "//evil.com" }),
      });

      await handleDriveConnect(req);
      expect(insertedReturnTo).toBe("/");
    });
  });

  describe("6. Function: drive-callback", () => {
    it("redirects with rate_limited when IP rate limit is exceeded", async () => {
      vi.spyOn(admin, "rpc").mockResolvedValueOnce({ data: false, error: null } as any);

      const req = new Request(
        "https://mock/functions/v1/drive-callback?state=xyz123456789&code=testcode",
        { headers: { "x-forwarded-for": "203.0.113.1" } }
      );
      const res = await handleDriveCallback(req);
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toContain("drive=error&reason=rate_limited");
    });

    it("redirects with reason=state if state is invalid, missing, or expired", async () => {
      vi.spyOn(admin, "rpc").mockResolvedValueOnce({ data: true, error: null } as any);
      vi.spyOn(admin, "from").mockReturnValue({
        delete: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        }),
      } as any);

      const req = new Request(
        "https://mock/functions/v1/drive-callback?state=non-existent-state&code=testcode"
      );
      const res = await handleDriveCallback(req);
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toContain("drive=error&reason=state");
    });

    it("redirects with Google error param if user denied access", async () => {
      vi.spyOn(admin, "rpc").mockResolvedValueOnce({ data: true, error: null } as any);
      vi.spyOn(admin, "from").mockReturnValue({
        delete: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: {
                    user_id: "user-123",
                    return_to: "/settings",
                    expires_at: new Date(Date.now() + 60000).toISOString(),
                  },
                  error: null,
                }),
            }),
          }),
        }),
      } as any);

      const req = new Request(
        "https://mock/functions/v1/drive-callback?state=valid-state-12345&error=access_denied"
      );
      const res = await handleDriveCallback(req);
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe(
        "https://mock.aboard.example/settings?drive=error&reason=access_denied"
      );
    });

    it("exchanges code, encrypts refresh token, and redirects with drive=connected on success", async () => {
      vi.spyOn(admin, "rpc").mockResolvedValueOnce({ data: true, error: null } as any);
      vi.spyOn(admin, "from").mockReturnValue({
        delete: () => ({
          eq: () => ({
            select: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: {
                    user_id: "user-123",
                    code_verifier: "test-verifier",
                    return_to: "/workspace",
                    expires_at: new Date(Date.now() + 60000).toISOString(),
                  },
                  error: null,
                }),
            }),
          }),
        }),
        upsert: () => Promise.resolve({ error: null }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      } as any);

      // Mock Google token endpoint
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "google-access-tok",
            refresh_token: "google-refresh-tok-secret",
            expires_in: 3600,
            scope: `openid email ${DRIVE_SCOPE}`,
            token_type: "Bearer",
          }),
          { status: 200 }
        )
      );

      const req = new Request(
        "https://mock/functions/v1/drive-callback?state=valid-state-12345&code=auth-code-123"
      );
      const res = await handleDriveCallback(req);
      expect(res.status).toBe(302);
      expect(res.headers.get("Location")).toBe(
        "https://mock.aboard.example/workspace?drive=connected"
      );
    });
  });

  describe("7. Function: drive-link-token", () => {
    it("rejects short or invalid refresh token payloads with 400 bad_request", async () => {
      vi.spyOn(admin.auth, "getUser").mockResolvedValueOnce({
        data: { user: { id: "user-123", email: "user@example.com" } },
        error: null,
      } as any);
      vi.spyOn(admin, "rpc").mockResolvedValueOnce({ data: true, error: null } as any);

      const req = new Request("https://mock/functions/v1/drive-link-token", {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-jwt",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refresh_token: "too-short" }),
      });

      await expect(handleDriveLinkToken(req)).rejects.toMatchObject({
        status: 400,
        code: "bad_request",
      });
    });

    it("verifies refresh token at Google, stores encrypted link, and returns connected=true", async () => {
      vi.spyOn(admin.auth, "getUser").mockResolvedValueOnce({
        data: { user: { id: "user-123", email: "user@example.com" } },
        error: null,
      } as any);
      vi.spyOn(admin, "rpc").mockResolvedValueOnce({ data: true, error: null } as any);
      vi.spyOn(admin, "from").mockReturnValue({
        upsert: () => Promise.resolve({ error: null }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      } as any);

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "google-access-tok",
            expires_in: 3600,
            scope: `openid email ${DRIVE_SCOPE}`,
            token_type: "Bearer",
          }),
          { status: 200 }
        )
      );

      const req = new Request("https://mock/functions/v1/drive-link-token", {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-jwt",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          refresh_token: "valid-google-refresh-token-from-path-a-12345",
        }),
      });

      const res = await handleDriveLinkToken(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ connected: true });
    });
  });

  describe("8. Function: drive-token", () => {
    it("returns 404 not_connected when user has no active Google link", async () => {
      vi.spyOn(admin.auth, "getUser").mockResolvedValueOnce({
        data: { user: { id: "user-123" } },
        error: null,
      } as any);
      vi.spyOn(admin, "rpc").mockResolvedValueOnce({ data: true, error: null } as any);
      vi.spyOn(admin, "from").mockReturnValue({
        select: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle: () => Promise.resolve({ data: null, error: null }),
            }),
          }),
        }),
      } as any);

      const req = new Request("https://mock/functions/v1/drive-token", {
        method: "POST",
        headers: { Authorization: "Bearer valid-jwt" },
      });

      await expect(handleDriveToken(req)).rejects.toMatchObject({
        status: 404,
        code: "not_connected",
      });
    });

    it("decrypts stored token, refreshes access token at Google, and returns fresh token", async () => {
      vi.spyOn(admin.auth, "getUser").mockResolvedValueOnce({
        data: { user: { id: "user-123" } },
        error: null,
      } as any);
      vi.spyOn(admin, "rpc").mockResolvedValueOnce({ data: true, error: null } as any);

      const { ct, iv } = await encrypt("my-secret-stored-refresh-token");

      vi.spyOn(admin, "from").mockReturnValue({
        select: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: {
                    user_id: "user-123",
                    refresh_ct: ct,
                    refresh_iv: iv,
                    google_email: "test@example.com",
                  },
                  error: null,
                }),
            }),
          }),
        }),
        update: () => ({ eq: () => Promise.resolve({ error: null }) }),
      } as any);

      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "fresh-google-access-tok-123",
            expires_in: 3600,
            scope: `openid email ${DRIVE_SCOPE}`,
            token_type: "Bearer",
          }),
          { status: 200 }
        )
      );

      const req = new Request("https://mock/functions/v1/drive-token", {
        method: "POST",
        headers: { Authorization: "Bearer valid-jwt" },
      });

      const res = await handleDriveToken(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.access_token).toBe("fresh-google-access-tok-123");
      expect(data.expires_at).toBeGreaterThan(Date.now());
    });

    it("catches invalid_grant 409 from Google, sets revoked_at, and throws 409 reconnect_required", async () => {
      vi.spyOn(admin.auth, "getUser").mockResolvedValueOnce({
        data: { user: { id: "user-123" } },
        error: null,
      } as any);
      vi.spyOn(admin, "rpc").mockResolvedValueOnce({ data: true, error: null } as any);

      const { ct, iv } = await encrypt("revoked-token");

      let updatedRevokedAt = false;
      vi.spyOn(admin, "from").mockReturnValue({
        select: () => ({
          eq: () => ({
            is: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: {
                    user_id: "user-123",
                    refresh_ct: ct,
                    refresh_iv: iv,
                  },
                  error: null,
                }),
            }),
          }),
        }),
        update: (fields: any) => {
          if (fields.revoked_at) updatedRevokedAt = true;
          return { eq: () => Promise.resolve({ error: null }) };
        },
      } as any);

      // Google returns invalid_grant
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: "invalid_grant",
            error_description: "Token has been expired or revoked.",
          }),
          { status: 400 }
        )
      );

      const req = new Request("https://mock/functions/v1/drive-token", {
        method: "POST",
        headers: { Authorization: "Bearer valid-jwt" },
      });

      await expect(handleDriveToken(req)).rejects.toMatchObject({
        status: 409,
        code: "reconnect_required",
      });
      expect(updatedRevokedAt).toBe(true);
    });
  });

  describe("9. Function: drive-disconnect", () => {
    it("revokes token at Google, deletes database row, sets local mode, and returns connected=false", async () => {
      vi.spyOn(admin.auth, "getUser").mockResolvedValueOnce({
        data: { user: { id: "user-123" } },
        error: null,
      } as any);
      vi.spyOn(admin, "rpc").mockResolvedValueOnce({ data: true, error: null } as any);

      const { ct, iv } = await encrypt("refresh-token-to-revoke");
      let deletedRow = false;
      let storageSetToLocal = false;

      vi.spyOn(admin, "from").mockReturnValue({
        select: () => ({
          eq: () => ({
            maybeSingle: () =>
              Promise.resolve({
                data: {
                  user_id: "user-123",
                  refresh_ct: ct,
                  refresh_iv: iv,
                },
                error: null,
              }),
          }),
        }),
        delete: () => ({
          eq: () => {
            deletedRow = true;
            return Promise.resolve({ error: null });
          },
        }),
        update: (fields: any) => {
          if (fields.default_storage === "local") storageSetToLocal = true;
          return { eq: () => Promise.resolve({ error: null }) };
        },
      } as any);

      const fetchSpy = vi
        .spyOn(globalThis, "fetch")
        .mockResolvedValueOnce(new Response("", { status: 200 }));

      const req = new Request("https://mock/functions/v1/drive-disconnect", {
        method: "POST",
        headers: { Authorization: "Bearer valid-jwt" },
      });

      const res = await handleDriveDisconnect(req);
      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data).toEqual({ connected: false });
      expect(deletedRow).toBe(true);
      expect(storageSetToLocal).toBe(true);
      expect(fetchSpy).toHaveBeenCalledWith(
        "https://oauth2.googleapis.com/revoke",
        expect.any(Object)
      );
    });
  });
});
