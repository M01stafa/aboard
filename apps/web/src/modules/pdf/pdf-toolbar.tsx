"use client";

import React, { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/provider";

export type AnnotationToolType = "select" | "highlight" | "ink" | "freeText" | "stamp";

export interface PdfToolbarProps {
  documentTitle?: string;
  currentPage: number;
  totalPages: number;
  zoomLevel: number;
  showThumbnails: boolean;
  onToggleThumbnails: () => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  // Annotation Tools (PDF-3, PDF-4)
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
  // Online Tools (Task 41 / PDFX-1..5)
  onRunOnlineTool?: (tool: "ocr" | "compress" | "office-to-pdf") => void;
  isProcessingOnlineTool?: boolean;
}

export function PdfToolbar({
  documentTitle,
  currentPage,
  totalPages,
  zoomLevel,
  showThumbnails,
  onToggleThumbnails,
  onPrevPage,
  onNextPage,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  activeTool = "select",
  canUndo = false,
  canRedo = false,
  onSelectTool,
  onUndo,
  onRedo,
  onAddStamp,
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
  onRunOnlineTool,
  isProcessingOnlineTool = false,
}: PdfToolbarProps) {
  const { t } = useI18n();
  const stampInputRef = useRef<HTMLInputElement>(null);
  const imagePageInputRef = useRef<HTMLInputElement>(null);
  const [showPageMenu, setShowPageMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const [showToolsMenu, setShowToolsMenu] = useState(false);
  const toolsMenuRef = useRef<HTMLDivElement>(null);

  const handleStampClick = () => {
    onSelectTool?.("stamp");
    stampInputRef.current?.click();
  };

  const handleStampFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onAddStamp?.(file);
    }
    if (stampInputRef.current) {
      stampInputRef.current.value = "";
    }
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

  // Close dropdown on click outside or escape key
  useEffect(() => {
    if (!showPageMenu) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowPageMenu(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowPageMenu(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showPageMenu]);

  // Close online tools dropdown on click outside or escape key
  useEffect(() => {
    if (!showToolsMenu) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (toolsMenuRef.current && !toolsMenuRef.current.contains(e.target as Node)) {
        setShowToolsMenu(false);
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setShowToolsMenu(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showToolsMenu]);

  const getToolButtonStyle = (tool: AnnotationToolType): React.CSSProperties => {
    const isActive = activeTool === tool;
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: "var(--space-1)",
      height: "var(--control-sm)",
      paddingInline: "var(--space-1)",
      borderRadius: "var(--radius-sm)",
      border: isActive ? "1px solid var(--btn-primary-bg)" : "1px solid var(--border-card)",
      backgroundColor: isActive ? "var(--btn-primary-bg)" : "var(--bg-surface)",
      color: isActive ? "var(--btn-primary-text)" : "var(--text-main)",
      cursor: "pointer",
      fontSize: "13px",
      fontWeight: isActive ? 600 : 500,
      fontFamily: "var(--font-sans)",
      transition: "background-color 150ms ease, color 150ms ease, border-color 150ms ease",
    };
  };

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
        overflowX: "auto",
        scrollbarWidth: "none",
      }}
    >
      {/* Hidden file input for stamp image selection */}
      <input
        type="file"
        ref={stampInputRef}
        onChange={handleStampFileChange}
        accept="image/png,image/jpeg"
        data-testid="pdf-stamp-input"
        style={{ display: "none" }}
      />

      {/* Hidden file input for image page insertion */}
      <input
        type="file"
        ref={imagePageInputRef}
        onChange={handleImagePageChange}
        accept="image/png,image/jpeg"
        data-testid="pdf-insert-image-input"
        style={{ display: "none" }}
      />

      {/* Group 1: Navigation & View Controls */}
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

        {/* Document Title (Optional) */}
        {documentTitle && (
          <span
            data-testid="pdf-document-title"
            style={{
              fontSize: "13px",
              fontWeight: 500,
              maxWidth: "calc(var(--space-8) * 2)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              marginInlineStart: "var(--space-1)",
              color: "var(--text-muted)",
            }}
            title={documentTitle}
          >
            {documentTitle}
          </span>
        )}

        {/* Divider */}
        <div
          style={{
            width: "1px",
            height: "var(--space-3)",
            backgroundColor: "var(--border-card)",
            marginInline: "var(--space-1)",
          }}
        />

        {/* Zoom Out */}
        <button
          type="button"
          onClick={onZoomOut}
          aria-label={t("pdf.zoomOut")}
          title={t("pdf.zoomOut")}
          data-testid="pdf-zoom-out"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "var(--control-sm)",
            height: "var(--control-sm)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-card)",
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-main)",
            cursor: "pointer",
            transition: "background-color 150ms ease",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>

        {/* Zoom Reset / Level Display */}
        <button
          type="button"
          onClick={onResetZoom}
          aria-label={t("pdf.resetZoom")}
          title={t("pdf.resetZoom")}
          data-testid="pdf-zoom-level"
          dir="ltr"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: "var(--space-6)",
            height: "var(--control-sm)",
            paddingInline: "var(--space-1)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-card)",
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-main)",
            cursor: "pointer",
            fontSize: "13px",
            fontVariantNumeric: "tabular-nums",
            fontFamily: "var(--font-sans)",
            transition: "background-color 150ms ease",
          }}
        >
          {Math.round(zoomLevel * 100)}%
        </button>

        {/* Zoom In */}
        <button
          type="button"
          onClick={onZoomIn}
          aria-label={t("pdf.zoomIn")}
          title={t("pdf.zoomIn")}
          data-testid="pdf-zoom-in"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "var(--control-sm)",
            height: "var(--control-sm)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-card)",
            backgroundColor: "var(--bg-surface)",
            color: "var(--text-main)",
            cursor: "pointer",
            transition: "background-color 150ms ease",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>
      </div>

      {/* Group 2: Annotation Tools & History (PDF-3, PDF-4) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-1)",
          flexWrap: "nowrap",
        }}
      >
        {/* Select Tool */}
        <button
          type="button"
          onClick={() => onSelectTool?.("select")}
          data-testid="pdf-tool-select"
          style={getToolButtonStyle("select")}
          title={t("pdf.toolSelect")}
          aria-label={t("pdf.toolSelect")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3l7 18 3-7 7-3L3 3z" />
          </svg>
          <span>{t("pdf.toolSelect")}</span>
        </button>

        {/* Highlight Tool */}
        <button
          type="button"
          onClick={() => onSelectTool?.("highlight")}
          data-testid="pdf-tool-highlight"
          style={getToolButtonStyle("highlight")}
          title={t("pdf.toolHighlight")}
          aria-label={t("pdf.toolHighlight")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 11-6 6v3h3l6-6" />
            <path d="m22 7-4.5-4.5a2.12 2.12 0 0 0-3 0L10 7l4 4 4.5-4.5a2.12 2.12 0 0 0 0-3Z" />
          </svg>
          <span>{t("pdf.toolHighlight")}</span>
        </button>

        {/* Ink Tool */}
        <button
          type="button"
          onClick={() => onSelectTool?.("ink")}
          data-testid="pdf-tool-ink"
          style={getToolButtonStyle("ink")}
          title={t("pdf.toolInk")}
          aria-label={t("pdf.toolInk")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
          <span>{t("pdf.toolInk")}</span>
        </button>

        {/* Text Tool */}
        <button
          type="button"
          onClick={() => onSelectTool?.("freeText")}
          data-testid="pdf-tool-text"
          style={getToolButtonStyle("freeText")}
          title={t("pdf.toolText")}
          aria-label={t("pdf.toolText")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 7 4 4 20 4 20 7" />
            <line x1="12" y1="4" x2="12" y2="20" />
          </svg>
          <span>{t("pdf.toolText")}</span>
        </button>

        {/* Stamp Tool */}
        <button
          type="button"
          onClick={handleStampClick}
          data-testid="pdf-tool-stamp"
          style={getToolButtonStyle("stamp")}
          title={t("pdf.toolStamp")}
          aria-label={t("pdf.toolStamp")}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 22h14" />
            <path d="M19.27 13.73A2.5 2.5 0 0 0 17.5 13h-11a2.5 2.5 0 0 0-1.77.73l-1.5 1.5A1 1 0 0 0 4 17v2h16v-2a1 1 0 0 0-.23-.67l-1.5-1.6Z" />
            <path d="M14 13V8a2 2 0 0 0-4 0v5" />
          </svg>
          <span>{t("pdf.toolStamp")}</span>
        </button>

        {/* Divider */}
        <div
          style={{
            width: "1px",
            height: "var(--space-3)",
            backgroundColor: "var(--border-card)",
            marginInline: "var(--space-1)",
          }}
        />

        {/* Undo */}
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label={t("pdf.undo")}
          title={t("pdf.undo")}
          data-testid="pdf-undo-button"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--space-1)",
            height: "var(--control-sm)",
            paddingInline: "var(--space-1)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-card)",
            backgroundColor: canUndo ? "var(--bg-surface)" : "var(--bg-subtle)",
            color: canUndo ? "var(--text-main)" : "var(--text-muted)",
            cursor: canUndo ? "pointer" : "not-allowed",
            fontSize: "13px",
            fontWeight: 500,
            fontFamily: "var(--font-sans)",
            transition: "background-color 150ms ease",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v6h6" />
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
          </svg>
          <span>{t("pdf.undo")}</span>
        </button>

        {/* Redo */}
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label={t("pdf.redo")}
          title={t("pdf.redo")}
          data-testid="pdf-redo-button"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--space-1)",
            height: "var(--control-sm)",
            paddingInline: "var(--space-1)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-card)",
            backgroundColor: canRedo ? "var(--bg-surface)" : "var(--bg-subtle)",
            color: canRedo ? "var(--text-main)" : "var(--text-muted)",
            cursor: canRedo ? "pointer" : "not-allowed",
            fontSize: "13px",
            fontWeight: 500,
            fontFamily: "var(--font-sans)",
            transition: "background-color 150ms ease",
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 7v6h-6" />
            <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
          </svg>
          <span>{t("pdf.redo")}</span>
        </button>
      </div>

      {/* Group 3: Operations, Online Tools & Export */}
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
            onClick={() => setShowPageMenu((prev) => !prev)}
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
            onClick={() => setShowToolsMenu((prev) => !prev)}
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
          onClick={onSendToBoard}
          disabled={isSendingToBoard}
          aria-label={t("pdf.sendToBoard")}
          title={t("pdf.sendToBoard")}
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
            cursor: isSendingToBoard ? "wait" : "pointer",
            fontSize: "13px",
            fontWeight: 500,
            gap: "var(--space-1)",
            fontFamily: "var(--font-sans)",
            transition: "background-color 150ms ease",
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
