/**
 * Aboard Workspace Host Types
 * Conforms to docs/specs/architecture.md §6.1-6.3
 */

export type ModuleKind = "board" | "pdf" | "circuit";

export interface Tab {
  id: string;
  kind: ModuleKind;
  itemId: string;
  title: string;
  isIframe?: boolean;
}

export type Slot = "primary" | "secondary" | "hidden";

export type SplitMode = "none" | "vertical" | "horizontal";

export interface LayoutState {
  tabs: Tab[];           // Stable order = DOM order, never re-sorted or re-keyed
  tabBarOrder: string[]; // Order displayed in tab bar (decoupled from DOM order)
  primary: string | null;
  secondary: string | null;
  split: SplitMode;
  ratio: number;         // 0.2 ... 0.8
}

/**
 * Returns the layout slot for a given tab id:
 * - "primary": visible in primary pane
 * - "secondary": visible in secondary pane (only if split !== "none")
 * - "hidden": rendered in DOM but hidden via CSS visibility/positioning
 */
export function slotOf(layout: LayoutState, tabId: string): Slot {
  if (tabId === layout.primary) return "primary";
  if (layout.split !== "none" && tabId === layout.secondary) return "secondary";
  return "hidden";
}
