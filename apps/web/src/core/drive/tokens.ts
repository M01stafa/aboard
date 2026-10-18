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
   * Returns a valid access token. If missing or expiring within 60 seconds,
   * refreshes via the drive-token Edge Function with concurrent request deduplication.
   */
  async get(): Promise<string> {
    if (this.token && Date.now() < this.token.exp - 60_000) {
      return this.token.value;
    }
    this.inflight ??= this.fetchToken().finally(() => {
      this.inflight = undefined;
    });
    return this.inflight;
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
      const status =
        (error as { context?: Response })?.context?.status ||
        (error as any)?.status;
      if (status === 409 || status === 404) {
        bus.emit("drive:reconnect-required", {
          reason: status === 409 ? "revoked" : "not_connected",
        });
      }
      throw error;
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
