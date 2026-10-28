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
} from "./annotation-storage";
import { processStampImage } from "./image-stamp-utils";
import { stampBlobUrlCache } from "./custom-stamp-renderer";
import type { AnnotationToolType } from "./pdf-toolbar";
import type { CustomInkStroke, CustomInkTransform } from "./pdf-custom-ink-layer";

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
  handleAddStamp: (file: File) => Promise<void>;
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

  // Custom ink state (isolated completely from EmbedPDF to guarantee 1:1 mouse alignment)
  const [customStrokes, setCustomStrokes] = useState<Record<number, CustomInkStroke[]>>({});
  const customStrokesRef = useRef<Record<number, CustomInkStroke[]>>({});
  useEffect(() => {
    customStrokesRef.current = customStrokes;
  }, [customStrokes]);
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
        customStrokesRef.current
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

        isRestoringRef.current = true;
        const transferItems = await deserializeAnnotations(projectId, savedJson, ps);
        if (transferItems.length > 0) {
          scope.importAnnotations(transferItems);
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
        // If we are currently in custom ink draw mode, do NOT let EmbedPDF reset us to select
        setActiveToolState((prev) => (prev === "ink" ? "ink" : "select"));
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
      if (!annotationScope) return;

      if (typeof annotationScope.deselectAnnotation === "function") {
        annotationScope.deselectAnnotation();
      }

      if (tool === "select" || tool === "ink") {
        // Native EmbedPDF ink is completely eradicated; keep native tool inactive
        annotationScope.setActiveTool(null);
      } else if (tool === "highlight") {
        annotationScope.setActiveTool("highlight");
      } else if (tool === "freeText") {
        annotationScope.setActiveTool("freeText");
      } else if (tool === "stamp") {
        annotationScope.setActiveTool("stamp");
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

    // 2. Delete selected EmbedPDF annotations (stamps, freeText, highlights)
    if (annotationScope) {
      const selectedAnnoIds = annotationScope.getSelectedAnnotationIds();
      if (selectedAnnoIds && selectedAnnoIds.length > 0) {
        const allAnnos = annotationScope.getAnnotations();
        const toDelete = allAnnos
          .filter((ta) => selectedAnnoIds.includes(ta.object.id))
          .map((ta) => ({ pageIndex: ta.object.pageIndex, id: ta.object.id }));
        if (toDelete.length > 0) {
          annotationScope.deleteAnnotations(toDelete);
          annotationScope.deselectAnnotation();
          triggerDebouncedSave();
          changed = true;
        }
      }
    }

    return changed;
  }, [annotationScope, triggerDebouncedSave]);

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
    async (file: File) => {
      if (!annotationScope) return;
      try {
        const { buffer, width, height, mimeType } = await processStampImage(file);
        const pageIdx = Math.max(0, currentPage - 1);
        const stampId =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `stamp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

        const blob = new Blob([buffer], { type: mimeType });
        const blobUrl = URL.createObjectURL(blob);
        stampBlobUrlCache.set(stampId, blobUrl);

        const stampAnno: PdfStampAnnoObject = {
          id: stampId,
          type: PdfAnnotationSubtype.STAMP,
          pageIndex: pageIdx,
          rect: {
            origin: { x: 72, y: 72 },
            size: { width, height },
          },
        };

        annotationScope.createAnnotation(pageIdx, stampAnno, {
          data: buffer,
        });

        annotationScope.setActiveTool(null);
        setActiveToolState("select");
        if (typeof annotationScope.selectAnnotation === "function") {
          annotationScope.selectAnnotation(pageIdx, stampId);
        }

        triggerDebouncedSave();
      } catch (err) {
        console.error("[usePdfAnnotations] Failed to add stamp:", err);
      }
    },
    [annotationScope, currentPage, triggerDebouncedSave]
  );

  // Expose on window for E2E testing in browser environments
  useEffect(() => {
    if (typeof window !== "undefined") {
      (window as unknown as { __aboard_pdfAnnotations?: unknown }).__aboard_pdfAnnotations = {
        scope: annotationScope,
        history: historyScope,
        customStrokes: customStrokesRef.current,
        selectedStrokeIds: selectedStrokeIdsRef.current,
        deleteSelected: handleDeleteSelected,
      };
    }
  }, [annotationScope, historyScope, customStrokes, selectedStrokeIds, handleDeleteSelected]);

  return {
    activeTool,
    canUndo,
    canRedo,
    handleSelectTool,
    handleUndo,
    handleRedo,
    handleAddStamp,
    customStrokes,
    selectedStrokeIds,
    setSelectedStrokeIds,
    handleDeleteSelected,
    handleAddCustomStroke,
    handleMoveCustomStroke,
    handleMoveCustomStrokes,
    annotationScope,
  };
}
