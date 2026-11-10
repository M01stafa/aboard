import { supabase } from "@/core/supabase";
import { bus } from "@/core/bus";

export interface DriveToken {
  value: string;
  exp: number;
}

/**
 * DriveTokenManager keeps the Google Access Token strictly in memory (SEC-2 / SEC-5).
 * Tokens are never saved to localStorage, sessionStorage, or IndexedDB.
 */
export class DriveTokenManager {
  private token?: DriveToken;
  private inflight?: Promise<string>;

  /**
   * Returns a valid access token. If missing or expiring within 60 seconds (or if forceFresh is true),
   * refreshes via the drive-token Edge Function with concurrent request deduplication.
   */
  async get(forceFresh = false): Promise<string> {
    if (!forceFresh && this.token && Date.now() < this.token.exp - 60_000) {
      return this.token.value;
    }
    if (forceFresh) {
      this.token = undefined;
      this.inflight = undefined;
    }
    this.inflight ??= this.fetchToken().finally(() => {
      this.inflight = undefined;
    });
    return this.inflight;
  }

  /**
   * Checks whether the current access token is valid and unexpired (with 60s buffer).
   */
  isTokenValid(): boolean {
    return Boolean(this.token?.value && Date.now() < this.token.exp - 60_000);
  }

  /**
   * Explicitly ensures a valid, fresh access token is available.
   * If expired or null, refreshes via the drive-token Edge Function.
   */
  async ensureFreshToken(): Promise<string> {
    const isExpiredOrNull = !this.isTokenValid();
    return this.get(isExpiredOrNull);
  }

  /**
   * Clears in-memory token cache (e.g. on disconnect or sign-out).
   */
  invalidate(): void {
    this.token = undefined;
    this.inflight = undefined;
  }

  /**
   * Test helper to inspect in-memory state.
   */
  peekToken(): DriveToken | undefined {
    return this.token ? { ...this.token } : undefined;
  }

  private async fetchToken(): Promise<string> {
    const { data, error } = await supabase.functions.invoke("drive-token", {
      method: "POST",
    });

    if (error) {
      let message = error.message;
      const status =
        (error as { context?: Response })?.context?.status ||
        (error as any)?.status;
      let code: string | undefined;

      try {
        const ctx = (error as { context?: Response })?.context;
        if (ctx) {
          const body = await ctx.clone().json().catch(() => ({}));
          code = body?.code;
        }
      } catch {}

      if (status === 401 || code === "missing_token" || code === "invalid_token") {
        message = "You are not signed in. Please sign in to connect Google Drive, or export as an .alpha file.";
      } else if (status === 404 || code === "not_connected") {
        bus.emit("drive:reconnect-required", { reason: "not_connected" });
        message = "Google Drive is not connected. Please connect Google Drive in Settings or export as an .alpha file.";
      } else if (status === 409 || code === "reconnect_required" || code === "invalid_grant") {
        bus.emit("drive:reconnect-required", { reason: "revoked" });
        message = "Google Drive connection has expired. Please reconnect in Settings or export as an .alpha file.";
      }

      const enhancedErr = new Error(message);
      (enhancedErr as any).status = status;
      (enhancedErr as any).code = code;
      throw enhancedErr;
    }

    if (!data?.access_token) {
      throw new Error("No access_token returned by drive-token");
    }

    this.token = {
      value: data.access_token,
      exp:
        typeof data.expires_at === "number"
          ? data.expires_at
          : Date.now() + 3600_000,
    };

    return data.access_token;
  }
}

export const driveTokenManager = new DriveTokenManager();

if (typeof window !== "undefined") {
  (window as unknown as { __aboard_driveTokenManager?: DriveTokenManager }).__aboard_driveTokenManager =
    driveTokenManager;
}

