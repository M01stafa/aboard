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

// Default mock for @excalidraw/excalidraw in Node unit tests
vi.mock("@excalidraw/excalidraw", () => ({
  Excalidraw: vi.fn((props: { excalidrawAPI?: (api: unknown) => void }) => {
    if (typeof props.excalidrawAPI === "function") {
      props.excalidrawAPI({
        refresh: vi.fn(),
        getAppState: vi.fn(() => ({ scrollX: 0, scrollY: 0, zoom: { value: 1 }, width: 800, height: 600 })),
        getSceneElements: vi.fn(() => []),
        updateScene: vi.fn(),
        addFiles: vi.fn(),
        getFiles: vi.fn(() => ({})),
      });
    }
    return React.createElement("div", {
      "data-testid": "mocked-excalidraw",
      className: "excalidraw",
    });
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
