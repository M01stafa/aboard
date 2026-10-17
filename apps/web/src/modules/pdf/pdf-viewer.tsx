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
import { RenderLayer } from "@embedpdf/plugin-render/react";
import { ScrollPluginPackage } from "@embedpdf/plugin-scroll";
import { Scroller, useScroll } from "@embedpdf/plugin-scroll/react";
import { ViewportPluginPackage } from "@embedpdf/plugin-viewport";
import { Viewport } from "@embedpdf/plugin-viewport/react";
import { ZoomPluginPackage } from "@embedpdf/plugin-zoom";
import { useZoom } from "@embedpdf/plugin-zoom/react";
import { ThumbnailPluginPackage } from "@embedpdf/plugin-thumbnail";
import { ThumbnailsPane, ThumbImg } from "@embedpdf/plugin-thumbnail/react";
import type { PdfDocumentObject } from "@embedpdf/models";
import { useI18n } from "@/i18n/provider";
import { PdfToolbar } from "./pdf-toolbar";

export interface PdfViewerProps {
  documentId: string;
  blob: Blob;
  documentTitle?: string;
  initialPage?: number;
  onPageChange: (page: number) => void;
}

const plugins = [
  { package: RenderPluginPackage },
  { package: ScrollPluginPackage },
  { package: ViewportPluginPackage },
  { package: ZoomPluginPackage },
  { package: ThumbnailPluginPackage },
] as unknown as PluginBatchRegistrations;

interface ViewerInnerProps {
  documentId: string;
  documentTitle?: string;
  initialPage: number;
  onPageChange: (page: number) => void;
}

function ViewerInner({
  documentId,
  documentTitle,
  initialPage,
  onPageChange,
}: ViewerInnerProps) {
  const { provides: scrollScope, state: scrollState } = useScroll(documentId);
  const { provides: zoomScope, state: zoomState } = useZoom(documentId);
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [displayPage, setDisplayPage] = useState(initialPage);
  const hasRestoredPageRef = useRef(false);
  const isSettledRef = useRef(initialPage <= 1);

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
              width: "160px",
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
                      width: `${meta.width}px`,
                      height: `${meta.height}px`,
                      boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                      borderRadius: "var(--radius-sm)",
                      border:
                        scrollState.currentPage === meta.pageIndex + 1
                          ? "2px solid var(--accent-text)"
                          : "1px solid var(--border-card)",
                    }}
                  />
                  <span
                    dir="ltr"
                    style={{
                      fontSize: "12px",
                      color: "var(--text-muted)",
                      marginTop: "var(--space-8)",
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {meta.pageIndex + 1}
                  </span>
                </div>
              )}
            </ThumbnailsPane>
          </aside>
        )}

        {/* Main PDF canvas view */}
        <Viewport
          documentId={documentId}
          data-testid="pdf-viewport"
          style={{
            flex: 1,
            width: "100%",
            height: "100%",
            overflow: "auto",
            backgroundColor: "var(--bg-body)",
            boxSizing: "border-box",
          }}
        >
          <Scroller
            documentId={documentId}
            renderPage={(layout) => (
              <div
                key={layout.pageNumber}
                data-page-number={layout.pageNumber}
                data-testid={`pdf-page-${layout.pageNumber}`}
                style={{
                  position: "relative",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
                  backgroundColor: "#ffffff",
                  width: `${layout.rotatedWidth}px`,
                  height: `${layout.rotatedHeight}px`,
                }}
              >
                <RenderLayer
                  documentId={documentId}
                  pageIndex={layout.pageIndex}
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
}: PdfViewerProps) {
  const { t } = useI18n();

  // PDFium WASM engine loaded lazily here on first PDF open
  const { engine, isLoading: engineLoading, error: engineError } = usePdfiumEngine({
    wasmUrl: "/wasm/pdfium.wasm",
    worker: false,
  });

  const [isDocumentReady, setIsDocumentReady] = useState(false);
  const [docLoadError, setDocLoadError] = useState<string | null>(null);

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
        engine={engine}
        plugins={plugins}
        onInitialized={handleInitialized}
      >
        {isDocumentReady ? (
          <ViewerInner
            documentId={documentId}
            documentTitle={documentTitle}
            initialPage={initialPage}
            onPageChange={onPageChange}
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
    </div>
  );
}
