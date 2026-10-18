// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ExportDialog } from "./export-dialog";
import { I18nProvider } from "@/i18n/provider";
import * as exportModule from "./export";

// @ts-expect-error React testing flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("ExportDialog UI (Task 31 / ALPHA-6)", () => {
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
    vi.restoreAllMocks();
  });

  it("does not render when isOpen is false", () => {
    act(() => {
      root.render(
        <I18nProvider>
          <ExportDialog projectId="test-proj" isOpen={false} onClose={vi.fn()} />
        </I18nProvider>
      );
    });

    expect(container.querySelector('[data-testid="alpha-export-dialog"]')).toBeNull();
  });

  it("renders export dialog with options when isOpen is true", () => {
    act(() => {
      root.render(
        <I18nProvider>
          <ExportDialog projectId="test-proj" isOpen={true} onClose={vi.fn()} />
        </I18nProvider>
      );
    });

    expect(container.querySelector('[data-testid="alpha-export-dialog"]')).not.toBeNull();

    const pdfsCheckbox = container.querySelector(
      '[data-testid="export-include-pdfs"]'
    ) as HTMLInputElement;
    expect(pdfsCheckbox).not.toBeNull();
    expect(pdfsCheckbox.checked).toBe(true); // default ON

    const annotatedCheckbox = container.querySelector(
      '[data-testid="export-include-annotated"]'
    ) as HTMLInputElement;
    expect(annotatedCheckbox).not.toBeNull();
    expect(annotatedCheckbox.checked).toBe(false); // default OFF

    const submitBtn = container.querySelector(
      '[data-testid="export-submit-btn"]'
    ) as HTMLButtonElement;
    expect(submitBtn).not.toBeNull();
  });

  it("calls onClose when clicking cancel button", () => {
    const onClose = vi.fn();

    act(() => {
      root.render(
        <I18nProvider>
          <ExportDialog projectId="test-proj" isOpen={true} onClose={onClose} />
        </I18nProvider>
      );
    });

    const cancelBtn = container.querySelector(
      '[data-testid="export-cancel-btn"]'
    ) as HTMLButtonElement;
    act(() => {
      cancelBtn.click();
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls exportAlpha with chosen options on submit", async () => {
    const onClose = vi.fn();
    const exportSpy = vi.spyOn(exportModule, "exportAlpha").mockResolvedValue({
      fileName: "test.alpha",
      isStreaming: false,
      manifest: {} as unknown as exportModule.ExportResult["manifest"],
      totalBytes: 100,
    });

    act(() => {
      root.render(
        <I18nProvider>
          <ExportDialog projectId="test-proj" isOpen={true} onClose={onClose} />
        </I18nProvider>
      );
    });

    const annotatedCheckbox = container.querySelector(
      '[data-testid="export-include-annotated"]'
    ) as HTMLInputElement;
    act(() => {
      annotatedCheckbox.click();
    });
    expect(annotatedCheckbox.checked).toBe(true);

    const submitBtn = container.querySelector(
      '[data-testid="export-submit-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      submitBtn.click();
    });

    expect(exportSpy).toHaveBeenCalledWith("test-proj", {
      includePdfs: true,
      includeAnnotated: true,
      streamToDisk: true,
      projectService: undefined,
    });
    expect(onClose).toHaveBeenCalled();
  });
});
