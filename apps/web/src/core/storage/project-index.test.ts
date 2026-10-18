import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getProjectStorageBadge,
  SupabaseProjectIndex,
  type ProjectIndexRow,
} from "./project-index";
import { ProjectService } from "./project-service";
import type { StorageProvider, AlphaManifest } from "./types";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("Project Index & Badge Selection (Task 22 / LAUNCH-2, STORE-1)", () => {
  describe("getProjectStorageBadge", () => {
    it("assigns --badge-tech to Drive projects and enables interaction", () => {
      const badge = getProjectStorageBadge(
        { storage: "drive", local_device_id: null },
        "current-dev-123"
      );
      expect(badge.kind).toBe("drive");
      expect(badge.tokenPrefix).toBe("--badge-tech");
      expect(badge.isInteractive).toBe(true);
      expect(badge.labelKey).toBe("launcher.storageDrive");
    });

    it("assigns --badge-primary to local projects matching this device and enables interaction", () => {
      const badge = getProjectStorageBadge(
        { storage: "local", local_device_id: "device-xyz" },
        "device-xyz"
      );
      expect(badge.kind).toBe("this-device");
      expect(badge.tokenPrefix).toBe("--badge-primary");
      expect(badge.isInteractive).toBe(true);
      expect(badge.labelKey).toBe("launcher.storageThisDevice");
    });

    it("assigns --badge-bronze to local projects from another device and disables interaction", () => {
      const badge = getProjectStorageBadge(
        { storage: "local", local_device_id: "device-other" },
        "device-this"
      );
      expect(badge.kind).toBe("another-device");
      expect(badge.tokenPrefix).toBe("--badge-bronze");
      expect(badge.isInteractive).toBe(false);
      expect(badge.labelKey).toBe("launcher.storageAnotherDevice");
    });

    it("assigns --badge-bronze when local project has no local_device_id or currentDeviceId is missing", () => {
      const badgeNoDevice = getProjectStorageBadge(
        { storage: "local", local_device_id: null },
        "device-this"
      );
      expect(badgeNoDevice.kind).toBe("another-device");
      expect(badgeNoDevice.tokenPrefix).toBe("--badge-bronze");
      expect(badgeNoDevice.isInteractive).toBe(false);

      const badgeNoCurrent = getProjectStorageBadge(
        { storage: "local", local_device_id: "device-this" },
        undefined
      );
      expect(badgeNoCurrent.kind).toBe("another-device");
      expect(badgeNoCurrent.isInteractive).toBe(false);
    });
  });

  describe("SupabaseProjectIndex client operations", () => {
    let mockFrom: ReturnType<typeof vi.fn>;
    let mockClient: SupabaseClient;
    let index: SupabaseProjectIndex;

    beforeEach(() => {
      mockFrom = vi.fn();
      mockClient = { from: mockFrom } as unknown as SupabaseClient;
      index = new SupabaseProjectIndex(mockClient);
    });

    it("onProjectCreated inserts project row without touching updated_at", async () => {
      const insertFn = vi.fn().mockResolvedValue({ error: null });
      mockFrom.mockReturnValue({ insert: insertFn });

      await index.onProjectCreated({
        id: "p-100",
        title: "Calculus III",
        subject: "Mathematics",
        storage: "local",
        localDeviceId: "dev-local-1",
      });

      expect(mockFrom).toHaveBeenCalledWith("projects");
      expect(insertFn).toHaveBeenCalledWith({
        id: "p-100",
        title: "Calculus III",
        subject: "Mathematics",
        storage: "local",
        local_device_id: "dev-local-1",
        drive_folder_id: null,
        item_count: 0,
      });

      // Crucial: assert updated_at is never provided (touch_updated_at trigger sets it)
      const callArg = insertFn.mock.calls[0][0];
      expect(callArg.updated_at).toBeUndefined();
      expect(callArg.created_at).toBeUndefined();
    });

    it("onProjectRenamed updates title only and never sets updated_at", async () => {
      const eqFn = vi.fn().mockResolvedValue({ error: null });
      const updateFn = vi.fn().mockReturnValue({ eq: eqFn });
      mockFrom.mockReturnValue({ update: updateFn });

      await index.onProjectRenamed("p-100", "Calculus IV - Advanced");

      expect(mockFrom).toHaveBeenCalledWith("projects");
      expect(updateFn).toHaveBeenCalledWith({ title: "Calculus IV - Advanced" });
      expect(eqFn).toHaveBeenCalledWith("id", "p-100");

      const updateArg = updateFn.mock.calls[0][0];
      expect(updateArg.updated_at).toBeUndefined();
    });

    it("onProjectDeleted deletes row for local projects", async () => {
      const eqFn = vi.fn().mockResolvedValue({ error: null });
      const deleteFn = vi.fn().mockReturnValue({ eq: eqFn });
      mockFrom.mockReturnValue({ delete: deleteFn });

      await index.onProjectDeleted("p-100", "local");

      expect(mockFrom).toHaveBeenCalledWith("projects");
      expect(deleteFn).toHaveBeenCalled();
      expect(eqFn).toHaveBeenCalledWith("id", "p-100");
    });

    it("onProjectDeleted soft-deletes row for Drive projects", async () => {
      const eqFn = vi.fn().mockResolvedValue({ error: null });
      const updateFn = vi.fn().mockReturnValue({ eq: eqFn });
      mockFrom.mockReturnValue({ update: updateFn });

      await index.onProjectDeleted("p-200", "drive");

      expect(mockFrom).toHaveBeenCalledWith("projects");
      expect(updateFn).toHaveBeenCalledWith(
        expect.objectContaining({ deleted_at: expect.any(String) })
      );
      expect(eqFn).toHaveBeenCalledWith("id", "p-200");
    });

    it("onStorageModeChanged updates storage and target identifiers", async () => {
      const eqFn = vi.fn().mockResolvedValue({ error: null });
      const updateFn = vi.fn().mockReturnValue({ eq: eqFn });
      mockFrom.mockReturnValue({ update: updateFn });

      await index.onStorageModeChanged("p-100", {
        storage: "drive",
        driveFolderId: "folder-drive-999",
      });

      expect(mockFrom).toHaveBeenCalledWith("projects");
      expect(updateFn).toHaveBeenCalledWith({
        storage: "drive",
        local_device_id: null,
        drive_folder_id: "folder-drive-999",
      });
      expect(eqFn).toHaveBeenCalledWith("id", "p-100");
    });

    it("fetchRecentProjects queries active projects ordered by updated_at descending", async () => {
      const mockRows: ProjectIndexRow[] = [
        {
          id: "p-2",
          title: "Physics",
          subject: null,
          storage: "local",
          drive_folder_id: null,
          local_device_id: "dev-1",
          item_count: 3,
          created_at: "2026-10-15T10:00:00Z",
          updated_at: "2026-10-16T12:00:00Z",
          deleted_at: null,
        },
      ];

      const orderFn = vi.fn().mockResolvedValue({ data: mockRows, error: null });
      const isFn = vi.fn().mockReturnValue({ order: orderFn });
      const selectFn = vi.fn().mockReturnValue({ is: isFn });
      mockFrom.mockReturnValue({ select: selectFn });

      const result = await index.fetchRecentProjects();

      expect(mockFrom).toHaveBeenCalledWith("projects");
      expect(selectFn).toHaveBeenCalled();
      expect(isFn).toHaveBeenCalledWith("deleted_at", null);
      expect(orderFn).toHaveBeenCalledWith("updated_at", { ascending: false });
      expect(result).toEqual(mockRows);
    });

    it("throws errors when Supabase returns an error", async () => {
      const insertFn = vi.fn().mockResolvedValue({ error: new Error("RLS violated") });
      mockFrom.mockReturnValue({ insert: insertFn });

      await expect(
        index.onProjectCreated({
          id: "p-fail",
          title: "Fail",
          storage: "local",
        })
      ).rejects.toThrow("RLS violated");
    });
  });

  describe("ProjectService lifecycle sync integration", () => {
    class MockStorageProvider implements StorageProvider {
      readonly kind = "local" as const;
      public manifests = new Map<string, AlphaManifest>();
      async createProject(manifest: AlphaManifest) {
        this.manifests.set(manifest.project.id, manifest);
        return {};
      }
      async loadManifest(id: string) {
        const m = this.manifests.get(id);
        if (!m) throw new Error("not found");
        return m;
      }
      async saveManifest(manifest: AlphaManifest) {
        this.manifests.set(manifest.project.id, manifest);
      }
      async readItem() {
        return "";
      }
      async writeItem() {}
      async deleteItem() {}
      async hasFile() {
        return false;
      }
      async readFile() {
        return new Blob();
      }
      async writeFile() {}
      async listFiles() {
        return [];
      }
      async deleteProject(id: string) {
        this.manifests.delete(id);
      }
    }

    it("triggers syncer on create, rename, and delete lifecycle events", async () => {
      const provider = new MockStorageProvider();
      const service = new ProjectService(provider);

      const createdSpy = vi.fn().mockResolvedValue(undefined);
      const renamedSpy = vi.fn().mockResolvedValue(undefined);
      const deletedSpy = vi.fn().mockResolvedValue(undefined);
      const storageSpy = vi.fn().mockResolvedValue(undefined);

      service.setIndexSyncer({
        onProjectCreated: createdSpy,
        onProjectRenamed: renamedSpy,
        onProjectDeleted: deletedSpy,
        onStorageModeChanged: storageSpy,
      });

      // 1. Create
      const manifest = await service.createProject("Bio 101", "Genetics", {
        storage: "local",
        localDeviceId: "dev-xyz",
      });
      expect(createdSpy).toHaveBeenCalledWith({
        id: manifest.project.id,
        title: "Bio 101",
        subject: "Genetics",
        storage: "local",
        localDeviceId: "dev-xyz",
        driveFolderId: undefined,
      });

      // 2. Rename
      await service.renameProject(manifest.project.id, "Bio 101 - Advanced");
      expect(renamedSpy).toHaveBeenCalledWith(manifest.project.id, "Bio 101 - Advanced");
      const loaded = await service.openProject(manifest.project.id);
      expect(loaded.project.title).toBe("Bio 101 - Advanced");

      // 3. Delete
      await service.deleteProject(manifest.project.id, "local");
      expect(deletedSpy).toHaveBeenCalledWith(manifest.project.id, "local");
      await expect(service.openProject(manifest.project.id)).rejects.toThrow();
    });
  });
});
