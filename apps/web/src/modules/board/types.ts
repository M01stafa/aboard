import type { Tab } from "@/workspace/types";

/**
 * The exact 6 AppState keys verified in Spike S1 and docs/specs/modules.md §7.1.
 * V04 confirmed in @excalidraw/excalidraw types.d.ts.
 */
export const PERSISTED_APP_STATE_KEYS = [
  "viewBackgroundColor",
  "scrollX",
  "scrollY",
  "zoom",
  "gridSize",
  "gridModeEnabled",
] as const;

export type PersistedAppStateKey = (typeof PERSISTED_APP_STATE_KEYS)[number];

export type PersistedAppState = Partial<Record<PersistedAppStateKey, unknown>>;

export interface BoardItemPayload {
  elements: readonly unknown[];
  appState: PersistedAppState;
  files?: Record<string, string>; // maps Excalidraw fileId -> SHA-256 content key
}

export interface BoardPaneProps {
  projectId: string;
  tab: Tab;
  visible: boolean;
  onMount?: (tabId: string, token: string) => void;
  onApiReady?: (api: unknown) => void;
}

/**
 * Extracts only the 6 persisted keys from an Excalidraw AppState object.
 */
export function pickPersistedAppState(
  appState?: Record<string, unknown> | null
): PersistedAppState {
  if (!appState || typeof appState !== "object") {
    return {};
  }
  const picked: PersistedAppState = {};
  for (const key of PERSISTED_APP_STATE_KEYS) {
    if (key in appState && appState[key] !== undefined) {
      picked[key] = appState[key];
    }
  }
  return picked;
}
