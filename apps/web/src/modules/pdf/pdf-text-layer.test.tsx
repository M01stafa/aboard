// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PdfTextLayer } from "./pdf-text-layer";

// @ts-expect-error React testing flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockWait = vi.fn((onSuccess: (data: unknown) => void) => {
  onSuccess({
    runs: [
      {
        text: "Hello World",
        charIndex: 0,
        charCount: 11,
        rect: { origin: { x: 50, y: 100 }, size: { width: 120, height: 16 } },
        fontSize: 16,
      },
    ],
  });
});

const mockGetPageTextRuns = vi.fn().mockReturnValue({
  wait: mockWait,
});

const mockRegistry = {
  getEngine: () => ({
    getPageTextRuns: mockGetPageTextRuns,
    getPageGeometry: vi.fn(),
  }),
};

let mockDocState: {
  scale: number;
  document: { pages: Array<{ pageIndex: number }> };
} = {
  scale: 1.5,
  document: { pages: [{ pageIndex: 0 }] },
};

vi.mock("@embedpdf/core/react", () => ({
  useRegistry: () => ({ registry: mockRegistry }),
  useDocumentState: () => mockDocState,
}));

describe("PdfTextLayer Component", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  it("renders container with data-text-layer='true' and positioned text spans", () => {
    act(() => {
      root.render(
        <PdfTextLayer
          documentId="doc-1"
          pageIndex={0}
          isAnnotating={false}
        />
      );
    });

    const textLayer = container.querySelector('[data-text-layer="true"]') as HTMLElement;
    expect(textLayer).toBeTruthy();
    expect(textLayer.getAttribute("data-page-index")).toBe("0");
    expect(textLayer.style.pointerEvents).toBe("auto");
    expect(textLayer.style.userSelect).toBe("text");

    const span = textLayer.querySelector("span");
    expect(span).toBeTruthy();
    expect(span?.textContent).toBe("Hello World");
    expect(span?.style.left).toBe(`${50 * 1.5}px`);
    expect(span?.style.top).toBe(`${100 * 1.5}px`);
    expect(span?.style.width).toBe(`${120 * 1.5}px`);
    expect(span?.style.height).toBe(`${16 * 1.5}px`);
    expect(span?.style.color).toBe("transparent");
  });

  it("disables pointer events and selection when isAnnotating is true", () => {
    act(() => {
      root.render(
        <PdfTextLayer
          documentId="doc-1"
          pageIndex={0}
          isAnnotating={true}
        />
      );
    });

    const textLayer = container.querySelector('[data-text-layer="true"]') as HTMLElement;
    expect(textLayer).toBeTruthy();
    expect(textLayer.style.pointerEvents).toBe("none");
    expect(textLayer.style.userSelect).toBe("none");
  });
});
