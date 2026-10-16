import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as defaultSupabase } from "@/core/supabase";

export interface ProjectIndexRow {
  id: string;
  user_id?: string;
  title: string;
  subject: string | null;
  storage: "local" | "drive";
  drive_folder_id: string | null;
  local_device_id: string | null;
  item_count: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type StorageBadgeKind = "drive" | "this-device" | "another-device";

export interface StorageBadgeConfig {
  kind: StorageBadgeKind;
  labelKey:
    | "launcher.storageDrive"
    | "launcher.storageThisDevice"
    | "launcher.storageAnotherDevice";
  tokenPrefix: "--badge-tech" | "--badge-primary" | "--badge-bronze";
  isInteractive: boolean;
}

/**
 * Determines badge attributes and interactivity based on storage mode and device ID.
 * Follows DESIGN.md semantics and docs/specs/storage-layer.md §11.5:
 * - Drive projects: --badge-tech, openable everywhere
 * - Local on this device: --badge-primary, openable
 * - Local on another device: --badge-bronze, greyed out / non-interactive
 */
export function getProjectStorageBadge(
  project: { storage: "local" | "drive"; local_device_id?: string | null },
  currentDeviceId?: string | null
): StorageBadgeConfig {
  if (project.storage === "drive") {
    return {
      kind: "drive",
      labelKey: "launcher.storageDrive",
      tokenPrefix: "--badge-tech",
      isInteractive: true,
    };
  }

  const isThisDevice =
    Boolean(currentDeviceId) &&
    Boolean(project.local_device_id) &&
    project.local_device_id === currentDeviceId;

  if (isThisDevice) {
    return {
      kind: "this-device",
      labelKey: "launcher.storageThisDevice",
      tokenPrefix: "--badge-primary",
      isInteractive: true,
    };
  }

  return {
    kind: "another-device",
    labelKey: "launcher.storageAnotherDevice",
    tokenPrefix: "--badge-bronze",
    isInteractive: false,
  };
}

export interface ProjectIndexSyncer {
  onProjectCreated(row: {
    id: string;
    title: string;
    subject?: string;
    storage: "local" | "drive";
    localDeviceId?: string;
    driveFolderId?: string;
  }): Promise<void>;

  onProjectRenamed(id: string, newTitle: string): Promise<void>;

  onProjectDeleted(id: string, storage: "local" | "drive"): Promise<void>;

  onStorageModeChanged(
    id: string,
    params: {
      storage: "local" | "drive";
      localDeviceId?: string;
      driveFolderId?: string;
    }
  ): Promise<void>;
}

/**
 * Client-side sync interface for Supabase public.projects index table.
 * Implements Task 22 and docs/specs/storage-layer.md §11.5.
 * Never sets updated_at: touch_updated_at trigger sets it automatically.
 */
export class SupabaseProjectIndex implements ProjectIndexSyncer {
  private client: SupabaseClient;

  constructor(client?: SupabaseClient) {
    this.client = client ?? defaultSupabase;
  }

  setClient(client: SupabaseClient): void {
    this.client = client;
  }

  /**
   * Fetches recent active projects for the signed-in user, ordered by updatedAt desc.
   */
  async fetchRecentProjects(clientOverride?: SupabaseClient): Promise<ProjectIndexRow[]> {
    const client = clientOverride ?? this.client;
    const { data, error } = await client
      .from("projects")
      .select("id, title, subject, storage, drive_folder_id, local_device_id, item_count, created_at, updated_at, deleted_at")
      .is("deleted_at", null)
      .order("updated_at", { ascending: false });

    if (error) {
      throw error;
    }

    return (data as ProjectIndexRow[]) || [];
  }

  /**
   * Inserts a new project metadata row on creation.
   */
  async onProjectCreated(row: {
    id: string;
    title: string;
    subject?: string;
    storage: "local" | "drive";
    localDeviceId?: string;
    driveFolderId?: string;
  }): Promise<void> {
    const { error } = await this.client.from("projects").insert({
      id: row.id,
      title: row.title,
      subject: row.subject || null,
      storage: row.storage,
      local_device_id: row.localDeviceId || null,
      drive_folder_id: row.driveFolderId || null,
      item_count: 0,
    });

    if (error) {
      throw error;
    }
  }

  /**
   * Updates title on rename. Never touches updated_at (Postgres trigger updates it).
   */
  async onProjectRenamed(id: string, newTitle: string): Promise<void> {
    const { error } = await this.client
      .from("projects")
      .update({ title: newTitle })
      .eq("id", id);

    if (error) {
      throw error;
    }
  }

  /**
   * Deletes local project row, or soft-deletes Drive project row.
   */
  async onProjectDeleted(id: string, storage: "local" | "drive"): Promise<void> {
    if (storage === "local") {
      const { error } = await this.client.from("projects").delete().eq("id", id);
      if (error) {
        throw error;
      }
    } else {
      const { error } = await this.client
        .from("projects")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) {
        throw error;
      }
    }
  }

  /**
   * Updates storage mode and device / folder IDs.
   */
  async onStorageModeChanged(
    id: string,
    params: {
      storage: "local" | "drive";
      localDeviceId?: string;
      driveFolderId?: string;
    }
  ): Promise<void> {
    const { error } = await this.client
      .from("projects")
      .update({
        storage: params.storage,
        local_device_id: params.localDeviceId || null,
        drive_folder_id: params.driveFolderId || null,
      })
      .eq("id", id);

    if (error) {
      throw error;
    }
  }
}

export const projectIndex = new SupabaseProjectIndex();
