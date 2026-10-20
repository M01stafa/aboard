import { vi } from "vitest";
import React from "react";

// Fallback for ResizeObserver in Node/happy-dom unit tests
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// Fallback for window.matchMedia if undefined
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

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

// Default mock for @excalidraw/excalidraw in Node unit tests
vi.mock("@excalidraw/excalidraw", () => ({
  MainMenu: MainMenuMock,
  WelcomeScreen: WelcomeScreenMock,
  Excalidraw: vi.fn((props: { excalidrawAPI?: (api: unknown) => void }) => {
    if (typeof props.excalidrawAPI === "function") {
      props.excalidrawAPI({
        refresh: vi.fn(),
        getAppState: vi.fn(() => ({ scrollX: 0, scrollY: 0, zoom: { value: 1 }, width: 800, height: 600 })),
        getSceneElements: vi.fn(() => []),
        updateScene: vi.fn(),
        addFiles: vi.fn(),
        getFiles: vi.fn(() => ({})),
        scrollToContent: vi.fn(),
      });
    }
    return React.createElement(
      "div",
      {
        "data-testid": "mocked-excalidraw",
        className: "excalidraw",
      },
      (props as { children?: React.ReactNode }).children
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
  reconcileElements: vi.fn(
    (
      localElements: Array<{ id: string; version?: number; versionNonce?: number }> = [],
      remoteElements: Array<{ id: string; version?: number; versionNonce?: number }> = [],
      _localAppState: Record<string, unknown> = {}
    ) => {
      const localMap = new Map(localElements.map((el) => [el.id, el]));
      const result: Array<{ id: string; version?: number; versionNonce?: number }> = [];
      const added = new Set<string>();

      for (const remote of remoteElements) {
        if (!added.has(remote.id)) {
          const local = localMap.get(remote.id);
          const discardRemote =
            local &&
            ((local.version ?? 0) > (remote.version ?? 0) ||
              ((local.version ?? 0) === (remote.version ?? 0) &&
                (local.versionNonce ?? 0) < (remote.versionNonce ?? 0)));

          if (local && discardRemote) {
            result.push(local);
            added.add(local.id);
          } else {
            result.push(remote);
            added.add(remote.id);
          }
        }
      }

      for (const local of localElements) {
        if (!added.has(local.id)) {
          result.push(local);
          added.add(local.id);
        }
      }

      return result;
    }
  ),
}));
