// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BoardPane } from "./board-pane";
import { I18nProvider } from "@/i18n/provider";
import { projectService } from "@/core/storage";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

// @ts-expect-error React testing flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Track props passed to mocked Excalidraw component
let lastExcalidrawProps: Record<string, unknown> | null = null;
let mockRefresh = vi.fn();
let mockExcalidrawApi: Partial<ExcalidrawImperativeAPI> = {};

vi.mock("@excalidraw/excalidraw", () => ({
  Excalidraw: vi.fn((props: Record<string, unknown>) => {
    lastExcalidrawProps = props;
    if (typeof props.excalidrawAPI === "function") {
      props.excalidrawAPI(mockExcalidrawApi);
    }
    return React.createElement("div", {
      "data-testid": "mocked-excalidraw-canvas",
      className: "excalidraw",
    });
  }),
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
      await Promise.resolve();
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
});
