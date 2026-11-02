"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { EmbedPDF, useDocumentState } from "@embedpdf/core/react";
import { usePdfiumEngine } from "@embedpdf/engines/react";
import {
  PluginRegistry,
  PluginBatchRegistrations,
  startLoadingDocument,
  setDocumentLoaded,
} from "@embedpdf/core";
import { RenderPluginPackage } from "@embedpdf/plugin-render";
import { RenderLayer, useRenderCapability } from "@embedpdf/plugin-render/react";
import { bus, type AppEvents } from "@/core/bus";
import { MAX_ALLOWED_FILE_BYTES, compressImageIfNeeded } from "@/modules/board/image-utils";
import { getImageDimensions } from "@/integration/board-insertion";
import { ScrollPluginPackage } from "@embedpdf/plugin-scroll";
import { Scroller, useScroll } from "@embedpdf/plugin-scroll/react";
import { ViewportPluginPackage } from "@embedpdf/plugin-viewport";
import { Viewport } from "@embedpdf/plugin-viewport/react";
import { ZoomPluginPackage } from "@embedpdf/plugin-zoom";
import { useZoom } from "@embedpdf/plugin-zoom/react";
import { ThumbnailPluginPackage } from "@embedpdf/plugin-thumbnail";
import { ThumbnailsPane, ThumbImg } from "@embedpdf/plugin-thumbnail/react";
import { InteractionManagerPluginPackage } from "@embedpdf/plugin-interaction-manager";
import { PagePointerProvider } from "@embedpdf/plugin-interaction-manager/react";
import {
  SelectionPluginPackage,
  SelectionLayer,
  useSelectionCapability,
} from "@embedpdf/plugin-selection/react";
import {
  AnnotationPluginPackage,
  AnnotationLayer,
  useRegisterRenderers,
} from "@embedpdf/plugin-annotation/react";
import { customStampRenderer } from "./custom-stamp-renderer";
import { PdfTextLayer } from "./pdf-text-layer";
import { HistoryPluginPackage } from "@embedpdf/plugin-history";
import { ExportPluginPackage, useExport } from "@embedpdf/plugin-export/react";
import type { PdfDocumentObject } from "@embedpdf/models";
import { projectService as defaultProjectService, type ProjectService } from "@/core/storage";
import { computeBlobSha256 } from "@/core/storage/sha256";
import { useI18n } from "@/i18n/provider";
import { PdfToolbar } from "./pdf-toolbar";
import { PdfFloatingToolbar } from "./pdf-floating-toolbar";
import { usePdfAnnotations } from "./use-pdf-annotations";
import {
  PdfCustomInkLayer,
  compositeCustomStrokesOnBlob,
  type CustomInkPoint,
} from "./pdf-custom-ink-layer";
import {
  rotatePage,
  deletePage,
  reorderPages,
  insertImagePage,
  burnAnnotationsWithPdfLib,
  burnCustomInkOnPdfBytes,
} from "./page-operations";

export interface PdfViewerProps {
  documentId: string;
  blob: Blob;
  documentTitle?: string;
  initialPage?: number;
  onPageChange: (page: number) => void;
  projectId?: string;
  pdfHash?: string;
  tabId?: string;
  itemId?: string;
  projectServiceOverride?: ProjectService;
  onSaveRestructuredPdf?: (newBlob: Blob, name?: string) => Promise<void>;
  onShowToast?: (message: string) => void;
  hasBoardTab?: boolean;
}

const plugins = [
  { package: RenderPluginPackage },
  { package: ScrollPluginPackage },
  { package: ViewportPluginPackage },
  { package: ZoomPluginPackage },
  { package: ThumbnailPluginPackage },
  { package: InteractionManagerPluginPackage },
  { package: SelectionPluginPackage },
  { package: AnnotationPluginPackage },
  { package: HistoryPluginPackage },
  { package: ExportPluginPackage },
] as unknown as PluginBatchRegistrations;

interface ViewerInnerProps {
  documentId: string;
  blob: Blob;
  documentTitle?: string;
  initialPage: number;
  onPageChange: (page: number) => void;
  projectId?: string;
  pdfHash?: string;
  tabId?: string;
  itemId?: string;
  projectServiceOverride?: ProjectService;
  onSaveRestructuredPdf?: (newBlob: Blob, name?: string) => Promise<void>;
  onShowToast: (message: string) => void;
  hasBoardTab?: boolean;
}

function ViewerInner({
  documentId,
  blob,
  documentTitle,
  initialPage,
  onPageChange,
  projectId = "default",
  pdfHash,
  tabId,
  itemId,
  projectServiceOverride,
  onSaveRestructuredPdf,
  onShowToast,
  hasBoardTab = true,
}: ViewerInnerProps) {
  const { t } = useI18n();
  useRegisterRenderers(useMemo(() => [customStampRenderer], []));
  const ps = projectServiceOverride ?? defaultProjectService;
  const { provides: scrollScope, state: scrollState } = useScroll(documentId);
  const { provides: zoomScope, state: zoomState } = useZoom(documentId);
  const { provides: exportScope } = useExport(documentId);
  const { provides: renderCapability } = useRenderCapability();
  const { provides: selectionCapability } = useSelectionCapability();
  const selectionScope = useMemo(
    () => (selectionCapability ? selectionCapability.forDocument(documentId) : null),
    [selectionCapability, documentId]
  );

  const [showThumbnails, setShowThumbnails] = useState(false);
  const [displayPage, setDisplayPage] = useState(initialPage);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isOperatingPage, setIsOperatingPage] = useState(false);
  const [isSendingToBoard, setIsSendingToBoard] = useState(false);
  const [selectedText, setSelectedText] = useState("");
  const [selectionPos, setSelectionPos] = useState<{ top: number; left: number } | null>(null);
  const [isSendingSelection, setIsSendingSelection] = useState(false);
  const viewerContainerRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const zoomScopeRef = useRef(zoomScope);

  useEffect(() => {
    zoomScopeRef.current = zoomScope;
  }, [zoomScope]);

  // Desktop Ctrl + Wheel zoom on the PDF viewport container
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    let lastZoomTime = 0;
    let lastZoomDir = 0;
    const THROTTLE_MS = 50;

    const handleWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();

      if (event.deltaY === 0) return;
      const dir = event.deltaY < 0 ? 1 : -1;
      const now = Date.now();
      if (now - lastZoomTime < THROTTLE_MS && dir === lastZoomDir) {
        return;
      }
      lastZoomTime = now;
      lastZoomDir = dir;

      if (dir > 0) {
        zoomScopeRef.current?.zoomIn();
      } else {
        zoomScopeRef.current?.zoomOut();
      }
    };

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, []);

  const handleSendToBoard = async () => {
    if (!renderCapability) {
      onShowToast(t("pdf.sendToBoardError"));
      return;
    }
    setIsSendingToBoard(true);
    try {
      const renderScope = renderCapability.forDocument(documentId);
      const pageNum = displayPage || scrollState.currentPage || 1;
      const pageIndex = Math.max(0, pageNum - 1);

      const task = renderScope.renderPage({
        pageIndex,
        options: {
          scaleFactor: 2,
          imageType: "image/webp",
          imageQuality: 0.85,
          withAnnotations: true,
        },
      });

      let pageBlob = await task.toPromise();
      if (customStrokes[pageIndex] && customStrokes[pageIndex].length > 0) {
        const { width: origW, height: origH } = await getImageDimensions(pageBlob);
        pageBlob = await compositeCustomStrokesOnBlob(pageBlob, customStrokes[pageIndex], origW, origH);
      }
      if (pageBlob.size > MAX_ALLOWED_FILE_BYTES) {
        pageBlob = await compressImageIfNeeded(pageBlob);
      }

      const { width, height } = await getImageDimensions(pageBlob);

      bus.emit("pdf:page-to-board", {
        docItemId: itemId || documentId,
        page: pageNum,
        image: pageBlob,
        width,
        height,
        sourceTabId: tabId,
      });

      onShowToast(t("pdf.sentToBoardSuccess"));
    } catch (err) {
      console.error("[PdfViewer] Failed to send page to board:", err);
      onShowToast(t("pdf.sendToBoardError"));
    } finally {
      setIsSendingToBoard(false);
    }
  };

  const hasRestoredPageRef = useRef(false);
  const isSettledRef = useRef(initialPage <= 1);

  const {
    activeTool,
    canUndo,
    canRedo,
    handleSelectTool,
    handleUndo,
    handleRedo,
    handleAddStamp,
    customStrokes,
    handleAddCustomStroke,
    handleMoveCustomStroke,
    handleMoveCustomStrokes,
    selectedStrokeIds,
    setSelectedStrokeIds,
    handleDeleteSelected,
    getObjectsForPage,
    handleMoveObject,
    handleResizeObject,
    annotationScope,
  } = usePdfAnnotations({
    documentId,
    projectId,
    itemId,
    pdfHash,
    currentPage: displayPage || scrollState.currentPage || 1,
    projectServiceOverride,
  });

  const docState = useDocumentState(documentId);
  const stampFileInputRef = useRef<HTMLInputElement>(null);
  const pendingStampRef = useRef<{ pageIndex: number; x: number; y: number } | null>(null);

  const handlePageStampClick = useCallback(
    (pageIndex: number, pt: CustomInkPoint) => {
      pendingStampRef.current = { pageIndex, x: pt.x, y: pt.y };
      stampFileInputRef.current?.click();
    },
    []
  );

  const handleStampFileInputChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      const pending = pendingStampRef.current;
      if (file) {
        await handleAddStamp(file, pending ?? undefined);
      }
      if (stampFileInputRef.current) {
        stampFileInputRef.current.value = "";
      }
      pendingStampRef.current = null;
      handleSelectTool("select");
    },
    [handleAddStamp, handleSelectTool]
  );

  const renderCustomAnnotation = useCallback(
    ({ annotation, children }: { annotation: { id: string; type?: number }; children: React.ReactNode }) => (
      <div
        data-annotation-id={annotation.id}
        data-annotation-type={annotation.type}
        style={{ width: "100%", height: "100%", overflow: "visible" }}
      >
        {children}
      </div>
    ),
    []
  );

  // Delete/Backspace shortcut for selected custom annotations and Undo/Redo shortcuts (PDF-3, PDF-4)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        const deleted = handleDeleteSelected();
        if (deleted) {
          e.preventDefault();
        }
      } else if ((e.ctrlKey || e.metaKey) && !e.altKey) {
        if (e.key.toLowerCase() === "z") {
          e.preventDefault();
          if (e.shiftKey) {
            handleRedo();
          } else {
            handleUndo();
          }
        } else if (e.key.toLowerCase() === "y") {
          e.preventDefault();
          handleRedo();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleDeleteSelected, handleUndo, handleRedo]);

  // Restore the student's initial page position once the document is layout-ready
  useEffect(() => {
    if (!scrollScope) return;
    if (initialPage <= 1) {
      hasRestoredPageRef.current = true;
      isSettledRef.current = true;
      return;
    }

    const tryRestore = () => {
      if (!hasRestoredPageRef.current) {
        hasRestoredPageRef.current = true;
        scrollScope.scrollToPage({ pageNumber: initialPage, behavior: "auto" });
        setTimeout(() => {
          isSettledRef.current = true;
        }, 400);
      }
    };

    const existingLayout = scrollScope.getLayout();
    if (existingLayout && existingLayout.virtualItems?.length > 0) {
      tryRestore();
    }

    const unsub = scrollScope.onLayoutChange(() => {
      tryRestore();
    });

    return () => {
      unsub();
    };
  }, [scrollScope, initialPage]);

  // Track page change and inform parent persistence hook only after initial restoration settles
  useEffect(() => {
    if (!scrollScope) return;
    return scrollScope.onPageChange((event) => {
      setDisplayPage(event.pageNumber);
      if (isSettledRef.current) {
        onPageChange(event.pageNumber);
      }
    });
  }, [scrollScope, onPageChange]);

  // Handle cross-module navigation requests (INT-4 / INT-3)
  useEffect(() => {
    if (!scrollScope) return;
    const handleNavigatePage = (evt: AppEvents["pdf:navigate-page"]) => {
      if (!evt.itemId || evt.itemId === itemId || evt.itemId === documentId) {
        if (typeof evt.page === "number" && evt.page >= 1) {
          scrollScope.scrollToPage({ pageNumber: evt.page, behavior: "smooth" });
          setDisplayPage(evt.page);
          onPageChange(evt.page);
        }
      }
    };
    bus.on("pdf:navigate-page", handleNavigatePage);
    return () => {
      bus.off("pdf:navigate-page", handleNavigatePage);
    };
  }, [scrollScope, itemId, documentId, onPageChange]);

  // Detect text selection for "Selection to Note" (INT-4)
  useEffect(() => {
    const handleSelection = () => {
      if (typeof window === "undefined") return;
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        if (selectionScope && selectionScope.getFormattedSelection().length > 0) {
          return;
        }
        setSelectedText("");
        setSelectionPos(null);
        return;
      }

      const text = selection.toString().trim();
      if (!text) {
        if (selectionScope && selectionScope.getFormattedSelection().length > 0) {
          return;
        }
        setSelectedText("");
        setSelectionPos(null);
        return;
      }

      const container = viewerContainerRef.current;
      if (!container) return;

      const pdfPane = container.closest('[data-testid^="pane-pdf-"]') || container.parentElement || container;
      const range = selection.getRangeAt(0);
      const node = range.commonAncestorContainer;
      const isInside =
        container.contains(node) ||
        pdfPane.contains(node) ||
        (node.parentElement ? pdfPane.contains(node.parentElement) : false);
      if (!isInside) {
        return;
      }

      const rangeRect = range.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      let top = 20;
      let left = 40;
      if (rangeRect && (rangeRect.width > 0 || rangeRect.height > 0)) {
        top =
          rangeRect.top - containerRect.top > 50
            ? rangeRect.top - containerRect.top - 40
            : rangeRect.bottom - containerRect.top + 8;
        left = Math.max(
          16,
          Math.min(
            containerRect.width - 160,
            rangeRect.left - containerRect.left + rangeRect.width / 2 - 60
          )
        );
      }

      setSelectedText(text);
      setSelectionPos({ top, left });
    };

    document.addEventListener("selectionchange", handleSelection);
    const containerEl = viewerContainerRef.current;
    if (containerEl) {
      containerEl.addEventListener("mouseup", handleSelection);
      containerEl.addEventListener("pointerup", handleSelection);
    }

    return () => {
      document.removeEventListener("selectionchange", handleSelection);
      if (containerEl) {
        containerEl.removeEventListener("mouseup", handleSelection);
        containerEl.removeEventListener("pointerup", handleSelection);
      }
    };
  }, [selectionScope]);

  // Also detect text selection via EmbedPDF's native SelectionPlugin (INT-4)
  useEffect(() => {
    if (!selectionScope) return;

    const syncPluginSelection = () => {
      selectionScope.getSelectedText().wait(
        (lines) => {
          const text = (lines || []).join("\n").trim();
          if (!text) {
            setSelectedText("");
            setSelectionPos(null);
            return;
          }

          let top = 24;
          let left = 64;
          const container = viewerContainerRef.current;
          if (container) {
            const selEl = container.querySelector('[style*="mix-blend-mode"]') as HTMLElement | null;
            if (selEl) {
              const selRect = selEl.getBoundingClientRect();
              const containerRect = container.getBoundingClientRect();
              if (selRect.width > 0 || selRect.height > 0) {
                top =
                  selRect.top - containerRect.top > 50
                    ? selRect.top - containerRect.top - 40
                    : selRect.bottom - containerRect.top + 8;
                left = Math.max(
                  16,
                  Math.min(
                    containerRect.width - 160,
                    selRect.left - containerRect.left + selRect.width / 2 - 60
                  )
                );
              }
            }
          }

          setSelectedText(text);
          setSelectionPos({ top, left });
        },
        () => {}
      );
    };

    const unsubEnd = selectionScope.onEndSelection(() => {
      syncPluginSelection();
    });
    const unsubChange = selectionScope.onSelectionChange((sel) => {
      if (!sel) {
        const domSel = typeof window !== "undefined" ? window.getSelection() : null;
        if (!domSel || domSel.isCollapsed || !domSel.toString().trim()) {
          setSelectedText("");
          setSelectionPos(null);
        }
      }
    });

    return () => {
      unsubEnd();
      unsubChange();
    };
  }, [selectionScope]);

  const handleSendSelectionToBoard = async () => {
    if (!selectedText) return;
    setIsSendingSelection(true);
    try {
      const curPage = displayPage || scrollState.currentPage || 1;
      bus.emit("pdf:selection", {
        docItemId: itemId || documentId,
        page: curPage,
        text: selectedText,
        sourceTabId: tabId,
      });
      onShowToast(t("pdf.selectionSentToBoardSuccess"));
      setSelectedText("");
      setSelectionPos(null);
      selectionScope?.clear();
      window.getSelection()?.removeAllRanges();
    } catch (err) {
      console.error("[PdfViewer] Failed to send selection to board:", err);
    } finally {
      setIsSendingSelection(false);
    }
  };

  const handlePrevPage = () => {
    const cur = scrollState.currentPage || displayPage;
    if (scrollScope && cur > 1) {
      const target = cur - 1;
      setDisplayPage(target);
      scrollScope.scrollToPage({ pageNumber: target });
      onPageChange(target);
    }
  };

  const handleNextPage = () => {
    const total = scrollState.totalPages || 1;
    const cur = scrollState.currentPage || displayPage;
    if (scrollScope && cur < total) {
      const target = cur + 1;
      setDisplayPage(target);
      scrollScope.scrollToPage({ pageNumber: target });
      onPageChange(target);
    }
  };

  const handleZoomIn = () => {
    zoomScope?.zoomIn();
  };

  const handleZoomOut = () => {
    zoomScope?.zoomOut();
  };

  const handleResetZoom = () => {
    zoomScope?.requestZoom(1.0);
  };

  // Download PDF with burned-in annotations (PDF-5)
  const handleDownloadAnnotated = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      let pdfBytes: Uint8Array;
      if (exportScope) {
        // 1. Live PDFium Export with all active/imported annotations
        const task = exportScope.saveAsCopy();
        const arrayBuffer = await task.toPromise();
        pdfBytes = new Uint8Array(arrayBuffer);
        // Burn custom ink strokes onto the exported PDF
        pdfBytes = await burnCustomInkOnPdfBytes(pdfBytes, customStrokes);
      } else {
        // 2. Standalone burning fallback using @cantoo/pdf-lib
        const curBuffer = await blob.arrayBuffer();
        const savedJson = (await ps.readAnnotations(projectId, pdfHash || documentId)) ?? "";
        pdfBytes = await burnAnnotationsWithPdfLib(curBuffer, savedJson, projectId, ps);
      }

      const annotatedBlob = new Blob([pdfBytes.buffer as ArrayBuffer], { type: "application/pdf" });
      const hash = await computeBlobSha256(annotatedBlob);
      const baseName = (documentTitle ?? "document").replace(/\.pdf$/i, "");
      const downloadName = `${baseName}-annotated.pdf`;

      // Save to ProjectService using canonical Task 20 signature: putFile(projectId, blob, meta, knownKey)
      await ps.putFile(
        projectId,
        annotatedBlob,
        {
          name: downloadName,
          mime: "application/pdf",
        },
        hash
      );

      // Trigger browser download
      const downloadUrl = URL.createObjectURL(annotatedBlob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = downloadName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(downloadUrl);
    } catch (err) {
      console.error("[PdfViewer] Download annotated PDF failed:", err);
    } finally {
      setIsDownloading(false);
    }
  };

  // Helper executing page operations and warning user that annotations do not carry over (PDF-6)
  const executePageOp = async (op: (curBytes: ArrayBuffer) => Promise<Uint8Array>) => {
    if (isOperatingPage) return;
    setIsOperatingPage(true);
    try {
      const curBuffer = await blob.arrayBuffer();
      const newBytes = await op(curBuffer);
      const newBlob = new Blob([newBytes.buffer as ArrayBuffer], { type: "application/pdf" });

      await onSaveRestructuredPdf?.(newBlob);
      onShowToast(t("pdf.restructuredWarning"));
    } catch (err) {
      console.error("[PdfViewer] Page operation failed:", err);
      onShowToast(err instanceof Error ? err.message : String(err));
    } finally {
      setIsOperatingPage(false);
    }
  };

  const handleRotatePage = async () => {
    const curPage = displayPage || scrollState.currentPage || 1;
    const pageIdx = Math.max(0, curPage - 1);
    await executePageOp((bytes) => rotatePage(bytes, pageIdx, 90));
  };

  const handleMovePageUp = async () => {
    const curPage = displayPage || scrollState.currentPage || 1;
    if (curPage <= 1) return;
    const total = scrollState.totalPages || 1;
    const newOrder = Array.from({ length: total }, (_, i) => i);
    const fromIdx = curPage - 1;
    const toIdx = fromIdx - 1;
    [newOrder[fromIdx], newOrder[toIdx]] = [newOrder[toIdx], newOrder[fromIdx]];

    await executePageOp((bytes) => reorderPages(bytes, newOrder));
  };

  const handleMovePageDown = async () => {
    const curPage = displayPage || scrollState.currentPage || 1;
    const total = scrollState.totalPages || 1;
    if (curPage >= total) return;
    const newOrder = Array.from({ length: total }, (_, i) => i);
    const fromIdx = curPage - 1;
    const toIdx = fromIdx + 1;
    [newOrder[fromIdx], newOrder[toIdx]] = [newOrder[toIdx], newOrder[fromIdx]];

    await executePageOp((bytes) => reorderPages(bytes, newOrder));
  };

  const handleDeletePage = async () => {
    const total = scrollState.totalPages || 1;
    if (total <= 1) {
      onShowToast(t("pdf.deletePageError"));
      return;
    }
    const curPage = displayPage || scrollState.currentPage || 1;
    const pageIdx = Math.max(0, curPage - 1);
    await executePageOp((bytes) => deletePage(bytes, pageIdx));
  };

  const handleInsertImagePage = async (file: File) => {
    const curPage = displayPage || scrollState.currentPage || 1;
    const imgBuffer = await file.arrayBuffer();
    await executePageOp((bytes) => insertImagePage(bytes, imgBuffer, file.type, curPage));
  };

  return (
    <div
      ref={viewerContainerRef}
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        position: "relative",
      }}
    >
      {selectedText && selectionPos && (
        <button
          type="button"
          data-testid="pdf-selection-to-board-btn"
          onClick={() => {
            if (!hasBoardTab || isSendingSelection) return;
            handleSendSelectionToBoard();
          }}
          disabled={!hasBoardTab || isSendingSelection}
          title={!hasBoardTab ? t("pdf.sendToBoardNoBoardOpen") : t("pdf.selectionSendToBoard")}
          style={{
            position: "absolute",
            top: `${selectionPos.top}px`,
            left: `${selectionPos.left}px`,
            zIndex: 100,
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--space-1)",
            padding: "var(--space-1) var(--space-2)",
            backgroundColor: "var(--btn-primary-bg)",
            color: "var(--btn-primary-text)",
            border: "1px solid var(--border-card)",
            borderRadius: "var(--radius-md)",
            boxShadow: "var(--shadow-2)",
            fontSize: "0.8125rem",
            fontWeight: "var(--weight-medium)",
            cursor: (!hasBoardTab || isSendingSelection) ? (!hasBoardTab ? "not-allowed" : "wait") : "pointer",
            opacity: !hasBoardTab ? 0.45 : 1,
            userSelect: "none",
            transition: "transform var(--motion-fast) var(--ease-standard), opacity var(--motion-fast) var(--ease-standard)",
          }}
        >
          <span>📝</span>
          <span>{t("pdf.selectionSendToBoard")}</span>
        </button>
      )}

      <PdfToolbar
        documentTitle={documentTitle}
        currentPage={displayPage || scrollState.currentPage || 1}
        totalPages={scrollState.totalPages || 1}
        showThumbnails={showThumbnails}
        onToggleThumbnails={() => setShowThumbnails((prev) => !prev)}
        onPrevPage={handlePrevPage}
        onNextPage={handleNextPage}
        onDownloadAnnotated={handleDownloadAnnotated}
        isDownloading={isDownloading}
        onSendToBoard={handleSendToBoard}
        isSendingToBoard={isSendingToBoard}
        hasBoardTab={hasBoardTab}
      />

      <div
        style={{
          display: "flex",
          flex: 1,
          minHeight: 0,
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Thumbnail drawer */}
        {showThumbnails && (
          <aside
            data-testid="pdf-thumbnails-pane"
            style={{
              width: "calc(var(--space-16) * 1.25)",
              height: "100%",
              borderInlineEnd: "1px solid var(--border-card)",
              backgroundColor: "var(--bg-subtle)",
              flexShrink: 0,
              boxSizing: "border-box",
            }}
          >
            <ThumbnailsPane documentId={documentId} style={{ height: "100%" }}>
              {(meta) => (
                <div
                  key={meta.pageIndex}
                  data-testid={`thumb-page-${meta.pageIndex + 1}`}
                  onClick={() =>
                    scrollScope?.scrollToPage({ pageNumber: meta.pageIndex + 1 })
                  }
                  style={{
                    position: "absolute",
                    top: meta.top,
                    left: 0,
                    right: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    cursor: "pointer",
                    padding: "var(--space-8)",
                    boxSizing: "border-box",
                  }}
                >
                  <ThumbImg
                    documentId={documentId}
                    meta={meta}
                    style={{
                      border:
                        displayPage === meta.pageIndex + 1
                          ? "2px solid var(--brand-primary)"
                          : "1px solid var(--border-card)",
                      borderRadius: "var(--radius-sm)",
                      boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
                    }}
                  />
                  <span
                    style={{
                      fontSize: "12px",
                      marginTop: "var(--space-8)",
                      color:
                        displayPage === meta.pageIndex + 1
                          ? "var(--brand-primary)"
                          : "var(--text-muted)",
                      fontWeight: displayPage === meta.pageIndex + 1 ? 600 : 400,
                    }}
                  >
                    {meta.pageIndex + 1}
                  </span>
                </div>
              )}
            </ThumbnailsPane>
          </aside>
        )}

        {/* Canvas container hosting floating vertical toolbar and Viewport */}
        <div
          ref={canvasContainerRef}
          data-testid="pdf-canvas-container"
          style={{
            position: "relative",
            flex: 1,
            width: "100%",
            height: "100%",
            minWidth: 0,
            marginInline: "auto",
            direction: "ltr",
            overflow: "hidden",
            boxSizing: "border-box",
          }}
        >
          {/* Viewport with Canvas Render, Selection, and Annotation Layers */}
          <Viewport
            documentId={documentId}
            style={{
              width: "100%",
              height: "100%",
              marginInline: "auto",
              direction: "ltr",
              position: "relative",
              zIndex: 1,
            }}
          >
            <Scroller
              documentId={documentId}
              renderPage={(page) => {
                const docPage = docState?.document?.pages?.[page.pageIndex];
                const docScale = docState?.scale ?? zoomState.currentZoomLevel ?? 1;
                const docRotation = ((docPage?.rotation ?? 0) + (docState?.rotation ?? 0)) % 4;
                const isRotated90or270 = docRotation % 2 === 1;
                const unscaledWidth = docPage?.size
                  ? (isRotated90or270 ? docPage.size.height : docPage.size.width)
                  : (docScale > 0 ? page.rotatedWidth / docScale : (page.rotatedWidth || page.width));
                const unscaledHeight = docPage?.size
                  ? (isRotated90or270 ? docPage.size.width : docPage.size.height)
                  : (docScale > 0 ? page.rotatedHeight / docScale : (page.rotatedHeight || page.height));

                return (
                  <PagePointerProvider
                    key={page.pageIndex}
                    documentId={documentId}
                    pageIndex={page.pageIndex}
                    data-testid={`pdf-page-${page.pageIndex + 1}`}
                    style={{
                      position: "relative",
                      width: "100%",
                      height: "100%",
                      boxShadow: "0 4px 16px rgba(0, 0, 0, 0.15)",
                      backgroundColor: "#ffffff",
                      boxSizing: "border-box",
                      direction: "ltr",
                      overflow: "visible",
                    }}
                  >
                    <RenderLayer
                      documentId={documentId}
                      pageIndex={page.pageIndex}
                      style={{
                        display: "block",
                        width: "100%",
                        height: "100%",
                        pointerEvents: "none",
                        userSelect: "none",
                      }}
                    />
                    <PdfTextLayer
                      documentId={documentId}
                      pageIndex={page.pageIndex}
                      isAnnotating={activeTool !== "select"}
                    />
                    <SelectionLayer
                      documentId={documentId}
                      pageIndex={page.pageIndex}
                    />
                    <AnnotationLayer
                      documentId={documentId}
                      pageIndex={page.pageIndex}
                      customAnnotationRenderer={renderCustomAnnotation as any}
                      style={{
                        position: "absolute",
                        inset: 0,
                        pointerEvents: "none",
                        direction: "ltr",
                        overflow: "visible",
                      }}
                    />
                    <PdfCustomInkLayer
                      pageIndex={page.pageIndex}
                      pageWidth={unscaledWidth}
                      pageHeight={unscaledHeight}
                      isActive={activeTool === "ink"}
                      isSelectMode={activeTool === "select"}
                      isStampMode={activeTool === "stamp"}
                      onStampClick={handlePageStampClick}
                      strokes={customStrokes[page.pageIndex] || []}
                      selectedStrokeIds={selectedStrokeIds}
                      onSelectStrokes={setSelectedStrokeIds}
                      onAddStroke={handleAddCustomStroke}
                      onMoveStroke={handleMoveCustomStroke}
                      onMoveStrokes={handleMoveCustomStrokes}
                      objects={getObjectsForPage(page.pageIndex)}
                      onMoveObject={handleMoveObject}
                      onResizeObject={handleResizeObject}
                      annotationScope={annotationScope}
                    />
                  </PagePointerProvider>
                );
              }}
            />
          </Viewport>

          {/* Floating Vertical Toolbar (PDF Annotation, Zoom Controls, Page Operations) */}
          <PdfFloatingToolbar
            activeTool={activeTool}
            canUndo={canUndo}
            canRedo={canRedo}
            onSelectTool={handleSelectTool}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onAddStamp={handleAddStamp}
            zoomLevel={zoomState.currentZoomLevel || 1.0}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onResetZoom={handleResetZoom}
            currentPage={displayPage || scrollState.currentPage || 1}
            totalPages={scrollState.totalPages || 1}
            onRotatePage={handleRotatePage}
            onMovePageUp={handleMovePageUp}
            onMovePageDown={handleMovePageDown}
            onDeletePage={handleDeletePage}
            onInsertImagePage={handleInsertImagePage}
            isOperatingPage={isOperatingPage}
          />

          {/* Hidden file input for stamp image selection triggered on PDF page click (PDF-3) */}
          <input
            ref={stampFileInputRef}
            type="file"
            accept="image/png,image/jpeg"
            data-testid="pdf-stamp-input"
            style={{ display: "none" }}
            onChange={handleStampFileInputChange}
          />
        </div>
      </div>
    </div>
  );
}

export function PdfViewer({
  documentId,
  blob,
  documentTitle,
  initialPage = 1,
  onPageChange,
  projectId,
  pdfHash,
  tabId,
  itemId,
  projectServiceOverride,
  onSaveRestructuredPdf,
  onShowToast,
  hasBoardTab = true,
}: PdfViewerProps) {
  const { t } = useI18n();

  // PDFium WASM engine loaded lazily here on first PDF open
  const { engine, isLoading: engineLoading, error: engineError } = usePdfiumEngine({
    wasmUrl: "/wasm/pdfium.wasm",
    worker: false,
  });

  const [isDocumentReady, setIsDocumentReady] = useState(false);
  const [docLoadError, setDocLoadError] = useState<string | null>(null);
  const [prevDocId, setPrevDocId] = useState(documentId);
  if (documentId !== prevDocId) {
    setPrevDocId(documentId);
    setIsDocumentReady(false);
    setDocLoadError(null);
  }
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string) => {
    if (onShowToast) {
      onShowToast(message);
      return;
    }
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToastMessage(message);
    toastTimerRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  // Maintain Blob URL reference
  const objectUrl = useMemo(() => {
    return URL.createObjectURL(blob);
  }, [blob]);

  useEffect(() => {
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  const handleInitialized = async (reg: PluginRegistry) => {
    try {
      const eng = reg.getEngine();
      const store = reg.getStore();

      let doc: PdfDocumentObject;
      try {
        doc = await new Promise<PdfDocumentObject>((resolve, reject) => {
          const task = eng.openDocumentUrl(
            {
              id: documentId,
              url: objectUrl,
            },
            { normalizeRotation: true }
          );
          task.wait(resolve, (e) => reject(new Error(String(e.reason?.message ?? e))));
        });
      } catch (err) {
        // Fallback to array buffer if URL streaming is restricted
        const buffer = await blob.arrayBuffer();
        doc = await new Promise<PdfDocumentObject>((resolve, reject) => {
          const task = eng.openDocumentBuffer(
            {
              id: documentId,
              content: buffer,
            },
            { normalizeRotation: true }
          );
          task.wait(resolve, (e) => reject(new Error(String(e.reason?.message ?? e))));
        });
      }

      doc = {
        ...doc,
        normalizedRotation: true,
        pages: doc.pages.map((p) => ({
          ...p,
          rotation: 0,
        })),
      };

      store.dispatch(startLoadingDocument(documentId, documentTitle));
      store.dispatch(setDocumentLoaded(documentId, doc));
      setIsDocumentReady(true);
    } catch (err) {
      console.error("[PdfViewer] Document loading failed:", err);
      setDocLoadError(err instanceof Error ? err.message : String(err));
    }
  };

  if (engineError || docLoadError) {
    return (
      <div
        data-testid="pdf-error-state"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          padding: "var(--space-3)",
          color: "var(--danger-text)",
          gap: "var(--space-1)",
        }}
      >
        <p style={{ fontWeight: 600 }}>{t("pdf.loadError")}</p>
        <p style={{ fontSize: "12px", color: "var(--text-muted)" }}>
          {engineError?.message || docLoadError}
        </p>
      </div>
    );
  }

  if (engineLoading || !engine) {
    return (
      <div
        data-testid="pdf-loading-engine"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: "100%",
          color: "var(--text-muted)",
          fontSize: "14px",
        }}
      >
        {t("pdf.loadingDocument")}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        position: "relative",
      }}
      data-testid="pdf-viewer-root"
    >
      <EmbedPDF
        key={pdfHash || documentId}
        engine={engine}
        plugins={plugins}
        onInitialized={handleInitialized}
      >
        {isDocumentReady ? (
          <ViewerInner
            documentId={documentId}
            blob={blob}
            documentTitle={documentTitle}
            initialPage={initialPage}
            onPageChange={onPageChange}
            projectId={projectId}
            pdfHash={pdfHash}
            tabId={tabId}
            itemId={itemId}
            projectServiceOverride={projectServiceOverride}
            onSaveRestructuredPdf={onSaveRestructuredPdf}
            onShowToast={showToast}
            hasBoardTab={hasBoardTab}
          />
        ) : (
          <div
            data-testid="pdf-loading-doc"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: "100%",
              color: "var(--text-muted)",
              fontSize: "14px",
            }}
          >
            {t("pdf.loadingDocument")}
          </div>
        )}
      </EmbedPDF>

      {/* Warning toast notification (PDF-6) */}
      {toastMessage && !onShowToast && (
        <div
          role="alert"
          aria-live="polite"
          data-testid="pdf-restructure-toast"
          style={{
            position: "absolute",
            bottom: "var(--space-2)",
            insetInlineStart: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-main)",
            border: "1px solid var(--border-card)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-1) var(--space-2)",
            boxShadow: "var(--shadow-3)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            gap: "var(--space-1)",
            fontSize: "14px",
            fontWeight: 500,
            maxWidth: "calc(var(--space-8) * 4)",
            boxSizing: "border-box",
          }}
        >
          <span>⚠️</span>
          <span>{toastMessage}</span>
          <button
            type="button"
            onClick={() => setToastMessage(null)}
            aria-label="Close"
            data-testid="pdf-dismiss-toast"
            style={{
              border: "none",
              background: "transparent",
              color: "var(--text-muted)",
              cursor: "pointer",
              paddingInline: "var(--space-1)",
              fontSize: "16px",
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
}
