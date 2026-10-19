"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { EmbedPDF } from "@embedpdf/core/react";
import { usePdfiumEngine } from "@embedpdf/engines/react";
import {
  PluginRegistry,
  PluginBatchRegistrations,
  startLoadingDocument,
  setDocumentLoaded,
} from "@embedpdf/core";
import { RenderPluginPackage } from "@embedpdf/plugin-render";
import { RenderLayer, useRenderCapability } from "@embedpdf/plugin-render/react";
import { bus } from "@/core/bus";
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
import { SelectionPluginPackage, SelectionLayer } from "@embedpdf/plugin-selection/react";
import { AnnotationPluginPackage, AnnotationLayer } from "@embedpdf/plugin-annotation/react";
import { HistoryPluginPackage } from "@embedpdf/plugin-history";
import { ExportPluginPackage, useExport } from "@embedpdf/plugin-export/react";
import type { PdfDocumentObject } from "@embedpdf/models";
import { projectService as defaultProjectService, type ProjectService } from "@/core/storage";
import { computeBlobSha256 } from "@/core/storage/sha256";
import { useI18n } from "@/i18n/provider";
import { PdfToolbar } from "./pdf-toolbar";
import { usePdfAnnotations } from "./use-pdf-annotations";
import {
  rotatePage,
  deletePage,
  reorderPages,
  insertImagePage,
  burnAnnotationsWithPdfLib,
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
  onSaveRestructuredPdf?: (newBlob: Blob) => Promise<void>;
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
  onSaveRestructuredPdf?: (newBlob: Blob) => Promise<void>;
  onShowToast: (message: string) => void;
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
}: ViewerInnerProps) {
  const { t } = useI18n();
  const ps = projectServiceOverride ?? defaultProjectService;
  const { provides: scrollScope, state: scrollState } = useScroll(documentId);
  const { provides: zoomScope, state: zoomState } = useZoom(documentId);
  const { provides: exportScope } = useExport(documentId);
  const { provides: renderCapability } = useRenderCapability();

  const [showThumbnails, setShowThumbnails] = useState(false);
  const [displayPage, setDisplayPage] = useState(initialPage);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isOperatingPage, setIsOperatingPage] = useState(false);
  const [isSendingToBoard, setIsSendingToBoard] = useState(false);

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
  } = usePdfAnnotations({
    documentId,
    projectId,
    pdfHash,
    currentPage: displayPage || scrollState.currentPage || 1,
    projectServiceOverride,
  });

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
      style={{
        display: "flex",
        flexDirection: "column",
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <PdfToolbar
        documentTitle={documentTitle}
        currentPage={displayPage || scrollState.currentPage || 1}
        totalPages={scrollState.totalPages || 1}
        zoomLevel={zoomState.currentZoomLevel || 1.0}
        showThumbnails={showThumbnails}
        onToggleThumbnails={() => setShowThumbnails((prev) => !prev)}
        onPrevPage={handlePrevPage}
        onNextPage={handleNextPage}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onResetZoom={handleResetZoom}
        activeTool={activeTool}
        canUndo={canUndo}
        canRedo={canRedo}
        onSelectTool={handleSelectTool}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onAddStamp={handleAddStamp}
        onDownloadAnnotated={handleDownloadAnnotated}
        isDownloading={isDownloading}
        onRotatePage={handleRotatePage}
        onMovePageUp={handleMovePageUp}
        onMovePageDown={handleMovePageDown}
        onDeletePage={handleDeletePage}
        onInsertImagePage={handleInsertImagePage}
        isOperatingPage={isOperatingPage}
        onSendToBoard={handleSendToBoard}
        isSendingToBoard={isSendingToBoard}
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

        {/* Viewport with Canvas Render, Selection, and Annotation Layers */}
        <Viewport documentId={documentId} style={{ flex: 1, height: "100%" }}>
          <Scroller
            documentId={documentId}
            renderPage={(page) => (
              <div
                key={page.pageIndex}
                data-testid={`pdf-page-${page.pageIndex + 1}`}
                style={{
                  position: "relative",
                  boxShadow: "0 4px 16px rgba(0, 0, 0, 0.15)",
                  backgroundColor: "#ffffff",
                  boxSizing: "border-box",
                }}
              >
                <RenderLayer
                  documentId={documentId}
                  pageIndex={page.pageIndex}
                />
                <SelectionLayer
                  documentId={documentId}
                  pageIndex={page.pageIndex}
                />
                <AnnotationLayer
                  documentId={documentId}
                  pageIndex={page.pageIndex}
                />
              </div>
            )}
          />
        </Viewport>
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
}: PdfViewerProps) {
  const { t } = useI18n();

  // PDFium WASM engine loaded lazily here on first PDF open
  const { engine, isLoading: engineLoading, error: engineError } = usePdfiumEngine({
    wasmUrl: "/wasm/pdfium.wasm",
    worker: false,
  });

  const [isDocumentReady, setIsDocumentReady] = useState(false);
  const [docLoadError, setDocLoadError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string) => {
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
          const task = eng.openDocumentUrl({
            id: documentId,
            url: objectUrl,
          });
          task.wait(resolve, (e) => reject(new Error(String(e.reason?.message ?? e))));
        });
      } catch (err) {
        // Fallback to array buffer if URL streaming is restricted
        const buffer = await blob.arrayBuffer();
        doc = await new Promise<PdfDocumentObject>((resolve, reject) => {
          const task = eng.openDocumentBuffer({
            id: documentId,
            content: buffer,
          });
          task.wait(resolve, (e) => reject(new Error(String(e.reason?.message ?? e))));
        });
      }

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
          padding: "var(--space-24)",
          color: "var(--danger-text, #ef4444)",
          gap: "var(--space-8)",
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
      {toastMessage && (
        <div
          role="alert"
          aria-live="polite"
          data-testid="pdf-restructure-toast"
          style={{
            position: "absolute",
            bottom: "var(--space-16)",
            left: "50%",
            transform: "translateX(-50%)",
            backgroundColor: "var(--slate-900, #0f172a)",
            color: "#ffffff",
            border: "1px solid var(--border-card)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-8) var(--space-16)",
            boxShadow: "0 8px 24px rgba(0, 0, 0, 0.3)",
            zIndex: 1000,
            display: "flex",
            alignItems: "center",
            gap: "var(--space-8)",
            fontSize: "14px",
            fontWeight: 500,
            maxWidth: "calc(var(--space-16) * 4)",
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
              color: "#ffffff",
              cursor: "pointer",
              padding: "0 var(--space-8)",
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
