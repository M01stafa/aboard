import { create } from "zustand";
import { supabase } from "@/core/supabase";
import { bus } from "@/core/bus";
import { driveTokenManager } from "./tokens";

export interface DriveStatusRow {
  connected: boolean;
  google_email: string | null;
  linked_at: string | null;
  reconnect_required?: boolean;
}

export interface DriveStatusState {
  connected: boolean;
  googleEmail: string | null;
  linkedAt: string | null;
  reconnectRequired: boolean;
  loading: boolean;
  error: string | null;

  fetchStatus: () => Promise<void>;
  connect: (returnTo?: string) => Promise<string>;
  disconnect: () => Promise<void>;
  handlePathA: (providerRefreshToken: string) => Promise<void>;
  clearError: () => void;
}

export const useDriveStore = create<DriveStatusState>((set, get) => {
  if (typeof window !== "undefined") {
    bus.on("drive:reconnect-required", () => {
      set({ reconnectRequired: true });
    });
  }

  return {
    connected: false,
    googleEmail: null,
    linkedAt: null,
    reconnectRequired: false,
    loading: false,
    error: null,

    fetchStatus: async () => {
      set({ loading: true, error: null });
      try {
        const { data, error } = await supabase.rpc("get_drive_status");
        if (error) throw error;
        const row = (Array.isArray(data) ? data[0] : data) as DriveStatusRow | undefined;
        if (row && row.connected) {
          set({
            connected: true,
            googleEmail: row.google_email,
            linkedAt: row.linked_at,
            reconnectRequired: false,
            loading: false,
          });
        } else {
          set({
            connected: false,
            googleEmail: null,
            linkedAt: null,
            loading: false,
          });
        }
      } catch (err: unknown) {
        set({
          loading: false,
          error:
            err instanceof Error ? err.message : "Failed to fetch Drive status",
        });
      }
    },

    connect: async (returnTo = "/settings") => {
      set({ loading: true, error: null });
      try {
        const { data, error } = await supabase.functions.invoke(
          "drive-connect",
          {
            body: { returnTo },
          }
        );
        if (error) throw error;
        if (!data?.url) throw new Error("No consent URL returned");
        set({ loading: false });
        return data.url;
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to initiate Drive connection";
        set({ loading: false, error: message });
        throw err;
      }
    },

    disconnect: async () => {
      set({ loading: true, error: null });
      try {
        const { error } = await supabase.functions.invoke("drive-disconnect", {
          method: "POST",
        });
        if (error) throw error;
        driveTokenManager.invalidate();
        set({
          connected: false,
          googleEmail: null,
          linkedAt: null,
          reconnectRequired: false,
          loading: false,
        });
        bus.emit("drive:disconnected", {});
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to disconnect Google Drive";
        set({ loading: false, error: message });
        throw err;
      }
    },

    handlePathA: async (providerRefreshToken: string) => {
      set({ loading: true, error: null });
      try {
        const { error: linkErr } = await supabase.functions.invoke(
          "drive-link-token",
          { body: { refresh_token: providerRefreshToken } }
        );
        if (linkErr) throw linkErr;
        await supabase.auth.refreshSession();
        await get().fetchStatus();
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "Failed to link Google Drive via Path A";
        set({ loading: false, error: message });
        throw err;
      }
    },

    clearError: () => set({ error: null }),
  };
});
