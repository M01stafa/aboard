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
}: PdfToolbarProps) {
  const { t } = useI18n();
  const stampInputRef = useRef<HTMLInputElement>(null);
  const imagePageInputRef = useRef<HTMLInputElement>(null);
  const [showPageMenu, setShowPageMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

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

  const getToolButtonStyle = (tool: AnnotationToolType): React.CSSProperties => {
    const isActive = activeTool === tool;
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      height: "32px",
      paddingInline: "var(--space-8)",
      borderRadius: "var(--radius-sm)",
      border: "1px solid var(--border-input)",
      backgroundColor: isActive ? "var(--accent-text)" : "var(--bg-subtle)",
      color: isActive ? "#ffffff" : "var(--text-main)",
      cursor: "pointer",
      fontSize: "14px",
      fontWeight: isActive ? 600 : 500,
    };
  };

  return (
    <header
      className="pdf-toolbar"
      data-testid="pdf-toolbar"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        height: "48px",
        paddingInline: "var(--space-16)",
        backgroundColor: "var(--bg-surface)",
        borderBottom: "1px solid var(--border-card)",
        color: "var(--text-main)",
        boxSizing: "border-box",
        gap: "var(--space-16)",
        userSelect: "none",
        position: "relative",
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

      {/* Left side: Thumbnails & Page Navigation */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-8)",
          flexShrink: 0,
        }}
      >
        <button
          type="button"
          onClick={onToggleThumbnails}
          aria-label={t("pdf.toggleThumbnails")}
          data-testid="pdf-thumbnails-toggle"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "32px",
            height: "32px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-input)",
            backgroundColor: showThumbnails ? "var(--accent-text)" : "var(--bg-subtle)",
            color: showThumbnails ? "#ffffff" : "var(--text-main)",
            cursor: "pointer",
            fontSize: "14px",
          }}
        >
          ☰
        </button>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-8)",
          }}
        >
          <button
            type="button"
            onClick={onPrevPage}
            disabled={currentPage <= 1}
            aria-label={t("pdf.prevPage")}
            data-testid="pdf-prev-page"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "32px",
              height: "32px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-input)",
              backgroundColor: "var(--bg-subtle)",
              color: "var(--text-main)",
              cursor: currentPage <= 1 ? "not-allowed" : "pointer",
              opacity: currentPage <= 1 ? 0.5 : 1,
              fontSize: "16px",
              fontWeight: 600,
            }}
          >
            ‹
          </button>

          <span
            data-testid="pdf-page-display"
            style={{
              fontSize: "14px",
              fontWeight: 500,
              minWidth: "64px",
              textAlign: "center",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {currentPage} / {totalPages || 1}
          </span>

          <button
            type="button"
            onClick={onNextPage}
            disabled={currentPage >= totalPages}
            aria-label={t("pdf.nextPage")}
            data-testid="pdf-next-page"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "32px",
              height: "32px",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-input)",
              backgroundColor: "var(--bg-subtle)",
              color: "var(--text-main)",
              cursor: currentPage >= totalPages ? "not-allowed" : "pointer",
              opacity: currentPage >= totalPages ? 0.5 : 1,
              fontSize: "16px",
              fontWeight: 600,
            }}
          >
            ›
          </button>
        </div>

        {documentTitle && (
          <span
            data-testid="pdf-document-title"
            style={{
              fontSize: "14px",
              fontWeight: 600,
              maxWidth: "var(--space-16)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              marginInlineStart: "var(--space-8)",
              color: "var(--text-muted)",
            }}
            title={documentTitle}
          >
            {documentTitle}
          </span>
        )}
      </div>

      {/* Center: Annotation Tools & History (PDF-3, PDF-4) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-8)",
          flexWrap: "nowrap",
        }}
      >
        <button
          type="button"
          onClick={() => onSelectTool?.("select")}
          data-testid="pdf-tool-select"
          style={getToolButtonStyle("select")}
          title={t("pdf.toolSelect")}
        >
          {t("pdf.toolSelect")}
        </button>

        <button
          type="button"
          onClick={() => onSelectTool?.("highlight")}
          data-testid="pdf-tool-highlight"
          style={getToolButtonStyle("highlight")}
          title={t("pdf.toolHighlight")}
        >
          {t("pdf.toolHighlight")}
        </button>

        <button
          type="button"
          onClick={() => onSelectTool?.("ink")}
          data-testid="pdf-tool-ink"
          style={getToolButtonStyle("ink")}
          title={t("pdf.toolInk")}
        >
          {t("pdf.toolInk")}
        </button>

        <button
          type="button"
          onClick={() => onSelectTool?.("freeText")}
          data-testid="pdf-tool-text"
          style={getToolButtonStyle("freeText")}
          title={t("pdf.toolText")}
        >
          {t("pdf.toolText")}
        </button>

        <button
          type="button"
          onClick={handleStampClick}
          data-testid="pdf-tool-stamp"
          style={getToolButtonStyle("stamp")}
          title={t("pdf.toolStamp")}
        >
          {t("pdf.toolStamp")}
        </button>

        <div
          style={{
            width: "1px",
            height: "24px",
            backgroundColor: "var(--border-input)",
            marginInline: "var(--space-8)",
          }}
        />

        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label={t("pdf.undo")}
          data-testid="pdf-undo-button"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            height: "32px",
            paddingInline: "var(--space-8)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-input)",
            backgroundColor: "var(--bg-subtle)",
            color: "var(--text-main)",
            cursor: canUndo ? "pointer" : "not-allowed",
            opacity: canUndo ? 1 : 0.5,
            fontSize: "14px",
            fontWeight: 500,
          }}
        >
          {t("pdf.undo")}
        </button>

        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label={t("pdf.redo")}
          data-testid="pdf-redo-button"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            height: "32px",
            paddingInline: "var(--space-8)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-input)",
            backgroundColor: "var(--bg-subtle)",
            color: "var(--text-main)",
            cursor: canRedo ? "pointer" : "not-allowed",
            opacity: canRedo ? 1 : 0.5,
            fontSize: "14px",
            fontWeight: 500,
          }}
        >
          {t("pdf.redo")}
        </button>
      </div>

      {/* Right side: Page Operations, Download & Zoom Controls */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-8)",
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
            data-testid="pdf-page-operations-menu"
            disabled={isOperatingPage}
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: "32px",
              paddingInline: "var(--space-8)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-input)",
              backgroundColor: showPageMenu ? "var(--bg-elevated)" : "var(--bg-subtle)",
              color: "var(--text-main)",
              cursor: isOperatingPage ? "wait" : "pointer",
              fontSize: "14px",
              fontWeight: 500,
              gap: "var(--space-8)",
            }}
          >
            <span>{t("pdf.pageOperations")}</span>
            <span style={{ fontSize: "10px" }}>▼</span>
          </button>

          {showPageMenu && (
            <div
              data-testid="pdf-page-operations-dropdown"
              style={{
                position: "absolute",
                top: "calc(100% + var(--space-8))",
                right: 0,
                backgroundColor: "var(--bg-surface)",
                border: "1px solid var(--border-input)",
                borderRadius: "var(--radius-md)",
                boxShadow: "0 8px 24px rgba(0, 0, 0, 0.2)",
                zIndex: 100,
                minWidth: "var(--space-16)",
                padding: "var(--space-8)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-8)",
              }}
            >
              {/* Rotate Page 90° */}
              <button
                type="button"
                data-testid="pdf-rotate-page-btn"
                onClick={() => {
                  setShowPageMenu(false);
                  onRotatePage?.();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: "32px",
                  paddingInline: "var(--space-8)",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  backgroundColor: "var(--bg-subtle)",
                  color: "var(--text-main)",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: 500,
                  textAlign: "start",
                }}
              >
                {t("pdf.rotatePage")}
              </button>

              {/* Move Page Up */}
              <button
                type="button"
                data-testid="pdf-move-page-up-btn"
                disabled={currentPage <= 1}
                onClick={() => {
                  setShowPageMenu(false);
                  onMovePageUp?.();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: "32px",
                  paddingInline: "var(--space-8)",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  backgroundColor: "var(--bg-subtle)",
                  color: "var(--text-main)",
                  cursor: currentPage <= 1 ? "not-allowed" : "pointer",
                  opacity: currentPage <= 1 ? 0.5 : 1,
                  fontSize: "14px",
                  fontWeight: 500,
                  textAlign: "start",
                }}
              >
                {t("pdf.movePageUp")}
              </button>

              {/* Move Page Down */}
              <button
                type="button"
                data-testid="pdf-move-page-down-btn"
                disabled={currentPage >= totalPages}
                onClick={() => {
                  setShowPageMenu(false);
                  onMovePageDown?.();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: "32px",
                  paddingInline: "var(--space-8)",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  backgroundColor: "var(--bg-subtle)",
                  color: "var(--text-main)",
                  cursor: currentPage >= totalPages ? "not-allowed" : "pointer",
                  opacity: currentPage >= totalPages ? 0.5 : 1,
                  fontSize: "14px",
                  fontWeight: 500,
                  textAlign: "start",
                }}
              >
                {t("pdf.movePageDown")}
              </button>

              {/* Insert Image as Page */}
              <button
                type="button"
                data-testid="pdf-insert-image-btn"
                onClick={() => {
                  imagePageInputRef.current?.click();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: "32px",
                  paddingInline: "var(--space-8)",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  backgroundColor: "var(--bg-subtle)",
                  color: "var(--text-main)",
                  cursor: "pointer",
                  fontSize: "14px",
                  fontWeight: 500,
                  textAlign: "start",
                }}
              >
                {t("pdf.insertImagePage")}
              </button>

              {/* Delete Page */}
              <button
                type="button"
                data-testid="pdf-delete-page-btn"
                disabled={totalPages <= 1}
                onClick={() => {
                  setShowPageMenu(false);
                  onDeletePage?.();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  height: "32px",
                  paddingInline: "var(--space-8)",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  backgroundColor: "var(--bg-subtle)",
                  color: totalPages <= 1 ? "var(--text-muted)" : "var(--brand-danger, #ef4444)",
                  cursor: totalPages <= 1 ? "not-allowed" : "pointer",
                  opacity: totalPages <= 1 ? 0.5 : 1,
                  fontSize: "14px",
                  fontWeight: 500,
                  textAlign: "start",
                }}
              >
                {t("pdf.deletePage")}
              </button>
            </div>
          )}
        </div>

        {/* Download Annotated PDF (PDF-5) */}
        <button
          type="button"
          onClick={onDownloadAnnotated}
          disabled={isDownloading}
          aria-label={t("pdf.downloadAnnotated")}
          data-testid="pdf-download-btn"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            height: "32px",
            paddingInline: "var(--space-8)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-input)",
            backgroundColor: "var(--bg-subtle)",
            color: "var(--text-main)",
            cursor: isDownloading ? "wait" : "pointer",
            fontSize: "14px",
            fontWeight: 500,
            gap: "var(--space-8)",
          }}
          title={t("pdf.downloadAnnotated")}
        >
          <span style={{ fontSize: "14px" }}>⤓</span>
          <span>{isDownloading ? t("pdf.downloading") : t("pdf.downloadAnnotated")}</span>
        </button>

        {/* Send to Board Button (INT-1) */}
        <button
          type="button"
          onClick={onSendToBoard}
          disabled={isSendingToBoard}
          aria-label={t("pdf.sendToBoard")}
          data-testid="pdf-send-to-board-btn"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            height: "32px",
            paddingInline: "var(--space-2)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-input)",
            backgroundColor: "var(--bg-subtle)",
            color: "var(--text-main)",
            cursor: isSendingToBoard ? "wait" : "pointer",
            fontSize: "14px",
            fontWeight: 500,
            gap: "var(--space-1)",
          }}
          title={t("pdf.sendToBoard")}
        >
          <span style={{ fontSize: "14px" }}>📋</span>
          <span>{isSendingToBoard ? t("pdf.sendingToBoard") : t("pdf.sendToBoard")}</span>
        </button>

        <div
          style={{
            width: "1px",
            height: "24px",
            backgroundColor: "var(--border-input)",
            marginInline: "var(--space-1)",
          }}
        />

        {/* Zoom Controls */}
        <button
          type="button"
          onClick={onZoomOut}
          aria-label={t("pdf.zoomOut")}
          data-testid="pdf-zoom-out"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "32px",
            height: "32px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-input)",
            backgroundColor: "var(--bg-subtle)",
            color: "var(--text-main)",
            cursor: "pointer",
            fontSize: "16px",
            fontWeight: 600,
          }}
        >
          −
        </button>

        <button
          type="button"
          onClick={onResetZoom}
          aria-label={t("pdf.resetZoom")}
          data-testid="pdf-zoom-level"
          dir="ltr"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: "48px",
            height: "32px",
            paddingInline: "var(--space-8)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-input)",
            backgroundColor: "var(--bg-subtle)",
            color: "var(--text-main)",
            cursor: "pointer",
            fontSize: "14px",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {Math.round(zoomLevel * 100)}%
        </button>

        <button
          type="button"
          onClick={onZoomIn}
          aria-label={t("pdf.zoomIn")}
          data-testid="pdf-zoom-in"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            width: "32px",
            height: "32px",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-input)",
            backgroundColor: "var(--bg-subtle)",
            color: "var(--text-main)",
            cursor: "pointer",
            fontSize: "16px",
            fontWeight: 600,
          }}
        >
          +
        </button>
      </div>
    </header>
  );
}
