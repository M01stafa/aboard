// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useBoardPersistence, type UseBoardPersistenceResult } from "./use-board-persistence";
import { pickPersistedAppState, PERSISTED_APP_STATE_KEYS } from "./types";
import type { ProjectService } from "@/core/storage";

// @ts-expect-error React testing flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("pickPersistedAppState", () => {
  it("extracts only the 6 verified keys and ignores ephemeral/transient keys", () => {
    const rawAppState = {
      viewBackgroundColor: "#ffffff",
      scrollX: 120,
      scrollY: -40,
      zoom: { value: 1.5 },
      gridSize: 20,
      gridModeEnabled: true,
      // Ephemeral keys that must NOT be persisted
      cursorButton: "down",
      isResizing: true,
      isRotating: false,
      activeTool: { type: "rectangle" },
      selectedElementIds: { elem1: true },
      toast: { message: "hello" },
    };

    const picked = pickPersistedAppState(rawAppState);

    expect(Object.keys(picked).sort()).toEqual([...PERSISTED_APP_STATE_KEYS].sort());
    expect(picked.viewBackgroundColor).toBe("#ffffff");
    expect(picked.scrollX).toBe(120);
    expect(picked.scrollY).toBe(-40);
    expect(picked.zoom).toEqual({ value: 1.5 });
    expect(picked.gridSize).toBe(20);
    expect(picked.gridModeEnabled).toBe(true);
    // @ts-expect-error key should not exist
    expect(picked.activeTool).toBeUndefined();
    // @ts-expect-error key should not exist
    expect(picked.cursorButton).toBeUndefined();
  });

  it("handles null or empty inputs gracefully", () => {
    expect(pickPersistedAppState(null)).toEqual({});
    expect(pickPersistedAppState(undefined)).toEqual({});
    expect(pickPersistedAppState({})).toEqual({});
  });
});

describe("useBoardPersistence Hook (BOARD-1, BOARD-2)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  function HookTester({
    options,
    onResult,
  }: {
    options: Parameters<typeof useBoardPersistence>[0];
    onResult: (res: UseBoardPersistenceResult) => void;
  }) {
    const res = useBoardPersistence(options);
    onResult(res);
    return null;
  }

  it("loads existing board item and filters appState keys", async () => {
    const mockElements = [{ id: "el1", type: "rectangle", x: 10, y: 20, width: 100, height: 50 }];
    const mockStoredPayload = JSON.stringify({
      elements: mockElements,
      appState: {
        viewBackgroundColor: "#f0f0f0",
        scrollX: 50,
        scrollY: 75,
        zoom: { value: 1 },
        gridSize: 10,
        gridModeEnabled: false,
        activeTool: { type: "selection" }, // should be stripped
      },
    });

    const mockProjectService = {
      readItem: vi.fn(async (_projId: string, _itemId: string) => mockStoredPayload),
      saveBoard: vi.fn(async () => {}),
    } as unknown as ProjectService;

    let latestResult!: UseBoardPersistenceResult;

    await act(async () => {
      root.render(
        React.createElement(HookTester, {
          options: {
            projectId: "proj-1",
            itemId: "board-1",
            title: "Test Whiteboard",
            projectServiceOverride: mockProjectService,
          },
          onResult: (res) => {
            latestResult = res;
          },
        })
      );
    });

    // Wait for async loadItem to resolve
    await act(async () => {
      await Promise.resolve();
    });

    expect(mockProjectService.readItem).toHaveBeenCalledWith("proj-1", "board-1");
    expect(latestResult.isLoaded).toBe(true);
    expect(latestResult.initialData?.elements).toEqual(mockElements);
    expect(latestResult.initialData?.appState).toEqual({
      viewBackgroundColor: "#f0f0f0",
      scrollX: 50,
      scrollY: 75,
      zoom: { value: 1 },
      gridSize: 10,
      gridModeEnabled: false,
    });
  });

  it("handles empty or missing board items gracefully", async () => {
    const mockProjectService = {
      readItem: vi.fn(async () => {
        throw new Error("Item not found");
      }),
      saveBoard: vi.fn(async () => {}),
    } as unknown as ProjectService;

    let latestResult!: UseBoardPersistenceResult;

    await act(async () => {
      root.render(
        React.createElement(HookTester, {
          options: {
            projectId: "proj-1",
            itemId: "board-new",
            title: "New Board",
            projectServiceOverride: mockProjectService,
          },
          onResult: (res) => {
            latestResult = res;
          },
        })
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(latestResult.isLoaded).toBe(true);
    expect(latestResult.initialData).toBeNull();
  });

  it("saveBoard persists serialized elements and filtered appState to projectService.saveBoard", async () => {
    const mockSaveBoard = vi.fn(async () => {});
    const mockProjectService = {
      readItem: vi.fn(async () => {
        throw new Error("Item not found");
      }),
      saveBoard: mockSaveBoard,
    } as unknown as ProjectService;

    let latestResult!: UseBoardPersistenceResult;

    await act(async () => {
      root.render(
        React.createElement(HookTester, {
          options: {
            projectId: "proj-1",
            itemId: "board-1",
            title: "Chemistry Diagram",
            projectServiceOverride: mockProjectService,
          },
          onResult: (res) => {
            latestResult = res;
          },
        })
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const elementsToSave = [{ id: "circ-1", type: "ellipse", x: 20, y: 30 }];
    const stateToSave = {
      viewBackgroundColor: "#ffffff",
      scrollX: 10,
      scrollY: 20,
      zoom: { value: 2 },
      gridSize: 20,
      gridModeEnabled: true,
      openMenu: "canvas", // transient
      cursorButton: "up", // transient
    };

    await act(async () => {
      await latestResult.saveBoard(elementsToSave, stateToSave);
    });

    expect(mockSaveBoard).toHaveBeenCalledTimes(1);
    const [pId, itId, payloadStr, title] = mockSaveBoard.mock.calls[0] as unknown as [
      string,
      string,
      string,
      string
    ];
    expect(pId).toBe("proj-1");
    expect(itId).toBe("board-1");
    expect(title).toBe("Chemistry Diagram");

    const parsed = JSON.parse(payloadStr);
    expect(parsed.elements).toEqual(elementsToSave);
    expect(parsed.appState).toEqual({
      viewBackgroundColor: "#ffffff",
      scrollX: 10,
      scrollY: 20,
      zoom: { value: 2 },
      gridSize: 20,
      gridModeEnabled: true,
    });
    expect(parsed.appState.openMenu).toBeUndefined();
    expect(parsed.appState.cursorButton).toBeUndefined();
  });
});
