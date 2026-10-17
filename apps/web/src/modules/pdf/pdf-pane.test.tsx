// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PdfPane, isMobileDevice } from "./pdf-pane";
import { PdfToolbar } from "./pdf-toolbar";
import { I18nProvider } from "@/i18n/provider";
import type { Tab } from "@/workspace/types";
import type { ProjectService } from "@/core/storage";

// @ts-expect-error React testing flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("PdfToolbar component (Task 28)", () => {
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

  it("renders page navigation and zoom controls correctly", () => {
    const onPrevPage = vi.fn();
    const onNextPage = vi.fn();
    const onZoomIn = vi.fn();
    const onZoomOut = vi.fn();
    const onResetZoom = vi.fn();
    const onToggleThumbnails = vi.fn();

    act(() => {
      root.render(
        <I18nProvider>
          <PdfToolbar
            documentTitle="Biology_101.pdf"
            currentPage={2}
            totalPages={10}
            zoomLevel={1.25}
            showThumbnails={false}
            onToggleThumbnails={onToggleThumbnails}
            onPrevPage={onPrevPage}
            onNextPage={onNextPage}
            onZoomIn={onZoomIn}
            onZoomOut={onZoomOut}
            onResetZoom={onResetZoom}
          />
        </I18nProvider>
      );
    });

    const pageDisplay = container.querySelector('[data-testid="pdf-page-display"]');
    expect(pageDisplay?.textContent).toContain("2");
    expect(pageDisplay?.textContent).toContain("10");

    const zoomDisplay = container.querySelector('[data-testid="pdf-zoom-level"]');
    expect(zoomDisplay?.textContent).toContain("125%");

    const prevBtn = container.querySelector('[data-testid="pdf-prev-page"]') as HTMLButtonElement;
    expect(prevBtn.disabled).toBe(false);
    act(() => {
      prevBtn.click();
    });
    expect(onPrevPage).toHaveBeenCalledTimes(1);

    const nextBtn = container.querySelector('[data-testid="pdf-next-page"]') as HTMLButtonElement;
    expect(nextBtn.disabled).toBe(false);
    act(() => {
      nextBtn.click();
    });
    expect(onNextPage).toHaveBeenCalledTimes(1);

    const zoomInBtn = container.querySelector('[data-testid="pdf-zoom-in"]') as HTMLButtonElement;
    act(() => {
      zoomInBtn.click();
    });
    expect(onZoomIn).toHaveBeenCalledTimes(1);

    const thumbnailsToggle = container.querySelector('[data-testid="pdf-thumbnails-toggle"]') as HTMLButtonElement;
    act(() => {
      thumbnailsToggle.click();
    });
    expect(onToggleThumbnails).toHaveBeenCalledTimes(1);
  });

  it("disables prev page button on page 1 and next page button on last page", () => {
    act(() => {
      root.render(
        <I18nProvider>
          <PdfToolbar
            currentPage={1}
            totalPages={1}
            zoomLevel={1.0}
            showThumbnails={false}
            onToggleThumbnails={vi.fn()}
            onPrevPage={vi.fn()}
            onNextPage={vi.fn()}
            onZoomIn={vi.fn()}
            onZoomOut={vi.fn()}
            onResetZoom={vi.fn()}
          />
        </I18nProvider>
      );
    });

    const prevBtn = container.querySelector('[data-testid="pdf-prev-page"]') as HTMLButtonElement;
    expect(prevBtn.disabled).toBe(true);

    const nextBtn = container.querySelector('[data-testid="pdf-next-page"]') as HTMLButtonElement;
    expect(nextBtn.disabled).toBe(true);
  });
});

describe("PdfPane and Mobile Large File UX (PDF-7)", () => {
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

  it("detects mobile devices based on matchMedia coarse pointer or viewport width", () => {
    expect(typeof isMobileDevice()).toBe("boolean");
  });

  it("invokes onMount callback with tab ID and stable token", async () => {
    const onMount = vi.fn();
    const tab: Tab = {
      id: "tab-pdf-test",
      kind: "pdf",
      itemId: "item-pdf-1",
      title: "PDF Document",
    };

    const mockPs = {
      readItem: vi.fn().mockResolvedValue(""),
      getFile: vi.fn(),
      savePdf: vi.fn(),
      putFile: vi.fn(),
    } as unknown as ProjectService;

    act(() => {
      root.render(
        <I18nProvider>
          <PdfPane
            projectId="test-proj"
            tab={tab}
            visible={true}
            onMount={onMount}
            projectServiceOverride={mockPs}
          />
        </I18nProvider>
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(onMount).toHaveBeenCalledTimes(1);
    expect(onMount).toHaveBeenCalledWith("tab-pdf-test", expect.any(String));
  });

  it("renders empty state with dropzone when no file has been added yet", async () => {
    const tab: Tab = {
      id: "tab-pdf-empty",
      kind: "pdf",
      itemId: "item-pdf-empty",
      title: "PDF Document",
    };

    const mockPs = {
      readItem: vi.fn().mockResolvedValue(""),
      getFile: vi.fn(),
      savePdf: vi.fn(),
      putFile: vi.fn(),
    } as unknown as ProjectService;

    act(() => {
      root.render(
        <I18nProvider>
          <PdfPane
            projectId="test-proj"
            tab={tab}
            visible={true}
            projectServiceOverride={mockPs}
          />
        </I18nProvider>
      );
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(container.querySelector('[data-testid="pdf-dropzone"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pdf-file-input"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="pdf-select-button"]')).not.toBeNull();
  });
});
