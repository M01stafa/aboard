// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { usePdfAnnotations, type UsePdfAnnotationsResult } from "./use-pdf-annotations";
import { PdfCustomInkLayer } from "./pdf-custom-ink-layer";

// @ts-expect-error React testing flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mockSelectAnnotation = vi.fn();
const mockSetSelection = vi.fn();
const mockCreateAnnotation = vi.fn();
const mockSetActiveTool = vi.fn();
const mockDeselectAnnotation = vi.fn();

vi.mock("@embedpdf/plugin-annotation/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@embedpdf/plugin-annotation/react")>();
  return {
    ...actual,
    useAnnotation: () => ({
      provides: {
        getAnnotations: vi.fn().mockReturnValue([]),
        exportAnnotations: vi.fn().mockReturnValue({ wait: (cb: (items: unknown[]) => void) => cb([]) }),
        importAnnotations: vi.fn(),
        onAnnotationEvent: vi.fn().mockReturnValue(() => {}),
        onActiveToolChange: vi.fn().mockReturnValue(() => {}),
        setActiveTool: mockSetActiveTool,
        createAnnotation: mockCreateAnnotation,
        selectAnnotation: mockSelectAnnotation,
        setSelection: mockSetSelection,
        deselectAnnotation: mockDeselectAnnotation,
      },
    }),
  };
});

vi.mock("@embedpdf/plugin-history/react", () => ({
  useHistoryCapability: () => ({
    provides: {
      forDocument: () => ({
        canUndo: () => false,
        canRedo: () => false,
        undo: vi.fn(),
        redo: vi.fn(),
        onHistoryChange: vi.fn().mockReturnValue(() => {}),
      }),
    },
  }),
}));

vi.mock("./image-stamp-utils", () => ({
  processStampImage: vi.fn().mockResolvedValue({
    buffer: new ArrayBuffer(8),
    width: 160,
    height: 120,
    mimeType: "image/png",
  }),
}));

describe("Stamp Immediate Resize & Selection (Sub-Agent 2)", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
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

  it("immediately selects a newly created stamp and switches tool to select", async () => {
    let hookResult!: UsePdfAnnotationsResult;

    function TestComponent() {
      hookResult = usePdfAnnotations({
        documentId: "doc-stamp-test",
        currentPage: 1,
      });
      return null;
    }

    act(() => {
      root.render(<TestComponent />);
    });

    const dummyFile = new File(["dummy content"], "stamp.png", { type: "image/png" });

    await act(async () => {
      await hookResult.handleAddStamp(dummyFile, { pageIndex: 0, x: 50, y: 50 });
    });

    expect(mockCreateAnnotation).toHaveBeenCalledTimes(1);
    const createdAnno = mockCreateAnnotation.mock.calls[0][1];
    const stampId = createdAnno.id;

    // Active tool switched to select
    expect(hookResult.activeTool).toBe("select");
    expect(mockSetActiveTool).toHaveBeenCalledWith(null);

    // Selected strokes include stamp ID immediately
    expect(hookResult.selectedStrokeIds).toEqual([stampId]);

    // EmbedPDF selection methods called
    expect(mockSelectAnnotation).toHaveBeenCalledWith(0, stampId);
    expect(mockSetSelection).toHaveBeenCalledWith([stampId]);
  });

  it("renders bounding box and resize handles for the selected stamp in PdfCustomInkLayer", () => {
    const stampObject = {
      id: "stamp-123",
      type: "stamp" as const,
      pageIndex: 0,
      x: 100,
      y: 100,
      width: 160,
      height: 120,
    };

    act(() => {
      root.render(
        <svg>
          <PdfCustomInkLayer
            pageIndex={0}
            pageWidth={612}
            pageHeight={792}
            isActive={false}
            isSelectMode={true}
            strokes={[]}
            selectedStrokeIds={["stamp-123"]}
            onAddStroke={vi.fn()}
            objects={[stampObject]}
          />
        </svg>
      );
    });

    // Check that bounding box exists
    const bbox = container.querySelector('[data-testid="pdf-stamp-bbox"]');
    expect(bbox).not.toBeNull();

    // Check that resize handles exist
    const nwHandle = container.querySelector('[data-testid="pdf-stamp-resize-handle-nw"]');
    const seHandle = container.querySelector('[data-testid="pdf-stamp-resize-handle-se"]');
    const neHandle = container.querySelector('[data-testid="pdf-stamp-resize-handle-ne"]');
    const swHandle = container.querySelector('[data-testid="pdf-stamp-resize-handle-sw"]');

    expect(nwHandle).not.toBeNull();
    expect(seHandle).not.toBeNull();
    expect(neHandle).not.toBeNull();
    expect(swHandle).not.toBeNull();
  });
});
