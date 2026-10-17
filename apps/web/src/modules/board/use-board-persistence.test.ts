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

  it("extracts images from files payload, puts them in ProjectService, and saves clean fileMap without base64 in JSON (BOARD-2)", async () => {
    const mockSaveBoard = vi.fn(async () => {});
    const mockPutFile = vi.fn(async (_projId: string, _blob: Blob, _meta: { mime: string; name?: string }) => ({
      key: "mock-sha256-hash-12345",
    }));

    const mockProjectService = {
      readItem: vi.fn(async () => {
        throw new Error("Item not found");
      }),
      saveBoard: mockSaveBoard,
      putFile: mockPutFile,
    } as unknown as ProjectService;

    let latestResult!: UseBoardPersistenceResult;

    await act(async () => {
      root.render(
        React.createElement(HookTester, {
          options: {
            projectId: "proj-1",
            itemId: "board-1",
            title: "Board With Images",
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

    // Elements containing an image referencing fileId "img-file-1"
    const elements = [
      { id: "img-el-1", type: "image", fileId: "img-file-1", x: 50, y: 50, width: 200, height: 150 },
    ];
    const appState = { viewBackgroundColor: "#ffffff" };
    const files = {
      "img-file-1": {
        id: "img-file-1",
        dataURL: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        mimeType: "image/png",
        created: Date.now(),
      },
    };

    await act(async () => {
      await latestResult.saveBoard(elements, appState, files);
    });

    // 1. Verify putFile was called with the decoded binary blob
    expect(mockPutFile).toHaveBeenCalledTimes(1);
    const [pId, passedBlob, meta] = mockPutFile.mock.calls[0] as unknown as [
      string,
      Blob,
      { mime: string; name: string }
    ];
    expect(pId).toBe("proj-1");
    expect(passedBlob).toBeInstanceOf(Blob);
    expect(passedBlob.size).toBeGreaterThan(0);
    expect(meta.mime).toBe("image/png");
    expect(meta.name).toBe("img-file-1");

    // 2. Verify saveBoard received the board payload
    expect(mockSaveBoard).toHaveBeenCalledTimes(1);
    const [, , payloadStr] = mockSaveBoard.mock.calls[0] as unknown as [string, string, string];
    const parsedPayload = JSON.parse(payloadStr);

    // 3. Confirm NO base64 strings live in the persisted payload JSON
    expect(payloadStr.includes("data:image/png;base64")).toBe(false);
    expect(parsedPayload.files).toEqual({
      "img-file-1": "mock-sha256-hash-12345",
    });
    expect(parsedPayload.elements).toEqual(elements);
  });

  it("restores image files via projectService.getFile on load and provides them in initialData (BOARD-2)", async () => {
    const rawImageBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]); // PNG header
    const mockBlob = new Blob([rawImageBytes], { type: "image/png" });

    const storedBoardJson = JSON.stringify({
      elements: [
        { id: "img-el-2", type: "image", fileId: "file-xyz", x: 10, y: 10, width: 100, height: 100 },
      ],
      appState: { viewBackgroundColor: "#000000" },
      files: {
        "file-xyz": "sha256-xyz-content-key",
      },
    });

    const mockGetFile = vi.fn(async (_projId: string, _key: string) => mockBlob);
    const mockProjectService = {
      readItem: vi.fn(async () => storedBoardJson),
      getFile: mockGetFile,
      saveBoard: vi.fn(async () => {}),
    } as unknown as ProjectService;

    let latestResult!: UseBoardPersistenceResult;

    await act(async () => {
      root.render(
        React.createElement(HookTester, {
          options: {
            projectId: "proj-1",
            itemId: "board-restore-test",
            projectServiceOverride: mockProjectService,
          },
          onResult: (res) => {
            latestResult = res;
          },
        })
      );
    });

    // Wait for readItem + getFile + FileReader to resolve
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(mockGetFile).toHaveBeenCalledWith("proj-1", "sha256-xyz-content-key");
    expect(latestResult.isLoaded).toBe(true);
    expect(latestResult.initialData?.files).toBeDefined();

    const restoredFiles = latestResult.initialData?.files as Record<string, { id: string; dataURL: string; mimeType: string }>;
    expect(restoredFiles["file-xyz"]).toBeDefined();
    expect(restoredFiles["file-xyz"].id).toBe("file-xyz");
    expect(restoredFiles["file-xyz"].mimeType).toBe("image/png");
    expect(restoredFiles["file-xyz"].dataURL.startsWith("data:image/png")).toBe(true);
  });

  it("compresses images larger than 4MB before persisting via putFile (BOARD-3)", async () => {
    const mockPutFile = vi.fn(async (_projId: string, blob: Blob) => {
      // Confirm the passed blob was compressed to <= 4MB
      expect(blob.size).toBeLessThanOrEqual(4 * 1024 * 1024);
      return { key: "sha256-mock-compressed-hash" };
    });

    const mockProjectService = {
      readItem: vi.fn(async () => {
        throw new Error("Item not found");
      }),
      saveBoard: vi.fn(async () => {}),
      putFile: mockPutFile,
    } as unknown as ProjectService;

    let latestResult!: UseBoardPersistenceResult;

    await act(async () => {
      root.render(
        React.createElement(HookTester, {
          options: {
            projectId: "proj-1",
            itemId: "board-large-img",
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

    // Simulate 5MB base64 image dataURL
    const fiveMbByteCount = 5 * 1024 * 1024;
    // Fast base64 string generation
    const dummyBytes = new Uint8Array(fiveMbByteCount);
    let binary = "";
    const chunk = 32768;
    for (let i = 0; i < dummyBytes.length; i += chunk) {
      binary += String.fromCharCode.apply(null, Array.from(dummyBytes.subarray(i, i + chunk)));
    }
    const largeDataUrl = `data:image/jpeg;base64,${btoa(binary)}`;

    const elements = [{ id: "el-large", type: "image", fileId: "large-photo-1" }];
    const files = {
      "large-photo-1": {
        id: "large-photo-1",
        dataURL: largeDataUrl,
        mimeType: "image/jpeg",
        created: Date.now(),
      },
    };

    await act(async () => {
      await latestResult.saveBoard(elements, {}, files);
    });

    expect(mockPutFile).toHaveBeenCalledTimes(1);
    const [, passedBlob] = mockPutFile.mock.calls[0] as unknown as [string, Blob];
    expect(passedBlob.size).toBeLessThanOrEqual(4 * 1024 * 1024);
  });
});
