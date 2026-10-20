import { useCallback, useEffect, useRef, useState } from "react";
import { projectService as defaultProjectService, type ProjectService } from "@/core/storage";
import { pickPersistedAppState, type PersistedAppState } from "./types";
import {
  blobToDataURL,
  compressImageIfNeeded,
  dataURLToBlob,
  extractImageFileIds,
  MAX_ALLOWED_FILE_BYTES,
} from "./image-utils";

export interface UseBoardPersistenceOptions {
  projectId: string;
  itemId: string;
  title?: string;
  projectServiceOverride?: ProjectService;
}

export interface BoardInitialData {
  elements: readonly unknown[];
  appState: PersistedAppState;
  files?: Record<string, unknown>;
}

export interface UseBoardPersistenceResult {
  initialData: BoardInitialData | null;
  isLoaded: boolean;
  saveBoard: (
    elements: readonly unknown[],
    appState: Record<string, unknown>,
    files?: Record<string, unknown>
  ) => Promise<void>;
  loadedFiles: Record<string, unknown>;
}

/**
 * Ensures all linear elements (arrows and lines) have normalized coordinates where
 * points[0] is strictly [0, 0]. In Excalidraw, if points[0] is not [0, 0], LinearElementEditor
 * logs 'Linear element is not normalized'. This normalizes points and adjusts (x, y) origin.
 */
export function normalizeLinearElements<T>(elements: readonly T[]): T[] {
  if (!Array.isArray(elements)) return [];
  return elements.map((element) => {
    if (
      element &&
      typeof element === "object" &&
      "type" in element &&
      (element.type === "arrow" || element.type === "line") &&
      "points" in element &&
      Array.isArray(element.points) &&
      element.points.length > 0
    ) {
      const firstPoint = element.points[0];
      if (Array.isArray(firstPoint) && (firstPoint[0] !== 0 || firstPoint[1] !== 0)) {
        const ox = Number(firstPoint[0]) || 0;
        const oy = Number(firstPoint[1]) || 0;
        const currentX = "x" in element && typeof element.x === "number" ? element.x : 0;
        const currentY = "y" in element && typeof element.y === "number" ? element.y : 0;
        const newPoints = element.points.map((p: unknown) => {
          if (Array.isArray(p) && p.length >= 2) {
            return [(Number(p[0]) || 0) - ox, (Number(p[1]) || 0) - oy];
          }
          return p;
        });
        return {
          ...element,
          x: currentX + ox,
          y: currentY + oy,
          points: newPoints,
        };
      }
    }
    return element;
  });
}

/**
 * Hook managing asynchronous loading and debounced saving of whiteboard scenes,
 * including content-addressed binary image storage.
 * Satisfies BOARD-1, BOARD-2, BOARD-3, and Task 26 specification:
 * - Reads elements, persisted appState, and content-addressed image blobs from ProjectService.
 * - Extracts images from Excalidraw's onChange files payload and saves them via ProjectService.putFile.
 * - Enforces the 4MB image limit via client-side compression before storing.
 * - Keeps board payload JSON lightweight (storing only file IDs and SHA-256 hashes, never base64 data).
 * - Reconstructs Excalidraw binary files on initialization and passes them to Excalidraw.
 * - Never feeds onChange data back into React component state to preserve 60fps drawing.
 */
export function useBoardPersistence({
  projectId,
  itemId,
  title,
  projectServiceOverride,
}: UseBoardPersistenceOptions): UseBoardPersistenceResult {
  const ps = projectServiceOverride ?? defaultProjectService;
  const [initialData, setInitialData] = useState<BoardInitialData | null>(null);
  const [loadedFiles, setLoadedFiles] = useState<Record<string, unknown>>({});
  const [isLoaded, setIsLoaded] = useState(false);

  // Cached map of Excalidraw fileId -> SHA-256 content key
  const persistedFilesMapRef = useRef<Record<string, string>>({});
  // In-flight upload deduplication map
  const inFlightUploadsRef = useRef<Map<string, Promise<string>>>(new Map());

  const titleRef = useRef(title);
  useEffect(() => {
    titleRef.current = title;
  }, [title]);

  useEffect(() => {
    let isSubscribed = true;

    async function loadItem() {
      try {
        const raw = await ps.readItem(projectId, itemId);
        if (raw && isSubscribed) {
          const parsed = JSON.parse(raw);
          const rawElements = Array.isArray(parsed?.elements) ? parsed.elements : [];
          const elements = normalizeLinearElements(rawElements);
          const appState = pickPersistedAppState(parsed?.appState);
          const storedFileMap: Record<string, string> =
            parsed?.files && typeof parsed.files === "object" ? parsed.files : {};

          // Extract all file IDs referenced by elements or present in storedFileMap
          const elementFileIds = extractImageFileIds(elements);
          const allFileIds = new Set<string>([
            ...Object.keys(storedFileMap),
            ...elementFileIds,
          ]);

          const reconstructedFiles: Record<string, unknown> = {};

          for (const fileId of allFileIds) {
            const contentKey = storedFileMap[fileId] || fileId;
            try {
              const blob = await ps.getFile(projectId, contentKey);
              if (blob && isSubscribed) {
                const dataURL = await blobToDataURL(blob);
                reconstructedFiles[fileId] = {
                  id: fileId,
                  dataURL,
                  mimeType: blob.type || "image/png",
                  created: Date.now(),
                  lastRetrieved: Date.now(),
                };
                persistedFilesMapRef.current[fileId] = contentKey;
              }
            } catch (err) {
              console.warn(
                `[useBoardPersistence] Could not load file ${fileId} (${contentKey}):`,
                err
              );
            }
          }

          if (isSubscribed) {
            setInitialData({
              elements,
              appState,
              files: reconstructedFiles,
            });
            setLoadedFiles(reconstructedFiles);
          }
        }
      } catch {
        // Item does not exist yet (new board); Excalidraw initializes empty
      } finally {
        if (isSubscribed) {
          setIsLoaded(true);
        }
      }
    }

    loadItem();

    return () => {
      isSubscribed = false;
    };
  }, [projectId, itemId, ps]);

  const saveBoard = useCallback(
    async (
      elements: readonly unknown[],
      appState: Record<string, unknown>,
      files?: Record<string, unknown>
    ): Promise<void> => {
      // 1. Process and persist newly added or changed files from Excalidraw
      if (files && typeof files === "object") {
        const fileEntries = Object.entries(files);
        for (const [fileId, rawFileData] of fileEntries) {
          if (!rawFileData || typeof rawFileData !== "object") continue;
          const fileData = rawFileData as {
            id?: string;
            dataURL?: string;
            mimeType?: string;
          };
          if (!fileData.dataURL) continue;

          // If already uploaded and hashed, skip
          if (persistedFilesMapRef.current[fileId]) continue;

          // If an upload is currently in flight for this fileId, wait for it
          const inFlight = inFlightUploadsRef.current.get(fileId);
          if (inFlight) {
            await inFlight;
            continue;
          }

          // Start upload and content-hashing promise
          const uploadPromise = (async () => {
            try {
              let blob = dataURLToBlob(fileData.dataURL!);
              // Cap dimensions and compress if > 4MB (BOARD-3)
              if (blob.size > MAX_ALLOWED_FILE_BYTES) {
                blob = await compressImageIfNeeded(blob);
              }
              const mime = fileData.mimeType || blob.type || "image/png";
              const { key } = await ps.putFile(projectId, blob, {
                mime,
                name: fileId,
              });
              persistedFilesMapRef.current[fileId] = key;
              return key;
            } catch (err) {
              console.error(
                `[useBoardPersistence] Failed to persist file ${fileId}:`,
                err
              );
              throw err;
            } finally {
              inFlightUploadsRef.current.delete(fileId);
            }
          })();

          inFlightUploadsRef.current.set(fileId, uploadPromise);
          await uploadPromise;
        }
      }

      // 2. Identify active image file IDs currently referenced in scene elements
      const normalizedElements = normalizeLinearElements(elements);
      const activeFileIds = extractImageFileIds(normalizedElements);
      const fileMap: Record<string, string> = {};
      for (const fId of activeFileIds) {
        const contentKey = persistedFilesMapRef.current[fId] || fId;
        if (contentKey) {
          fileMap[fId] = contentKey;
        }
      }

      // 3. Save lightweight board payload (NO dataURLs or raw base64)
      const pickedState = pickPersistedAppState(appState);
      const payload = JSON.stringify({
        elements: normalizedElements,
        appState: pickedState,
        files: fileMap,
      });

      await ps.saveBoard(projectId, itemId, payload, titleRef.current);
    },
    [projectId, itemId, ps]
  );

  return {
    initialData,
    isLoaded,
    saveBoard,
    loadedFiles,
  };
}
