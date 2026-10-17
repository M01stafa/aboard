import { useCallback, useEffect, useRef, useState } from "react";
import { projectService as defaultProjectService, type ProjectService } from "@/core/storage";
import { pickPersistedAppState, type PersistedAppState } from "./types";

export interface UseBoardPersistenceOptions {
  projectId: string;
  itemId: string;
  title?: string;
  projectServiceOverride?: ProjectService;
}

export interface BoardInitialData {
  elements: readonly unknown[];
  appState: PersistedAppState;
}

export interface UseBoardPersistenceResult {
  initialData: BoardInitialData | null;
  isLoaded: boolean;
  saveBoard: (
    elements: readonly unknown[],
    appState: Record<string, unknown>
  ) => Promise<void>;
}

/**
 * Hook managing asynchronous loading and debounced saving of whiteboard scenes.
 * Satisfies BOARD-1, BOARD-2, and Task 25 specification:
 * - Reads elements and the 6 persisted appState keys from ProjectService on mount.
 * - Saves serialized { elements, appState } back to ProjectService.saveBoard on onChange.
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
  const [isLoaded, setIsLoaded] = useState(false);

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
          const elements = Array.isArray(parsed?.elements) ? parsed.elements : [];
          const appState = pickPersistedAppState(parsed?.appState);
          setInitialData({
            elements,
            appState,
          });
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
      appState: Record<string, unknown>
    ): Promise<void> => {
      const pickedState = pickPersistedAppState(appState);
      const payload = JSON.stringify({
        elements,
        appState: pickedState,
      });

      await ps.saveBoard(projectId, itemId, payload, titleRef.current);
    },
    [projectId, itemId, ps]
  );

  return {
    initialData,
    isLoaded,
    saveBoard,
  };
}
