"use client";

import React from "react";
import { useI18n } from "@/i18n/provider";

export type AnnotationToolType = "select" | "highlight" | "ink" | "freeText" | "text" | "stamp" | "sticky";

export interface PdfToolbarProps {
  documentTitle?: string;
  currentPage: number;
  totalPages: number;
  showThumbnails: boolean;
  onToggleThumbnails: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  // Optional props for backwards compatibility
  zoomLevel?: number;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onResetZoom?: () => void;
  activeTool?: AnnotationToolType;
  canUndo?: boolean;
  canRedo?: boolean;
  onSelectTool?: (tool: AnnotationToolType) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onAddStamp?: (file: File) => void;
  onRotatePage?: () => void;
  onMovePageUp?: () => void;
  onMovePageDown?: () => void;
  onDeletePage?: () => void;
  onInsertImagePage?: (file: File) => void;
  isOperatingPage?: boolean;
  // Annotated Download & Export (PDF-5)
  onDownloadAnnotated?: () => void;
  isDownloading?: boolean;
  // Cross-Tool Integration (INT-1)
  onSendToBoard?: () => void;
  isSendingToBoard?: boolean;
  hasBoardTab?: boolean;
}

export function PdfToolbar({
  documentTitle,
  currentPage,
  totalPages,
  showThumbnails,
  onToggleThumbnails,
  onPrevPage,
  onNextPage,
  onDownloadAnnotated,
  isDownloading = false,
  onSendToBoard,
  isSendingToBoard = false,
  hasBoardTab = true,
}: PdfToolbarProps) {
  const { t } = useI18n();

  return (
    <header
      className="pdf-toolbar"
      role="toolbar"
      aria-label="PDF Document Toolbar"
      data-testid="pdf-toolbar"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: "var(--space-6)",
        paddingInline: "var(--space-2)",
        backgroundColor: "var(--bg-surface)",
        borderBottom: "1px solid var(--border-card)",
        color: "var(--text-main)",
        boxSizing: "border-box",
        gap: "var(--space-1)",
        userSelect: "none",
        position: "relative",
        zIndex: 20,
      }}
    >
      {/* Start Group: Navigation & Document Metadata */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-1)",
          flexShrink: 0,
        }}
      >
        {/* Toggle Thumbnails */}
        <button
          type="button"
          onClick={onToggleThumbnails}
          aria-label={t("pdf.toggleThumbnails")}
          title={t("pdf.toggleThumbnails")}
          data-testid="pdf-thumbnails-toggle"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "var(--control-sm)",
            height: "var(--control-sm)",
            borderRadius: "var(--radius-sm)",
            border: showThumbnails ? "1px solid var(--accent-text)" : "1px solid var(--border-card)",
            backgroundColor: showThumbnails ? "var(--btn-outline-hover-bg)" : "var(--bg-surface)",
            color: showThumbnails ? "var(--accent-text-strong)" : "var(--text-main)",
            cursor: "pointer",
            transition: "background-color 150ms ease, border-color 150ms ease",
          }}
          onMouseEnter={(e) => {
            if (!showThumbnails) {
              e.currentTarget.style.backgroundColor = "var(--btn-outline-hover-bg)";
            }
          }}
          onMouseLeave={(e) => {
            if (!showThumbnails) {
              e.currentTarget.style.backgroundColor = "var(--bg-surface)";
            }
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        </button>

        {/* Page Stepper: < Page/Total > locked to LTR layout */}
        <div
          dir="ltr"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--space-1)",
            direction: "ltr",
          }}
        >
          {/* Previous Page */}
          <button
            type="button"
            onClick={onPrevPage}
            disabled={currentPage <= 1}
            aria-label={t("pdf.prevPage")}
            title={t("pdf.prevPage")}
            data-testid="pdf-prev-page"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "var(--control-sm)",
              height: "var(--control-sm)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-card)",
              backgroundColor: currentPage <= 1 ? "var(--bg-subtle)" : "var(--bg-surface)",
              color: currentPage <= 1 ? "var(--text-muted)" : "var(--text-main)",
              cursor: currentPage <= 1 ? "not-allowed" : "pointer",
              transition: "background-color 150ms ease",
            }}
            onMouseEnter={(e) => {
              if (currentPage > 1) {
                e.currentTarget.style.backgroundColor = "var(--btn-outline-hover-bg)";
              }
            }}
            onMouseLeave={(e) => {
              if (currentPage > 1) {
                e.currentTarget.style.backgroundColor = "var(--bg-surface)";
              }
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          {/* Page Indicator */}
          <span
            data-testid="pdf-page-display"
            dir="ltr"
            style={{
              fontSize: "13px",
              fontWeight: 500,
              minWidth: "var(--space-6)",
              textAlign: "center",
              fontVariantNumeric: "tabular-nums",
              color: "var(--text-main)",
              fontFamily: "var(--font-sans)",
            }}
          >
            {currentPage} / {totalPages || 1}
          </span>

          {/* Next Page */}
          <button
            type="button"
            onClick={onNextPage}
            disabled={currentPage >= totalPages}
            aria-label={t("pdf.nextPage")}
            title={t("pdf.nextPage")}
            data-testid="pdf-next-page"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "var(--control-sm)",
              height: "var(--control-sm)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-card)",
              backgroundColor: currentPage >= totalPages ? "var(--bg-subtle)" : "var(--bg-surface)",
              color: currentPage >= totalPages ? "var(--text-muted)" : "var(--text-main)",
              cursor: currentPage >= totalPages ? "not-allowed" : "pointer",
              transition: "background-color 150ms ease",
            }}
            onMouseEnter={(e) => {
              if (currentPage < totalPages) {
                e.currentTarget.style.backgroundColor = "var(--btn-outline-hover-bg)";
              }
            }}
            onMouseLeave={(e) => {
              if (currentPage < totalPages) {
                e.currentTarget.style.backgroundColor = "var(--bg-surface)";
              }
            }}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        {/* Divider */}
        {documentTitle && (
          <div
            style={{
              width: "1px",
              height: "var(--space-3)",
              backgroundColor: "var(--border-card)",
              marginInline: "var(--space-1)",
            }}
          />
        )}

        {/* Document Title (Optional) */}
        {documentTitle && (
          <span
            data-testid="pdf-document-title"
            style={{
              fontSize: "13px",
              fontWeight: 500,
              maxWidth: "calc(var(--space-8) * 3)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              color: "var(--text-muted)",
            }}
            title={documentTitle}
          >
            {documentTitle}
          </span>
        )}
      </div>

      {/* End Group: Top-Level Document Actions */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-1)",
          flexShrink: 0,
        }}
      >
        {/* Send to Board Button (INT-1) */}
        <button
          type="button"
          onClick={() => {
            if (!hasBoardTab || isSendingToBoard) return;
            onSendToBoard?.();
          }}
          disabled={!hasBoardTab || isSendingToBoard}
          aria-label={t("pdf.sendToBoard")}
          title={!hasBoardTab ? t("pdf.sendToBoardNoBoardOpen") : t("pdf.sendToBoard")}
          data-testid="pdf-send-to-board-btn"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            height: "var(--control-sm)",
            paddingInline: "var(--space-1)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-card)",
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-main)",
            cursor: (!hasBoardTab || isSendingToBoard) ? (!hasBoardTab ? "not-allowed" : "wait") : "pointer",
            opacity: !hasBoardTab ? 0.45 : 1,
            fontSize: "13px",
            fontWeight: 500,
            gap: "var(--space-1)",
            fontFamily: "var(--font-sans)",
            transition: "background-color 150ms ease, opacity 150ms ease",
          }}
          onMouseEnter={(e) => {
            if (hasBoardTab && !isSendingToBoard) {
              e.currentTarget.style.backgroundColor = "var(--btn-outline-hover-bg)";
            }
          }}
          onMouseLeave={(e) => {
            if (hasBoardTab && !isSendingToBoard) {
              e.currentTarget.style.backgroundColor = "var(--bg-surface)";
            }
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="8" y1="12" x2="16" y2="12" />
            <line x1="12" y1="8" x2="12" y2="16" />
          </svg>
          <span>{isSendingToBoard ? t("pdf.sendingToBoard") : t("pdf.sendToBoard")}</span>
        </button>

        {/* Download Annotated PDF (PDF-5) */}
        <button
          type="button"
          onClick={onDownloadAnnotated}
          disabled={isDownloading}
          aria-label={t("pdf.downloadAnnotated")}
          title={t("pdf.downloadAnnotated")}
          data-testid="pdf-download-btn"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            height: "var(--control-sm)",
            paddingInline: "var(--space-1)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-card)",
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-main)",
            cursor: isDownloading ? "wait" : "pointer",
            fontSize: "13px",
            fontWeight: 500,
            gap: "var(--space-1)",
            fontFamily: "var(--font-sans)",
            transition: "background-color 150ms ease",
          }}
          onMouseEnter={(e) => {
            if (!isDownloading) {
              e.currentTarget.style.backgroundColor = "var(--btn-outline-hover-bg)";
            }
          }}
          onMouseLeave={(e) => {
            if (!isDownloading) {
              e.currentTarget.style.backgroundColor = "var(--bg-surface)";
            }
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <span>{isDownloading ? t("pdf.downloading") : t("pdf.downloadAnnotated")}</span>
        </button>
      </div>
    </header>
  );
}
