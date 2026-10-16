import type { ItemRecord, StorageProvider } from "./types";
import type { ProjectService } from "./project-service";
import { getDb, type AboardDatabase } from "@/core/db";
import { requestPersistenceSilently } from "./persistence";

/**
 * The five save status states defined in WS-3 and docs/specs/storage-layer.md §11.4.
 * In Phase 2, only "saving" and "saved-local" are reachable.
 */
export type SaveStatus =
  | "saved-drive"
  | "saving"
  | "saved-local"
  | "waiting-connection"
  | "reconnect-drive";

export interface QueuedItem {
  projectId: string;
  item: ItemRecord;
  payload: string;
  queuedAt: number;
}

export interface SaveQueueOptions {
  debounceMs?: number;
  projectService?: ProjectService;
  db?: AboardDatabase;
  onDirtyTransition?: (itemId: string, state: "dirty" | "clean") => void;
  onStatusChange?: (status: SaveStatus) => void;
}

export interface DriveCadenceConfig {
  readonly idleDelayMs: number; // 3 s after last change
  readonly maxIntervalMs: number; // At most once per 30 s continuous
}

/**
 * SaveQueue: framework-agnostic persistence queue ensuring silent, debounced,
 * and reliable saving to IndexedDB with zero lost work (STORE-1, STORE-3, WS-3, WS-4).
 * Implements docs/specs/storage-layer.md §11.3–11.4.
 */
export class SaveQueue {
  private projectService?: ProjectService;
  private customDb?: AboardDatabase;
  private status: SaveStatus = "saved-local";
  private listeners = new Set<(status: SaveStatus) => void>();
  private pendingMap = new Map<string, QueuedItem>(); // key: `${projectId}:${itemId}`
  private debounceTimer?: ReturnType<typeof setTimeout>;
  private debounceMs: number;
  private persistenceRequested = false;
  private hasUnsyncedDriveEntries = false;
  private onDirtyTransition?: (itemId: string, state: "dirty" | "clean") => void;
  private driveUploadHook?: (items: QueuedItem[]) => Promise<void>;
  private detachBrowserListeners?: () => void;

  // Drive upload cadence structured for Task 35 (§11.4: 3s idle, max 30s continuous)
  public static readonly DRIVE_CADENCE: DriveCadenceConfig = {
    idleDelayMs: 3000,
    maxIntervalMs: 30000,
  };
  private driveIdleTimer?: ReturnType<typeof setTimeout>;
  private driveMaxTimer?: ReturnType<typeof setTimeout>;
  private driveLastUploadTimestamp = 0;

  constructor(optionsOrService?: ProjectService | SaveQueueOptions) {
    if (optionsOrService && "getProvider" in optionsOrService) {
      this.projectService = optionsOrService;
      this.debounceMs = 500;
    } else {
      const opts = optionsOrService ?? {};
      this.projectService = opts.projectService;
      this.customDb = opts.db;
      this.debounceMs = opts.debounceMs ?? 500;
      this.onDirtyTransition = opts.onDirtyTransition;
      if (opts.onStatusChange) {
        this.listeners.add(opts.onStatusChange);
      }
    }

    // Auto-attach browser hooks in browser environments
    if (typeof window !== "undefined") {
      this.attachBrowserHooks();
    }
  }

  public setProjectService(service: ProjectService): void {
    this.projectService = service;
  }

  public getStatus(): SaveStatus {
    return this.status;
  }

  public subscribe(listener: (status: SaveStatus) => void): () => void {
    this.listeners.add(listener);
    listener(this.status);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private setStatus(next: SaveStatus): void {
    if (this.status === next) return;
    this.status = next;
    for (const listener of this.listeners) {
      listener(this.status);
    }
  }

  private resolveDb(): AboardDatabase | null {
    return this.customDb ?? getDb() ?? null;
  }

  public isLocalMode(): boolean {
    if (!this.projectService) return true;
    return this.projectService.getProvider().kind === "local";
  }

  /**
   * Enqueues an item change notification from ProjectService.
   * Debounces writes at ~500 ms and coalesces rapid edits to the same item.
   */
  public enqueue(projectId: string, item: ItemRecord, payload: string): void {
    const key = `${projectId}:${item.id}`;

    // Coalesce edits per item: latest payload and title win
    this.pendingMap.set(key, {
      projectId,
      item,
      payload,
      queuedAt: Date.now(),
    });

    this.setStatus("saving");

    // Debounce writes at ~500 ms
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this.debounceTimer = setTimeout(() => {
      void this.flushNow();
    }, this.debounceMs);

    // Structure Drive upload cadence for Phase 7 (Task 35)
    this.scheduleDriveUploadCadence();
  }

  public hasPending(projectId: string, itemId: string): boolean {
    return this.pendingMap.has(`${projectId}:${itemId}`);
  }

  public getPendingPayload(projectId: string, itemId: string): string | undefined {
    return this.pendingMap.get(`${projectId}:${itemId}`)?.payload;
  }

  public cancelPending(projectId: string, itemId: string): void {
    this.pendingMap.delete(`${projectId}:${itemId}`);
    if (this.pendingMap.size === 0 && this.status === "saving") {
      this.setStatus(this.isLocalMode() ? "saved-local" : "saved-drive");
    }
  }

  public cancelAllForProject(projectId: string): void {
    for (const key of Array.from(this.pendingMap.keys())) {
      if (key.startsWith(`${projectId}:`)) {
        this.pendingMap.delete(key);
      }
    }
    if (this.pendingMap.size === 0 && this.status === "saving") {
      this.setStatus(this.isLocalMode() ? "saved-local" : "saved-drive");
    }
  }

  /**
   * Notification from ProjectService when a binary file is saved.
   */
  public notifyFileSaved(_projectId: string, _fileKey: string): void {
    // In local mode, binary files write directly to IndexedDB
    if (this.isLocalMode() && !this.persistenceRequested) {
      this.persistenceRequested = true;
      void requestPersistenceSilently();
    }
  }

  /**
   * Notification from ProjectService when an item is directly written.
   */
  public notifyItemSaved(_projectId: string, _item: ItemRecord): void {
    if (this.isLocalMode() && !this.persistenceRequested) {
      this.persistenceRequested = true;
      void requestPersistenceSilently();
    }
  }

  /**
   * Notification when switching projects: flushes previous project's edits immediately.
   */
  public async onProjectSwitch(_newProjectId?: string): Promise<void> {
    await this.flushNow();
  }

  /**
   * Hook for Task 35 to insert Drive upload step without rewriting the queue.
   */
  public setDriveUploadHook(hook: (items: QueuedItem[]) => Promise<void>): void {
    this.driveUploadHook = hook;
  }

  /**
   * Structured Drive-upload cadence for Task 35 (§11.4: 3s after last change, at most once per 30s continuous).
   * Does not call any Drive code in Phase 2.
   */
  private scheduleDriveUploadCadence(): void {
    if (this.isLocalMode()) return;

    // 1. Idle delay: 3 s after the last change
    if (this.driveIdleTimer) {
      clearTimeout(this.driveIdleTimer);
    }
    this.driveIdleTimer = setTimeout(() => {
      void this.executeDriveUploadCadence("idle-3s");
    }, SaveQueue.DRIVE_CADENCE.idleDelayMs);

    // 2. Continuous editing cap: at most once per 30 s
    if (!this.driveMaxTimer) {
      this.driveMaxTimer = setTimeout(() => {
        void this.executeDriveUploadCadence("continuous-30s");
      }, SaveQueue.DRIVE_CADENCE.maxIntervalMs);
    }
  }

  private async executeDriveUploadCadence(_trigger: "idle-3s" | "continuous-30s"): Promise<void> {
    if (this.isLocalMode()) return;

    if (this.driveIdleTimer) {
      clearTimeout(this.driveIdleTimer);
      this.driveIdleTimer = undefined;
    }
    if (this.driveMaxTimer) {
      clearTimeout(this.driveMaxTimer);
      this.driveMaxTimer = undefined;
    }
    this.driveLastUploadTimestamp = Date.now();

    // Hook will be called when Task 35 attaches DriveProvider
    if (this.driveUploadHook) {
      await this.driveUploadHook([]);
    }
  }

  /**
   * Flushes all pending writes immediately to IndexedDB.
   * Triggered by: tab close (beforeunload), visibilitychange (hidden), project switch, exportAlpha.
   */
  public async flushNow(): Promise<void> {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = undefined;
    }

    if (this.pendingMap.size === 0) {
      if (this.status === "saving") {
        this.setStatus(this.isLocalMode() ? "saved-local" : "saved-drive");
      }
      return;
    }

    // Take snapshot of pending items and clear queue
    const entries = Array.from(this.pendingMap.values());
    this.pendingMap.clear();

    const provider: StorageProvider | undefined = this.projectService?.getProvider();
    const db = this.resolveDb();
    const isLocal = this.isLocalMode();

    for (const entry of entries) {
      // Step 1: Write to provider / IndexedDB
      if (provider) {
        await provider.writeItem(entry.projectId, entry.item, entry.payload);
      }

      // Step 2: Mark affected row dirty in IndexedDB first, and upsert outbox entry
      if (db) {
        try {
          await db.items.update(entry.item.id, { dirty: 1 });
          const existing = await db.outbox.where("itemId").equals(entry.item.id).first();
          if (existing?.seq) {
            await db.outbox.update(existing.seq, {
              payload: entry.payload,
              createdAt: Date.now(),
            });
          } else {
            await db.outbox.put({
              projectId: entry.projectId,
              itemId: entry.item.id,
              payload: entry.payload,
              createdAt: Date.now(),
            });
          }
        } catch {
          // Non-fatal if mock/testing DB doesn't support table operations
        }
      }
      this.onDirtyTransition?.(entry.item.id, "dirty");

      // Step 3: In local mode, immediately mark clean (no upload needed)
      if (isLocal) {
        if (db) {
          try {
            await db.items.update(entry.item.id, { dirty: 0 });
            await db.outbox.where("itemId").equals(entry.item.id).delete();
          } catch {
            // Non-fatal
          }
        }
        this.onDirtyTransition?.(entry.item.id, "clean");
      } else {
        // In Drive mode: hook for Task 35 Drive upload step
        this.hasUnsyncedDriveEntries = true;
        if (this.driveUploadHook) {
          await this.driveUploadHook([entry]);
          this.hasUnsyncedDriveEntries = false;
        }
      }
    }

    if (isLocal) {
      this.setStatus("saved-local");
      // Request persistent storage after the first local save
      if (!this.persistenceRequested) {
        this.persistenceRequested = true;
        void requestPersistenceSilently();
      }
    } else {
      this.setStatus("saved-drive");
    }
  }

  /**
   * Synchronous check for beforeunload gating.
   * In Phase 2 (local mode), this is ALWAYS false so the "leave site?" dialog never appears.
   */
  public hasUnsyncedDriveChangesSync(): boolean {
    if (this.isLocalMode()) {
      return false;
    }
    return this.hasUnsyncedDriveEntries;
  }

  public async hasUnsyncedDriveChanges(): Promise<boolean> {
    if (this.isLocalMode()) {
      return false;
    }
    const db = this.resolveDb();
    if (!db) return this.hasUnsyncedDriveEntries;
    const count = await db.outbox.count();
    return count > 0;
  }

  /**
   * Handles beforeunload event: flushes immediately and only prompts
   * if outbox holds unsynced Drive entries (WS-4). Never prompts in local mode.
   */
  public handleBeforeUnload(event: BeforeUnloadEvent): boolean {
    // 1. Flush immediately on tab close
    void this.flushNow();

    // 2. Check if outbox holds unsynced Drive entries
    if (this.hasUnsyncedDriveChangesSync()) {
      event.preventDefault();
      event.returnValue = "";
      return true; // Dialog shown
    }
    return false; // No dialog
  }

  /**
   * Attaches browser lifecycle flush hooks:
   * 1. tab close (beforeunload)
   * 2. page becomes hidden (visibilitychange)
   */
  public attachBrowserHooks(): () => void {
    if (typeof window === "undefined") {
      return () => {};
    }

    if (this.detachBrowserListeners) {
      this.detachBrowserListeners();
    }

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      this.handleBeforeUnload(event);
    };

    const onVisibilityChange = () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        void this.flushNow();
      }
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("visibilitychange", onVisibilityChange);

    this.detachBrowserListeners = () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      this.detachBrowserListeners = undefined;
    };

    return this.detachBrowserListeners;
  }

  public dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    if (this.driveIdleTimer) {
      clearTimeout(this.driveIdleTimer);
    }
    if (this.driveMaxTimer) {
      clearTimeout(this.driveMaxTimer);
    }
    if (this.detachBrowserListeners) {
      this.detachBrowserListeners();
    }
    this.listeners.clear();
    this.pendingMap.clear();
  }
}
