"use client";

import React, { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/provider";

export type AnnotationToolType = "select" | "highlight" | "ink" | "freeText" | "stamp";

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
  // Task 30: Annotated Download & Page Operations (PDF-5, PDF-6)
  onDownloadAnnotated?: () => void;
  isDownloading?: boolean;
  onRotatePage?: () => void;
  onMovePageUp?: () => void;
  onMovePageDown?: () => void;
  onDeletePage?: () => void;
  onInsertImagePage?: (file: File) => void;
  isOperatingPage?: boolean;
  // Cross-Tool Integration (INT-1)
  onSendToBoard?: () => void;
  isSendingToBoard?: boolean;
  hasBoardTab?: boolean;
  // Online Tools (Task 41 / PDFX-1..5)
  onRunOnlineTool?: (tool: "ocr" | "compress" | "office-to-pdf") => void;
  isProcessingOnlineTool?: boolean;
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
  onRotatePage,
  onMovePageUp,
  onMovePageDown,
  onDeletePage,
  onInsertImagePage,
  isOperatingPage = false,
  onSendToBoard,
  isSendingToBoard = false,
  hasBoardTab = true,
  onRunOnlineTool,
  isProcessingOnlineTool = false,
}: PdfToolbarProps) {
  const { t } = useI18n();
  const imagePageInputRef = useRef<HTMLInputElement>(null);
  const [showPageMenu, setShowPageMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const toolsMenuRef = useRef<HTMLDivElement>(null);

  const togglePageMenu = () => {
    setShowPageMenu((prev) => {
      const next = !prev;
      if (next) setShowToolsMenu(false);
      return next;
    });
  };

  const toggleToolsMenu = () => {
    setShowToolsMenu((prev) => {
      const next = !prev;
      if (next) setShowPageMenu(false);
      return next;
    });
  };

  const handleImagePageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onInsertImagePage?.(file);
    }
    if (imagePageInputRef.current) {
      imagePageInputRef.current.value = "";
    }
    setShowPageMenu(false);
  };

  // Close dropdowns on click outside or escape key
  useEffect(() => {
    if (!showPageMenu && !showToolsMenu) return;

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (showPageMenu && menuRef.current && !menuRef.current.contains(target)) {
        setShowPageMenu(false);
      }
      if (showToolsMenu && toolsMenuRef.current && !toolsMenuRef.current.contains(target)) {
        setShowToolsMenu(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowPageMenu(false);
        setShowToolsMenu(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showPageMenu, showToolsMenu]);

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
        zIndex: 40,
        overflow: "visible",
      }}
    >
      {/* Hidden file input for image page insertion */}
      <input
        type="file"
        ref={imagePageInputRef}
        onChange={handleImagePageChange}
        accept="image/png,image/jpeg"
        data-testid="pdf-insert-image-input"
        style={{ display: "none" }}
      />

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
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        </button>

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
        >
          <svg
            className="icon-directional"
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
        >
          <svg
            className="icon-directional"
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

      {/* End Group: Actions & Tools Menus */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-1)",
          flexShrink: 0,
        }}
      >
        {/* Page Operations Dropdown Menu (PDF-6) */}
        <div ref={menuRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={togglePageMenu}
            aria-haspopup="true"
            aria-expanded={showPageMenu}
            aria-label={t("pdf.pageOperations")}
            title={t("pdf.pageOperations")}
            data-testid="pdf-page-operations-menu"
            disabled={isOperatingPage}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: "var(--control-sm)",
              paddingInline: "var(--space-1)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-card)",
              backgroundColor: showPageMenu ? "var(--bg-subtle)" : "var(--bg-surface)",
              color: "var(--text-main)",
              cursor: isOperatingPage ? "wait" : "pointer",
              fontSize: "13px",
              fontWeight: 500,
              gap: "var(--space-1)",
              fontFamily: "var(--font-sans)",
              transition: "background-color 150ms ease",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
            <span>{t("pdf.pageOperations")}</span>
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transform: showPageMenu ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 150ms ease",
              }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {showPageMenu && (
            <div
              role="menu"
              aria-label={t("pdf.pageOperations")}
              data-testid="pdf-page-operations-dropdown"
              style={{
                position: "absolute",
                top: "calc(100% + var(--space-1))",
                insetInlineEnd: 0,
                backgroundColor: "var(--bg-surface)",
                border: "1px solid var(--border-card)",
                borderRadius: "var(--radius-sm)",
                boxShadow: "var(--shadow-3)",
                zIndex: 100,
                minWidth: "calc(var(--space-8) * 3)",
                padding: "var(--space-1)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-1)",
              }}
            >
              {/* Rotate Page 90° */}
              <button
                type="button"
                role="menuitem"
                data-testid="pdf-rotate-page-btn"
                onClick={() => {
                  setShowPageMenu(false);
                  onRotatePage?.();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-1)",
                  height: "var(--control-sm)",
                  paddingInline: "var(--space-1)",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  backgroundColor: "transparent",
                  color: "var(--text-main)",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 500,
                  textAlign: "start",
                  fontFamily: "var(--font-sans)",
                  transition: "background-color 150ms ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--bg-subtle)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
                  <polyline points="21 3 21 8 16 8" />
                </svg>
                <span>{t("pdf.rotatePage")}</span>
              </button>

              {/* Move Page Up */}
              <button
                type="button"
                role="menuitem"
                data-testid="pdf-move-page-up-btn"
                disabled={currentPage <= 1}
                onClick={() => {
                  setShowPageMenu(false);
                  onMovePageUp?.();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-1)",
                  height: "var(--control-sm)",
                  paddingInline: "var(--space-1)",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  backgroundColor: "transparent",
                  color: currentPage <= 1 ? "var(--text-muted)" : "var(--text-main)",
                  cursor: currentPage <= 1 ? "not-allowed" : "pointer",
                  fontSize: "13px",
                  fontWeight: 500,
                  textAlign: "start",
                  fontFamily: "var(--font-sans)",
                  transition: "background-color 150ms ease",
                }}
                onMouseEnter={(e) => {
                  if (currentPage > 1) {
                    e.currentTarget.style.backgroundColor = "var(--bg-subtle)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="18 15 12 9 6 15" />
                </svg>
                <span>{t("pdf.movePageUp")}</span>
              </button>

              {/* Move Page Down */}
              <button
                type="button"
                role="menuitem"
                data-testid="pdf-move-page-down-btn"
                disabled={currentPage >= totalPages}
                onClick={() => {
                  setShowPageMenu(false);
                  onMovePageDown?.();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-1)",
                  height: "var(--control-sm)",
                  paddingInline: "var(--space-1)",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  backgroundColor: "transparent",
                  color: currentPage >= totalPages ? "var(--text-muted)" : "var(--text-main)",
                  cursor: currentPage >= totalPages ? "not-allowed" : "pointer",
                  fontSize: "13px",
                  fontWeight: 500,
                  textAlign: "start",
                  fontFamily: "var(--font-sans)",
                  transition: "background-color 150ms ease",
                }}
                onMouseEnter={(e) => {
                  if (currentPage < totalPages) {
                    e.currentTarget.style.backgroundColor = "var(--bg-subtle)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
                <span>{t("pdf.movePageDown")}</span>
              </button>

              {/* Insert Image as Page */}
              <button
                type="button"
                role="menuitem"
                data-testid="pdf-insert-image-btn"
                onClick={() => {
                  imagePageInputRef.current?.click();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-1)",
                  height: "var(--control-sm)",
                  paddingInline: "var(--space-1)",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  backgroundColor: "transparent",
                  color: "var(--text-main)",
                  cursor: "pointer",
                  fontSize: "13px",
                  fontWeight: 500,
                  textAlign: "start",
                  fontFamily: "var(--font-sans)",
                  transition: "background-color 150ms ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--bg-subtle)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span>{t("pdf.insertImagePage")}</span>
              </button>

              {/* Divider */}
              <div
                style={{
                  height: "1px",
                  backgroundColor: "var(--border-card)",
                  marginBlock: "var(--space-1)",
                }}
              />

              {/* Delete Page */}
              <button
                type="button"
                role="menuitem"
                data-testid="pdf-delete-page-btn"
                disabled={totalPages <= 1}
                onClick={() => {
                  setShowPageMenu(false);
                  onDeletePage?.();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-1)",
                  height: "var(--control-sm)",
                  paddingInline: "var(--space-1)",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  backgroundColor: "transparent",
                  color: totalPages <= 1 ? "var(--text-muted)" : "var(--danger-text)",
                  cursor: totalPages <= 1 ? "not-allowed" : "pointer",
                  fontSize: "13px",
                  fontWeight: 500,
                  textAlign: "start",
                  fontFamily: "var(--font-sans)",
                  transition: "background-color 150ms ease",
                }}
                onMouseEnter={(e) => {
                  if (totalPages > 1) {
                    e.currentTarget.style.backgroundColor = "var(--danger-bg)";
                  }
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="3 6 5 6 21 6" />
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                <span>{t("pdf.deletePage")}</span>
              </button>
            </div>
          )}
        </div>

        {/* Online Tools Dropdown Menu (Task 41 / PDFX-1..5) */}
        <div ref={toolsMenuRef} style={{ position: "relative" }}>
          <button
            type="button"
            onClick={toggleToolsMenu}
            aria-haspopup="true"
            aria-expanded={showToolsMenu}
            aria-label={t("pdf.toolsMenu")}
            title={t("pdf.toolsMenu")}
            data-testid="pdf-online-tools-menu"
            disabled={isProcessingOnlineTool}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: "var(--control-sm)",
              paddingInline: "var(--space-1)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-card)",
              backgroundColor: showToolsMenu ? "var(--bg-subtle)" : "var(--bg-surface)",
              color: "var(--text-main)",
              cursor: isProcessingOnlineTool ? "wait" : "pointer",
              fontSize: "13px",
              fontWeight: 500,
              gap: "var(--space-1)",
              fontFamily: "var(--font-sans)",
              transition: "background-color 150ms ease",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <span>{t("pdf.toolsMenu")}</span>
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{
                transform: showToolsMenu ? "rotate(180deg)" : "rotate(0deg)",
                transition: "transform 150ms ease",
              }}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>

          {showToolsMenu && (
            <div
              role="menu"
              aria-label={t("pdf.toolsMenu")}
              data-testid="pdf-online-tools-dropdown"
              style={{
                position: "absolute",
                top: "calc(100% + var(--space-1))",
                insetInlineEnd: 0,
                backgroundColor: "var(--bg-surface)",
                border: "1px solid var(--border-card)",
                borderRadius: "var(--radius-sm)",
                boxShadow: "var(--shadow-3)",
                zIndex: 100,
                minWidth: "calc(var(--space-8) * 4)",
                padding: "var(--space-1)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-1)",
              }}
            >
              {/* OCR */}
              <button
                type="button"
                role="menuitem"
                data-testid="pdf-tool-ocr-btn"
                onClick={() => {
                  setShowToolsMenu(false);
                  onRunOnlineTool?.("ocr");
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  padding: "var(--space-1)",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  backgroundColor: "transparent",
                  color: "var(--text-main)",
                  cursor: "pointer",
                  textAlign: "start",
                  gap: "var(--space-1)",
                  fontFamily: "var(--font-sans)",
                  transition: "background-color 150ms ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--bg-subtle)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <span style={{ fontWeight: 600, fontSize: "13px" }}>{t("pdf.toolOcr")}</span>
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  {t("pdf.toolOcrDesc")}
                </span>
              </button>

              {/* Compress */}
              <button
                type="button"
                role="menuitem"
                data-testid="pdf-tool-compress-btn"
                onClick={() => {
                  setShowToolsMenu(false);
                  onRunOnlineTool?.("compress");
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  padding: "var(--space-1)",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  backgroundColor: "transparent",
                  color: "var(--text-main)",
                  cursor: "pointer",
                  textAlign: "start",
                  gap: "var(--space-1)",
                  fontFamily: "var(--font-sans)",
                  transition: "background-color 150ms ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--bg-subtle)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <span style={{ fontWeight: 600, fontSize: "13px" }}>{t("pdf.toolCompress")}</span>
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  {t("pdf.toolCompressDesc")}
                </span>
              </button>

              {/* Office to PDF */}
              <button
                type="button"
                role="menuitem"
                data-testid="pdf-tool-office-btn"
                onClick={() => {
                  setShowToolsMenu(false);
                  onRunOnlineTool?.("office-to-pdf");
                }}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  padding: "var(--space-1)",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  backgroundColor: "transparent",
                  color: "var(--text-main)",
                  cursor: "pointer",
                  textAlign: "start",
                  gap: "var(--space-1)",
                  fontFamily: "var(--font-sans)",
                  transition: "background-color 150ms ease",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "var(--bg-subtle)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <span style={{ fontWeight: 600, fontSize: "13px" }}>{t("pdf.toolOfficeToPdf")}</span>
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  {t("pdf.toolOfficeToPdfDesc")}
                </span>
              </button>
            </div>
          )}
        </div>

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
