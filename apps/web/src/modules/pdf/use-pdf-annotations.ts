import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
} from "./annotation-storage";
import type { AnnotationToolType } from "./pdf-toolbar";

export interface UsePdfAnnotationsOptions {
  documentId: string;
  projectId?: string;
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
}

export function usePdfAnnotations({
  documentId,
  projectId = "default",
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

  const isRestoringRef = useRef(false);
  const hasRestoredRef = useRef(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced save through ProjectService & SaveQueue (coalesces rapid drawing strokes)
  const triggerDebouncedSave = useCallback(() => {
    if (isRestoringRef.current || !annotationScope) return;

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(async () => {
      try {
        if (!annotationScope) return;

        const items = await new Promise<AnnotationTransferItem[]>((resolve, reject) => {
          const task = annotationScope.exportAnnotations();
          task.wait(resolve, (err) => reject(new Error(String(err))));
        });

        const serialized = await serializeAnnotations(projectId, hashKey, items, ps);
        await ps.saveAnnotations(projectId, hashKey, serialized);
      } catch (err) {
        console.error("[usePdfAnnotations] Debounced save failed:", err);
      }
    }, 400);
  }, [annotationScope, projectId, hashKey, ps]);

  // Initial restoration on document load: loads clean JSON and restores stamps via getFile
  useEffect(() => {
    if (!annotationScope || hasRestoredRef.current) return;
    hasRestoredRef.current = true;
    const scope = annotationScope;

    async function restore() {
      try {
        const savedJson = await ps.readAnnotations(projectId, hashKey);
        if (!savedJson || savedJson.trim() === "" || savedJson === "[]") {
          return;
        }

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
  }, [annotationScope, projectId, hashKey, ps]);

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

  // Track undo / redo capabilities and trigger save on undo/redo actions
  useEffect(() => {
    if (!historyScope) return;

    const updateHistory = () => {
      setCanUndo(historyScope.canUndo());
      setCanRedo(historyScope.canRedo());
    };

    updateHistory();

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
  }, [historyScope, triggerDebouncedSave]);

  // Cleanup pending timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, []);

  const handleSelectTool = useCallback(
    (tool: AnnotationToolType) => {
      setActiveToolState(tool);
      if (!annotationScope) return;

      if (tool === "select") {
        annotationScope.setActiveTool(null);
      } else if (tool === "highlight") {
        annotationScope.setActiveTool("highlight");
      } else if (tool === "ink") {
        annotationScope.setActiveTool("ink");
      } else if (tool === "freeText") {
        annotationScope.setActiveTool("freeText");
      } else if (tool === "stamp") {
        annotationScope.setActiveTool("stamp");
      }
    },
    [annotationScope]
  );

  const handleUndo = useCallback(() => {
    if (historyScope && historyScope.canUndo()) {
      historyScope.undo();
    }
  }, [historyScope]);

  const handleRedo = useCallback(() => {
    if (historyScope && historyScope.canRedo()) {
      historyScope.redo();
    }
  }, [historyScope]);

  const handleAddStamp = useCallback(
    async (file: File) => {
      if (!annotationScope) return;
      try {
        const arrayBuffer = await file.arrayBuffer();
        const pageIdx = Math.max(0, currentPage - 1);
        const stampId =
          typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
            ? crypto.randomUUID()
            : `stamp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

        const stampAnno: PdfStampAnnoObject = {
          id: stampId,
          type: PdfAnnotationSubtype.STAMP,
          pageIndex: pageIdx,
          rect: {
            origin: { x: 72, y: 72 },
            size: { width: 144, height: 96 },
          },
        };

        annotationScope.createAnnotation(pageIdx, stampAnno, {
          data: arrayBuffer,
        });

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
      };
    }
  }, [annotationScope, historyScope]);

  return {
    activeTool,
    canUndo,
    canRedo,
    handleSelectTool,
    handleUndo,
    handleRedo,
    handleAddStamp,
  };
}
