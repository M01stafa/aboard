// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PdfCustomInkLayer } from "./pdf-custom-ink-layer";
import { usePdfAnnotations, type UsePdfAnnotationsResult } from "./use-pdf-annotations";
import { PdfAnnotationSubtype } from "@embedpdf/models";
import { PdfFloatingToolbar } from "./pdf-floating-toolbar";

// @ts-expect-error React testing flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/i18n/provider", () => ({
  useI18n: () => ({ t: (k: string) => k }),
}));

const mockCreateAnnotation = vi.fn();
const mockUpdateAnnotation = vi.fn();
const mockSelectAnnotation = vi.fn();
const mockDeselectAnnotation = vi.fn();
const mockSetActiveTool = vi.fn();
const mockGetAnnotations = vi.fn().mockReturnValue([]);

vi.mock("@embedpdf/plugin-annotation/react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@embedpdf/plugin-annotation/react")>();
  return {
    ...actual,
    useAnnotation: () => ({
      provides: {
        getAnnotations: mockGetAnnotations,
        exportAnnotations: vi.fn().mockReturnValue({ wait: (cb: (items: unknown[]) => void) => cb([]) }),
        importAnnotations: vi.fn(),
        createAnnotation: mockCreateAnnotation,
        updateAnnotation: mockUpdateAnnotation,
        deleteAnnotations: vi.fn(),
        onAnnotationEvent: vi.fn().mockReturnValue(() => {}),
        onActiveToolChange: vi.fn().mockReturnValue(() => {}),
        setActiveTool: mockSetActiveTool,
        selectAnnotation: mockSelectAnnotation,
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

describe("PDF Text Tool (Sub-Agent 1)", () => {
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

  const sampleTextObject = {
    id: "text-1",
    type: "text" as const,
    pageIndex: 0,
    x: 60,
    y: 90,
    width: 140,
    height: 36,
    contents: "Hello World",
    text: "Hello World",
    fontSize: 16,
    color: "#E44234",
  };

  it("renders text display in non-editing mode within foreignObject", () => {
    act(() => {
      root.render(
        <PdfCustomInkLayer
          pageIndex={0}
          pageWidth={612}
          pageHeight={792}
          isActive={false}
          isSelectMode={true}
          strokes={[]}
          onAddStroke={vi.fn()}
          objects={[sampleTextObject]}
        />
      );
    });

    const displayEl = container.querySelector('[data-testid="pdf-text-display-text-1"]');
    expect(displayEl).not.toBeNull();
    expect(displayEl?.textContent).toBe("Hello World");
    expect(displayEl?.getAttribute("dir")).toBe("auto");

    // In non-editing mode, no textarea or input should be present
    const inputEl = container.querySelector('[data-testid="pdf-text-input-text-1"]');
    expect(inputEl).toBeNull();
  });

  it("switches to edit mode on double-click and triggers onUpdateText on change", () => {
    const handleUpdateText = vi.fn();

    act(() => {
      root.render(
        <PdfCustomInkLayer
          pageIndex={0}
          pageWidth={612}
          pageHeight={792}
          isActive={false}
          isSelectMode={true}
          strokes={[]}
          onAddStroke={vi.fn()}
          onUpdateText={handleUpdateText}
          objects={[sampleTextObject]}
        />
      );
    });

    const textBox = container.querySelector('[data-testid="pdf-text-box-text-1"]');
    expect(textBox).not.toBeNull();

    // Double click to enter edit mode
    act(() => {
      textBox?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    });

    const textarea = container.querySelector('[data-testid="pdf-text-input-text-1"]') as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
    expect(textarea.value).toBe("Hello World");
    expect(textarea.style.border).toContain("dashed");
    expect(textarea.getAttribute("dir")).toBe("auto");

    // Typing in textarea calls onUpdateText via React native setter
    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      )?.set;
      nativeSetter?.call(textarea, "Updated Text");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });

    expect(handleUpdateText).toHaveBeenCalledWith(0, "text-1", "Updated Text");

    // Pressing Escape exits edit mode
    act(() => {
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    const displayAfterEscape = container.querySelector('[data-testid="pdf-text-display-text-1"]');
    expect(displayAfterEscape).not.toBeNull();
  });

  it("exits edit mode when textarea loses focus (focusout / blur)", () => {
    act(() => {
      root.render(
        <PdfCustomInkLayer
          pageIndex={0}
          pageWidth={612}
          pageHeight={792}
          isActive={false}
          isSelectMode={true}
          strokes={[]}
          onAddStroke={vi.fn()}
          objects={[sampleTextObject]}
        />
      );
    });

    const textBox = container.querySelector('[data-testid="pdf-text-box-text-1"]');
    act(() => {
      textBox?.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    });

    const textarea = container.querySelector('[data-testid="pdf-text-input-text-1"]') as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();

    act(() => {
      textarea.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });

    const displayAfterBlur = container.querySelector('[data-testid="pdf-text-display-text-1"]');
    expect(displayAfterBlur).not.toBeNull();
  });

  it("clicking canvas in isTextMode calls onAddText and enters edit mode", () => {
    const handleAddText = vi.fn().mockReturnValue("new-text-id");

    act(() => {
      root.render(
        <PdfCustomInkLayer
          pageIndex={0}
          pageWidth={612}
          pageHeight={792}
          isActive={false}
          isTextMode={true}
          onAddText={handleAddText}
          strokes={[]}
          onAddStroke={vi.fn()}
          objects={[]}
        />
      );
    });

    const svg = container.querySelector("svg");
    expect(svg).not.toBeNull();

    // Mock getBoundingClientRect on SVG for coordinate mapping
    vi.spyOn(svg!, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 0,
      width: 612 * 3,
      height: 792 * 3,
      right: 612 * 3,
      bottom: 792 * 3,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    act(() => {
      svg?.dispatchEvent(
        new PointerEvent("pointerdown", {
          clientX: 612,
          clientY: 792,
          button: 0,
          bubbles: true,
        })
      );
    });

    expect(handleAddText).toHaveBeenCalledWith(0, expect.objectContaining({
      width: 140,
      height: 36,
      text: "Text",
      fontSize: 16,
    }));
  });

  it("renders selection bounding box and 8 handles when selected", () => {
    act(() => {
      root.render(
        <PdfCustomInkLayer
          pageIndex={0}
          pageWidth={612}
          pageHeight={792}
          isActive={false}
          isSelectMode={true}
          selectedStrokeIds={["text-1"]}
          strokes={[]}
          onAddStroke={vi.fn()}
          objects={[sampleTextObject]}
        />
      );
    });

    const bbox = container.querySelector('[data-testid="pdf-text-bbox"]');
    expect(bbox).not.toBeNull();

    const handles = container.querySelectorAll('[data-testid^="pdf-text-resize-handle-"]');
    expect(handles.length).toBe(8);
  });

  it("Floating toolbar highlights text button for both 'text' and 'freeText'", () => {
    act(() => {
      root.render(
        <PdfFloatingToolbar
          activeTool="freeText"
          zoomLevel={1.0}
          onZoomIn={vi.fn()}
          onZoomOut={vi.fn()}
          onResetZoom={vi.fn()}
        />
      );
    });

    const textBtn = container.querySelector('[data-testid="pdf-tool-text"]');
    expect(textBtn?.getAttribute("aria-pressed")).toBe("true");

    act(() => {
      root.render(
        <PdfFloatingToolbar
          activeTool="text"
          zoomLevel={1.0}
          onZoomIn={vi.fn()}
          onZoomOut={vi.fn()}
          onResetZoom={vi.fn()}
        />
      );
    });

    const textBtn2 = container.querySelector('[data-testid="pdf-tool-text"]');
    expect(textBtn2?.getAttribute("aria-pressed")).toBe("true");
  });

  it("usePdfAnnotations handleAddText creates FreeText annotation and selects it", () => {
    let hookResult!: UsePdfAnnotationsResult;

    function TestComponent() {
      hookResult = usePdfAnnotations({
        documentId: "doc-1",
        projectId: "proj-1",
        currentPage: 1,
      });
      return null;
    }

    act(() => {
      root.render(<TestComponent />);
    });

    expect(hookResult).toBeDefined();

    act(() => {
      const id = hookResult.handleAddText(0, {
        x: 100,
        y: 150,
        text: "Custom Text",
        fontSize: 18,
        color: "#1A63A0",
      });
      expect(id).toBeTruthy();
    });

    expect(mockCreateAnnotation).toHaveBeenCalledWith(
      0,
      expect.objectContaining({
        type: PdfAnnotationSubtype.FREETEXT,
        pageIndex: 0,
        contents: "Custom Text",
        fontSize: 18,
        fontColor: "#1A63A0",
        rect: {
          origin: { x: 100, y: 150 },
          size: { width: 140, height: 36 },
        },
      })
    );

    expect(mockSelectAnnotation).toHaveBeenCalledWith(0, expect.any(String));
    expect(hookResult.activeTool).toBe("select");
  });

  it("usePdfAnnotations handleUpdateText calls annotationScope.updateAnnotation", () => {
    let hookResult!: UsePdfAnnotationsResult;

    function TestComponent() {
      hookResult = usePdfAnnotations({
        documentId: "doc-1",
        projectId: "proj-1",
        currentPage: 1,
      });
      return null;
    }

    act(() => {
      root.render(<TestComponent />);
    });

    act(() => {
      hookResult.handleUpdateText(0, "text-1", "New Contents");
    });

    expect(mockUpdateAnnotation).toHaveBeenCalledWith(0, "text-1", {
      contents: "New Contents",
    });
  });

  it("usePdfAnnotations getObjectsForPage returns text objects with contents, coordinates, and fontSize", () => {
    mockGetAnnotations.mockReturnValue([
      {
        object: {
          id: "freetext-anno-1",
          pageIndex: 0,
          type: PdfAnnotationSubtype.FREETEXT,
          contents: "Exam Questions",
          fontSize: 20,
          fontColor: "#E44234",
          rect: {
            origin: { x: 72, y: 144 },
            size: { width: 200, height: 50 },
          },
        },
      },
    ]);

    let hookResult!: UsePdfAnnotationsResult;

    function TestComponent() {
      hookResult = usePdfAnnotations({
        documentId: "doc-1",
        projectId: "proj-1",
        currentPage: 1,
      });
      return null;
    }

    act(() => {
      root.render(<TestComponent />);
    });

    const objects = hookResult.getObjectsForPage(0);
    expect(objects.length).toBe(1);
    expect(objects[0].id).toBe("freetext-anno-1");
    expect(objects[0].type).toBe("text");
    expect(objects[0].contents).toBe("Exam Questions");
    expect(objects[0].text).toBe("Exam Questions");
    expect(objects[0].fontSize).toBe(20);
    expect(objects[0].x).toBe(72);
    expect(objects[0].y).toBe(144);
    expect(objects[0].width).toBe(200);
    expect(objects[0].height).toBe(50);
  });
});
