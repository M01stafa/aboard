// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PdfToolbar } from "./pdf-toolbar";
import { PdfFloatingToolbar } from "./pdf-floating-toolbar";
import { I18nProvider } from "@/i18n/provider";

// @ts-expect-error React testing flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("PdfToolbar Slim Header & Dropdowns (Task 29, 30, 41)", () => {
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

  const defaultToolbarProps = {
    documentTitle: "Lecture 10 - Neurological Anatomy.pdf",
    currentPage: 2,
    totalPages: 10,
    showThumbnails: false,
    onToggleThumbnails: vi.fn(),
    onPrevPage: vi.fn(),
    onNextPage: vi.fn(),
    onDownloadAnnotated: vi.fn(),
    onRotatePage: vi.fn(),
    onMovePageUp: vi.fn(),
    onMovePageDown: vi.fn(),
    onDeletePage: vi.fn(),
    onInsertImagePage: vi.fn(),
    onSendToBoard: vi.fn(),
    hasBoardTab: true,
  };

  it("renders slim top header with navigation, document title, and action buttons", () => {
    act(() => {
      root.render(
        <I18nProvider>
          <PdfToolbar {...defaultToolbarProps} />
        </I18nProvider>
      );
    });

    expect(container.querySelector('[data-testid="pdf-toolbar"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pdf-thumbnails-toggle"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pdf-prev-page"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pdf-page-display"]')?.textContent).toContain("2 / 10");
    expect(container.querySelector('[data-testid="pdf-next-page"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pdf-document-title"]')?.textContent).toBe("Lecture 10 - Neurological Anatomy.pdf");
    expect(container.querySelector('[data-testid="pdf-send-to-board-btn"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pdf-download-btn"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pdf-page-operations-menu"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pdf-online-tools-menu"]')).not.toBeNull();
  });

  it("opens Page Operations menu and triggers rotate, move up, move down, insert image, and delete", () => {
    const onRotatePage = vi.fn();
    const onMovePageUp = vi.fn();
    const onMovePageDown = vi.fn();
    const onDeletePage = vi.fn();

    act(() => {
      root.render(
        <I18nProvider>
          <PdfToolbar
            {...defaultToolbarProps}
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
            {...defaultToolbarProps}
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

    // Click OCR
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

  it("handles mutually exclusive dropdowns (opening Page Operations closes Online Tools and vice versa)", () => {
    act(() => {
      root.render(
        <I18nProvider>
          <PdfToolbar {...defaultToolbarProps} />
        </I18nProvider>
      );
    });

    const pageMenuBtn = container.querySelector('[data-testid="pdf-page-operations-menu"]') as HTMLButtonElement;
    const toolsMenuBtn = container.querySelector('[data-testid="pdf-online-tools-menu"]') as HTMLButtonElement;

    // Open Page Operations
    act(() => {
      pageMenuBtn.click();
    });
    expect(container.querySelector('[data-testid="pdf-page-operations-dropdown"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pdf-online-tools-dropdown"]')).toBeNull();

    // Open Online Tools -> Page Operations should close
    act(() => {
      toolsMenuBtn.click();
    });
    expect(container.querySelector('[data-testid="pdf-page-operations-dropdown"]')).toBeNull();
    expect(container.querySelector('[data-testid="pdf-online-tools-dropdown"]')).not.toBeNull();

    // Pressing Escape closes dropdown
    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });
    expect(container.querySelector('[data-testid="pdf-online-tools-dropdown"]')).toBeNull();
  });

  it("triggers onDownloadAnnotated when download button is clicked", () => {
    const onDownloadAnnotated = vi.fn();

    act(() => {
      root.render(
        <I18nProvider>
          <PdfToolbar
            {...defaultToolbarProps}
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

  it("triggers onSendToBoard when send to board button is clicked", () => {
    const onSendToBoard = vi.fn();

    act(() => {
      root.render(
        <I18nProvider>
          <PdfToolbar
            {...defaultToolbarProps}
            onSendToBoard={onSendToBoard}
            hasBoardTab={true}
          />
        </I18nProvider>
      );
    });

    const sendBtn = container.querySelector('[data-testid="pdf-send-to-board-btn"]') as HTMLButtonElement;
    expect(sendBtn).not.toBeNull();

    act(() => {
      sendBtn.click();
    });
    expect(onSendToBoard).toHaveBeenCalledTimes(1);
  });
});

describe("PdfFloatingToolbar (Floating Vertical Controls)", () => {
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

  const defaultFloatingProps = {
    activeTool: "select" as const,
    canUndo: false,
    canRedo: false,
    onSelectTool: vi.fn(),
    onUndo: vi.fn(),
    onRedo: vi.fn(),
    onAddStamp: vi.fn(),
    zoomLevel: 1.0,
    onZoomIn: vi.fn(),
    onZoomOut: vi.fn(),
    onResetZoom: vi.fn(),
  };

  it("renders all annotation tools, undo/redo, and zoom controls", () => {
    act(() => {
      root.render(
        <I18nProvider>
          <PdfFloatingToolbar {...defaultFloatingProps} zoomLevel={1.25} />
        </I18nProvider>
      );
    });

    expect(container.querySelector('[data-testid="pdf-floating-toolbar"]')).not.toBeNull();
    // Annotation tools
    expect(container.querySelector('[data-testid="pdf-tool-select"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pdf-tool-highlight"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pdf-tool-ink"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pdf-tool-text"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pdf-tool-stamp"]')).not.toBeNull();
    // History
    expect(container.querySelector('[data-testid="pdf-undo-button"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pdf-redo-button"]')).not.toBeNull();
    // Zoom
    expect(container.querySelector('[data-testid="pdf-zoom-in"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pdf-zoom-out"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pdf-zoom-level"]')?.textContent).toBe("125%");
  });

  it("triggers onSelectTool when clicking different annotation tool buttons", () => {
    const onSelectTool = vi.fn();

    act(() => {
      root.render(
        <I18nProvider>
          <PdfFloatingToolbar {...defaultFloatingProps} onSelectTool={onSelectTool} />
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
          <PdfFloatingToolbar
            {...defaultFloatingProps}
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

  it("handles undo and redo buttons based on canUndo and canRedo props", () => {
    const onUndo = vi.fn();
    const onRedo = vi.fn();

    act(() => {
      root.render(
        <I18nProvider>
          <PdfFloatingToolbar
            {...defaultFloatingProps}
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
          <PdfFloatingToolbar
            {...defaultFloatingProps}
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

  it("triggers zoom in, zoom out, and reset zoom", () => {
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();
    const onResetZoom = vi.fn();

    act(() => {
      root.render(
        <I18nProvider>
          <PdfFloatingToolbar
            {...defaultFloatingProps}
            zoomLevel={1.5}
            onZoomIn={onZoomIn}
            onZoomOut={onZoomOut}
            onResetZoom={onResetZoom}
          />
        </I18nProvider>
      );
    });

    const zoomInBtn = container.querySelector('[data-testid="pdf-zoom-in"]') as HTMLButtonElement;
    act(() => {
      zoomInBtn.click();
    });
    expect(onZoomIn).toHaveBeenCalledTimes(1);

    const zoomOutBtn = container.querySelector('[data-testid="pdf-zoom-out"]') as HTMLButtonElement;
    act(() => {
      zoomOutBtn.click();
    });
    expect(onZoomOut).toHaveBeenCalledTimes(1);

    const zoomLevelBtn = container.querySelector('[data-testid="pdf-zoom-level"]') as HTMLButtonElement;
    expect(zoomLevelBtn.textContent).toBe("150%");
    act(() => {
      zoomLevelBtn.click();
    });
    expect(onResetZoom).toHaveBeenCalledTimes(1);
  });
});
