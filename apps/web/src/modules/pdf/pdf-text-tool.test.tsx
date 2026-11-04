// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PdfCustomInkLayer, getMaxTextWidth, detectTextDirection } from "./pdf-custom-ink-layer";
import { usePdfAnnotations, type UsePdfAnnotationsResult } from "./use-pdf-annotations";
import { PdfFloatingToolbar } from "./pdf-floating-toolbar";
import { wrapLineForPdf } from "./page-operations";

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
      onUpdateTextBoxSize={h.handleUpdateTextBoxSize}
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

  function dispatchPaste(
    textarea: HTMLTextAreaElement,
    plainText: string,
    htmlText?: string
  ): Event {
    let pasteEv: Event;
    act(() => {
      pasteEv = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(pasteEv, "clipboardData", {
        value: {
          getData: (type: string) => {
            if (type === "text/plain") return plainText;
            if (type === "text/html") return htmlText ?? "";
            return "";
          },
        },
      });
      textarea.dispatchEvent(pasteEv);
    });
    return pasteEv!;
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
    expect(box?.getAttribute("dir")).toBe("ltr");
    expect(box?.style.unicodeBidi).toBe("plaintext");
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

  it("allows Enter and Shift+Enter to insert new lines without exiting edit mode, and exits edit mode on Ctrl+Enter / Meta+Enter", () => {
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

    // Shift+Enter should NOT blur and should NOT preventDefault
    let shiftEnterPrevented = false;
    act(() => {
      const shiftEnterEv = new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true, cancelable: true });
      textarea.dispatchEvent(shiftEnterEv);
      shiftEnterPrevented = shiftEnterEv.defaultPrevented;
    });

    expect(shiftEnterPrevented).toBe(false);
    expect(container.querySelector("textarea")).not.toBeNull();
    expect(document.activeElement).toBe(textarea);

    // Typing multiline content
    typeInto(textarea, "Line 1\nLine 2\nLine 3");
    expect(Number(textarea.rows)).toBe(3);
    expect(textarea.style.whiteSpace).toBe("pre-wrap");

    // Ctrl+Enter should blur and commit
    act(() => {
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", ctrlKey: true, bubbles: true, cancelable: true })
      );
    });

    expect(container.querySelector("textarea")).toBeNull();
    const box = container.querySelector('[data-testid^="pdf-text-box-"]') as HTMLElement | null;
    expect(box).not.toBeNull();
    expect(box?.textContent).toBe("Line 1\nLine 2\nLine 3");
    expect(box?.style.whiteSpace).toBe("pre-wrap");
  });

  it("exits edit mode on Meta+Enter", () => {
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
    typeInto(textarea, "Cmd+Enter commit");

    // Meta+Enter should blur and commit
    act(() => {
      textarea.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", metaKey: true, bubbles: true, cancelable: true })
      );
    });

    expect(container.querySelector("textarea")).toBeNull();
    const box = container.querySelector('[data-testid^="pdf-text-box-"]') as HTMLElement | null;
    expect(box).not.toBeNull();
    expect(box?.textContent).toBe("Cmd+Enter commit");
  });

  it("maintains fixed container dimensions (250x100) and zero crawling for multiline content", () => {
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

    // Check rendered objects from hook: fixed to 250x100
    const objects = hookRef.getObjectsForPage(0);
    expect(objects.length).toBe(1);
    expect(objects[0].width).toBe(250);
    expect(objects[0].height).toBe(100);

    // Verify rendered div has pre-wrap and displays all lines properly inside fixed container
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
    expect(textarea.getAttribute("dir")).toBe("auto");
    expect(textarea.style.unicodeBidi).toBe("plaintext");
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

  it("selection bounding box hugs all lines of multiline text", () => {
    const multilineObject = {
      id: "text-multi",
      type: "text" as const,
      pageIndex: 0,
      x: 50,
      y: 50,
      width: 100,
      height: 16 * 1.4 * 3, // 3 lines
      contents: "Line 1\nLine 2\nLine 3",
      text: "Line 1\nLine 2\nLine 3",
      fontSize: 16,
      color: "#E44234",
    };

    act(() => {
      root.render(
        <PdfCustomInkLayer
          pageIndex={0}
          pageWidth={612}
          pageHeight={792}
          isActive={false}
          isSelectMode={true}
          selectedStrokeIds={["text-multi"]}
          strokes={[]}
          onAddStroke={vi.fn()}
          objects={[multilineObject]}
        />
      );
    });

    const bboxGroup = container.querySelector('[data-testid="pdf-text-bbox"]');
    expect(bboxGroup).not.toBeNull();
    const bboxRect = bboxGroup?.querySelector("rect");
    expect(bboxRect).not.toBeNull();
    const heightAttr = parseFloat(bboxRect?.getAttribute("height") || "0");
    // Should hug 3 lines: 16 * 1.4 * 3 = 67.2
    expect(heightAttr).toBeCloseTo(67.2, 1);
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
    expect(objects[0].width).toBe(250);
    expect(objects[0].height).toBe(100);
    mockGetAnnotations.mockReturnValue([]);
  });

  it("anchors English text to top-left (curX, curY) with direction ltr and text-align left, preventing crawling across keystrokes", () => {
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
        new PointerEvent("pointerdown", { clientX: 712, clientY: 942, button: 0, bubbles: true })
      );
    });

    const initialX = hookRef.customTextBoxes[0][0].x;
    const initialY = hookRef.customTextBoxes[0][0].y;
    expect(initialX).toBeCloseTo(100, 0);
    expect(initialY).toBeCloseTo(150, 0);

    const fo = container.querySelector("foreignObject") as SVGForeignObjectElement;
    expect(fo).not.toBeNull();
    expect(parseFloat(fo.getAttribute("x") || "0")).toBeCloseTo(initialX, 0);
    expect(parseFloat(fo.getAttribute("y") || "0")).toBeCloseTo(initialY, 0);
    expect(fo.style.direction).toBe("ltr");
    expect(fo.style.textAlign).toBe("left");

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();
    expect(textarea.style.direction).toBe("ltr");
    expect(textarea.style.textAlign).toBe("left");

    // Type 20 characters in succession ("TTTTTTTTTTTTTTTTTTTT")
    let typed = "";
    for (let i = 0; i < 20; i++) {
      typed += "T";
      typeInto(textarea, typed);

      const currentFo = container.querySelector("foreignObject") as SVGForeignObjectElement;
      const currentTa = container.querySelector("textarea") as HTMLTextAreaElement;
      const currentGroup = container.querySelector('[data-testid="pdf-text-object"]') as SVGGElement;

      // Crucially: foreignObject x and y must NOT change dynamically based on text width
      expect(parseFloat(currentFo.getAttribute("x") || "0")).toBeCloseTo(initialX, 0);
      expect(parseFloat(currentFo.getAttribute("y") || "0")).toBeCloseTo(initialY, 0);
      // Group transform must not contain dynamic text-width offsets
      expect(currentGroup.getAttribute("transform")).toBeNull();
      // Direction and text-align remain strictly LTR left
      expect(currentTa.style.direction).toBe("ltr");
      expect(currentTa.style.textAlign).toBe("left");
    }

    expect(hookRef.customTextBoxes[0][0].x).toBeCloseTo(initialX, 0);
    expect(hookRef.customTextBoxes[0][0].y).toBeCloseTo(initialY, 0);
    expect(hookRef.customTextBoxes[0][0].text).toBe("TTTTTTTTTTTTTTTTTTTT");
  });

  it("detects Arabic text and applies direction rtl and text-align right", () => {
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
        new PointerEvent("pointerdown", { clientX: 712, clientY: 942, button: 0, bubbles: true })
      );
    });

    const textarea = container.querySelector("textarea") as HTMLTextAreaElement;
    // Type Arabic text
    typeInto(textarea, "مرحبا بالعالم");

    const fo = container.querySelector("foreignObject") as SVGForeignObjectElement;
    expect(fo.style.direction).toBe("rtl");
    expect(fo.style.textAlign).toBe("right");
    expect(fo.getAttribute("dir")).toBe("rtl");
    expect(fo.style.unicodeBidi).toBe("plaintext");
    expect(textarea.style.direction).toBe("rtl");
    expect(textarea.style.textAlign).toBe("right");
    expect(textarea.getAttribute("dir")).toBe("auto");
    expect(textarea.style.unicodeBidi).toBe("plaintext");

    // Exit edit mode to test display div
    act(() => {
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });

    const div = container.querySelector('[data-testid^="pdf-text-box-"]') as HTMLDivElement;
    expect(div).not.toBeNull();
    expect(div.style.direction).toBe("rtl");
    expect(div.style.textAlign).toBe("right");
    expect(div.getAttribute("dir")).toBe("rtl");
    expect(div.style.unicodeBidi).toBe("plaintext");
  });

  it("pasting plain text with CRLF (\\r\\n) normalizes to \\n and preserves all newlines", () => {
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
    act(() => {
      box.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    });
    const textarea = container.querySelector('[data-testid="pdf-text-input-text-1"]') as HTMLTextAreaElement;
    expect(textarea).not.toBeNull();

    // Select all existing text to replace with paste
    textarea.selectionStart = 0;
    textarea.selectionEnd = textarea.value.length;

    const crlfText = "First line\r\nSecond line\r\nThird line";
    const pasteEv = dispatchPaste(textarea, crlfText);

    expect(pasteEv.defaultPrevented).toBe(true);
    expect(handleUpdateText).toHaveBeenCalledWith(0, "text-1", "First line\nSecond line\nThird line");
    expect(textarea.value).toBe("First line\nSecond line\nThird line");
    expect(textarea.selectionStart).toBe("First line\nSecond line\nThird line".length);
    expect(textarea.selectionEnd).toBe("First line\nSecond line\nThird line".length);
    const expectedMinHeight = 16 * 1.4 * 3 + 18;
    expect(parseFloat(textarea.style.height)).toBeGreaterThanOrEqual(expectedMinHeight);
  });

  it("pasting plain text with \\n splices at cursor position and calls onUpdateText with newlines intact", () => {
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
    typeInto(textarea, "Prefix: ");

    // Position cursor at end of "Prefix: " (length 8)
    textarea.selectionStart = 8;
    textarea.selectionEnd = 8;

    const multilineText = "Item 1\nItem 2\nItem 3";
    const pasteEv = dispatchPaste(textarea, multilineText, "<b>Item 1</b><br>Item 2<br>Item 3");

    expect(pasteEv.defaultPrevented).toBe(true);
    const expectedResult = "Prefix: Item 1\nItem 2\nItem 3";
    expect(hookRef.customTextBoxes[0][0].text).toBe(expectedResult);
    expect(textarea.value).toBe(expectedResult);
    expect(textarea.selectionStart).toBe(8 + multilineText.length);
    expect(textarea.selectionEnd).toBe(8 + multilineText.length);
    const expectedMinHeight = 16 * 1.4 * 3 + 18;
    expect(parseFloat(textarea.style.height)).toBeGreaterThanOrEqual(expectedMinHeight);
  });

  describe("Auto-wrapping & max-width constraints", () => {
    it("getMaxTextWidth computes sensible constraints based on page width and X offset", () => {
      // Available width is 612 - 60 - 24 = 528 -> clamped to 500 max
      expect(getMaxTextWidth(612, 60)).toBe(500);
      // Available width is 612 - 350 - 24 = 238 -> between 200 and 500
      expect(getMaxTextWidth(612, 350)).toBe(238);
      // Available width is 612 - 550 - 24 = 38 -> clamped to 200 min
      expect(getMaxTextWidth(612, 550)).toBe(200);
      // On wide page, still capped at 500
      expect(getMaxTextWidth(1200, 100)).toBe(500);
    });

    it("maintains fixed 250x100 textarea with word-break and zero crawling when long unbroken text is typed", () => {
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
      expect(textarea).not.toBeNull();
      const fo = textarea.closest("foreignObject");
      expect(fo).not.toBeNull();
      const initialOriginX = parseFloat(fo?.getAttribute("x") || "0");
      const initialOriginY = parseFloat(fo?.getAttribute("y") || "0");

      // 300 character string without newlines
      const longText = "A".repeat(300);
      typeInto(textarea, longText);

      // Verify styling properties for wrapping and fixed size (no crawl)
      expect(textarea.style.width).toBe("100%");
      expect(textarea.style.height).toBe("100%");
      expect(textarea.style.resize).toBe("none");
      expect(textarea.style.overflow).toBe("hidden");
      expect(textarea.style.whiteSpace).toBe("pre-wrap");
      expect(textarea.style.wordBreak).toBe("break-word");
      expect(textarea.style.overflowWrap).toBe("break-word");

      // Verify foreignObject dimensions are fixed 250x100
      expect(parseFloat(fo?.getAttribute("width") || "0")).toBe(250);
      expect(parseFloat(fo?.getAttribute("height") || "0")).toBe(100);

      // Verify the foreignObject origin remains strictly fixed in place
      const finalOriginX = parseFloat(fo?.getAttribute("x") || "0");
      const finalOriginY = parseFloat(fo?.getAttribute("y") || "0");
      expect(finalOriginX).toBe(initialOriginX);
      expect(finalOriginY).toBe(initialOriginY);
    });

    it("display div applies word-break, pre-wrap, overflow hidden and selection bbox matches fixed dimensions", () => {
      const longText = "B".repeat(300);
      const longTextObject = {
        id: "text-long-1",
        type: "text" as const,
        pageIndex: 0,
        x: 72,
        y: 120,
        width: 250,
        height: 100,
        contents: longText,
        text: longText,
        fontSize: 16,
        color: "#E44234",
      };

      act(() => {
        root.render(
          <PdfCustomInkLayer
            pageIndex={0}
            pageWidth={612}
            pageHeight={792}
            isActive={false}
            isSelectMode={true}
            selectedStrokeIds={["text-long-1"]}
            strokes={[]}
            onAddStroke={vi.fn()}
            objects={[longTextObject]}
          />
        );
      });

      const displayDiv = container.querySelector('[data-testid="pdf-text-box-text-long-1"]') as HTMLElement | null;
      expect(displayDiv).not.toBeNull();
      expect(displayDiv?.style.width).toBe("100%");
      expect(displayDiv?.style.height).toBe("100%");
      expect(displayDiv?.style.overflow).toBe("hidden");
      expect(displayDiv?.style.whiteSpace).toBe("pre-wrap");
      expect(displayDiv?.style.wordBreak).toBe("break-word");
      expect(displayDiv?.style.overflowWrap).toBe("break-word");

      // Check selection bbox
      const bboxGroup = container.querySelector('[data-testid="pdf-text-bbox"]');
      expect(bboxGroup).not.toBeNull();
      const bboxRect = bboxGroup?.querySelector("rect");
      expect(bboxRect).not.toBeNull();

      // Bounding box matches fixed dimensions (250x100)
      const bboxWidth = parseFloat(bboxRect?.getAttribute("width") || "0");
      expect(bboxWidth).toBe(250);

      const bboxHeight = parseFloat(bboxRect?.getAttribute("height") || "0");
      expect(bboxHeight).toBe(100);

      // Bounding box origin (x, y) must strictly match the object's origin
      const bboxX = parseFloat(bboxRect?.getAttribute("x") || "0");
      const bboxY = parseFloat(bboxRect?.getAttribute("y") || "0");
      expect(bboxX).toBe(72);
      expect(bboxY).toBe(120);
    });

    it("wrapLineForPdf wraps long unbroken strings into chunks fitting maxTextWidth", () => {
      const mockFont = {
        widthOfTextAtSize: (text: string, size: number) => text.length * size * 0.6,
      } as any;

      const longUnbroken = "C".repeat(300);
      const wrapped = wrapLineForPdf(longUnbroken, mockFont, 16, 500);

      // 500 / (16 * 0.6) = 52 characters per line, so 300 chars should wrap into ~6 lines
      expect(wrapped.length).toBeGreaterThan(1);
      for (const line of wrapped) {
        expect(mockFont.widthOfTextAtSize(line, 16)).toBeLessThanOrEqual(500);
      }
      expect(wrapped.join("")).toBe(longUnbroken);
    });

    it("wrapLineForPdf wraps multiline sentences at word boundaries when possible", () => {
      const mockFont = {
        widthOfTextAtSize: (text: string, size: number) => text.length * size * 0.6,
      } as any;

      const sentence = "The quick brown fox jumps over the lazy dog and runs across the entire field without stopping";
      const wrapped = wrapLineForPdf(sentence, mockFont, 16, 250);

      expect(wrapped.length).toBeGreaterThan(1);
      for (const line of wrapped) {
        expect(mockFont.widthOfTextAtSize(line, 16)).toBeLessThanOrEqual(250);
      }
      expect(wrapped.join(" ")).toBe(sentence);
    });
  });

  describe("Text Direction - RTL/LTR & Bidi handling", () => {
    it("detectTextDirection correctly classifies pure English, pure Arabic, and mixed text based on first strong directional character", () => {
      // Pure English
      expect(detectTextDirection("Hello World")).toBe("ltr");
      expect(detectTextDirection("Nusuq platform")).toBe("ltr");
      // Pure Arabic
      expect(detectTextDirection("مرحبا بالعالم")).toBe("rtl");
      expect(detectTextDirection("منصة نسق")).toBe("rtl");
      // Mixed text starting with English
      expect(detectTextDirection("Aboard أداة")).toBe("ltr");
      expect(detectTextDirection("Alpha Board منصة العمل")).toBe("ltr");
      // Mixed text starting with Arabic
      expect(detectTextDirection("أداة Aboard")).toBe("rtl");
      expect(detectTextDirection("منصة Alpha Board")).toBe("rtl");
      // Leading numbers, symbols, spaces followed by directional characters
      expect(detectTextDirection("  123. Hello")).toBe("ltr");
      expect(detectTextDirection("  123. مرحباً")).toBe("rtl");
      // Fallback for empty or non-directional text
      expect(detectTextDirection("")).toBe("ltr");
      expect(detectTextDirection("123 456 !!!")).toBe("ltr");
    });

    it("verifies pure English text resolves to direction: ltr and textAlign: left in both textarea and display div", () => {
      const englishTextObject = {
        id: "text-en",
        type: "text" as const,
        pageIndex: 0,
        x: 50,
        y: 80,
        width: 120,
        height: 30,
        contents: "English text content",
        text: "English text content",
        fontSize: 16,
        color: "#1A63A0",
      };

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
            objects={[englishTextObject]}
          />
        );
      });

      const displayDiv = container.querySelector('[data-testid="pdf-text-box-text-en"]') as HTMLDivElement;
      expect(displayDiv).not.toBeNull();
      expect(displayDiv.style.direction).toBe("ltr");
      expect(displayDiv.style.textAlign).toBe("left");
      expect(displayDiv.getAttribute("dir")).toBe("ltr");
      expect(displayDiv.style.unicodeBidi).toBe("plaintext");

      const fo = displayDiv.closest("foreignObject");
      expect(fo?.style.direction).toBe("ltr");
      expect(fo?.style.textAlign).toBe("left");
      expect(fo?.getAttribute("dir")).toBe("ltr");
      expect(fo?.style.unicodeBidi).toBe("plaintext");

      act(() => {
        displayDiv.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
      });

      const textarea = container.querySelector('[data-testid="pdf-text-input-text-en"]') as HTMLTextAreaElement;
      expect(textarea).not.toBeNull();
      expect(textarea.style.direction).toBe("ltr");
      expect(textarea.style.textAlign).toBe("left");
      expect(textarea.getAttribute("dir")).toBe("auto");
      expect(textarea.style.unicodeBidi).toBe("plaintext");
    });

    it("verifies pure Arabic text resolves to direction: rtl and textAlign: right in both textarea and display div", () => {
      const arabicTextObject = {
        id: "text-ar",
        type: "text" as const,
        pageIndex: 0,
        x: 50,
        y: 80,
        width: 120,
        height: 30,
        contents: "نص عربي خالص",
        text: "نص عربي خالص",
        fontSize: 16,
        color: "#E44234",
      };

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
            objects={[arabicTextObject]}
          />
        );
      });

      const displayDiv = container.querySelector('[data-testid="pdf-text-box-text-ar"]') as HTMLDivElement;
      expect(displayDiv).not.toBeNull();
      expect(displayDiv.style.direction).toBe("rtl");
      expect(displayDiv.style.textAlign).toBe("right");
      expect(displayDiv.getAttribute("dir")).toBe("rtl");
      expect(displayDiv.style.unicodeBidi).toBe("plaintext");

      const fo = displayDiv.closest("foreignObject");
      expect(fo?.style.direction).toBe("rtl");
      expect(fo?.style.textAlign).toBe("right");
      expect(fo?.getAttribute("dir")).toBe("rtl");
      expect(fo?.style.unicodeBidi).toBe("plaintext");

      act(() => {
        displayDiv.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
      });

      const textarea = container.querySelector('[data-testid="pdf-text-input-text-ar"]') as HTMLTextAreaElement;
      expect(textarea).not.toBeNull();
      expect(textarea.style.direction).toBe("rtl");
      expect(textarea.style.textAlign).toBe("right");
      expect(textarea.getAttribute("dir")).toBe("auto");
      expect(textarea.style.unicodeBidi).toBe("plaintext");
    });

    it("verifies mixed text starting with English (Aboard أداة) resolves to direction: ltr, textAlign: left, with dir=ltr on display div and foreignObject", () => {
      const mixedEnObject = {
        id: "text-mixed-en",
        type: "text" as const,
        pageIndex: 0,
        x: 60,
        y: 100,
        width: 150,
        height: 32,
        contents: "Aboard أداة",
        text: "Aboard أداة",
        fontSize: 16,
        color: "#1A63A0",
      };

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
            objects={[mixedEnObject]}
          />
        );
      });

      const displayDiv = container.querySelector('[data-testid="pdf-text-box-text-mixed-en"]') as HTMLDivElement;
      expect(displayDiv).not.toBeNull();
      expect(displayDiv.style.direction).toBe("ltr");
      expect(displayDiv.style.textAlign).toBe("left");
      expect(displayDiv.getAttribute("dir")).toBe("ltr");
      expect(displayDiv.style.unicodeBidi).toBe("plaintext");

      const fo = displayDiv.closest("foreignObject");
      expect(fo?.style.direction).toBe("ltr");
      expect(fo?.style.textAlign).toBe("left");
      expect(fo?.getAttribute("dir")).toBe("ltr");
      expect(fo?.style.unicodeBidi).toBe("plaintext");

      act(() => {
        displayDiv.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
      });

      const textarea = container.querySelector('[data-testid="pdf-text-input-text-mixed-en"]') as HTMLTextAreaElement;
      expect(textarea).not.toBeNull();
      expect(textarea.style.direction).toBe("ltr");
      expect(textarea.style.textAlign).toBe("left");
      expect(textarea.getAttribute("dir")).toBe("auto");
      expect(textarea.style.unicodeBidi).toBe("plaintext");
    });

    it("verifies mixed text starting with Arabic (أداة Aboard) resolves to direction: rtl, textAlign: right, with dir=rtl on display div and foreignObject", () => {
      const mixedArObject = {
        id: "text-mixed-ar",
        type: "text" as const,
        pageIndex: 0,
        x: 60,
        y: 100,
        width: 150,
        height: 32,
        contents: "أداة Aboard",
        text: "أداة Aboard",
        fontSize: 16,
        color: "#E44234",
      };

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
            objects={[mixedArObject]}
          />
        );
      });

      const displayDiv = container.querySelector('[data-testid="pdf-text-box-text-mixed-ar"]') as HTMLDivElement;
      expect(displayDiv).not.toBeNull();
      expect(displayDiv.style.direction).toBe("rtl");
      expect(displayDiv.style.textAlign).toBe("right");
      expect(displayDiv.getAttribute("dir")).toBe("rtl");
      expect(displayDiv.style.unicodeBidi).toBe("plaintext");

      const fo = displayDiv.closest("foreignObject");
      expect(fo?.style.direction).toBe("rtl");
      expect(fo?.style.textAlign).toBe("right");
      expect(fo?.getAttribute("dir")).toBe("rtl");
      expect(fo?.style.unicodeBidi).toBe("plaintext");

      act(() => {
        displayDiv.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
      });

      const textarea = container.querySelector('[data-testid="pdf-text-input-text-mixed-ar"]') as HTMLTextAreaElement;
      expect(textarea).not.toBeNull();
      expect(textarea.style.direction).toBe("rtl");
      expect(textarea.style.textAlign).toBe("right");
      expect(textarea.getAttribute("dir")).toBe("auto");
      expect(textarea.style.unicodeBidi).toBe("plaintext");
    });

    it("preserves explicit direction property when rendering text boxes", () => {
      const explicitRtlObject = {
        id: "text-explicit-rtl",
        type: "text" as const,
        pageIndex: 0,
        x: 60,
        y: 100,
        width: 150,
        height: 32,
        contents: "123 Neutral text",
        text: "123 Neutral text",
        fontSize: 16,
        color: "#E44234",
        direction: "rtl" as const,
      };

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
            objects={[explicitRtlObject]}
          />
        );
      });

      const displayDiv = container.querySelector('[data-testid="pdf-text-box-text-explicit-rtl"]') as HTMLDivElement;
      expect(displayDiv).not.toBeNull();
      expect(displayDiv.style.direction).toBe("rtl");
      expect(displayDiv.style.textAlign).toBe("right");
      expect(displayDiv.getAttribute("dir")).toBe("rtl");

      const fo = displayDiv.closest("foreignObject");
      expect(fo?.style.direction).toBe("rtl");
      expect(fo?.style.textAlign).toBe("right");
      expect(fo?.getAttribute("dir")).toBe("rtl");
    });

    it("verifies usePdfAnnotations initializes, updates, and propagates direction", () => {
      act(() => {
        root.render(<Harness />);
      });

      // 1. Initial creation with English text detects 'ltr'
      let id1 = "";
      act(() => {
        id1 = hookRef.handleAddText(0, { x: 50, y: 50, text: "Hello World" });
      });
      expect(hookRef.customTextBoxes[0].find((b) => b.id === id1)?.direction).toBe("ltr");
      expect(hookRef.getObjectsForPage(0).find((o) => o.id === id1)?.direction).toBe("ltr");

      // 2. Initial creation with Arabic text detects 'rtl'
      let id2 = "";
      act(() => {
        id2 = hookRef.handleAddText(0, { x: 50, y: 100, text: "مرحبا" });
      });
      expect(hookRef.customTextBoxes[0].find((b) => b.id === id2)?.direction).toBe("rtl");
      expect(hookRef.getObjectsForPage(0).find((o) => o.id === id2)?.direction).toBe("rtl");

      // 3. Updating text from English to Arabic updates direction to 'rtl'
      act(() => {
        hookRef.handleUpdateText(0, id1, "مرحبا بالجميع");
      });
      expect(hookRef.customTextBoxes[0].find((b) => b.id === id1)?.direction).toBe("rtl");
      expect(hookRef.getObjectsForPage(0).find((o) => o.id === id1)?.direction).toBe("rtl");

      // 4. Creation with empty text defaults to 'ltr'
      let id3 = "";
      act(() => {
        id3 = hookRef.handleAddText(0, { x: 50, y: 150 });
      });
      expect(hookRef.customTextBoxes[0].find((b) => b.id === id3)?.direction).toBe("ltr");
    });
  });

  describe("Fix Resizing on Drag for PDF Text Box", () => {
    it("handleUpdateTextBoxSize updates width and height on custom text box, and getObjectsForPage preserves them", () => {
      act(() => {
        root.render(<Harness />);
      });
      let textId = "";
      act(() => {
        textId = hookRef.handleAddText(0, { x: 50, y: 50, text: "Line 1\nLine 2\nLine 3" });
      });
      act(() => {
        hookRef.handleUpdateTextBoxSize(0, textId, { width: 220, height: 68 });
      });
      expect(hookRef.customTextBoxes[0].find((b) => b.id === textId)?.width).toBe(220);
      expect(hookRef.customTextBoxes[0].find((b) => b.id === textId)?.height).toBe(68);

      const pageObjs = hookRef.getObjectsForPage(0);
      const textObj = pageObjs.find((o) => o.id === textId);
      expect(textObj?.width).toBe(220);
      expect(textObj?.height).toBe(68);

      // Moving the object strictly updates x and y and preserves locked width and height
      act(() => {
        hookRef.handleMoveObject(0, textId, { x: 300, y: 150 }, "text");
      });
      const movedBox = hookRef.customTextBoxes[0].find((b) => b.id === textId);
      expect(movedBox?.x).toBe(300);
      expect(movedBox?.y).toBe(150);
      expect(movedBox?.width).toBe(220);
      expect(movedBox?.height).toBe(68);

      const movedObj = hookRef.getObjectsForPage(0).find((o) => o.id === textId);
      expect(movedObj?.x).toBe(300);
      expect(movedObj?.y).toBe(150);
      expect(movedObj?.width).toBe(220);
      expect(movedObj?.height).toBe(68);
    });

    it("text box maintains exact width and height before, during, and after drag", () => {
      const onMoveObject = vi.fn();
      const textObject = {
        id: "text-drag-test",
        type: "text" as const,
        pageIndex: 0,
        x: 60,
        y: 80,
        width: 250,
        height: 68,
        contents: "Line 1\nLine 2\nLine 3",
        text: "Line 1\nLine 2\nLine 3",
        fontSize: 16,
        color: "#E44234",
      };

      act(() => {
        root.render(
          <PdfCustomInkLayer
            pageIndex={0}
            pageWidth={612}
            pageHeight={792}
            isActive={false}
            isSelectMode={true}
            selectedStrokeIds={["text-drag-test"]}
            strokes={[]}
            onAddStroke={vi.fn()}
            onMoveObject={onMoveObject}
            objects={[textObject]}
          />
        );
      });

      const svg = container.querySelector("svg")!;
      mockSvgRect(svg);
      const displayDiv = container.querySelector('[data-testid="pdf-text-box-text-drag-test"]') as HTMLDivElement;
      const bboxRect = container.querySelector('[data-testid="pdf-text-bbox"] rect') as SVGRectElement;

      // 1. Before drag: display div is 100% and foreignObject / bbox have identical width and height
      const fo = displayDiv.closest("foreignObject");
      expect(fo).not.toBeNull();
      expect(parseFloat(fo?.getAttribute("width") || "0")).toBe(250);
      expect(parseFloat(fo?.getAttribute("height") || "0")).toBe(68);
      expect(displayDiv.style.width).toBe("100%");
      expect(displayDiv.style.height).toBe("100%");
      expect(parseFloat(bboxRect.getAttribute("width") || "0")).toBe(250);
      expect(parseFloat(bboxRect.getAttribute("height") || "0")).toBe(68);

      // 2. Start drag: pointerdown
      act(() => {
        displayDiv.dispatchEvent(
          new PointerEvent("pointerdown", { clientX: 700, clientY: 900, button: 0, bubbles: true })
        );
      });

      // 3. During drag: pointermove across page (e.g. moved horizontally by 200px)
      act(() => {
        svg.dispatchEvent(new PointerEvent("pointermove", { clientX: 900, clientY: 950, bubbles: true }));
      });

      // Bounding box and foreignObject width & height MUST remain strictly 250 and 68
      const displayDuring = container.querySelector('[data-testid="pdf-text-box-text-drag-test"]') as HTMLDivElement;
      const foDuring = displayDuring.closest("foreignObject");
      const bboxDuring = container.querySelector('[data-testid="pdf-text-bbox"] rect') as SVGRectElement;
      expect(parseFloat(foDuring?.getAttribute("width") || "0")).toBe(250);
      expect(parseFloat(foDuring?.getAttribute("height") || "0")).toBe(68);
      expect(displayDuring.style.width).toBe("100%");
      expect(displayDuring.style.height).toBe("100%");
      expect(parseFloat(bboxDuring.getAttribute("width") || "0")).toBe(250);
      expect(parseFloat(bboxDuring.getAttribute("height") || "0")).toBe(68);

      // 4. End drag: pointerup commits movement
      act(() => {
        svg.dispatchEvent(new PointerEvent("pointerup", { clientX: 900, clientY: 950, bubbles: true }));
      });
      expect(onMoveObject).toHaveBeenCalledTimes(1);
    });

    it("locks computed width and height via onUpdateTextBoxSize on blur", () => {
      const onUpdateTextBoxSize = vi.fn();
      const textObject = {
        id: "text-blur-test",
        type: "text" as const,
        pageIndex: 0,
        x: 60,
        y: 80,
        width: 0,
        height: 0,
        contents: "Some text",
        text: "Some text",
        fontSize: 16,
        color: "#E44234",
      };

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
            onUpdateTextBoxSize={onUpdateTextBoxSize}
            objects={[textObject]}
          />
        );
      });

      const displayDiv = container.querySelector('[data-testid="pdf-text-box-text-blur-test"]')!;
      act(() => {
        displayDiv.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
      });

      const textarea = container.querySelector('[data-testid="pdf-text-input-text-blur-test"]') as HTMLTextAreaElement;
      expect(textarea).not.toBeNull();

      act(() => {
        textarea.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
      });

      expect(onUpdateTextBoxSize).toHaveBeenCalledWith(
        0,
        "text-blur-test",
        expect.objectContaining({
          width: expect.any(Number),
          height: expect.any(Number),
        })
      );
      const call = onUpdateTextBoxSize.mock.calls[0];
      expect(call[2].width).toBeGreaterThanOrEqual(64);
      expect(call[2].height).toBeGreaterThan(0);
    });
  });
});