import Dexie from "dexie";
import { AboardDatabase } from "./schema";

let currentDb: AboardDatabase | null = null;
let currentUserId: string | null = null;

export type DbFactory = (userId: string) => AboardDatabase;
let dbFactory: DbFactory = (userId: string) => new AboardDatabase(userId);

/**
 * Allows injecting a custom database factory for unit testing environments.
 */
export function setDbFactoryForTesting(factory: DbFactory | null): void {
  dbFactory = factory ?? ((userId: string) => new AboardDatabase(userId));
}

/**
 * Opens the per-user IndexedDB database aboard:<userId>.
 * Idempotent: returns existing open instance if already open for the same user.
 * Generates and stores a unique device ID in the meta store on first open.
 */
export async function openDb(userId: string): Promise<AboardDatabase> {
  if (!userId || typeof userId !== "string") {
    throw new Error("Cannot open database without a valid userId.");
  }

  // Idempotent open: return active database if already open for this user
  if (currentDb && currentUserId === userId && currentDb.isOpen()) {
    return currentDb;
  }

  // If another user's database was previously open, close it first
  if (currentDb) {
    await closeDb();
  }

  const db = dbFactory(userId);
  await db.open();

  // Initialize deviceId in meta store if not present (docs/specs/storage-layer.md §11.2)
  const existingDevice = await db.meta.get("deviceId");
  if (!existingDevice || !existingDevice.value) {
    const deviceId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    await db.meta.put({ key: "deviceId", value: deviceId });
  }

  currentDb = db;
  currentUserId = userId;
  return db;
}

/**
 * Closes the active database connection if open.
 */
export async function closeDb(): Promise<void> {
  if (currentDb) {
    currentDb.close();
    currentDb = null;
    currentUserId = null;
  }
}

/**
 * Returns the currently active AboardDatabase instance, or null if closed.
 */
export function getDb(): AboardDatabase | null {
  return currentDb;
}

/**
 * Returns the userId associated with the active database, or null if none.
 */
export function getActiveUserId(): string | null {
  return currentUserId;
}

/**
 * Returns the persistent device ID for the current user from the meta store.
 * Opens the database if necessary.
 */
export async function getDeviceId(userId?: string): Promise<string> {
  const targetUserId = userId ?? currentUserId;
  if (!targetUserId) {
    if (currentDb && currentDb.isOpen()) {
      const rec = await currentDb.meta.get("deviceId");
      if (rec && typeof rec.value === "string") return rec.value;
    }
    return "unknown-device";
  }

  const db = await openDb(targetUserId);
  const rec = await db.meta.get("deviceId");
  if (rec && typeof rec.value === "string") return rec.value;

  const newId =
    typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  await db.meta.put({ key: "deviceId", value: newId });
  return newId;
}

/**
 * Deletes the specified user's database (aboard:<userId>).
 * Closes active connection first if open.
 */
export async function deleteUserDb(userId: string): Promise<void> {
  if (currentUserId === userId) {
    await closeDb();
  }
  await Dexie.delete(`aboard:${userId}`);
}

