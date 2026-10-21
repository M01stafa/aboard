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
    onDownloadAnnotated: vi.fn(),
    onRotatePage: vi.fn(),
    onMovePageUp: vi.fn(),
    onMovePageDown: vi.fn(),
    onDeletePage: vi.fn(),
    onInsertImagePage: vi.fn(),
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
    expect(container.querySelector('[data-testid="pdf-download-btn"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pdf-page-operations-menu"]')).not.toBeNull();
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

  it("activates stamp file input and calls onAddStamp on file change", () => {
    const onAddStamp = vi.fn();
    const onSelectTool = vi.fn();

    act(() => {
      root.render(
        <I18nProvider>
          <PdfToolbar
            {...defaultProps}
            onSelectTool={onSelectTool}
            onAddStamp={onAddStamp}
          />
        </I18nProvider>
      );
    });

    const stampBtn = container.querySelector('[data-testid="pdf-tool-stamp"]') as HTMLButtonElement;
    const fileInput = container.querySelector('[data-testid="pdf-stamp-input"]') as HTMLInputElement;

    expect(fileInput).not.toBeNull();
    const clickSpy = vi.spyOn(fileInput, "click");

    act(() => {
      stampBtn.click();
    });

    expect(onSelectTool).toHaveBeenCalledWith("stamp");
    expect(clickSpy).toHaveBeenCalledTimes(1);

    const dummyFile = new File(["dummy png bytes"], "approved.png", { type: "image/png" });
    act(() => {
      Object.defineProperty(fileInput, "files", {
        value: [dummyFile],
        writable: true,
      });
      fileInput.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(onAddStamp).toHaveBeenCalledWith(dummyFile);
  });

  it("disables undo and redo buttons when their history stacks are empty", () => {
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

  it("triggers onDownloadAnnotated when download button is clicked", () => {
    const onDownloadAnnotated = vi.fn();

    act(() => {
      root.render(
        <I18nProvider>
          <PdfToolbar
            {...defaultProps}
            onDownloadAnnotated={onDownloadAnnotated}
          />
        </I18nProvider>
      );
    });

    const downloadBtn = container.querySelector('[data-testid="pdf-download-btn"]') as HTMLButtonElement;
    expect(downloadBtn).not.toBeNull();

    act(() => {
      downloadBtn.click();
    });
    expect(onDownloadAnnotated).toHaveBeenCalledTimes(1);
  });

  it("opens Page Operations menu and triggers rotate, move up, move down, and delete", () => {
    const onRotatePage = vi.fn();
    const onMovePageUp = vi.fn();
    const onMovePageDown = vi.fn();
    const onDeletePage = vi.fn();

    act(() => {
      root.render(
        <I18nProvider>
          <PdfToolbar
            {...defaultProps}
            currentPage={2}
            totalPages={5}
            onRotatePage={onRotatePage}
            onMovePageUp={onMovePageUp}
            onMovePageDown={onMovePageDown}
            onDeletePage={onDeletePage}
          />
        </I18nProvider>
      );
    });

    const menuBtn = container.querySelector('[data-testid="pdf-page-operations-menu"]') as HTMLButtonElement;
    expect(container.querySelector('[data-testid="pdf-page-operations-dropdown"]')).toBeNull();

    // Open dropdown menu
    act(() => {
      menuBtn.click();
    });
    expect(container.querySelector('[data-testid="pdf-page-operations-dropdown"]')).not.toBeNull();

    // Click Rotate
    const rotateBtn = container.querySelector('[data-testid="pdf-rotate-page-btn"]') as HTMLButtonElement;
    act(() => {
      rotateBtn.click();
    });
    expect(onRotatePage).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-testid="pdf-page-operations-dropdown"]')).toBeNull();

    // Reopen menu and click Move Page Up
    act(() => {
      menuBtn.click();
    });
    const moveUpBtn = container.querySelector('[data-testid="pdf-move-page-up-btn"]') as HTMLButtonElement;
    act(() => {
      moveUpBtn.click();
    });
    expect(onMovePageUp).toHaveBeenCalledTimes(1);

    // Reopen menu and click Move Page Down
    act(() => {
      menuBtn.click();
    });
    const moveDownBtn = container.querySelector('[data-testid="pdf-move-page-down-btn"]') as HTMLButtonElement;
    act(() => {
      moveDownBtn.click();
    });
    expect(onMovePageDown).toHaveBeenCalledTimes(1);

    // Reopen menu and click Delete
    act(() => {
      menuBtn.click();
    });
    const deleteBtn = container.querySelector('[data-testid="pdf-delete-page-btn"]') as HTMLButtonElement;
    act(() => {
      deleteBtn.click();
    });
    expect(onDeletePage).toHaveBeenCalledTimes(1);
  });

  it("renders Online Tools dropdown and triggers onRunOnlineTool for ocr, compress, and office-to-pdf", () => {
    const onRunOnlineTool = vi.fn();

    act(() => {
      root.render(
        <I18nProvider>
          <PdfToolbar
            {...defaultProps}
            onRunOnlineTool={onRunOnlineTool}
            isProcessingOnlineTool={false}
          />
        </I18nProvider>
      );
    });

    const toolsBtn = container.querySelector('[data-testid="pdf-online-tools-menu"]') as HTMLButtonElement;
    expect(toolsBtn).not.toBeNull();
    expect(container.querySelector('[data-testid="pdf-online-tools-dropdown"]')).toBeNull();

    // Open dropdown
    act(() => {
      toolsBtn.click();
    });
    expect(container.querySelector('[data-testid="pdf-online-tools-dropdown"]')).not.toBeNull();

    // Check OCR
    const ocrBtn = container.querySelector('[data-testid="pdf-tool-ocr-btn"]') as HTMLButtonElement;
    expect(ocrBtn).not.toBeNull();
    act(() => {
      ocrBtn.click();
    });
    expect(onRunOnlineTool).toHaveBeenCalledWith("ocr");
    expect(container.querySelector('[data-testid="pdf-online-tools-dropdown"]')).toBeNull();

    // Reopen and check Compress
    act(() => {
      toolsBtn.click();
    });
    const compressBtn = container.querySelector('[data-testid="pdf-tool-compress-btn"]') as HTMLButtonElement;
    expect(compressBtn).not.toBeNull();
    act(() => {
      compressBtn.click();
    });
    expect(onRunOnlineTool).toHaveBeenCalledWith("compress");

    // Reopen and check Office to PDF
    act(() => {
      toolsBtn.click();
    });
    const officeBtn = container.querySelector('[data-testid="pdf-tool-office-btn"]') as HTMLButtonElement;
    expect(officeBtn).not.toBeNull();
    act(() => {
      officeBtn.click();
    });
    expect(onRunOnlineTool).toHaveBeenCalledWith("office-to-pdf");
  });

  it("disables Online Tools menu button when isProcessingOnlineTool is true", () => {
    act(() => {
      root.render(
        <I18nProvider>
          <PdfToolbar
            {...defaultProps}
            onRunOnlineTool={vi.fn()}
            isProcessingOnlineTool={true}
          />
        </I18nProvider>
      );
    });

    const toolsBtn = container.querySelector('[data-testid="pdf-online-tools-menu"]') as HTMLButtonElement;
    expect(toolsBtn.disabled).toBe(true);
  });
});
