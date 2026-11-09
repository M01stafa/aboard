import { describe, expect, it, vi, beforeEach } from "vitest";
import { pdfRegistry, type PdfImperativeAPI } from "./pdf-registry";

describe("pdfRegistry", () => {
  beforeEach(() => {
    pdfRegistry.clear();
  });

  it("registers and retrieves a PDF imperative API by ID", () => {
    const mockApi: PdfImperativeAPI = {
      addStamp: vi.fn(),
      getCurrentPage: vi.fn().mockReturnValue(1),
    };

    pdfRegistry.register("pdf-1", mockApi);
    expect(pdfRegistry.get("pdf-1")).toBe(mockApi);
    expect(pdfRegistry.get("non-existent")).toBeUndefined();
  });

  it("unregisters an API cleanly", () => {
    const mockApi: PdfImperativeAPI = {
      addStamp: vi.fn(),
      getCurrentPage: vi.fn().mockReturnValue(1),
    };

    pdfRegistry.register("pdf-1", mockApi);
    pdfRegistry.unregister("pdf-1");
    expect(pdfRegistry.get("pdf-1")).toBeUndefined();
  });

  it("waitFor resolves when registered before timeout", async () => {
    const mockApi: PdfImperativeAPI = {
      addStamp: vi.fn(),
      getCurrentPage: vi.fn().mockReturnValue(2),
    };

    setTimeout(() => {
      pdfRegistry.register("pdf-async", mockApi);
    }, 20);

    const api = await pdfRegistry.waitFor("pdf-async", 1000);
    expect(api).toBe(mockApi);
    expect(api.getCurrentPage()).toBe(2);
  });
});

