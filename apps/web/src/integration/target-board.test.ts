import { describe, it, expect } from "vitest";
import { selectTargetBoard } from "./target-board";
import type { LayoutState } from "@/workspace/types";

describe("selectTargetBoard", () => {
  const baseLayout: LayoutState = {
    tabs: [
      { id: "tab-pdf", kind: "pdf", itemId: "pdf-1", title: "PDF 1" },
      { id: "tab-circuit", kind: "circuit", itemId: "circuit-1", title: "Circuit 1" },
      { id: "tab-board-1", kind: "board", itemId: "board-1", title: "Board 1" },
      { id: "tab-board-2", kind: "board", itemId: "board-2", title: "Board 2" },
    ],
    tabBarOrder: ["tab-pdf", "tab-circuit", "tab-board-1", "tab-board-2"],
    primary: "tab-pdf",
    secondary: "tab-board-1",
    split: "vertical",
    ratio: 0.5,
  };

  it("Priority 1: selects an explicitly chosen board tab if valid", () => {
    const decision = selectTargetBoard({
      explicitTabId: "tab-board-2",
      sourceTabId: "tab-pdf",
      layout: baseLayout,
      mruBoardTabIds: ["tab-board-1"],
    });

    expect(decision).toEqual({
      type: "existing",
      tabId: "tab-board-2",
      tab: baseLayout.tabs[3],
      priority: 1,
    });
  });

  it("Priority 1: ignores explicit tab if it does not exist or is not a board", () => {
    const decision = selectTargetBoard({
      explicitTabId: "tab-circuit", // not a board
      sourceTabId: "tab-pdf",
      layout: baseLayout,
      mruBoardTabIds: ["tab-board-1"],
    });

    // Falls back to Priority 2 (other visible pane in split view)
    expect(decision).toEqual({
      type: "existing",
      tabId: "tab-board-1",
      tab: baseLayout.tabs[2],
      priority: 2,
    });
  });

  it("Priority 2: selects the other visible pane in split view if it is a board (from primary)", () => {
    const splitLayout: LayoutState = {
      ...baseLayout,
      primary: "tab-pdf",
      secondary: "tab-board-1",
      split: "vertical",
    };

    const decision = selectTargetBoard({
      sourceTabId: "tab-pdf",
      layout: splitLayout,
      mruBoardTabIds: ["tab-board-2"], // MRU points to board-2, but other visible pane is board-1
    });

    expect(decision).toEqual({
      type: "existing",
      tabId: "tab-board-1",
      tab: baseLayout.tabs[2],
      priority: 2,
    });
  });

  it("Priority 2: selects the other visible pane in split view if it is a board (from secondary)", () => {
    const splitLayout: LayoutState = {
      ...baseLayout,
      primary: "tab-board-1",
      secondary: "tab-circuit",
      split: "horizontal",
    };

    const decision = selectTargetBoard({
      sourceTabId: "tab-circuit",
      layout: splitLayout,
      mruBoardTabIds: ["tab-board-2"],
    });

    expect(decision).toEqual({
      type: "existing",
      tabId: "tab-board-1",
      tab: baseLayout.tabs[2],
      priority: 2,
    });
  });

  it("Priority 3: selects the most recently used board when split is none", () => {
    const singleLayout: LayoutState = {
      ...baseLayout,
      primary: "tab-pdf",
      secondary: null,
      split: "none",
    };

    const decision = selectTargetBoard({
      sourceTabId: "tab-pdf",
      layout: singleLayout,
      mruBoardTabIds: ["tab-board-2", "tab-board-1"],
    });

    expect(decision).toEqual({
      type: "existing",
      tabId: "tab-board-2",
      tab: baseLayout.tabs[3],
      priority: 3,
    });
  });

  it("Priority 3: falls back to any board in layout if MRU is empty", () => {
    const singleLayout: LayoutState = {
      ...baseLayout,
      primary: "tab-pdf",
      secondary: null,
      split: "none",
    };

    const decision = selectTargetBoard({
      sourceTabId: "tab-pdf",
      layout: singleLayout,
      mruBoardTabIds: [],
    });

    expect(decision.type).toBe("existing");
    if (decision.type === "existing") {
      expect(decision.priority).toBe(3);
      expect(decision.tabId).toBe("tab-board-1");
    }
  });

  it("Priority 4: returns create decision when no boards exist in layout", () => {
    const noBoardsLayout: LayoutState = {
      tabs: [
        { id: "tab-pdf", kind: "pdf", itemId: "pdf-1", title: "PDF" },
        { id: "tab-circuit", kind: "circuit", itemId: "circuit-1", title: "Circuit" },
      ],
      tabBarOrder: ["tab-pdf", "tab-circuit"],
      primary: "tab-pdf",
      secondary: "tab-circuit",
      split: "vertical",
      ratio: 0.5,
    };

    const decision = selectTargetBoard({
      sourceTabId: "tab-pdf",
      layout: noBoardsLayout,
      mruBoardTabIds: [],
    });

    expect(decision).toEqual({
      type: "create",
      priority: 4,
    });
  });
});
