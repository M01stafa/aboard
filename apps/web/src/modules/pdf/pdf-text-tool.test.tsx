// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PdfCustomInkLayer } from "./pdf-custom-ink-layer";
import { usePdfAnnotations, type UsePdfAnnotationsResult } from "./use-pdf-annotations";
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

function Harness() {
  const h = usePdfAnnotations({ documentId: "doc-1", projectId: "proj-1", currentPage: 1 });
  useEffect(() => {
    hookRef = h;
  });
  return (
    <PdfCustomInkLayer
      pageIndex={0}
      pageWidth={612}
      pageHeight={792}
      isActive={false}
      isSelectMode={h.activeTool === "select"}
      isTextMode={h.activeTool === "text" || h.activeTool === "freeText"}
      strokes={[]}
      onAddStroke={vi.fn()}
      selectedStrokeIds={h.selectedStrokeIds}
      onSelectStrokes={h.setSelectedStrokeIds}
      onAddText={h.handleAddText}
      onUpdateText={h.handleUpdateText}
      onDeleteText={h.handleDeleteText}
      onMoveObject={h.handleMoveObject}
      objects={h.getObjectsForPage(0)}
    />
  );
}

let hookRef!: UsePdfAnnotationsResult;

describe("PDF Text Tool (custom text boxes)", () => {
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

  function mockSvgRect(svg: Element) {
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({
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
  }

  function typeInto(textarea: HTMLTextAreaElement, value: string) {
    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      )?.set;
      nativeSetter?.call(textarea, value);
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  it("renders a non-editing text box as a single div with the text and no textarea", () => {
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

    const box = container.querySelector('[data-testid="pdf-text-box-text-1"]') as HTMLElement | null;
    expect(box).not.toBeNull();
    expect(box?.tagName).toBe("DIV");
    expect(box?.textContent).toBe("Hello World");
    // Ensure dir="auto" is avoided to prevent Chromium foreignObject rendering blocks
    expect(box?.getAttribute("dir")).not.toBe("auto");
    expect(box?.style.whiteSpace).toBe("pre-wrap");
    expect(container.querySelector("textarea")).toBeNull();
    const withText = Array.from(container.querySelectorAll("*")).filter(
      (el) => el.children.length === 0 && el.textContent === "Hello World"
    );
    expect(withText.length).toBe(1);
  });

  it("clicking the canvas in text mode creates exactly one empty box, enters edit mode and focuses it", () => {
    act(() => {
      root.render(<Harness />);
    });
    act(() => {
      hookRef.handleSelectTool("text");
    });

    const svg = container.querySelector("svg")!;
    mockSvgRect(svg);
    act(() => {
      svg.dispatchEvent(
        new PointerEvent("pointerdown", { clientX: 612, clientY: 792, button: 0, bubbles: true })
      );
    });

    const boxes = hookRef.customTextBoxes[0];
    expect(boxes.length).toBe(1);
    expect(boxes[0].text).toBe("");
    expect(boxes[0].fontSize).toBe(16);
    expect(boxes[0].x).toBeCloseTo(0, 0);
    expect(hookRef.activeTool).toBe("select");
    expect(mockCreateAnnotation).not.toHaveBeenCalled();
    expect(mockSetActiveTool).toHaveBeenLastCalledWith(null);

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
    expect(document.activeElement).toBe(textarea);
    // Selection bbox exists but is hidden while editing
    expect(container.querySelectorAll("textarea").length).toBe(1);
  });

  it("typing 5 characters in a row keeps the same textarea and yields the exact string", () => {
    act(() => {
      root.render(<Harness />);
    });
    act(() => {
      hookRef.handleSelectTool("text");
    });
    const svg = container.querySelector("svg")!;
    mockSvgRect(svg);
    act(() => {
      svg.dispatchEvent(
        new PointerEvent("pointerdown", { clientX: 700, clientY: 900, button: 0, bubbles: true })
      );
    });

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    let typed = "";
    for (const ch of "Hello") {
      typed += ch;
      typeInto(textarea, typed);
      const current = container.querySelector("textarea");
      expect(current).toBe(textarea);
      expect(current?.value).toBe(typed);
    }
    expect(hookRef.customTextBoxes[0][0].text).toBe("Hello");
    expect(document.activeElement).toBe(textarea);
  });

  it("renders the text exactly once after leaving edit mode with Escape", () => {
    act(() => {
      root.render(<Harness />);
    });
    act(() => {
      hookRef.handleSelectTool("text");
    });
    const svg = container.querySelector("svg")!;
    mockSvgRect(svg);
    act(() => {
      svg.dispatchEvent(
        new PointerEvent("pointerdown", { clientX: 700, clientY: 900, button: 0, bubbles: true })
      );
    });
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    typeInto(textarea, "Hello");

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });

    expect(container.querySelector("textarea")).toBeNull();
    const matches = Array.from(container.querySelectorAll("*")).filter(
      (el) => el.children.length === 0 && el.textContent === "Hello"
    );
    expect(matches.length).toBe(1);
    expect(hookRef.customTextBoxes[0].length).toBe(1);
  });

  it("removes the text box when edit mode ends with empty text", () => {
    act(() => {
      root.render(<Harness />);
    });
    act(() => {
      hookRef.handleSelectTool("text");
    });
    const svg = container.querySelector("svg")!;
    mockSvgRect(svg);
    act(() => {
      svg.dispatchEvent(
        new PointerEvent("pointerdown", { clientX: 700, clientY: 900, button: 0, bubbles: true })
      );
    });
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    act(() => {
      textarea.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(container.querySelector("textarea")).toBeNull();
    expect(hookRef.customTextBoxes[0].length).toBe(0);
  });

  it("accepts newlines on Enter without modifiers and stays in edit mode", () => {
    act(() => {
      root.render(<Harness />);
    });
    act(() => {
      hookRef.handleSelectTool("text");
    });
    const svg = container.querySelector("svg")!;
    mockSvgRect(svg);
    act(() => {
      svg.dispatchEvent(
        new PointerEvent("pointerdown", { clientX: 700, clientY: 900, button: 0, bubbles: true })
      );
    });
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    typeInto(textarea, "Line 1");

    // Enter alone without modifiers should NOT blur or exit edit mode
    let defaultPrevented = false;
    act(() => {
      const enterEv = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
      textarea.dispatchEvent(enterEv);
      defaultPrevented = enterEv.defaultPrevented;
    });

    expect(defaultPrevented).toBe(false);
    expect(container.querySelector("textarea")).not.toBeNull();
    expect(document.activeElement).toBe(textarea);

    // Typing newline continues multiline input
    typeInto(textarea, "Line 1\nLine 2");
    expect(hookRef.customTextBoxes[0][0].text).toBe("Line 1\nLine 2");
    expect(textarea.value).toBe("Line 1\nLine 2");
  });

  it("exits edit mode on Enter with modifiers (Shift+Enter, Ctrl+Enter, Meta+Enter)", () => {
    act(() => {
      root.render(<Harness />);
    });
    act(() => {
      hookRef.handleSelectTool("text");
    });
    const svg = container.querySelector("svg")!;
    mockSvgRect(svg);
    act(() => {
      svg.dispatchEvent(
        new PointerEvent("pointerdown", { clientX: 700, clientY: 900, button: 0, bubbles: true })
      );
    });
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    typeInto(textarea, "Line 1\nLine 2");

    // Shift+Enter should blur and commit
    act(() => {
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true, cancelable: true })
      );
    });

    expect(container.querySelector("textarea")).toBeNull();
    const box = container.querySelector('[data-testid^="pdf-text-box-"]') as HTMLElement | null;
    expect(box).not.toBeNull();
    expect(box?.textContent).toBe("Line 1\nLine 2");
    expect(box?.style.whiteSpace).toBe("pre-wrap");
  });

  it("adjusts container height and width dynamically based on multiline content", () => {
    act(() => {
      root.render(<Harness />);
    });
    act(() => {
      hookRef.handleSelectTool("text");
    });
    const svg = container.querySelector("svg")!;
    mockSvgRect(svg);
    act(() => {
      svg.dispatchEvent(
        new PointerEvent("pointerdown", { clientX: 700, clientY: 900, button: 0, bubbles: true })
      );
    });
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;

    // Multiline English text
    typeInto(textarea, "First line\nSecond longer line\nThird");
    expect(hookRef.customTextBoxes[0][0].text).toBe("First line\nSecond longer line\nThird");

    // Exit edit mode with Escape
    act(() => {
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });

    // Check rendered objects from hook
    const objects = hookRef.getObjectsForPage(0);
    expect(objects.length).toBe(1);
    // 3 lines height: 16 * 1.4 * 3 = 67.2
    expect(objects[0].height).toBeCloseTo(67.2, 1);
    // Longest line is "Second longer line" (18 chars)
    expect(objects[0].width).toBeGreaterThanOrEqual(18 * 16 * 0.6);

    // Verify rendered div has pre-wrap and displays all lines properly
    const div = container.querySelector('[data-testid^="pdf-text-box-"]') as HTMLElement | null;
    expect(div).not.toBeNull();
    expect(div?.style.whiteSpace).toBe("pre-wrap");
    expect(div?.textContent).toBe("First line\nSecond longer line\nThird");
  });

  it("updates state on every keystroke for English text without delay", () => {
    act(() => {
      root.render(<Harness />);
    });
    act(() => {
      hookRef.handleSelectTool("text");
    });
    const svg = container.querySelector("svg")!;
    mockSvgRect(svg);
    act(() => {
      svg.dispatchEvent(
        new PointerEvent("pointerdown", { clientX: 700, clientY: 900, button: 0, bubbles: true })
      );
    });
    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;

    // English keystrokes: each letter updates state immediately
    const words = ["A", "Al", "Alpha", "Alpha Board"];
    for (const w of words) {
      typeInto(textarea, w);
      expect(hookRef.customTextBoxes[0][0].text).toBe(w);
      expect(textarea.value).toBe(w);
    }
  });

  it("enters edit mode only through the native dblclick event", () => {
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

    const box = container.querySelector('[data-testid="pdf-text-box-text-1"]')!;
    expect(container.querySelector("textarea")).toBeNull();
    act(() => {
      box.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    });
    const textarea = container.querySelector('[data-testid="pdf-text-input-text-1"]') as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
    expect(textarea.value).toBe("Hello World");
    expect(textarea.getAttribute("dir")).not.toBe("auto");
    expect(textarea.style.whiteSpace).toBe("pre-wrap");
    typeInto(textarea, "Updated Text");
    expect(handleUpdateText).toHaveBeenCalledWith(0, "text-1", "Updated Text");
  });

  it("selected text shows only the dashed bbox: no resize handles and no rotate icon", () => {
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

    expect(container.querySelector('[data-testid="pdf-text-bbox"]')).not.toBeNull();
    expect(container.querySelectorAll("[data-resize-handle]").length).toBe(0);
    expect(container.querySelectorAll('[data-testid^="pdf-text-resize-handle-"]').length).toBe(0);
  });

  it("a single pointerdown on a text box starts a drag and commits onMoveObject on pointerup", () => {
    const onMoveObject = vi.fn();
    const onSelectStrokes = vi.fn();
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
          onSelectStrokes={onSelectStrokes}
          onMoveObject={onMoveObject}
          objects={[sampleTextObject]}
        />
      );
    });
    const svg = container.querySelector("svg")!;
    mockSvgRect(svg);
    const box = container.querySelector('[data-testid="pdf-text-box-text-1"]')!;

    act(() => {
      box.dispatchEvent(
        new PointerEvent("pointerdown", { clientX: 700, clientY: 900, button: 0, bubbles: true })
      );
    });
    expect(onSelectStrokes).toHaveBeenCalledWith(["text-1"]);
    act(() => {
      svg.dispatchEvent(new PointerEvent("pointermove", { clientX: 760, clientY: 960, bubbles: true }));
      svg.dispatchEvent(new PointerEvent("pointerup", { clientX: 760, clientY: 960, bubbles: true }));
    });
    expect(onMoveObject).toHaveBeenCalledWith(0, "text-1", { x: 120, y: 150 }, "text");
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
    expect(container.querySelector('[data-testid="pdf-tool-text"]')?.getAttribute("aria-pressed")).toBe("true");

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
    expect(container.querySelector('[data-testid="pdf-tool-text"]')?.getAttribute("aria-pressed")).toBe("true");
  });

  it("usePdfAnnotations never activates the native FreeText tool for text tools", () => {
    act(() => {
      root.render(<Harness />);
    });
    act(() => {
      hookRef.handleSelectTool("freeText");
    });
    expect(mockSetActiveTool).toHaveBeenLastCalledWith(null);
    expect(mockSetActiveTool).not.toHaveBeenCalledWith("freeText");
  });

  it("handleUpdateText / handleMoveObject / handleResizeObject only touch custom state", () => {
    act(() => {
      root.render(<Harness />);
    });
    let id = "";
    act(() => {
      id = hookRef.handleAddText(0, { x: 10, y: 20, text: "abc" });
    });
    act(() => {
      hookRef.handleUpdateText(0, id, "abcdef");
    });
    expect(hookRef.customTextBoxes[0][0].text).toBe("abcdef");

    act(() => {
      hookRef.handleMoveObject(0, id, { x: 55.555, y: 66 }, "text");
    });
    expect(hookRef.customTextBoxes[0][0].x).toBeCloseTo(55.56, 2);
    expect(hookRef.customTextBoxes[0][0].y).toBe(66);

    act(() => {
      hookRef.handleResizeObject(0, id, { origin: { x: 0, y: 0 }, size: { width: 500, height: 500 } }, "text");
    });
    expect(hookRef.customTextBoxes[0][0].x).toBeCloseTo(55.56, 2);
    expect(hookRef.customTextBoxes[0][0].fontSize).toBe(16);

    expect(mockCreateAnnotation).not.toHaveBeenCalled();
    expect(mockUpdateAnnotation).not.toHaveBeenCalled();
  });

  it("getObjectsForPage returns custom text boxes as text objects and ignores native FreeText", () => {
    mockGetAnnotations.mockReturnValue([
      {
        object: {
          id: "legacy-freetext",
          pageIndex: 0,
          type: 3,
          contents: "Legacy",
          rect: { origin: { x: 1, y: 1 }, size: { width: 10, height: 10 } },
        },
      },
    ]);
    act(() => {
      root.render(<Harness />);
    });
    act(() => {
      hookRef.handleAddText(0, { x: 72, y: 144, text: "Exam", fontSize: 20, color: "#1A63A0" });
    });
    const objects = hookRef.getObjectsForPage(0);
    expect(objects.length).toBe(1);
    expect(objects[0].type).toBe("text");
    expect(objects[0].text).toBe("Exam");
    expect(objects[0].fontSize).toBe(20);
    expect(objects[0].color).toBe("#1A63A0");
    expect(objects[0].x).toBe(72);
    expect(objects[0].y).toBe(144);
    expect(objects[0].width).toBeGreaterThanOrEqual(24);
    expect(objects[0].height).toBeCloseTo(28, 5);
    mockGetAnnotations.mockReturnValue([]);
  });
});