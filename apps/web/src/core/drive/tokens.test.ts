import { describe, it, expect, vi, beforeEach } from "vitest";
import { DriveTokenManager } from "./tokens";
import { useDriveStore } from "./drive-store";
import { supabase } from "@/core/supabase";
import { bus } from "@/core/bus";

describe("DriveTokenManager & DriveStore (Task 34 / AUTH-1, AUTH-3, SEC-2)", () => {
  let manager: DriveTokenManager;
  let mockInvoke: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockInvoke = vi.fn();

    // SupabaseClient.functions is a getter that instantiates a new FunctionsClient each access.
    // Spy on the getter to ensure all accesses get the mock.
    vi.spyOn(supabase, "functions", "get").mockReturnValue({
      invoke: mockInvoke,
    } as any);

    manager = new DriveTokenManager();
  });

  describe("DriveTokenManager (In-Memory Access Token)", () => {
    it("fetches access token via drive-token Edge Function on initial get()", async () => {
      mockInvoke.mockResolvedValueOnce({
        data: {
          access_token: "mock-access-token-1",
          expires_at: Date.now() + 3600_000,
        },
        error: null,
      });

      const token = await manager.get();
      expect(token).toBe("mock-access-token-1");
      expect(mockInvoke).toHaveBeenCalledWith("drive-token", { method: "POST" });
    });

    it("returns cached token when valid and not within 60s of expiry", async () => {
      mockInvoke.mockResolvedValueOnce({
        data: {
          access_token: "cached-token-123",
          expires_at: Date.now() + 1800_000, // 30 mins left
        },
        error: null,
      });

      const token1 = await manager.get();
      const token2 = await manager.get();

      expect(token1).toBe("cached-token-123");
      expect(token2).toBe("cached-token-123");
      expect(mockInvoke).toHaveBeenCalledTimes(1);
    });

    it("refreshes token if remaining lifetime is less than 60 seconds", async () => {
      mockInvoke
        .mockResolvedValueOnce({
          data: {
            access_token: "expiring-soon-token",
            expires_at: Date.now() + 30_000, // only 30s left (< 60s threshold)
          },
          error: null,
        })
        .mockResolvedValueOnce({
          data: {
            access_token: "fresh-new-token",
            expires_at: Date.now() + 3600_000,
          },
          error: null,
        });

      const first = await manager.get();
      expect(first).toBe("expiring-soon-token");

      const second = await manager.get();
      expect(second).toBe("fresh-new-token");
      expect(mockInvoke).toHaveBeenCalledTimes(2);
    });

    it("deduplicates concurrent get() calls to a single in-flight request", async () => {
      let resolvePromise: (value: any) => void;
      const delayedPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });

      mockInvoke.mockReturnValueOnce(delayedPromise);

      const p1 = manager.get();
      const p2 = manager.get();
      const p3 = manager.get();

      resolvePromise!({
        data: {
          access_token: "concurrent-token",
          expires_at: Date.now() + 3600_000,
        },
        error: null,
      });

      const [r1, r2, r3] = await Promise.all([p1, p2, p3]);
      expect(r1).toBe("concurrent-token");
      expect(r2).toBe("concurrent-token");
      expect(r3).toBe("concurrent-token");
      expect(mockInvoke).toHaveBeenCalledTimes(1);
    });

    it("emits drive:reconnect-required on the bus when drive-token returns 409 invalid_grant", async () => {
      mockInvoke.mockResolvedValueOnce({
        data: null,
        error: {
          context: { status: 409 },
          status: 409,
          message: "reconnect_required",
        },
      });

      const busSpy = vi.fn();
      bus.on("drive:reconnect-required", busSpy);

      await expect(manager.get()).rejects.toBeTruthy();
      expect(busSpy).toHaveBeenCalledWith({ reason: "revoked" });
      bus.off("drive:reconnect-required", busSpy);
    });

    it("emits drive:reconnect-required on the bus when drive-token returns 404 not_connected", async () => {
      mockInvoke.mockResolvedValueOnce({
        data: null,
        error: {
          context: { status: 404 },
          status: 404,
          message: "not_connected",
        },
      });

      const busSpy = vi.fn();
      bus.on("drive:reconnect-required", busSpy);

      await expect(manager.get()).rejects.toBeTruthy();
      expect(busSpy).toHaveBeenCalledWith({ reason: "not_connected" });
      bus.off("drive:reconnect-required", busSpy);
    });

    it("invalidate() clears the cached token in memory", async () => {
      mockInvoke
        .mockResolvedValueOnce({
          data: {
            access_token: "token-to-invalidate",
            expires_at: Date.now() + 3600_000,
          },
          error: null,
        })
        .mockResolvedValueOnce({
          data: {
            access_token: "re-fetched-token",
            expires_at: Date.now() + 3600_000,
          },
          error: null,
        });

      await manager.get();
      expect(manager.peekToken()?.value).toBe("token-to-invalidate");

      manager.invalidate();
      expect(manager.peekToken()).toBeUndefined();

      const next = await manager.get();
      expect(next).toBe("re-fetched-token");
    });
  });

  describe("DriveStore Actions", () => {
    it("fetchStatus() updates store state from get_drive_status RPC", async () => {
      vi.spyOn(supabase, "rpc").mockResolvedValueOnce({
        data: [
          {
            connected: true,
            google_email: "student@example.com",
            linked_at: "2026-10-18T00:00:00Z",
          },
        ],
        error: null,
      } as any);

      await useDriveStore.getState().fetchStatus();

      const state = useDriveStore.getState();
      expect(state.connected).toBe(true);
      expect(state.googleEmail).toBe("student@example.com");
      expect(state.linkedAt).toBe("2026-10-18T00:00:00Z");
      expect(state.reconnectRequired).toBe(false);
    });

    it("connect() invokes drive-connect and returns consent URL", async () => {
      mockInvoke.mockResolvedValueOnce({
        data: { url: "https://accounts.google.com/o/oauth2/v2/auth?test=1" },
        error: null,
      });

      const url = await useDriveStore.getState().connect("/settings");
      expect(url).toBe("https://accounts.google.com/o/oauth2/v2/auth?test=1");
      expect(mockInvoke).toHaveBeenCalledWith("drive-connect", {
        body: { returnTo: "/settings" },
      });
    });

    it("disconnect() invokes drive-disconnect, invalidates token manager, and emits event", async () => {
      mockInvoke.mockResolvedValueOnce({
        data: { connected: false },
        error: null,
      });

      const disconnectSpy = vi.fn();
      bus.on("drive:disconnected", disconnectSpy);

      await useDriveStore.getState().disconnect();

      expect(mockInvoke).toHaveBeenCalledWith("drive-disconnect", {
        method: "POST",
      });
      const state = useDriveStore.getState();
      expect(state.connected).toBe(false);
      expect(state.googleEmail).toBeNull();
      expect(disconnectSpy).toHaveBeenCalled();
      bus.off("drive:disconnected", disconnectSpy);
    });

    it("handlePathA() invokes drive-link-token, refreshes session, and updates status", async () => {
      mockInvoke.mockResolvedValueOnce({
        data: { connected: true },
        error: null,
      });

      const refreshSpy = vi
        .spyOn(supabase.auth, "refreshSession")
        .mockResolvedValueOnce({
          data: { session: null, user: null },
          error: null,
        } as any);

      vi.spyOn(supabase, "rpc").mockResolvedValueOnce({
        data: [
          {
            connected: true,
            google_email: "patha@example.com",
            linked_at: "2026-10-18T00:00:00Z",
          },
        ],
        error: null,
      } as any);

      await useDriveStore
        .getState()
        .handlePathA("google-refresh-token-from-path-a");

      expect(mockInvoke).toHaveBeenCalledWith("drive-link-token", {
        body: { refresh_token: "google-refresh-token-from-path-a" },
      });
      expect(refreshSpy).toHaveBeenCalled();
      expect(useDriveStore.getState().connected).toBe(true);
      expect(useDriveStore.getState().googleEmail).toBe("patha@example.com");
    });
  });
});
