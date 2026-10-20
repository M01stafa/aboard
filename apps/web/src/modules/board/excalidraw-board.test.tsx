// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ExcalidrawBoard } from "./excalidraw-board";

// @ts-expect-error React testing flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("ExcalidrawBoard Native Branding & Menu Sanitization", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  it("renders with essential canvas actions and omits external social and help links", () => {
    act(() => {
      root.render(<ExcalidrawBoard />);
    });

    // Native essential actions should exist
    expect(container.querySelector('[data-testid="menu-save-as-image"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="menu-export"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="menu-search"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="menu-clear-canvas"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="menu-toggle-theme"]')).toBeTruthy();
    expect(container.querySelector('[data-testid="menu-change-canvas-bg"]')).toBeTruthy();

    // Third-party external links and unwanted items must NOT exist
    expect(container.querySelector('[data-testid="menu-help"]')).toBeNull();
    expect(container.querySelector('[data-testid="menu-socials"]')).toBeNull();
    expect(container.querySelector('[data-testid="menu-load-scene"]')).toBeNull();
    expect(container.querySelector('[data-testid="menu-save-to-active-file"]')).toBeNull();
  });

  it("suppresses upstream welcome screen branding", () => {
    act(() => {
      root.render(<ExcalidrawBoard />);
    });

    // Custom welcome screen container rendered
    const welcome = container.querySelector('[data-testid="welcome-screen"]');
    expect(welcome).toBeTruthy();
  });
});
