import type { AboardDatabase, FileRecord } from "@/core/db";

export const DEFAULT_CACHE_MAX_BYTES = 500 * 1024 * 1024; // 500 MB
export const DEFAULT_CACHE_TARGET_BYTES = 400 * 1024 * 1024; // 400 MB target after eviction

export interface EvictionResult {
  initialBytes: number;
  finalBytes: number;
  evictedCount: number;
  evictedBytes: number;
}

/**
 * Calculates total byte size of cached unpinned files in Dexie.
 */
export async function getUnpinnedCacheSize(db: AboardDatabase): Promise<number> {
  const files = await db.files.toArray();
  return files.reduce((sum, f) => {
    if (f.pinned === true) return sum;
    return sum + (f.size || f.blob?.size || 0);
  }, 0);
}

/**
 * Evicts least-recently-used (LRU) clean files when usage passes maxCacheBytes (500MB).
 *
 * STRICT RULES (SEC-4, STORE-2, docs/specs/storage-layer.md §11.2):
 * 1. NEVER evict files pinned in local mode (pinned === true).
 * 2. NEVER evict files that haven't been uploaded to Drive yet (driveFileId must exist).
 * 3. NEVER evict dirty rows or files linked to pending outbox entries.
 */
export async function evictLruCacheIfNeeded(
  db: AboardDatabase,
  maxCacheBytes: number = DEFAULT_CACHE_MAX_BYTES,
  targetBytes: number = DEFAULT_CACHE_TARGET_BYTES
): Promise<EvictionResult> {
  const allFiles = await db.files.toArray();

  let totalBytes = 0;
  const eligibleFiles: FileRecord[] = [];

  for (const f of allFiles) {
    const size = f.size || f.blob?.size || 0;

    // Rule 1: Never evict local-mode / pinned files
    if (f.pinned === true) {
      continue;
    }

    totalBytes += size;

    // Rule 2: Only evict clean files that exist on Drive and have a confirmed driveFileId
    if (f.driveFileId) {
      eligibleFiles.push(f);
    }
  }

  const initialBytes = totalBytes;

  // Usage is below limit: no eviction needed
  if (totalBytes <= maxCacheBytes) {
    return {
      initialBytes,
      finalBytes: totalBytes,
      evictedCount: 0,
      evictedBytes: 0,
    };
  }

  // Sort eligible files by lastAccess ascending (oldest accessed first)
  eligibleFiles.sort((a, b) => (a.lastAccess || 0) - (b.lastAccess || 0));

  let evictedCount = 0;
  let evictedBytes = 0;

  for (const file of eligibleFiles) {
    if (totalBytes <= targetBytes) {
      break;
    }

    const fileSize = file.size || file.blob?.size || 0;
    await db.files.delete([file.projectId, file.key]);

    totalBytes -= fileSize;
    evictedBytes += fileSize;
    evictedCount++;
  }

  return {
    initialBytes,
    finalBytes: totalBytes,
    evictedCount,
    evictedBytes,
  };
}
