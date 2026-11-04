// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PdfCustomInkLayer } from "./pdf-custom-ink-layer";
import { usePdfAnnotations, type UsePdfAnnotationsResult } from "./use-pdf-annotations";

// @ts-expect-error React testing flag
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

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
        setActiveTool: vi.fn(),
        selectAnnotation: vi.fn(),
        deselectAnnotation: vi.fn(),
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

describe("Sticky Note UI & Editing (Sub-Agent 1)", () => {
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

  const sampleStickyObject = {
    id: "sticky-1",
    type: "sticky" as const,
    pageIndex: 0,
    x: 50,
    y: 80,
    width: 200,
    height: 180,
    text: "Initial sticky note text",
    color: "#FEF08A",
  };

  it("renders the sticky note card with react-stickies style header bar, 'Note' title, and close 'X' button", () => {
    const onDeleteSticky = vi.fn();
    const onUpdateStickyText = vi.fn();

    act(() => {
      root.render(
        <PdfCustomInkLayer
          pageIndex={0}
          pageWidth={800}
          pageHeight={1000}
          isActive={false}
          isSelectMode={true}
          strokes={[]}
          objects={[sampleStickyObject]}
          onAddStroke={vi.fn()}
          onDeleteSticky={onDeleteSticky}
          onUpdateStickyText={onUpdateStickyText}
        />
      );
    });

    const card = container.querySelector('[data-testid="pdf-sticky-card-sticky-1"]') as HTMLElement;
    expect(card).toBeTruthy();
    expect(card.style.backgroundColor.toLowerCase()).toMatch(/#fef08a|rgb\(254,\s*240,\s*138\)/);
    expect(card.style.borderRadius).toContain("var(--radius-md, 8px)");
    expect(card.style.boxShadow).toContain("var(--shadow-2");
    expect(card.style.transform).toMatch(/rotate\(-?\d+(\.\d+)?deg\)/);

    // Header bar checks
    const header = card.children[0] as HTMLElement;
    expect(header).toBeTruthy();
    expect(header.style.borderTopLeftRadius).toContain("var(--radius-md, 8px)");
    expect(header.style.borderTopRightRadius).toContain("var(--radius-md, 8px)");
    const noteTitle = card.querySelector("span");
    expect(noteTitle).toBeTruthy();
    expect(noteTitle?.textContent).toBe("Note");

    // Textarea checks (auto-direction and bottom rounded corners)
    const textarea = container.querySelector('[data-testid="pdf-sticky-textarea-sticky-1"]') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    expect(textarea.getAttribute("dir")).toBe("auto");
    expect(textarea.style.unicodeBidi).toBe("plaintext");
    expect(textarea.style.borderBottomLeftRadius).toContain("var(--radius-md, 8px)");
    expect(textarea.style.borderBottomRightRadius).toContain("var(--radius-md, 8px)");

    // Close button
    const deleteBtn = container.querySelector('[data-testid="pdf-sticky-delete-btn"]') as HTMLButtonElement;
    expect(deleteBtn).toBeTruthy();
  });

  it("starts in non-editing mode with textarea pointer-events: none", () => {
    act(() => {
      root.render(
        <PdfCustomInkLayer
          pageIndex={0}
          pageWidth={800}
          pageHeight={1000}
          isActive={false}
          isSelectMode={true}
          strokes={[]}
          objects={[sampleStickyObject]}
          onAddStroke={vi.fn()}
        />
      );
    });

    const textarea = container.querySelector('[data-testid="pdf-sticky-textarea-sticky-1"]') as HTMLTextAreaElement;
    expect(textarea).toBeTruthy();
    expect(textarea.value).toBe("Initial sticky note text");
    expect(textarea.style.pointerEvents).toBe("none");
  });

  it("activates editing mode and focuses textarea on double-click", () => {
    act(() => {
      root.render(
        <PdfCustomInkLayer
          pageIndex={0}
          pageWidth={800}
          pageHeight={1000}
          isActive={false}
          isSelectMode={true}
          strokes={[]}
          objects={[sampleStickyObject]}
          onAddStroke={vi.fn()}
        />
      );
    });

    const card = container.querySelector('[data-testid="pdf-sticky-card-sticky-1"]') as HTMLElement;
    const textarea = container.querySelector('[data-testid="pdf-sticky-textarea-sticky-1"]') as HTMLTextAreaElement;
    expect(textarea.style.pointerEvents).toBe("none");

    act(() => {
      card.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    });

    // After double click, textarea should have pointer-events: auto
    expect(textarea.style.pointerEvents).toBe("auto");
    expect(document.activeElement).toBe(textarea);
  });

  it("calls onDeleteSticky when the close 'X' button is clicked", () => {
    const onDeleteSticky = vi.fn();

    act(() => {
      root.render(
        <PdfCustomInkLayer
          pageIndex={0}
          pageWidth={800}
          pageHeight={1000}
          isActive={false}
          isSelectMode={true}
          strokes={[]}
          objects={[sampleStickyObject]}
          onAddStroke={vi.fn()}
          onDeleteSticky={onDeleteSticky}
        />
      );
    });

    const deleteBtn = container.querySelector('[data-testid="pdf-sticky-delete-btn"]') as HTMLButtonElement;
    expect(deleteBtn).toBeTruthy();

    act(() => {
      deleteBtn.click();
    });

    expect(onDeleteSticky).toHaveBeenCalledTimes(1);
    expect(onDeleteSticky).toHaveBeenCalledWith(0, "sticky-1");
  });

  it("calls onUpdateStickyText when typing in the textarea", () => {
    const onUpdateStickyText = vi.fn();

    act(() => {
      root.render(
        <PdfCustomInkLayer
          pageIndex={0}
          pageWidth={800}
          pageHeight={1000}
          isActive={false}
          isSelectMode={true}
          strokes={[]}
          objects={[sampleStickyObject]}
          onAddStroke={vi.fn()}
          onUpdateStickyText={onUpdateStickyText}
        />
      );
    });

    const card = container.querySelector('[data-testid="pdf-sticky-card-sticky-1"]') as HTMLElement;
    act(() => {
      card.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    });

    const textarea = container.querySelector('[data-testid="pdf-sticky-textarea-sticky-1"]') as HTMLTextAreaElement;
    act(() => {
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype,
        "value"
      )?.set;
      nativeSetter?.call(textarea, "Updated text");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
      textarea.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(onUpdateStickyText).toHaveBeenCalledWith(0, "sticky-1", "Updated text");
  });

  it("exits editing mode when pressing Escape in textarea", () => {
    act(() => {
      root.render(
        <PdfCustomInkLayer
          pageIndex={0}
          pageWidth={800}
          pageHeight={1000}
          isActive={false}
          isSelectMode={true}
          strokes={[]}
          objects={[sampleStickyObject]}
          onAddStroke={vi.fn()}
        />
      );
    });

    const card = container.querySelector('[data-testid="pdf-sticky-card-sticky-1"]') as HTMLElement;
    act(() => {
      card.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
    });

    const textarea = container.querySelector('[data-testid="pdf-sticky-textarea-sticky-1"]') as HTMLTextAreaElement;
    expect(textarea.style.pointerEvents).toBe("auto");

    act(() => {
      textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });

    expect(textarea.style.pointerEvents).toBe("none");
  });

  it("applies direction: ltr and text-align: left for English sticky note, and direction: rtl and text-align: right for Arabic sticky note", () => {
    const englishSticky = {
      id: "sticky-en",
      type: "sticky" as const,
      pageIndex: 0,
      x: 50,
      y: 80,
      width: 200,
      height: 180,
      text: "Hello World from English note",
      color: "#FEF08A",
    };

    const arabicSticky = {
      id: "sticky-ar",
      type: "sticky" as const,
      pageIndex: 0,
      x: 300,
      y: 80,
      width: 200,
      height: 180,
      text: "مرحبا بالعالم ملاحظة عربية",
      color: "#FEF08A",
    };

    act(() => {
      root.render(
        <PdfCustomInkLayer
          pageIndex={0}
          pageWidth={800}
          pageHeight={1000}
          isActive={false}
          isSelectMode={true}
          strokes={[]}
          objects={[englishSticky, arabicSticky]}
          onAddStroke={vi.fn()}
        />
      );
    });

    const enTextarea = container.querySelector('[data-testid="pdf-sticky-textarea-sticky-en"]') as HTMLTextAreaElement;
    expect(enTextarea).toBeTruthy();
    expect(enTextarea.style.direction).toBe("ltr");
    expect(enTextarea.style.textAlign).toBe("left");

    const arTextarea = container.querySelector('[data-testid="pdf-sticky-textarea-sticky-ar"]') as HTMLTextAreaElement;
    expect(arTextarea).toBeTruthy();
    expect(arTextarea.style.direction).toBe("rtl");
    expect(arTextarea.style.textAlign).toBe("right");
  });
});

describe("usePdfAnnotations Sticky Note Management (Sub-Agent 1)", () => {
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

  it("handles adding and deleting sticky notes, and exposes handleDeleteSticky on window", () => {
    let hookResult!: UsePdfAnnotationsResult;

    function TestComponent() {
      hookResult = usePdfAnnotations({
        documentId: "doc-test-1",
        currentPage: 1,
      });
      return null;
    }

    act(() => {
      root.render(<TestComponent />);
    });

    expect(typeof hookResult.handleAddSticky).toBe("function");
    expect(typeof hookResult.handleDeleteSticky).toBe("function");

    // Add sticky note
    act(() => {
      hookResult.handleAddSticky(0, {
        x: 100,
        y: 150,
        text: "New note",
      });
    });

    const page0Notes = hookResult.customStickyNotes[0];
    expect(page0Notes).toBeDefined();
    expect(page0Notes.length).toBe(1);
    expect(page0Notes[0].text).toBe("New note");
    expect(hookResult.selectedStrokeIds).toContain(page0Notes[0].id);

    // Verify window exposure
    const winAnno = (window as unknown as { __aboard_pdfAnnotations?: Record<string, unknown> })
      .__aboard_pdfAnnotations;
    expect(winAnno).toBeDefined();
    expect(typeof winAnno?.handleDeleteSticky).toBe("function");
    expect(typeof winAnno?.deleteSticky).toBe("function");

    // Delete sticky note via handleDeleteSticky
    const stickyId = page0Notes[0].id;
    act(() => {
      hookResult.handleDeleteSticky(0, stickyId);
    });

    expect(hookResult.customStickyNotes[0].length).toBe(0);
    expect(hookResult.selectedStrokeIds).not.toContain(stickyId);
  });

  it("allows moving and resizing sticky notes outside page boundaries (negative coordinates)", () => {
    let hookResult!: UsePdfAnnotationsResult;

    function TestComponent() {
      hookResult = usePdfAnnotations({
        documentId: "doc-test-overflow",
        currentPage: 1,
      });
      return null;
    }

    act(() => {
      root.render(<TestComponent />);
    });

    // Add sticky note at normal position
    act(() => {
      hookResult.handleAddSticky(0, {
        x: 100,
        y: 100,
        text: "Overflow note",
      });
    });

    const noteId = hookResult.customStickyNotes[0][0].id;

    // Move sticky note outside the page (negative coordinates)
    act(() => {
      hookResult.handleMoveObject(0, noteId, { x: -65.5, y: -42.25 }, "sticky");
    });

    expect(hookResult.customStickyNotes[0][0].x).toBe(-65.5);
    expect(hookResult.customStickyNotes[0][0].y).toBe(-42.25);

    // Resize sticky note with negative origin
    act(() => {
      hookResult.handleResizeObject(
        0,
        noteId,
        {
          origin: { x: -120.75, y: -80.5 },
          size: { width: 150, height: 120 },
        },
        "sticky"
      );
    });

    expect(hookResult.customStickyNotes[0][0].x).toBe(-120.75);
    expect(hookResult.customStickyNotes[0][0].y).toBe(-80.5);
    expect(hookResult.customStickyNotes[0][0].width).toBe(150);
    expect(hookResult.customStickyNotes[0][0].height).toBe(120);
  });

  it("verifies usePdfAnnotations initializes, updates, and propagates direction for sticky notes", () => {
    let hookResult!: UsePdfAnnotationsResult;

    function TestComponent() {
      hookResult = usePdfAnnotations({
        documentId: "doc-test-direction",
        currentPage: 1,
      });
      return null;
    }

    act(() => {
      root.render(<TestComponent />);
    });

    // 1. Initial creation with English text -> direction 'ltr'
    act(() => {
      hookResult.handleAddSticky(0, {
        x: 50,
        y: 50,
        text: "English sticky note",
      });
    });

    const enStickyId = hookResult.customStickyNotes[0][0].id;
    expect(hookResult.customStickyNotes[0][0].direction).toBe("ltr");
    expect(hookResult.getObjectsForPage(0).find((o) => o.id === enStickyId)?.direction).toBe("ltr");

    // 2. Initial creation with Arabic text -> direction 'rtl'
    act(() => {
      hookResult.handleAddSticky(0, {
        x: 100,
        y: 100,
        text: "ملاحظة عربية",
      });
    });

    const arStickyId = hookResult.customStickyNotes[0][1].id;
    expect(hookResult.customStickyNotes[0][1].direction).toBe("rtl");
    expect(hookResult.getObjectsForPage(0).find((o) => o.id === arStickyId)?.direction).toBe("rtl");

    // 3. Updating English sticky note with Arabic text updates direction to 'rtl'
    act(() => {
      hookResult.handleUpdateStickyText(0, enStickyId, "تحديث الملاحظة بالعربي");
    });

    expect(hookResult.customStickyNotes[0].find((s) => s.id === enStickyId)?.direction).toBe("rtl");
    expect(hookResult.getObjectsForPage(0).find((o) => o.id === enStickyId)?.direction).toBe("rtl");

    // 4. Updating Arabic sticky note with English text updates direction to 'ltr'
    act(() => {
      hookResult.handleUpdateStickyText(0, arStickyId, "Now updated to English text");
    });

    expect(hookResult.customStickyNotes[0].find((s) => s.id === arStickyId)?.direction).toBe("ltr");
    expect(hookResult.getObjectsForPage(0).find((o) => o.id === arStickyId)?.direction).toBe("ltr");
  });
});
