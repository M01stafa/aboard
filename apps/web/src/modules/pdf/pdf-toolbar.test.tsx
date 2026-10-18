// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PdfToolbar } from "./pdf-toolbar";
import { I18nProvider } from "@/i18n/provider";

// @ts-expect-error React testing flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("PdfToolbar Annotation Controls (Task 29 / PDF-3, PDF-4)", () => {
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

  const defaultProps = {
    documentTitle: "Lecture 10 - Neurological Anatomy.pdf",
    currentPage: 2,
    totalPages: 10,
    zoomLevel: 1.25,
    showThumbnails: false,
    onToggleThumbnails: vi.fn(),
    onPrevPage: vi.fn(),
    onNextPage: vi.fn(),
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onResetZoom: vi.fn(),
    activeTool: "select" as const,
    canUndo: false,
    canRedo: false,
    onSelectTool: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onAddStamp: vi.fn(),
  };

  it("renders all annotation tools and pagination controls", () => {
    act(() => {
      root.render(
        <I18nProvider>
          <PdfToolbar {...defaultProps} />
        </I18nProvider>
      );
    });

    expect(container.querySelector('[data-testid="pdf-toolbar"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pdf-tool-select"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pdf-tool-highlight"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pdf-tool-ink"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pdf-tool-text"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pdf-tool-stamp"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pdf-undo-button"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pdf-redo-button"]')).not.toBeNull();
  });

  it("triggers onSelectTool when clicking different annotation tool buttons", () => {
    const onSelectTool = vi.fn();

    act(() => {
      root.render(
        <I18nProvider>
          <PdfToolbar {...defaultProps} onSelectTool={onSelectTool} />
        </I18nProvider>
      );
    });

    const highlightBtn = container.querySelector('[data-testid="pdf-tool-highlight"]') as HTMLButtonElement;
    act(() => {
      highlightBtn.click();
    });
    expect(onSelectTool).toHaveBeenCalledWith("highlight");

    const inkBtn = container.querySelector('[data-testid="pdf-tool-ink"]') as HTMLButtonElement;
    act(() => {
      inkBtn.click();
    });
    expect(onSelectTool).toHaveBeenCalledWith("ink");

    const textBtn = container.querySelector('[data-testid="pdf-tool-text"]') as HTMLButtonElement;
    act(() => {
      textBtn.click();
    });
    expect(onSelectTool).toHaveBeenCalledWith("freeText");

    const selectBtn = container.querySelector('[data-testid="pdf-tool-select"]') as HTMLButtonElement;
    act(() => {
      selectBtn.click();
    });
    expect(onSelectTool).toHaveBeenCalledWith("select");
  });

  it("handles stamp upload via the stamp file input", () => {
    const onAddStamp = vi.fn();

    act(() => {
      root.render(
        <I18nProvider>
          <PdfToolbar {...defaultProps} onAddStamp={onAddStamp} />
        </I18nProvider>
      );
    });

    const fileInput = container.querySelector('input[data-testid="pdf-stamp-input"]') as HTMLInputElement;
    const testFile = new File(["dummy-png-data"], "anatomy-stamp.png", {
      type: "image/png",
    });

    act(() => {
      const event = new Event("change", { bubbles: true });
      Object.defineProperty(fileInput, "files", {
        value: [testFile],
        writable: true,
      });
      fileInput.dispatchEvent(event);
    });

    expect(onAddStamp).toHaveBeenCalledWith(testFile);
  });

  it("disables undo and redo buttons when canUndo and canRedo are false, and enables them when true", () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();

    act(() => {
      root.render(
        <I18nProvider>
          <PdfToolbar
            {...defaultProps}
            canUndo={false}
            canRedo={false}
            onUndo={onUndo}
            onRedo={onRedo}
          />
        </I18nProvider>
      );
    });

    const undoBtn = container.querySelector('[data-testid="pdf-undo-button"]') as HTMLButtonElement;
    const redoBtn = container.querySelector('[data-testid="pdf-redo-button"]') as HTMLButtonElement;

    expect(undoBtn.disabled).toBe(true);
    expect(redoBtn.disabled).toBe(true);

    act(() => {
      undoBtn.click();
      redoBtn.click();
    });
    expect(onUndo).not.toHaveBeenCalled();
    expect(onRedo).not.toHaveBeenCalled();

    act(() => {
      root.render(
        <I18nProvider>
          <PdfToolbar
            {...defaultProps}
            canUndo={true}
            canRedo={true}
            onUndo={onUndo}
            onRedo={onRedo}
          />
        </I18nProvider>
      );
    });

    expect(undoBtn.disabled).toBe(false);
    expect(redoBtn.disabled).toBe(false);

    act(() => {
      undoBtn.click();
    });
    expect(onUndo).toHaveBeenCalledTimes(1);

    act(() => {
      redoBtn.click();
    });
    expect(onRedo).toHaveBeenCalledTimes(1);
  });
});
