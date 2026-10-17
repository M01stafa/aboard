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
        getAppState: vi.fn(() => ({})),
        getSceneElements: vi.fn(() => []),
        updateScene: vi.fn(),
      });
    }
    return React.createElement("div", {
      "data-testid": "mocked-excalidraw",
      className: "excalidraw",
    });
  }),
}));
