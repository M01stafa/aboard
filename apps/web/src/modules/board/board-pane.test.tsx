// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BoardPane } from "./board-pane";
import { I18nProvider } from "@/i18n/provider";
import { projectService } from "@/core/storage";
import { bus } from "@/core/bus";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

// @ts-expect-error React testing flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Track props passed to mocked Excalidraw component
let lastExcalidrawProps: Record<string, unknown> | null = null;
let mockRefresh = vi.fn();
let mockExcalidrawApi: Partial<ExcalidrawImperativeAPI> = {};
export const mockAppendBoardToPdf = vi.fn().mockResolvedValue({
  targetPdfItemId: "pdf-1",
  pageCount: 2,
  newFileKey: "hash-1",
});

vi.mock("@/integration/board-to-pdf", () => ({
  appendBoardToPdf: (...args: unknown[]) => mockAppendBoardToPdf(...args),
}));

const mockItem = vi.fn((props: Record<string, unknown>) =>
  React.createElement("div", { "data-testid": "main-menu-item", ...props })
);

const MainMenuMock = Object.assign(
  vi.fn(({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "main-menu" }, children)
  ),
  {
    Item: mockItem,
    ItemLink: mockItem,
    ItemCustom: mockItem,
    Group: vi.fn(({ children }: { children?: React.ReactNode }) =>
      React.createElement("div", null, children)
    ),
    Separator: vi.fn(() => React.createElement("hr")),
    DefaultItems: {
      SaveAsImage: vi.fn(() => React.createElement("div", { "data-testid": "menu-save-as-image" })),
      Export: vi.fn(() => React.createElement("div", { "data-testid": "menu-export" })),
      SearchMenu: vi.fn(() => React.createElement("div", { "data-testid": "menu-search" })),
      ClearCanvas: vi.fn(() => React.createElement("div", { "data-testid": "menu-clear-canvas" })),
      ToggleTheme: vi.fn(() => React.createElement("div", { "data-testid": "menu-toggle-theme" })),
      ChangeCanvasBackground: vi.fn(() =>
        React.createElement("div", { "data-testid": "menu-change-canvas-bg" })
      ),
      Help: vi.fn(() => React.createElement("div", { "data-testid": "menu-help" })),
      Socials: vi.fn(() => React.createElement("div", { "data-testid": "menu-socials" })),
      LoadScene: vi.fn(() => React.createElement("div", { "data-testid": "menu-load-scene" })),
      SaveToActiveFile: vi.fn(() =>
        React.createElement("div", { "data-testid": "menu-save-to-active-file" })
      ),
    },
  }
);

const WelcomeScreenMock = Object.assign(
  vi.fn(({ children }: { children?: React.ReactNode }) =>
    React.createElement("div", { "data-testid": "welcome-screen" }, children)
  ),
  {
    Hints: {
      MenuHint: vi.fn(() => React.createElement("div")),
      ToolbarHint: vi.fn(() => React.createElement("div")),
      HelpHint: vi.fn(() => React.createElement("div")),
    },
    Center: vi.fn(({ children }: { children?: React.ReactNode }) =>
      React.createElement("div", null, children)
    ),
  }
);

vi.mock("@excalidraw/excalidraw", () => ({
  MainMenu: MainMenuMock,
  WelcomeScreen: WelcomeScreenMock,
  exportToBlob: vi.fn().mockResolvedValue(new Blob(["mock-png"], { type: "image/png" })),
  Excalidraw: vi.fn((props: Record<string, unknown> & { children?: React.ReactNode }) => {
    lastExcalidrawProps = props;
    if (typeof props.excalidrawAPI === "function") {
      props.excalidrawAPI(mockExcalidrawApi);
    }
    return React.createElement(
      "div",
      {
        "data-testid": "mocked-excalidraw-canvas",
        className: "excalidraw",
      },
      props.children
    );
  }),
  convertToExcalidrawElements: vi.fn(
    (
      skeletons: Array<Record<string, unknown>> | null,
      opts?: { regenerateIds?: boolean }
    ) => {
      if (!skeletons) return [];
      let counter = 0;
      return skeletons.map((s) => {
        counter++;
        const id =
          opts?.regenerateIds !== false
            ? `mock-el-${counter}-${Math.random().toString(36).slice(2, 7)}`
            : ((s.id as string) || `mock-el-${counter}`);
        return {
          type: s.type || "rectangle",
          x: s.x ?? 0,
          y: s.y ?? 0,
          width: s.width ?? 100,
          height: s.height ?? 50,
          angle: 0,
          strokeColor: s.strokeColor ?? "#1e1e1e",
          backgroundColor: s.backgroundColor ?? "transparent",
          fillStyle: s.fillStyle ?? "solid",
          strokeWidth: s.strokeWidth ?? 1,
          strokeStyle: s.strokeStyle ?? "solid",
          roundness: s.roundness ?? null,
          roughness: s.roughness ?? 1,
          opacity: s.opacity ?? 100,
          groupIds: s.groupIds ?? [],
          frameId: null,
          index: `a${counter}`,
          version: 1,
          versionNonce: 1,
          isDeleted: false,
          boundElements: null,
          updated: Date.now(),
          link: null,
          locked: s.locked ?? false,
          customData: s.customData,
          ...s,
          id,
        };
      });
    }
  ),
}));

describe("BoardPane Component (Task 25 / BOARD-1, BOARD-2, BOARD-4)", () => {
  let container: HTMLDivElement;
  let root: Root;
  let resizeCallback: ((entries: ResizeObserverEntry[]) => void) | null = null;

  beforeEach(() => {
    lastExcalidrawProps = null;
    mockRefresh = vi.fn();
    mockExcalidrawApi = {
      refresh: mockRefresh,
      getAppState: vi.fn(() => ({} as never)),
      getSceneElements: vi.fn(() => []),
      updateScene: vi.fn(),
      addFiles: vi.fn(),
      getFiles: vi.fn(() => ({})),
    };

    // Spy on ResizeObserver to capture callback and trigger manual resize events
    resizeCallback = null;
    globalThis.ResizeObserver = class MockResizeObserver {
      constructor(cb: (entries: ResizeObserverEntry[]) => void) {
        resizeCallback = cb;
      }
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    } as unknown as typeof ResizeObserver;

    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it("renders BoardPane container with required attributes, tokens, and stable token", async () => {
    const handleMount = vi.fn();

    await act(async () => {
      root.render(
        React.createElement(
          I18nProvider,
          null,
          React.createElement(BoardPane, {
            projectId: "test-board-proj",
            tab: { id: "tab-1", kind: "board", itemId: "item-b1", title: "Whiteboard 1" },
            visible: true,
            onMount: handleMount,
          })
        )
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const paneEl = container.querySelector<HTMLElement>('[data-testid="pane-board-tab-1"]');
    expect(paneEl).toBeTruthy();
    expect(paneEl?.getAttribute("data-pane-id")).toBe("tab-1");

    const identityToken = paneEl?.getAttribute("data-identity-token");
    expect(identityToken).toBeTruthy();
    expect(handleMount).toHaveBeenCalledWith("tab-1", identityToken);

    // Verify scoped brand accent CSS variables per DESIGN.md R1 and spec §15
    const styleAttr = paneEl?.getAttribute("style") || "";
    expect(styleAttr).toContain("--color-primary");
    expect(styleAttr).toContain("--color-brand-hover");
    expect(styleAttr).toContain("--focus-highlight-color");
  });

  it("passes correct i18n langCode and UIOptions to Excalidraw", async () => {
    // English default
    await act(async () => {
      root.render(
        React.createElement(
          I18nProvider,
          null,
          React.createElement(BoardPane, {
            projectId: "test-board-proj",
            tab: { id: "tab-b2", kind: "board", itemId: "item-b2", title: "Board 2" },
            visible: true,
          })
        )
      );
    });

    await act(async () => {
      for (let i = 0; i < 10; i++) {
        await Promise.resolve();
      }
    });

    expect(lastExcalidrawProps).toBeTruthy();
    expect(lastExcalidrawProps?.langCode).toBe("en");
    expect(lastExcalidrawProps?.theme).toBe("light");

    // Verify UIOptions hides load and saveToActiveFile (app manages files)
    const uiOpts = lastExcalidrawProps?.UIOptions as {
      canvasActions: { loadScene: boolean; saveToActiveFile: boolean };
    };
    expect(uiOpts).toBeDefined();
    expect(uiOpts.canvasActions.loadScene).toBe(false);
    expect(uiOpts.canvasActions.saveToActiveFile).toBe(false);
  });

  it("calls excalidrawAPI.refresh() when visible changes to true (tab switch per §6.2)", async () => {
    // 1. Initial render with visible = false (hidden tab)
    await act(async () => {
      root.render(
        React.createElement(
          I18nProvider,
          null,
          React.createElement(BoardPane, {
            projectId: "test-board-proj",
            tab: { id: "tab-b3", kind: "board", itemId: "item-b3", title: "Board 3" },
            visible: false,
          })
        )
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    mockRefresh.mockClear();

    // 2. Switch tab to active: visible = true
    await act(async () => {
      root.render(
        React.createElement(
          I18nProvider,
          null,
          React.createElement(BoardPane, {
            projectId: "test-board-proj",
            tab: { id: "tab-b3", kind: "board", itemId: "item-b3", title: "Board 3" },
            visible: true,
          })
        )
      );
    });

    expect(mockRefresh).toHaveBeenCalled();
  });

  it("calls excalidrawAPI.refresh() when container resizes via ResizeObserver", async () => {
    await act(async () => {
      root.render(
        React.createElement(
          I18nProvider,
          null,
          React.createElement(BoardPane, {
            projectId: "test-board-proj",
            tab: { id: "tab-b4", kind: "board", itemId: "item-b4", title: "Board 4" },
            visible: true,
          })
        )
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(resizeCallback).toBeTypeOf("function");
    mockRefresh.mockClear();

    // Simulate ResizeObserver firing for split divider drag
    await act(async () => {
      resizeCallback?.([
        {
          contentRect: { width: 640, height: 480 },
        } as unknown as ResizeObserverEntry,
      ]);
    });

    // Wait for requestAnimationFrame to flush
    await act(async () => {
      await new Promise((r) => requestAnimationFrame(r));
    });

    expect(mockRefresh).toHaveBeenCalled();
  });

  it("persists changes from onChange without feeding back into React state", async () => {
    const saveSpy = vi.spyOn(projectService, "saveBoard").mockImplementation(async () => {});

    await act(async () => {
      root.render(
        React.createElement(
          I18nProvider,
          null,
          React.createElement(BoardPane, {
            projectId: "test-board-proj",
            tab: { id: "tab-b5", kind: "board", itemId: "item-b5", title: "Board 5" },
            visible: true,
          })
        )
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(lastExcalidrawProps?.onChange).toBeTypeOf("function");

    const onChangeFn = lastExcalidrawProps?.onChange as (
      elements: unknown[],
      appState: Record<string, unknown>
    ) => void;

    const testElements = [{ id: "elem-test", type: "rectangle", x: 10, y: 10 }];
    const testAppState = {
      viewBackgroundColor: "#ffffff",
      scrollX: 100,
      scrollY: 200,
      zoom: { value: 1.25 },
      gridSize: 20,
      gridModeEnabled: true,
      cursorButton: "down", // transient, should be stripped
    };

    await act(async () => {
      onChangeFn(testElements, testAppState);
    });

    expect(saveSpy).toHaveBeenCalledTimes(1);
    const [projId, itemId, payload, title] = saveSpy.mock.calls[0];
    expect(projId).toBe("test-board-proj");
    expect(itemId).toBe("item-b5");
    expect(title).toBe("Board 5");

    const parsed = JSON.parse(payload);
    expect(parsed.elements).toEqual(testElements);
    expect(parsed.appState).toEqual({
      viewBackgroundColor: "#ffffff",
      scrollX: 100,
      scrollY: 200,
      zoom: { value: 1.25 },
      gridSize: 20,
      gridModeEnabled: true,
    });
    expect(parsed.appState.cursorButton).toBeUndefined();
  });

  it("handles image insertions in onChange by calling putFile and saving clean fileMap (BOARD-2)", async () => {
    const saveSpy = vi.spyOn(projectService, "saveBoard").mockImplementation(async () => {});
    const putFileSpy = vi.spyOn(projectService, "putFile").mockImplementation(async () => ({
      key: "sha256-pane-img-hash",
    }));

    await act(async () => {
      root.render(
        React.createElement(
          I18nProvider,
          null,
          React.createElement(BoardPane, {
            projectId: "test-board-proj",
            tab: { id: "tab-b6", kind: "board", itemId: "item-b6", title: "Board 6" },
            visible: true,
          })
        )
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const onChangeFn = lastExcalidrawProps?.onChange as (
      elements: unknown[],
      appState: Record<string, unknown>,
      files?: unknown
    ) => void;

    const testElements = [{ id: "img-node", type: "image", fileId: "pane-file-1" }];
    const testAppState = { viewBackgroundColor: "#edeae1" };
    const testFiles = {
      "pane-file-1": {
        id: "pane-file-1",
        dataURL: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        mimeType: "image/png",
        created: Date.now(),
      },
    };

    await act(async () => {
      onChangeFn(testElements, testAppState, testFiles);
    });

    expect(putFileSpy).toHaveBeenCalledTimes(1);
    expect(saveSpy).toHaveBeenCalledTimes(1);

    const [, , payload] = saveSpy.mock.calls[0];
    const parsed = JSON.parse(payload);
    expect(parsed.files).toEqual({
      "pane-file-1": "sha256-pane-img-hash",
    });
    expect(payload.includes("data:image/png;base64")).toBe(false);
  });

  it("renders templates toggle button and opens templates drawer on click (Task 27 / BOARD-5)", async () => {
    const tab = {
      id: "tab-board-templates-1",
      itemId: "item-board-templates-1",
      kind: "board" as const,
      title: "Board with Templates",
    };

    await act(async () => {
      root.render(
        <I18nProvider>
          <BoardPane projectId="proj-tpl-1" tab={tab} visible={true} />
        </I18nProvider>
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const toggleBtn = container.querySelector(
      '[data-testid="templates-panel-toggle"]'
    ) as HTMLButtonElement | null;
    expect(toggleBtn).toBeTruthy();
    expect(toggleBtn?.getAttribute("aria-expanded")).toBe("false");

    // Click toggle to open drawer
    await act(async () => {
      toggleBtn?.click();
    });

    const drawer = container.querySelector(
      '[data-testid="aboard-templates-drawer"]'
    );
    expect(drawer).toBeTruthy();
    expect(toggleBtn?.getAttribute("aria-expanded")).toBe("true");

    // Check all 8 template cards are rendered
    const cards = container.querySelectorAll('[data-testid^="template-card-"]');
    expect(cards).toHaveLength(8);

    // Click close button
    const closeBtn = container.querySelector(
      '[data-testid="templates-panel-close"]'
    ) as HTMLButtonElement | null;
    expect(closeBtn).toBeTruthy();

    await act(async () => {
      closeBtn?.click();
    });

    expect(
      container.querySelector('[data-testid="aboard-templates-drawer"]')
    ).toBeNull();
  });

  it("clicking insert on a template calls updateScene with converted elements and selects them without clearing canvas (Task 27 / BOARD-5)", async () => {
    const tab = {
      id: "tab-board-templates-2",
      itemId: "item-board-templates-2",
      kind: "board" as const,
      title: "Board Insert Test",
    };

    const initialElement = {
      id: "pre-existing-shape",
      type: "rectangle",
      x: 50,
      y: 50,
    };
    mockExcalidrawApi.getSceneElements = vi.fn(() => [initialElement as never]);
    mockExcalidrawApi.getAppState = vi.fn(() => ({
      scrollX: 100,
      scrollY: 100,
      zoom: { value: 1 },
      width: 1000,
      height: 800,
    } as never));

    await act(async () => {
      root.render(
        <I18nProvider>
          <BoardPane projectId="proj-tpl-2" tab={tab} visible={true} />
        </I18nProvider>
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    const toggleBtn = container.querySelector(
      '[data-testid="templates-panel-toggle"]'
    ) as HTMLButtonElement | null;
    await act(async () => {
      toggleBtn?.click();
    });

    const mindMapInsertBtn = container.querySelector(
      '[data-testid="template-insert-mind-map"]'
    ) as HTMLButtonElement | null;
    expect(mindMapInsertBtn).toBeTruthy();

    await act(async () => {
      mindMapInsertBtn?.click();
      await Promise.resolve();
    });

    expect(mockExcalidrawApi.updateScene).toHaveBeenCalledTimes(1);
    const updateCall = (mockExcalidrawApi.updateScene as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0];

    // Proves pre-existing elements are preserved
    expect(updateCall.elements[0].id).toBe("pre-existing-shape");
    expect(updateCall.elements.length).toBeGreaterThan(1);

    // Proves inserted elements are selected in appState
    expect(updateCall.appState.selectedElementIds).toBeDefined();
    const insertedIds = updateCall.elements.slice(1).map((e: { id: string }) => e.id);
    for (const id of insertedIds) {
      expect(updateCall.appState.selectedElementIds[id]).toBe(true);
    }
  });

  it("intercepts alpha:// links in onLinkOpen and emits navigate:alpha (INT-4)", async () => {
    const tab = { id: "tab-board-link", kind: "board" as const, itemId: "item-b-link", title: "Board Link" };
    vi.spyOn(projectService, "readItem").mockResolvedValue(JSON.stringify({ elements: [], appState: {} }));

    await act(async () => {
      root.render(
        <I18nProvider>
          <BoardPane projectId="proj-1" tab={tab} visible={true} />
        </I18nProvider>
      );
      await Promise.resolve();
    });

    const onLinkOpen = (lastExcalidrawProps as { onLinkOpen?: (el: unknown, ev: unknown) => void })?.onLinkOpen;
    expect(onLinkOpen).toBeTypeOf("function");

    const emitSpy = vi.spyOn(bus, "emit");
    const preventDefault = vi.fn();

    onLinkOpen?.(
      { link: "alpha://pdf/pdf-doc-1#page=4" },
      { preventDefault }
    );

    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(emitSpy).toHaveBeenCalledWith("navigate:alpha", {
      url: "alpha://pdf/pdf-doc-1#page=4",
    });
  });

  it("renders Send to PDF menu and triggers board:to-pdf with append mode (INT-3)", async () => {
    const tab = { id: "tab-board-pdf", kind: "board" as const, itemId: "item-b-pdf", title: "Board PDF" };
    vi.spyOn(projectService, "readItem").mockResolvedValue(
      JSON.stringify({
        elements: [{ id: "shape-1", isDeleted: false, type: "rectangle" }],
        appState: {},
      })
    );

    mockExcalidrawApi.getSceneElements = vi.fn().mockReturnValue([
      { id: "shape-1", isDeleted: false, type: "rectangle" },
    ]);

    const emitSpy = vi.spyOn(bus, "emit");

    await act(async () => {
      root.render(
        <I18nProvider>
          <BoardPane projectId="proj-1" tab={tab} visible={true} />
        </I18nProvider>
      );
      await Promise.resolve();
    });

    const sendToPdfBtn = container.querySelector(
      '[data-testid="board-send-to-pdf-btn"]'
    ) as HTMLButtonElement | null;
    expect(sendToPdfBtn).toBeTruthy();

    await act(async () => {
      sendToPdfBtn?.click();
      await Promise.resolve();
    });

    const appendBtn = container.querySelector(
      '[data-testid="send-to-pdf-append"]'
    ) as HTMLButtonElement | null;
    expect(appendBtn).toBeTruthy();

    await act(async () => {
      appendBtn?.click();
      await Promise.resolve();
    });

    expect(emitSpy).toHaveBeenCalledWith(
      "board:to-pdf",
      expect.objectContaining({
        boardItemId: "item-b-pdf",
        sourceTabId: "tab-board-pdf",
        mode: "append",
        image: expect.any(Blob),
      })
    );
  });

  it("triggers board:to-pdf with overlay mode when Overlay option is selected", async () => {
    const tab = { id: "tab-board-pdf-2", kind: "board" as const, itemId: "item-b-pdf-2", title: "Board PDF" };
    vi.spyOn(projectService, "readItem").mockResolvedValue(
      JSON.stringify({
        elements: [{ id: "shape-1", isDeleted: false, type: "rectangle" }],
        appState: {},
      })
    );

    mockExcalidrawApi.getSceneElements = vi.fn().mockReturnValue([
      { id: "shape-1", isDeleted: false, type: "rectangle" },
    ]);

    const emitSpy = vi.spyOn(bus, "emit");

    await act(async () => {
      root.render(
        <I18nProvider>
          <BoardPane projectId="proj-1" tab={tab} visible={true} />
        </I18nProvider>
      );
      await Promise.resolve();
    });

    const sendToPdfBtn = container.querySelector(
      '[data-testid="board-send-to-pdf-btn"]'
    ) as HTMLButtonElement | null;

    await act(async () => {
      sendToPdfBtn?.click();
      await Promise.resolve();
    });

    const overlayBtn = container.querySelector(
      '[data-testid="send-to-pdf-overlay"]'
    ) as HTMLButtonElement | null;
    expect(overlayBtn).toBeTruthy();

    await act(async () => {
      overlayBtn?.click();
      await Promise.resolve();
    });

    expect(emitSpy).toHaveBeenCalledWith(
      "board:to-pdf",
      expect.objectContaining({
        boardItemId: "item-b-pdf-2",
        sourceTabId: "tab-board-pdf-2",
        mode: "overlay",
        image: expect.any(Blob),
      })
    );
  });
});
