import { driveTokenManager, type DriveTokenManager } from "./tokens";

export type AboardKind =
  | "root"
  | "project"
  | "manifest"
  | "board"
  | "circuit"
  | "pdf"
  | "annotations"
  | "file";

export interface AboardAppProperties {
  aboardKind: AboardKind;
  aboardProjectId?: string;
  aboardItemId?: string;
  aboardFileKey?: string;
  aboardFileHash?: string;
  [key: string]: string | undefined;
}

export interface DriveFileMeta {
  id: string;
  name?: string;
  mimeType?: string;
  appProperties?: AboardAppProperties;
  headRevisionId?: string;
  size?: string | number;
  modifiedTime?: string;
  trashed?: boolean;
  parents?: string[];
}

export class DriveApiError extends Error {
  readonly status: number;
  readonly reason?: string;
  readonly isQuotaExceeded: boolean;

  constructor(status: number, message: string, reason?: string) {
    super(message);
    this.name = "DriveApiError";
    this.status = status;
    this.reason = reason;
    this.isQuotaExceeded =
      status === 403 &&
      (reason === "storageQuotaExceeded" ||
        message.includes("storageQuotaExceeded") ||
        message.includes("quota"));
  }
}

export class StorageQuotaExceededError extends DriveApiError {
  constructor(message = "Google Drive storage quota exceeded") {
    super(403, message, "storageQuotaExceeded");
    this.name = "StorageQuotaExceededError";
  }
}

export const DRIVE_API_BASE = "https://www.googleapis.com/drive/v3";
export const DRIVE_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";

export interface DriveFetchOptions extends RequestInit {
  tokenManager?: DriveTokenManager;
}

/**
 * Checks if a Drive 403 response is due to rate limits or quota.
 */
async function inspectDriveError(res: Response): Promise<{
  isRateLimit: boolean;
  isQuota: boolean;
  reason?: string;
  message?: string;
}> {
  try {
    const body = await res.clone().json();
    const errorObj = body?.error;
    const firstError = errorObj?.errors?.[0];
    const reason = firstError?.reason || errorObj?.status;
    const message = errorObj?.message || "";

    const isRateLimit =
      reason === "rateLimitExceeded" ||
      reason === "userRateLimitExceeded" ||
      reason === "RESOURCE_EXHAUSTED";

    const isQuota =
      reason === "storageQuotaExceeded" ||
      message.includes("storageQuotaExceeded") ||
      message.includes("quota");

    return { isRateLimit, isQuota, reason, message };
  } catch {
    return { isRateLimit: false, isQuota: false };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Low-level authenticated fetch wrapper for Google Drive API.
 * - Injects in-memory Google Access Token.
 * - Retries once on 401 with fresh token.
 * - Retries up to 5 times with exponential backoff and jitter on 429, 5xx, or 403 rate limits.
 * - Throws StorageQuotaExceededError on 403 quota exhaustion.
 */
export async function driveFetch(
  url: string,
  init: RequestInit = {},
  attempt = 0,
  tokenManager: DriveTokenManager = driveTokenManager
): Promise<Response> {
  const token = await tokenManager.get();

  const headers = new Headers(init.headers || {});
  headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(url, { ...init, headers });

  // 1. Handle 401: invalidate in-memory cache and retry once
  if (res.status === 401 && attempt === 0) {
    tokenManager.invalidate();
    return driveFetch(url, init, 1, tokenManager);
  }

  // 2. Handle 403 quota or rate-limit inspection
  if (res.status === 403) {
    const { isRateLimit, isQuota, reason, message } = await inspectDriveError(res);
    if (isQuota) {
      throw new StorageQuotaExceededError(message);
    }
    if (isRateLimit && attempt < 5) {
      const delay = Math.min(32_000, 2 ** attempt * 1000) + Math.random() * 1000;
      await sleep(delay);
      return driveFetch(url, init, attempt + 1, tokenManager);
    }
  }

  // 3. Handle 429 or 5xx: retry with exponential backoff + jitter up to 5 attempts
  const isRetryable = res.status === 429 || res.status >= 500;
  if (isRetryable && attempt < 5) {
    const delay = Math.min(32_000, 2 ** attempt * 1000) + Math.random() * 1000;
    await sleep(delay);
    return driveFetch(url, init, attempt + 1, tokenManager);
  }

  return res;
}

/**
 * Asserts response is 2xx and parses JSON body.
 */
async function ensureOk<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const { reason, message, isQuota } = await inspectDriveError(res);
    if (isQuota) {
      throw new StorageQuotaExceededError(message);
    }
    throw new DriveApiError(
      res.status,
      message || `Drive API request failed with status ${res.status}`,
      reason
    );
  }
  return res.json() as Promise<T>;
}

/**
 * Constructs multipart/related request body for small file uploads (< 5MB).
 */
export function createMultipartBody(metadata: object, blob: Blob): {
  body: Blob;
  headers: Record<string, string>;
} {
  const boundary = `aboard-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2)}`;
  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
    JSON.stringify(metadata),
    `\r\n--${boundary}\r\nContent-Type: ${blob.type || "application/octet-stream"}\r\n\r\n`,
    blob,
    `\r\n--${boundary}--`,
  ]);

  return {
    body,
    headers: {
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
  };
}

/**
 * Searches for files matching a Drive v3 query.
 */
export async function findFiles(
  query: string,
  fields = "files(id,name,mimeType,appProperties,headRevisionId,size,modifiedTime,parents,trashed)",
  tokenManager?: DriveTokenManager
): Promise<DriveFileMeta[]> {
  const url = `${DRIVE_API_BASE}/files?q=${encodeURIComponent(query)}&fields=${encodeURIComponent(fields)}`;
  const res = await driveFetch(url, { method: "GET" }, 0, tokenManager);
  const data = await ensureOk<{ files?: DriveFileMeta[] }>(res);
  return data.files || [];
}

/**
 * Reads file metadata by fileId.
 */
export async function getFileMeta(
  fileId: string,
  fields = "id,name,mimeType,appProperties,headRevisionId,size,modifiedTime,parents,trashed",
  tokenManager?: DriveTokenManager
): Promise<DriveFileMeta> {
  const url = `${DRIVE_API_BASE}/files/${fileId}?fields=${encodeURIComponent(fields)}`;
  const res = await driveFetch(url, { method: "GET" }, 0, tokenManager);
  return ensureOk<DriveFileMeta>(res);
}

/**
 * Downloads file binary content as Blob.
 */
export async function downloadFileBlob(
  fileId: string,
  tokenManager?: DriveTokenManager
): Promise<Blob> {
  const url = `${DRIVE_API_BASE}/files/${fileId}?alt=media`;
  const res = await driveFetch(url, { method: "GET" }, 0, tokenManager);
  if (!res.ok) {
    const { isQuota, reason, message } = await inspectDriveError(res);
    if (isQuota) throw new StorageQuotaExceededError(message);
    throw new DriveApiError(
      res.status,
      message || `Failed to download file ${fileId} (${res.status})`,
      reason
    );
  }
  return res.blob();
}

/**
 * Downloads file text content.
 */
export async function downloadFileText(
  fileId: string,
  tokenManager?: DriveTokenManager
): Promise<string> {
  const blob = await downloadFileBlob(fileId, tokenManager);
  return blob.text();
}

/**
 * Creates a folder with specific appProperties and optional parent.
 */
export async function createFolder(
  name: string,
  appProperties: AboardAppProperties,
  parentId?: string,
  tokenManager?: DriveTokenManager
): Promise<DriveFileMeta> {
  const metadata = {
    name,
    mimeType: "application/vnd.google-apps.folder",
    appProperties,
    parents: parentId ? [parentId] : undefined,
  };

  const res = await driveFetch(
    `${DRIVE_API_BASE}/files?fields=id,name,mimeType,appProperties,headRevisionId`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify(metadata),
    },
    0,
    tokenManager
  );

  return ensureOk<DriveFileMeta>(res);
}

/**
 * Soft deletes a file or folder by moving it to Drive trash.
 */
export async function trashFile(
  fileId: string,
  tokenManager?: DriveTokenManager
): Promise<void> {
  const res = await driveFetch(
    `${DRIVE_API_BASE}/files/${fileId}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify({ trashed: true }),
    },
    0,
    tokenManager
  );

  await ensureOk<{ id: string }>(res);
}

/**
 * Creates a file < 5MB using a single multipart/related HTTP request.
 */
export async function multipartCreateFile(
  metadata: {
    name: string;
    mimeType: string;
    parents?: string[];
    appProperties: AboardAppProperties;
  },
  blob: Blob,
  tokenManager?: DriveTokenManager
): Promise<{ id: string; headRevisionId?: string; appProperties?: AboardAppProperties }> {
  const { body, headers } = createMultipartBody(metadata, blob);
  const res = await driveFetch(
    `${DRIVE_UPLOAD_BASE}/files?uploadType=multipart&fields=id,headRevisionId,appProperties`,
    {
      method: "POST",
      headers,
      body,
    },
    0,
    tokenManager
  );

  return ensureOk<{ id: string; headRevisionId?: string; appProperties?: AboardAppProperties }>(res);
}

/**
 * Updates the binary/text content of an existing file.
 */
export async function updateFileContent(
  fileId: string,
  blob: Blob,
  tokenManager?: DriveTokenManager
): Promise<{ id: string; headRevisionId?: string }> {
  const res = await driveFetch(
    `${DRIVE_UPLOAD_BASE}/files/${fileId}?uploadType=media&fields=id,headRevisionId`,
    {
      method: "PATCH",
      headers: { "Content-Type": blob.type || "application/octet-stream" },
      body: blob,
    },
    0,
    tokenManager
  );

  return ensureOk<{ id: string; headRevisionId?: string }>(res);
}

/**
 * Resumable upload for files >= 5MB in 8 MiB chunks (multiple of 256 KiB).
 * Implements Google Drive v3 Resumable Upload protocol.
 */
export async function resumableCreateFile(
  metadata: {
    name: string;
    mimeType: string;
    parents?: string[];
    appProperties: AboardAppProperties;
  },
  blob: Blob,
  onProgress?: (progress: number) => void,
  tokenManager?: DriveTokenManager
): Promise<{ id: string; headRevisionId?: string; appProperties?: AboardAppProperties }> {
  // Step 1: Initiate resumable session
  const startRes = await driveFetch(
    `${DRIVE_UPLOAD_BASE}/files?uploadType=resumable&fields=id,headRevisionId,appProperties`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": blob.type || "application/octet-stream",
        "X-Upload-Content-Length": String(blob.size),
      },
      body: JSON.stringify(metadata),
    },
    0,
    tokenManager
  );

  if (!startRes.ok) {
    const { isQuota, reason, message } = await inspectDriveError(startRes);
    if (isQuota) throw new StorageQuotaExceededError(message);
    throw new DriveApiError(
      startRes.status,
      message || `Failed to initiate resumable upload session (${startRes.status})`,
      reason
    );
  }

  const sessionUrl = startRes.headers.get("Location");
  if (!sessionUrl) {
    throw new Error("Resumable upload session URL missing in Location header");
  }

  // Step 2: Upload chunks of 8 MiB (8 * 1024 * 1024 bytes)
  const CHUNK_SIZE = 8 * 1024 * 1024;
  let offset = 0;
  const totalSize = blob.size;

  while (offset < totalSize) {
    const end = Math.min(offset + CHUNK_SIZE, totalSize);
    const chunk = blob.slice(offset, end);

    let chunkRes: Response;
    try {
      chunkRes = await fetch(sessionUrl, {
        method: "PUT",
        headers: {
          "Content-Range": `bytes ${offset}-${end - 1}/${totalSize}`,
          "Content-Type": blob.type || "application/octet-stream",
        },
        body: chunk,
      });
    } catch {
      // Network interruption: query status and resume
      offset = await queryResumableStatus(sessionUrl, totalSize);
      onProgress?.(offset / totalSize);
      continue;
    }

    // 308 Resume Incomplete
    if (chunkRes.status === 308) {
      const range = chunkRes.headers.get("Range");
      if (range) {
        const match = range.match(/bytes=0-(\d+)/);
        if (match) {
          offset = Number(match[1]) + 1;
        } else {
          offset = end;
        }
      } else {
        offset = end;
      }
      onProgress?.(offset / totalSize);
      continue;
    }

    // 200 or 201: Upload completed
    if (chunkRes.ok) {
      onProgress?.(1);
      return chunkRes.json() as Promise<{
        id: string;
        headRevisionId?: string;
        appProperties?: AboardAppProperties;
      }>;
    }

    // 403 quota check
    if (chunkRes.status === 403) {
      const { isQuota, reason, message } = await inspectDriveError(chunkRes);
      if (isQuota) throw new StorageQuotaExceededError(message);
      throw new DriveApiError(chunkRes.status, message || "Upload forbidden", reason);
    }

    // 5xx server error during chunk: query status and retry
    if (chunkRes.status >= 500) {
      offset = await queryResumableStatus(sessionUrl, totalSize);
      onProgress?.(offset / totalSize);
      continue;
    }

    throw new DriveApiError(
      chunkRes.status,
      `Resumable chunk upload failed with status ${chunkRes.status}`
    );
  }

  throw new Error("Resumable upload loop exited without completion");
}

/**
 * Queries resumable upload status when interrupted.
 */
async function queryResumableStatus(sessionUrl: string, totalSize: number): Promise<number> {
  const statusRes = await fetch(sessionUrl, {
    method: "PUT",
    headers: {
      "Content-Range": `bytes */${totalSize}`,
    },
  });

  if (statusRes.status === 308) {
    const range = statusRes.headers.get("Range");
    if (range) {
      const match = range.match(/bytes=0-(\d+)/);
      if (match) {
        return Number(match[1]) + 1;
      }
    }
  }

  return 0;
}

/**
 * Automatically uploads a file using multipart (< 5MB) or resumable (>= 5MB).
 */
export async function uploadFile(
  metadata: {
    name: string;
    mimeType: string;
    parents?: string[];
    appProperties: AboardAppProperties;
  },
  blob: Blob,
  onProgress?: (progress: number) => void,
  tokenManager?: DriveTokenManager
): Promise<{ id: string; headRevisionId?: string; appProperties?: AboardAppProperties }> {
  if (blob.size >= 5 * 1024 * 1024) {
    return resumableCreateFile(metadata, blob, onProgress, tokenManager);
  }
  return multipartCreateFile(metadata, blob, tokenManager);
}

/**
 * Gets or creates the "Aboard" root folder in the user's My Drive.
 * Identified by appProperties: { aboardKind: "root" }.
 */
export async function getOrCreateRootFolder(
  tokenManager?: DriveTokenManager
): Promise<DriveFileMeta> {
  const query =
    "appProperties has { key='aboardKind' and value='root' } and trashed = false and mimeType = 'application/vnd.google-apps.folder'";
  const files = await findFiles(query, undefined, tokenManager);

  if (files.length > 0) {
    return files[0];
  }

  return createFolder(
    "Aboard",
    { aboardKind: "root" },
    undefined,
    tokenManager
  );
}

/**
 * Gets or creates a project folder under root.
 * Identified by appProperties: { aboardKind: "project", aboardProjectId: projectId }.
 */
export async function getOrCreateProjectFolder(
  projectId: string,
  title: string,
  rootFolderId: string,
  tokenManager?: DriveTokenManager
): Promise<DriveFileMeta> {
  const query = `'${rootFolderId}' in parents and appProperties has { key='aboardKind' and value='project' } and appProperties has { key='aboardProjectId' and value='${projectId}' } and trashed = false and mimeType = 'application/vnd.google-apps.folder'`;
  const files = await findFiles(query, undefined, tokenManager);

  if (files.length > 0) {
    return files[0];
  }

  const shortId = projectId.slice(0, 6);
  const folderName = `${title} (${shortId})`;

  return createFolder(
    folderName,
    {
      aboardKind: "project",
      aboardProjectId: projectId,
    },
    rootFolderId,
    tokenManager
  );
}
