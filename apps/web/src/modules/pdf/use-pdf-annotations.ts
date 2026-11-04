import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { bus } from "@/core/bus";
import { projectService as defaultProjectService, type ProjectService } from "@/core/storage";
import {
  useAnnotation,
  type AnnotationTransferItem,
} from "@embedpdf/plugin-annotation/react";
import { useHistoryCapability } from "@embedpdf/plugin-history/react";
import {
  PdfAnnotationSubtype,
  type PdfStampAnnoObject,
} from "@embedpdf/models";
import {
  serializeAnnotations,
  deserializeAnnotations,
  extractCustomInkStrokes,
  extractCustomStickyNotes,
  extractCustomTextBoxes,
  type CustomStickyNote,
  type CustomTextBox,
} from "./annotation-storage";
import { processStampImage } from "./image-stamp-utils";
import { stampBlobUrlCache } from "./custom-stamp-renderer";
import type { AnnotationToolType } from "./pdf-toolbar";
import {
  type CustomInkStroke,
  type CustomInkTransform,
  type CustomAnnotationObject,
  type CustomObjectType,
  getAbsoluteStrokeBounds,
  scaleStrokePoints,
  detectTextDirection,
} from "./pdf-custom-ink-layer";

/** Default text box styling (matches the design-system danger accent used for annotations). */
export const DEFAULT_TEXT_COLOR = "#E44234";
export const DEFAULT_TEXT_FONT_SIZE = 16;
export const DEFAULT_TEXT_BOX_WIDTH = 250;
export const DEFAULT_TEXT_BOX_HEIGHT = 100;

export interface UsePdfAnnotationsOptions {
  documentId: string;
  projectId?: string;
  itemId?: string;
  pdfHash?: string;
  currentPage: number;
  projectServiceOverride?: ProjectService;
}

export interface UsePdfAnnotationsResult {
  activeTool: AnnotationToolType;
  canUndo: boolean;
  canRedo: boolean;
  handleSelectTool: (tool: AnnotationToolType) => void;
  handleUndo: () => void;
  handleRedo: () => void;
  handleAddStamp: (
    file: File,
    options?: { pageIndex?: number; x?: number; y?: number }
  ) => Promise<void>;
  customStickyNotes: Record<number, CustomStickyNote[]>;
  handleAddSticky: (
    pageIndex: number,
    coords: { x: number; y: number; width?: number; height?: number; text?: string; color?: string }
  ) => void;
  handleUpdateStickyText: (pageIndex: number, id: string, text: string) => void;
  handleDeleteSticky: (pageIndex: number, id: string) => void;
  customTextBoxes: Record<number, CustomTextBox[]>;
  handleAddText: (
    pageIndex: number,
    coords: {
      x: number;
      y: number;
      width?: number;
      height?: number;
      text?: string;
      fontSize?: number;
      color?: string;
      id?: string;
      direction?: "ltr" | "rtl";
    }
  ) => string;
  handleUpdateText: (pageIndex: number, id: string, newText: string) => void;
  handleUpdateTextBoxSize: (
    pageIndex: number,
    id: string,
    size: { width: number; height: number }
  ) => void;
  handleDeleteText: (pageIndex: number, id: string) => void;
  customStrokes: Record<number, CustomInkStroke[]>;
  selectedStrokeIds: string[];
  setSelectedStrokeIds: (ids: string[]) => void;
  handleDeleteSelected: () => boolean;
  handleAddCustomStroke: (pageIndex: number, stroke: CustomInkStroke) => void;
  handleMoveCustomStroke: (
    pageIndex: number,
    strokeId: string,
    transform: CustomInkTransform
  ) => void;
  handleMoveCustomStrokes: (
    pageIndex: number,
    moves: Array<{ strokeId: string; transform: CustomInkTransform }>
  ) => void;
  getObjectsForPage: (pageIndex: number) => CustomAnnotationObject[];
  handleMoveObject: (
    pageIndex: number,
    id: string,
    newOrigin: { x: number; y: number },
    type: CustomObjectType
  ) => void;
  handleResizeObject: (
    pageIndex: number,
    id: string,
    newRect: { origin: { x: number; y: number }; size: { width: number; height: number } },
    type: CustomObjectType
  ) => void;
  annotationScope: ReturnType<typeof useAnnotation>["provides"];
}

export function usePdfAnnotations({
  documentId,
  projectId = "default",
  itemId,
  pdfHash,
  currentPage,
  projectServiceOverride,
}: UsePdfAnnotationsOptions): UsePdfAnnotationsResult {
  const ps = projectServiceOverride ?? defaultProjectService;
  const hashKey = pdfHash || documentId;

  const { provides: annotationScope } = useAnnotation(documentId);
  const { provides: historyCapability } = useHistoryCapability();

  const historyScope = useMemo(() => {
    return historyCapability ? historyCapability.forDocument(documentId) : null;
  }, [historyCapability, documentId]);

  const [activeTool, setActiveToolState] = useState<AnnotationToolType>("select");
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [annotationsVersion, setAnnotationsVersion] = useState(0);

  // Custom ink state (isolated completely from EmbedPDF to guarantee 1:1 mouse alignment)
  const [customStrokes, setCustomStrokes] = useState<Record<number, CustomInkStroke[]>>({});
  const customStrokesRef = useRef<Record<number, CustomInkStroke[]>>({});
  useEffect(() => {
    customStrokesRef.current = customStrokes;
  }, [customStrokes]);

  // Custom sticky notes state (native React + SVG foreignObject with JSON persistence)
  const [customStickyNotes, setCustomStickyNotes] = useState<Record<number, CustomStickyNote[]>>({});
  const customStickyNotesRef = useRef<Record<number, CustomStickyNote[]>>({});
  useEffect(() => {
    customStickyNotesRef.current = customStickyNotes;
  }, [customStickyNotes]);
  // Custom text boxes (purely custom object type; native FreeText is never used for new text)
  const [customTextBoxes, setCustomTextBoxes] = useState<Record<number, CustomTextBox[]>>({});
  const customTextBoxesRef = useRef<Record<number, CustomTextBox[]>>({});
  useEffect(() => {
    customTextBoxesRef.current = customTextBoxes;
  }, [customTextBoxes]);
  const [selectedStrokeIds, setSelectedStrokeIds] = useState<string[]>([]);
  const selectedStrokeIdsRef = useRef<string[]>([]);
  useEffect(() => {
    selectedStrokeIdsRef.current = selectedStrokeIds;
  }, [selectedStrokeIds]);
  const customUndoStackRef = useRef<Array<Record<number, CustomInkStroke[]>>>([]);
  const customRedoStackRef = useRef<Array<Record<number, CustomInkStroke[]>>>([]);

  const isRestoringRef = useRef(false);
  const hasRestoredRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Immediate flush function to guarantee annotations are saved without waiting for debounce
  const flushAnnotations = useCallback(async () => {
    if (isRestoringRef.current || !annotationScope) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }

    try {
      const items = await new Promise<AnnotationTransferItem[]>((resolve, reject) => {
        const task = annotationScope.exportAnnotations();
        task.wait(resolve, (err: unknown) => {
          const reasonObj =
            err && typeof err === "object" && "reason" in err
              ? (err as { reason: unknown }).reason
              : err;
          const msg =
            reasonObj && typeof reasonObj === "object" && "message" in reasonObj
              ? String((reasonObj as { message: unknown }).message)
              : typeof err === "object" && err !== null && "message" in err
              ? String((err as { message: unknown }).message)
              : String(err);
          reject(new Error(msg));
        });
      });

      const serialized = await serializeAnnotations(
        projectId,
        hashKey,
        items,
        ps,
        customStrokesRef.current,
        customStickyNotesRef.current,
        customTextBoxesRef.current
      );
      await ps.saveAnnotations(projectId, hashKey, serialized);
      if (itemId) {
        await ps.saveAnnotations(projectId, `anno-${itemId}`, serialized);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (
        msg.includes("Document not found") ||
        msg.includes("NotFound") ||
        msg.includes("not found") ||
        msg.includes("document not found") ||
        msg === "[object Object]"
      ) {
        // Document was closed or unmounted before flush completed; safely ignore
        return;
      }
      console.warn("[usePdfAnnotations] Flush annotations warning:", msg);
    }
  }, [annotationScope, projectId, hashKey, itemId, ps]);

  // Debounced save through ProjectService & SaveQueue (coalesces rapid drawing strokes)
  const triggerDebouncedSave = useCallback(() => {
    if (isRestoringRef.current || !annotationScope) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      void flushAnnotations();
    }, 400);
  }, [annotationScope, flushAnnotations]);

  // Initial restoration on document load: loads clean JSON and restores stamps via getFile
  useEffect(() => {
    if (!annotationScope || hasRestoredRef.current) return;
    hasRestoredRef.current = true;
    const scope = annotationScope;

    async function restore() {
      try {
        let savedJson = await ps.readAnnotations(projectId, hashKey);
        if (!savedJson && itemId) {
          savedJson = await ps.readAnnotations(projectId, `anno-${itemId}`);
        }
        if (!savedJson && pdfHash && pdfHash !== hashKey) {
          savedJson = await ps.readAnnotations(projectId, pdfHash);
        }
        if (!savedJson || savedJson.trim() === "" || savedJson === "[]") {
          return;
        }

        const restoredStrokes = extractCustomInkStrokes(savedJson);
        setCustomStrokes(restoredStrokes);
        customStrokesRef.current = restoredStrokes;

        const restoredStickies = extractCustomStickyNotes(savedJson);
        setCustomStickyNotes(restoredStickies);
        customStickyNotesRef.current = restoredStickies;

        const restoredTexts = extractCustomTextBoxes(savedJson);
        setCustomTextBoxes(restoredTexts);
        customTextBoxesRef.current = restoredTexts;

        isRestoringRef.current = true;
        const transferItems = await deserializeAnnotations(projectId, savedJson, ps);
        if (transferItems.length > 0) {
          scope.importAnnotations(transferItems);
          setAnnotationsVersion((v) => v + 1);
        }
      } catch (err) {
        console.error("[usePdfAnnotations] Restore annotations failed:", err);
      } finally {
        setTimeout(() => {
          isRestoringRef.current = false;
        }, 300);
      }
    }

    restore();
  }, [annotationScope, projectId, hashKey, itemId, pdfHash, ps]);

  // Listen to annotation change events (create, update, delete)
  useEffect(() => {
    if (!annotationScope) return;

    const unsub = annotationScope.onAnnotationEvent((event) => {
      if (isRestoringRef.current) return;
      if (event.type === "create" || event.type === "update" || event.type === "delete") {
        setAnnotationsVersion((v) => v + 1);
        triggerDebouncedSave();
      }
    });

    return () => {
      if (typeof unsub === "function") {
        unsub();
      }
    };
  }, [annotationScope, triggerDebouncedSave]);

  // Keep toolbar activeTool state synced with EmbedPDF's active tool (e.g. when freeText auto-resets to select)
  useEffect(() => {
    if (!annotationScope || typeof annotationScope.onActiveToolChange !== "function") return;

    const unsub = annotationScope.onActiveToolChange((tool) => {
      if (!tool) {
        // If we are currently in custom ink draw mode, stamp mode, sticky mode, or text mode, do NOT let EmbedPDF reset us to select
        setActiveToolState((prev) => (prev === "ink" || prev === "stamp" || prev === "sticky" || prev === "text" || prev === "freeText" ? prev : "select"));
      } else if (
        tool.id === "highlight" ||
        tool.id === "freeText" ||
        tool.id === "stamp"
      ) {
        setActiveToolState(tool.id);
      }
    });

    return () => {
      if (typeof unsub === "function") {
        unsub();
      }
    };
  }, [annotationScope]);

  // Track undo / redo capabilities and trigger save on undo/redo actions
  useEffect(() => {
    const updateHistory = () => {
      const hasCustomUndo = customUndoStackRef.current.length > 0;
      const hasCustomRedo = customRedoStackRef.current.length > 0;
      setCanUndo(hasCustomUndo || (historyScope ? historyScope.canUndo() : false));
      setCanRedo(hasCustomRedo || (historyScope ? historyScope.canRedo() : false));
    };

    updateHistory();

    if (!historyScope) return;

    const unsub = historyScope.onHistoryChange(() => {
      updateHistory();
      if (!isRestoringRef.current) {
        triggerDebouncedSave();
      }
    });

    return () => {
      if (typeof unsub === "function") {
        unsub();
      }
    };
  }, [historyScope, customStrokes, triggerDebouncedSave]);

  // Flush pending annotations on workspace:flush event (e.g. user navigating back to launcher)
  useEffect(() => {
    const handleWorkspaceFlush = () => {
      void flushAnnotations();
    };
    bus.on("workspace:flush", handleWorkspaceFlush);
    return () => {
      bus.off("workspace:flush", handleWorkspaceFlush);
    };
  }, [flushAnnotations]);

  // Cleanup or flush pending timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
        void flushAnnotations();
      }
    };
  }, [flushAnnotations]);

  const handleSelectTool = useCallback(
    (tool: AnnotationToolType) => {
      setActiveToolState(tool);
      if (typeof window !== "undefined") {
        window.getSelection()?.removeAllRanges();
      }
      if (!annotationScope) return;

      if (typeof annotationScope.deselectAnnotation === "function") {
        annotationScope.deselectAnnotation();
      }

      if (tool === "select" || tool === "ink" || tool === "stamp" || tool === "sticky" || tool === "text" || tool === "freeText") {
        // Native EmbedPDF ink, stamp, sticky note, and text are handled via custom layers; keep native tool inactive
        annotationScope.setActiveTool(null);
      } else if (tool === "highlight") {
        annotationScope.setActiveTool("highlight");
      }
    },
    [annotationScope]
  );

  const handleAddCustomStroke = useCallback(
    (pageIndex: number, stroke: CustomInkStroke) => {
      setCustomStrokes((prev) => {
        customUndoStackRef.current.push(prev);
        customRedoStackRef.current = [];
        const pageStrokes = prev[pageIndex] || [];
        const next = {
          ...prev,
          [pageIndex]: [...pageStrokes, stroke],
        };
        customStrokesRef.current = next;
        return next;
      });
      setCanUndo(true);
      setCanRedo(false);
      triggerDebouncedSave();
    },
    [triggerDebouncedSave]
  );

  const handleMoveCustomStrokes = useCallback(
    (pageIndex: number, moves: Array<{ strokeId: string; transform: CustomInkTransform }>) => {
      const prev = customStrokesRef.current;
      const pageStrokes = prev[pageIndex];
      if (!pageStrokes || moves.length === 0) return;
      const moveMap = new Map(moves.map((m) => [m.strokeId, m.transform]));
      const next = {
        ...prev,
        [pageIndex]: pageStrokes.map((s) => {
          const t = moveMap.get(s.id);
          return t ? { ...s, transform: t } : s;
        }),
      };
      customUndoStackRef.current.push(prev);
      customRedoStackRef.current = [];
      customStrokesRef.current = next;
      setCustomStrokes(next);
      setCanUndo(true);
      setCanRedo(false);
      triggerDebouncedSave();
    },
    [triggerDebouncedSave]
  );

  const handleMoveCustomStroke = useCallback(
    (pageIndex: number, strokeId: string, transform: CustomInkTransform) => {
      handleMoveCustomStrokes(pageIndex, [{ strokeId, transform }]);
    },
    [handleMoveCustomStrokes]
  );

  const handleDeleteSelected = useCallback((): boolean => {
    let changed = false;
    const prevStrokes = customStrokesRef.current;
    const selStrokes = new Set(selectedStrokeIdsRef.current);

    // 1. Delete selected custom ink strokes
    if (selStrokes.size > 0) {
      const nextStrokes: Record<number, CustomInkStroke[]> = {};
      let strokesRemoved = false;
      for (const [pStr, list] of Object.entries(prevStrokes)) {
        const pIdx = parseInt(pStr, 10);
        const filtered = list.filter((s) => !selStrokes.has(s.id));
        if (filtered.length !== list.length) {
          strokesRemoved = true;
          changed = true;
        }
        nextStrokes[pIdx] = filtered;
      }

      if (strokesRemoved) {
        customUndoStackRef.current.push(prevStrokes);
        customRedoStackRef.current = [];
        customStrokesRef.current = nextStrokes;
        setCustomStrokes(nextStrokes);
        selectedStrokeIdsRef.current = [];
        setSelectedStrokeIds([]);
        setCanUndo(true);
        setCanRedo(false);
        triggerDebouncedSave();
      }
    }

    // 2. Delete selected custom sticky notes
    const prevStickies = customStickyNotesRef.current;
    if (selStrokes.size > 0 && prevStickies) {
      const nextStickies: Record<number, CustomStickyNote[]> = {};
      let stickiesRemoved = false;
      for (const [pStr, list] of Object.entries(prevStickies)) {
        const pIdx = parseInt(pStr, 10);
        const filtered = list.filter((s) => !selStrokes.has(s.id));
        if (filtered.length !== list.length) {
          stickiesRemoved = true;
          changed = true;
        }
        nextStickies[pIdx] = filtered;
      }
      if (stickiesRemoved) {
        customStickyNotesRef.current = nextStickies;
        setCustomStickyNotes(nextStickies);
        selectedStrokeIdsRef.current = [];
        setSelectedStrokeIds([]);
        triggerDebouncedSave();
      }
    }

    // 2b. Delete selected custom text boxes
    const prevTexts = customTextBoxesRef.current;
    if (selStrokes.size > 0) {
      const nextTexts: Record<number, CustomTextBox[]> = {};
      let textsRemoved = false;
      for (const [pStr, list] of Object.entries(prevTexts)) {
        const pIdx = parseInt(pStr, 10);
        const filtered = list.filter((b) => !selStrokes.has(b.id));
        if (filtered.length !== list.length) {
          textsRemoved = true;
          changed = true;
        }
        nextTexts[pIdx] = filtered;
      }
      if (textsRemoved) {
        customTextBoxesRef.current = nextTexts;
        setCustomTextBoxes(nextTexts);
        selectedStrokeIdsRef.current = [];
        setSelectedStrokeIds([]);
        triggerDebouncedSave();
      }
    }

    // 3. Delete selected EmbedPDF annotations (stamps, freeText, highlights)
    if (annotationScope) {
      const selectedScopeIds = annotationScope.getSelectedAnnotationIds() || [];
      const selectedAnnoIds = new Set([...selectedScopeIds, ...Array.from(selStrokes)]);
      if (selectedAnnoIds.size > 0) {
        const allAnnos = annotationScope.getAnnotations();
        const toDelete = allAnnos
          .filter((ta) => selectedAnnoIds.has(ta.object.id))
          .map((ta) => ({ pageIndex: ta.object.pageIndex, id: ta.object.id }));
        if (toDelete.length > 0) {
          annotationScope.deleteAnnotations(toDelete);
          annotationScope.deselectAnnotation();
          setAnnotationsVersion((v) => v + 1);
          triggerDebouncedSave();
          changed = true;
        }
      }
    }

    return changed;
  }, [annotationScope, triggerDebouncedSave]);

  const getObjectsForPage = useCallback(
    (pageIndex: number): CustomAnnotationObject[] => {
      if (!annotationScope) return [];
      const annos = annotationScope.getAnnotations({ pageIndex }) || [];
      const res: CustomAnnotationObject[] = [];
      for (const a of annos) {
        const o = a?.object;
        if (!o || !o.rect) continue;
        const type: CustomObjectType | null =
          o.type === PdfAnnotationSubtype.STAMP
            ? "stamp"
            : o.type === PdfAnnotationSubtype.HIGHLIGHT
            ? "highlight"
            : null;
        if (type) {
          const anyObj = o as {
            contents?: string;
            text?: string;
            fontSize?: number;
            fontColor?: string;
            color?: string;
          };
          res.push({
            id: o.id,
            type,
            pageIndex: o.pageIndex ?? pageIndex,
            x: o.rect.origin.x,
            y: o.rect.origin.y,
            width: o.rect.size.width,
            height: o.rect.size.height,
            transform: { x: 0, y: 0 },
            text: anyObj.contents ?? anyObj.text,
            contents: anyObj.contents ?? anyObj.text,
            fontSize: anyObj.fontSize,
            color: anyObj.fontColor ?? anyObj.color,
          });
        }
      }

      const stickies = customStickyNotes[pageIndex] || [];
      for (const st of stickies) {
        res.push({
          id: st.id,
          type: "sticky",
          pageIndex,
          x: st.x,
          y: st.y,
          width: st.width,
          height: st.height,
          transform: st.transform ?? { x: 0, y: 0 },
          text: st.text,
          contents: st.text,
          color: st.color,
          rotation: st.rotation,
        });
      }

      const texts = customTextBoxes[pageIndex] || [];
      for (const tb of texts) {
        const fontSize = tb.fontSize || 16;
        res.push({
          id: tb.id,
          type: "text",
          pageIndex,
          x: tb.x,
          y: tb.y,
          width: tb.width && tb.width > 0 ? tb.width : DEFAULT_TEXT_BOX_WIDTH,
          height: tb.height && tb.height > 0 ? tb.height : DEFAULT_TEXT_BOX_HEIGHT,
          transform: { x: 0, y: 0 },
          text: tb.text,
          contents: tb.text,
          fontSize,
          color: tb.color,
          direction: tb.direction ?? detectTextDirection(tb.text ?? ""),
        });
      }

      return res;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [annotationScope, annotationsVersion, customStickyNotes, customTextBoxes]
  );

  const handleMoveObject = useCallback(
    (
      pageIndex: number,
      id: string,
      newOrigin: { x: number; y: number },
      type: CustomObjectType
    ) => {
      if (type === "highlight") return;
      if (type === "text") {
        setCustomTextBoxes((prev) => {
          const list = prev[pageIndex] || [];
          const next = {
            ...prev,
            [pageIndex]: list.map((b) =>
              b.id === id
                ? {
                    ...b,
                    x: Math.round(newOrigin.x * 100) / 100,
                    y: Math.round(newOrigin.y * 100) / 100,
                  }
                : b
            ),
          };
          customTextBoxesRef.current = next;
          return next;
        });
        triggerDebouncedSave();
        return;
      }
      if (type === "sticky") {
        setCustomStickyNotes((prev) => {
          const list = prev[pageIndex] || [];
          const nextList = list.map((st) =>
            st.id === id
              ? {
                  ...st,
                  x: Math.round(newOrigin.x * 100) / 100,
                  y: Math.round(newOrigin.y * 100) / 100,
                  transform: { x: 0, y: 0 },
                }
              : st
          );
          const next = { ...prev, [pageIndex]: nextList };
          customStickyNotesRef.current = next;
          return next;
        });
        setAnnotationsVersion((v) => v + 1);
        triggerDebouncedSave();
        return;
      }
      if (!annotationScope) return;
      try {
        const pageAnnos = annotationScope.getAnnotations({ pageIndex }) || [];
        const target = pageAnnos.find((a) => a.object.id === id);
        if (target?.object?.rect) {
          const origSize = target.object.rect.size;
          const safeX = Math.round(newOrigin.x * 100) / 100;
          const safeY = Math.round(newOrigin.y * 100) / 100;
          annotationScope.updateAnnotation(pageIndex, id, {
            rect: {
              origin: { x: safeX, y: safeY },
              size: origSize,
            },
          });
          setAnnotationsVersion((v) => v + 1);
          triggerDebouncedSave();
        }
      } catch (err) {
        console.error("[usePdfAnnotations] Failed to move object:", err);
      }
    },
    [annotationScope, triggerDebouncedSave]
  );

  const handleResizeObject = useCallback(
    (
      pageIndex: number,
      id: string,
      newRect: { origin: { x: number; y: number }; size: { width: number; height: number } },
      type: CustomObjectType
    ) => {
      if (type === "highlight" || type === "text") return;
      if (type === "stroke") {
        setCustomStrokes((prev) => {
          const pageStrokes = prev[pageIndex];
          if (!pageStrokes) return prev;
          const targetStroke = pageStrokes.find((s) => s.id === id);
          if (!targetStroke) return prev;

          const absBounds = getAbsoluteStrokeBounds(targetStroke);
          if (absBounds.width <= 0 || absBounds.height <= 0) return prev;

          const newPoints = scaleStrokePoints(targetStroke.points, absBounds, newRect, targetStroke.transform);

          customUndoStackRef.current.push(prev);
          customRedoStackRef.current = [];
          const next = {
            ...prev,
            [pageIndex]: pageStrokes.map((s) =>
              s.id === id ? { ...s, points: newPoints, transform: { x: 0, y: 0 } } : s
            ),
          };
          customStrokesRef.current = next;
          setCanUndo(true);
          setCanRedo(false);
          return next;
        });
        triggerDebouncedSave();
        return;
      }

      if (type === "sticky") {
        setCustomStickyNotes((prev) => {
          const list = prev[pageIndex] || [];
          const nextList = list.map((st) =>
            st.id === id
              ? {
                  ...st,
                  x: Math.round(newRect.origin.x * 100) / 100,
                  y: Math.round(newRect.origin.y * 100) / 100,
                  width: Math.max(80, Math.round(newRect.size.width * 100) / 100),
                  height: Math.max(60, Math.round(newRect.size.height * 100) / 100),
                  transform: { x: 0, y: 0 },
                }
              : st
          );
          const next = { ...prev, [pageIndex]: nextList };
          customStickyNotesRef.current = next;
          return next;
        });
        setAnnotationsVersion((v) => v + 1);
        triggerDebouncedSave();
        return;
      }

      if (!annotationScope) return;
      try {
        const pageAnnos = annotationScope.getAnnotations({ pageIndex }) || [];
        const target = pageAnnos.find((a) => a.object.id === id);
        if (target?.object?.rect) {
          const patch: Record<string, unknown> = {
            rect: {
              origin: {
                x: Math.round(newRect.origin.x * 100) / 100,
                y: Math.round(newRect.origin.y * 100) / 100,
              },
              size: {
                width: Math.max(10, Math.round(newRect.size.width * 100) / 100),
                height: Math.max(10, Math.round(newRect.size.height * 100) / 100),
              },
            },
          };
          annotationScope.updateAnnotation(pageIndex, id, patch);
          setAnnotationsVersion((v) => v + 1);
          triggerDebouncedSave();
        }
      } catch (err) {
        console.error("[usePdfAnnotations] Failed to resize object:", err);
      }
    },
    [annotationScope, triggerDebouncedSave]
  );

  const handleUndo = useCallback(() => {
    if (customUndoStackRef.current.length > 0) {
      const prev = customUndoStackRef.current.pop()!;
      customRedoStackRef.current.push(customStrokesRef.current);
      setCustomStrokes(prev);
      customStrokesRef.current = prev;
      setCanUndo(customUndoStackRef.current.length > 0 || (historyScope ? historyScope.canUndo() : false));
      setCanRedo(true);
      triggerDebouncedSave();
      return;
    }
    if (historyScope && historyScope.canUndo()) {
      historyScope.undo();
    }
  }, [historyScope, triggerDebouncedSave]);

  const handleRedo = useCallback(() => {
    if (customRedoStackRef.current.length > 0) {
      const next = customRedoStackRef.current.pop()!;
      customUndoStackRef.current.push(customStrokesRef.current);
      setCustomStrokes(next);
      customStrokesRef.current = next;
      setCanUndo(true);
      setCanRedo(customRedoStackRef.current.length > 0 || (historyScope ? historyScope.canRedo() : false));
      triggerDebouncedSave();
      return;
    }
    if (historyScope && historyScope.canRedo()) {
      historyScope.redo();
    }
  }, [historyScope, triggerDebouncedSave]);

  const handleAddStamp = useCallback(
    async (file: File, options?: { pageIndex?: number; x?: number; y?: number }) => {
      if (!annotationScope) return;
      try {
        const { buffer, width, height, mimeType } = await processStampImage(file);
        const pageIdx = typeof options?.pageIndex === "number" ? options.pageIndex : Math.max(0, currentPage - 1);
        const stampId =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `stamp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

        const blob = new Blob([buffer], { type: mimeType });
        const blobUrl = URL.createObjectURL(blob);
        stampBlobUrlCache.set(stampId, blobUrl);

        const originX = typeof options?.x === "number" ? Math.round(options.x * 100) / 100 : 72;
        const originY = typeof options?.y === "number" ? Math.round(options.y * 100) / 100 : 72;

        const stampAnno: PdfStampAnnoObject = {
          id: stampId,
          type: PdfAnnotationSubtype.STAMP,
          pageIndex: pageIdx,
          rect: {
            origin: { x: originX, y: originY },
            size: { width, height },
          },
        };

        annotationScope.createAnnotation(pageIdx, stampAnno, {
          data: buffer,
          mimeType: (mimeType === "image/jpeg" ? "image/jpeg" : "image/png") as "image/png" | "image/jpeg",
        });

        annotationScope.setActiveTool(null);
        setActiveToolState("select");
        selectedStrokeIdsRef.current = [stampId];
        setSelectedStrokeIds([stampId]);
        if (typeof annotationScope.selectAnnotation === "function") {
          annotationScope.selectAnnotation(pageIdx, stampId);
        }
        if (typeof (annotationScope as unknown as { setSelection?: (ids: string[]) => void }).setSelection === "function") {
          (annotationScope as unknown as { setSelection?: (ids: string[]) => void }).setSelection?.([stampId]);
        }
        setAnnotationsVersion((v) => v + 1);

        triggerDebouncedSave();
      } catch (err) {
        console.error("[usePdfAnnotations] Failed to add stamp:", err);
      }
    },
    [annotationScope, currentPage, triggerDebouncedSave]
  );

  const handleAddSticky = useCallback(
    (
      pageIndex: number,
      coords: { x: number; y: number; width?: number; height?: number; text?: string; color?: string; rotation?: number }
    ) => {
      const stickyId =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `sticky-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

      let hash = 0;
      for (let i = 0; i < stickyId.length; i++) {
        hash = (hash << 5) - hash + stickyId.charCodeAt(i);
        hash |= 0;
      }
      const rotation =
        coords.rotation ?? Math.round((((Math.abs(hash) % 17) - 8) / 10) * 10) / 10;

      const newSticky: CustomStickyNote = {
        id: stickyId,
        pageIndex,
        x: Math.round(coords.x * 100) / 100,
        y: Math.round(coords.y * 100) / 100,
        width: coords.width ?? 200,
        height: coords.height ?? 200,
        text: coords.text ?? "",
        color: coords.color ?? "#FEF08A",
        rotation,
        transform: { x: 0, y: 0 },
      };

      setCustomStickyNotes((prev) => {
        const list = prev[pageIndex] || [];
        const next = { ...prev, [pageIndex]: [...list, newSticky] };
        customStickyNotesRef.current = next;
        return next;
      });

      setActiveToolState("select");
      setSelectedStrokeIds([stickyId]);
      selectedStrokeIdsRef.current = [stickyId];
      setAnnotationsVersion((v) => v + 1);
      triggerDebouncedSave();
    },
    [triggerDebouncedSave]
  );

  const handleUpdateStickyText = useCallback(
    (pageIndex: number, id: string, text: string) => {
      setCustomStickyNotes((prev) => {
        const list = prev[pageIndex] || [];
        const nextList = list.map((st) => (st.id === id ? { ...st, text } : st));
        const next = { ...prev, [pageIndex]: nextList };
        customStickyNotesRef.current = next;
        return next;
      });
      triggerDebouncedSave();
    },
    [triggerDebouncedSave]
  );

  const handleDeleteSticky = useCallback(
    (pageIndex: number, id: string) => {
      setCustomStickyNotes((prev) => {
        const list = prev[pageIndex] || [];
        const nextList = list.filter((st) => st.id !== id);
        const next = { ...prev, [pageIndex]: nextList };
        customStickyNotesRef.current = next;
        return next;
      });
      setSelectedStrokeIds((prev) => {
        const next = prev.filter((item) => item !== id);
        selectedStrokeIdsRef.current = next;
        return next;
      });
      setAnnotationsVersion((v) => v + 1);
      triggerDebouncedSave();
    },
    [triggerDebouncedSave]
  );

  const handleAddText = useCallback(
    (
      pageIndex: number,
      coords: {
        x: number;
        y: number;
        width?: number;
        height?: number;
        text?: string;
        fontSize?: number;
        color?: string;
        id?: string;
        direction?: "ltr" | "rtl";
      }
    ): string => {
      const textId =
        coords.id ||
        (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `text-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`);

      const initialDir =
        coords.direction ?? (coords.text ? detectTextDirection(coords.text) : "ltr");

      const box: CustomTextBox = {
        id: textId,
        pageIndex,
        x: Math.round(coords.x * 100) / 100,
        y: Math.round(coords.y * 100) / 100,
        width: coords.width && coords.width > 0 ? coords.width : DEFAULT_TEXT_BOX_WIDTH,
        height: coords.height && coords.height > 0 ? coords.height : DEFAULT_TEXT_BOX_HEIGHT,
        text: coords.text ?? "",
        fontSize: coords.fontSize ?? DEFAULT_TEXT_FONT_SIZE,
        color: coords.color ?? DEFAULT_TEXT_COLOR,
        direction: initialDir,
      };

      setCustomTextBoxes((prev) => {
        const list = prev[pageIndex] || [];
        const next = { ...prev, [pageIndex]: [...list, box] };
        customTextBoxesRef.current = next;
        return next;
      });
      // Keep ref current synchronously for immediate reads
      const cur = customTextBoxesRef.current;
      if (!(cur[pageIndex] || []).some((b) => b.id === textId)) {
        customTextBoxesRef.current = { ...cur, [pageIndex]: [...(cur[pageIndex] || []), box] };
      }

      setActiveToolState("select");
      annotationScope?.setActiveTool(null);
      setSelectedStrokeIds([textId]);
      selectedStrokeIdsRef.current = [textId];
      triggerDebouncedSave();

      return textId;
    },
    [annotationScope, triggerDebouncedSave]
  );

  const handleUpdateText = useCallback(
    (pageIndex: number, id: string, newText: string) => {
      const dir = detectTextDirection(newText);
      setCustomTextBoxes((prev) => {
        const list = prev[pageIndex] || [];
        const next = {
          ...prev,
          [pageIndex]: list.map((b) => (b.id === id ? { ...b, text: newText, direction: dir } : b)),
        };
        customTextBoxesRef.current = next;
        return next;
      });
      triggerDebouncedSave();
    },
    [triggerDebouncedSave]
  );

  const handleUpdateTextBoxSize = useCallback(
    (pageIndex: number, id: string, size: { width: number; height: number }) => {
      setCustomTextBoxes((prev) => {
        const list = prev[pageIndex] || [];
        const next = {
          ...prev,
          [pageIndex]: list.map((b) =>
            b.id === id
              ? {
                  ...b,
                  width: Math.round(size.width * 100) / 100,
                  height: Math.round(size.height * 100) / 100,
                }
              : b
          ),
        };
        customTextBoxesRef.current = next;
        return next;
      });
      triggerDebouncedSave();
    },
    [triggerDebouncedSave]
  );

  const handleDeleteText = useCallback(
    (pageIndex: number, id: string) => {
      setCustomTextBoxes((prev) => {
        const list = prev[pageIndex] || [];
        const next = { ...prev, [pageIndex]: list.filter((b) => b.id !== id) };
        customTextBoxesRef.current = next;
        return next;
      });
      setSelectedStrokeIds((prev) => {
        const next = prev.filter((item) => item !== id);
        selectedStrokeIdsRef.current = next;
        return next;
      });
      triggerDebouncedSave();
    },
    [triggerDebouncedSave]
  );
  // Expose on window for E2E testing in browser environments
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as unknown as { __aboard_pdfAnnotations?: unknown }).__aboard_pdfAnnotations = {
        scope: annotationScope,
        history: historyScope,
        customStrokes: customStrokesRef.current,
        customStickyNotes: customStickyNotesRef.current,
        addSticky: handleAddSticky,
        handleDeleteSticky,
        deleteSticky: handleDeleteSticky,
        addText: handleAddText,
        updateText: handleUpdateText,
        updateTextBoxSize: handleUpdateTextBoxSize,
        deleteText: handleDeleteText,
        customTextBoxes: customTextBoxesRef.current,
        selectedStrokeIds: selectedStrokeIdsRef.current,
        deleteSelected: handleDeleteSelected,
        flushAnnotations,
      };
    }
  }, [
    annotationScope,
    historyScope,
    customStrokes,
    customStickyNotes,
    customTextBoxes,
    handleAddSticky,
    handleDeleteSticky,
    handleAddText,
    handleUpdateText,
    handleUpdateTextBoxSize,
    handleDeleteText,
    selectedStrokeIds,
    handleDeleteSelected,
    flushAnnotations,
  ]);

  return {
    activeTool,
    canUndo,
    canRedo,
    handleSelectTool,
    handleUndo,
    handleRedo,
    handleAddStamp,
    customStickyNotes,
    handleAddSticky,
    handleUpdateStickyText,
    handleDeleteSticky,
    handleAddText,
    handleUpdateText,
    handleUpdateTextBoxSize,
    handleDeleteText,
    customTextBoxes,
    customStrokes,
    selectedStrokeIds,
    setSelectedStrokeIds,
    handleDeleteSelected,
    handleAddCustomStroke,
    handleMoveCustomStroke,
    handleMoveCustomStrokes,
    getObjectsForPage,
    handleMoveObject,
    handleResizeObject,
    annotationScope,
  };
}
