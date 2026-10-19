import type { LayoutState, Tab } from "@/workspace/types";

export interface SelectTargetBoardOptions {
  explicitTabId?: string;
  sourceTabId?: string;
  layout: LayoutState;
  mruBoardTabIds?: string[];
}

export type TargetBoardDecision =
  | { type: "existing"; tabId: string; tab: Tab; priority: 1 | 2 | 3 }
  | { type: "create"; priority: 4 };

/**
 * Selects the target whiteboard for cross-tool actions (INT-1, INT-2)
 * adhering strictly to the priority chain defined in docs/specs/modules.md §8:
 *
 * 1. An explicitly chosen tab (if valid and is a board).
 * 2. The other visible pane if it is a board (split view).
 * 3. The most recently used board.
 * 4. Create a new board (if no boards exist).
 */
export function selectTargetBoard(options: SelectTargetBoardOptions): TargetBoardDecision {
  const { explicitTabId, sourceTabId, layout, mruBoardTabIds = [] } = options;
  const boardTabs = layout.tabs.filter((t) => t.kind === "board");

  // Priority 1: An explicitly chosen tab
  if (explicitTabId) {
    const explicitTab = boardTabs.find((t) => t.id === explicitTabId);
    if (explicitTab) {
      return { type: "existing", tabId: explicitTab.id, tab: explicitTab, priority: 1 };
    }
  }

  // Priority 2: The other visible pane if it is a board (split view)
  if (layout.split !== "none" && sourceTabId) {
    let otherTabId: string | null = null;
    if (layout.primary === sourceTabId) {
      otherTabId = layout.secondary;
    } else if (layout.secondary === sourceTabId) {
      otherTabId = layout.primary;
    }

    if (otherTabId) {
      const otherTab = boardTabs.find((t) => t.id === otherTabId);
      if (otherTab) {
        return { type: "existing", tabId: otherTab.id, tab: otherTab, priority: 2 };
      }
    }
  }

  // Priority 3: The most recently used board
  for (const mruId of mruBoardTabIds) {
    const mruTab = boardTabs.find((t) => t.id === mruId);
    if (mruTab) {
      return { type: "existing", tabId: mruTab.id, tab: mruTab, priority: 3 };
    }
  }

  // If no MRU list or no match in MRU list, fallback to any existing board tab
  if (boardTabs.length > 0) {
    const firstBoard = boardTabs[0];
    return { type: "existing", tabId: firstBoard.id, tab: firstBoard, priority: 3 };
  }

  // Priority 4: Create a new board
  return { type: "create", priority: 4 };
}
