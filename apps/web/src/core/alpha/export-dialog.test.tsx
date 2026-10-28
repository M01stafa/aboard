// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { ExportDialog } from "./export-dialog";
import { I18nProvider } from "@/i18n/provider";
import * as exportModule from "./export";
import type { ProjectService } from "@/core/storage";

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

  it("renders PDF-only export section with flattened and clean options", () => {
    act(() => {
      root.render(
        <I18nProvider>
          <ExportDialog projectId="test-proj" isOpen={true} onClose={vi.fn()} />
        </I18nProvider>
      );
    });

    const flattenedRadio = container.querySelector(
      '[data-testid="export-pdf-flattened"]'
    ) as HTMLInputElement;
    expect(flattenedRadio).not.toBeNull();
    expect(flattenedRadio.checked).toBe(true);

    const cleanRadio = container.querySelector(
      '[data-testid="export-pdf-clean"]'
    ) as HTMLInputElement;
    expect(cleanRadio).not.toBeNull();
    expect(cleanRadio.checked).toBe(false);

    const driveBtn = container.querySelector(
      '[data-testid="export-drive-btn"]'
    ) as HTMLButtonElement;
    expect(driveBtn).not.toBeNull();
    expect(driveBtn.textContent).toContain("Export PDFs to Drive");
  });

  it("exports flattened PDF to Google Drive when clicking export-drive-btn", async () => {
    const onClose = vi.fn();
    const mockPdfBlob = new Blob([new Uint8Array([1, 2, 3])], { type: "application/pdf" });
    const mockBurnedBytes = new Uint8Array([9, 8, 7]);

    const mockPs = {
      openProject: vi.fn().mockResolvedValue({
        items: [{ id: "pdf-1", kind: "pdf", title: "MyGuide.pdf", fileKey: "hash123" }],
      }),
      getFile: vi.fn().mockResolvedValue(mockPdfBlob),
      readAnnotations: vi.fn().mockResolvedValue(JSON.stringify([{ type: "highlight" }])),
      saveQueue: { flushNow: vi.fn().mockResolvedValue(undefined) },
    };

    const driveApi = await import("@/core/drive/api");
    const uploadSpy = vi.spyOn(driveApi, "uploadExportToDrive").mockResolvedValue({ id: "drive-file-1" });

    const pageOps = await import("@/modules/pdf/page-operations");
    const burnSpy = vi.spyOn(pageOps, "burnAnnotationsWithPdfLib").mockResolvedValue(mockBurnedBytes);

    act(() => {
      root.render(
        <I18nProvider>
          <ExportDialog
            projectId="test-proj"
            isOpen={true}
            onClose={onClose}
            projectService={mockPs as unknown as ProjectService}
          />
        </I18nProvider>
      );
    });

    // Wait for projectPdfs effect to settle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const driveBtn = container.querySelector(
      '[data-testid="export-drive-btn"]'
    ) as HTMLButtonElement;

    await act(async () => {
      driveBtn.click();
    });

    expect(burnSpy).toHaveBeenCalled();
    expect(uploadSpy).toHaveBeenCalledWith(
      "MyGuide-flattened.pdf",
      expect.any(Blob),
      undefined,
      expect.anything(),
      "application/pdf"
    );
  });

  it("exports clean PDF to Google Drive without burning when clean radio is selected", async () => {
    const onClose = vi.fn();
    const mockPdfBlob = new Blob([new Uint8Array([1, 2, 3])], { type: "application/pdf" });

    const mockPs = {
      openProject: vi.fn().mockResolvedValue({
        items: [{ id: "pdf-1", kind: "pdf", title: "CleanDoc.pdf", fileKey: "hash456" }],
      }),
      getFile: vi.fn().mockResolvedValue(mockPdfBlob),
      readAnnotations: vi.fn().mockResolvedValue(""),
      saveQueue: { flushNow: vi.fn().mockResolvedValue(undefined) },
    };

    const driveApi = await import("@/core/drive/api");
    const uploadSpy = vi.spyOn(driveApi, "uploadExportToDrive").mockResolvedValue({ id: "drive-file-2" });

    const pageOps = await import("@/modules/pdf/page-operations");
    const burnSpy = vi.spyOn(pageOps, "burnAnnotationsWithPdfLib");

    act(() => {
      root.render(
        <I18nProvider>
          <ExportDialog
            projectId="test-proj"
            isOpen={true}
            onClose={onClose}
            projectService={mockPs as unknown as ProjectService}
          />
        </I18nProvider>
      );
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const cleanRadio = container.querySelector(
      '[data-testid="export-pdf-clean"]'
    ) as HTMLInputElement;
    act(() => {
      cleanRadio.click();
    });
    expect(cleanRadio.checked).toBe(true);

    const driveBtn = container.querySelector(
      '[data-testid="export-drive-btn"]'
    ) as HTMLButtonElement;

    await act(async () => {
      driveBtn.click();
    });

    // Clean export should NOT burn annotations
    expect(burnSpy).not.toHaveBeenCalled();
    expect(uploadSpy).toHaveBeenCalledWith(
      "CleanDoc-clean.pdf",
      expect.any(Blob),
      undefined,
      expect.anything(),
      "application/pdf"
    );
  });
});
