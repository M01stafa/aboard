// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { usePdfPersistence, type UsePdfPersistenceResult } from "./use-pdf-persistence";
import { computeBlobSha256 } from "@/core/storage/sha256";
import type { ProjectService } from "@/core/storage";
import type { PdfItemPayload } from "./types";

// @ts-expect-error React testing flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("PDF Hashing with Progress (Task 28)", () => {
  it("computes streaming SHA-256 hash and emits progress ratios", async () => {
    const content = "Sample PDF content for hashing verification.";
    const blob = new Blob([content], { type: "application/pdf" });
    const progressUpdates: number[] = [];

    const hash = await computeBlobSha256(blob, (ratio) => {
      progressUpdates.push(ratio);
    });

    expect(typeof hash).toBe("string");
    expect(hash.length).toBe(64); // Valid 64-char SHA-256 hex string
    expect(progressUpdates.length).toBeGreaterThan(0);
    expect(progressUpdates[progressUpdates.length - 1]).toBe(1);
  });
});

describe("usePdfPersistence Hook (Task 28)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  function renderHook(
    projectId: string,
    itemId: string,
    psMock: ProjectService
  ): { current: UsePdfPersistenceResult } {
    const result = {} as { current: UsePdfPersistenceResult };

    function TestComponent() {
      const hookResult = usePdfPersistence({
        projectId,
        itemId,
        projectServiceOverride: psMock,
      });
      result.current = hookResult;
      return null;
    }

    act(() => {
      root.render(<TestComponent />);
    });

    return result;
  }

  it("loads empty state when item does not exist in ProjectService", async () => {
    const mockPs = {
      readItem: vi.fn().mockResolvedValue(""),
      getFile: vi.fn(),
      savePdf: vi.fn(),
      putFile: vi.fn(),
    } as unknown as ProjectService;

    const res = renderHook("test-proj", "test-item-1", mockPs);

    await act(async () => {
      await Promise.resolve();
    });

    expect(res.current.isLoaded).toBe(true);
    expect(res.current.payload).toBeNull();
    expect(res.current.blob).toBeNull();
  });

  it("loads existing item state and fetches blob by content key", async () => {
    const existingPayload: PdfItemPayload = {
      type: "alpha-pdf",
      version: 1,
      fileKey: "hash-pdf-1234",
      name: "Lecture1.pdf",
      lastPage: 7,
    };
    const sampleBlob = new Blob(["%PDF-1.4 sample bytes"], { type: "application/pdf" });

    const mockPs = {
      readItem: vi.fn().mockResolvedValue(JSON.stringify(existingPayload)),
      getFile: vi.fn().mockResolvedValue(sampleBlob),
      savePdf: vi.fn(),
      putFile: vi.fn(),
    } as unknown as ProjectService;

    const res = renderHook("test-proj", "test-item-2", mockPs);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(res.current.isLoaded).toBe(true);
    expect(res.current.payload).toEqual(existingPayload);
    expect(res.current.payload?.lastPage).toBe(7);
    expect(res.current.blob).toBe(sampleBlob);
  });

  it("adds a new PDF file: computes hash, calls putFile and savePdf", async () => {
    const fileBlob = new Blob(["%PDF-1.4 fresh new document"], { type: "application/pdf" });

    const mockPs = {
      readItem: vi.fn().mockResolvedValue(""),
      getFile: vi.fn(),
      savePdf: vi.fn().mockResolvedValue(undefined),
      putFile: vi.fn().mockImplementation((_proj, _blob, _meta, key) => Promise.resolve({ key })),
    } as unknown as ProjectService;

    const res = renderHook("test-proj", "test-item-3", mockPs);

    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      await res.current.addPdfFile(fileBlob, "Textbook.pdf");
    });

    expect(mockPs.putFile).toHaveBeenCalledTimes(1);
    expect(mockPs.savePdf).toHaveBeenCalledTimes(1);

    expect(res.current.payload?.name).toBe("Textbook.pdf");
    expect(res.current.payload?.lastPage).toBe(1);
    expect(res.current.blob).toBe(fileBlob);
  });

  it("persists page number updates debounced so reopening restores position", async () => {
    const existingPayload: PdfItemPayload = {
      type: "alpha-pdf",
      version: 1,
      fileKey: "hash-pdf-9999",
      name: "Paper.pdf",
      lastPage: 1,
    };
    const sampleBlob = new Blob(["%PDF-1.4 paper bytes"], { type: "application/pdf" });

    const mockPs = {
      readItem: vi.fn().mockResolvedValue(JSON.stringify(existingPayload)),
      getFile: vi.fn().mockResolvedValue(sampleBlob),
      savePdf: vi.fn().mockResolvedValue(undefined),
      putFile: vi.fn(),
    } as unknown as ProjectService;

    const res = renderHook("test-proj", "test-item-4", mockPs);

    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Student navigates to page 15
    act(() => {
      res.current.saveLastPage(15);
    });

    expect(res.current.payload?.lastPage).toBe(15);
    expect(mockPs.savePdf).toHaveBeenCalledTimes(1);
    const savedArg = (mockPs.savePdf as ReturnType<typeof vi.fn>).mock.calls[0];
    const savedPayload = JSON.parse(savedArg[2]);
    expect(savedPayload.lastPage).toBe(15);
    expect(savedPayload.fileKey).toBe("hash-pdf-9999");
  });
});
