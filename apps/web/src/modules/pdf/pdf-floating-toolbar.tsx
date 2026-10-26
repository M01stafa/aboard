"use client";

import React, { useRef } from "react";
import { useI18n } from "@/i18n/provider";
import type { AnnotationToolType } from "./pdf-toolbar";

export interface PdfFloatingToolbarProps {
  activeTool?: AnnotationToolType;
  canUndo?: boolean;
  canRedo?: boolean;
  onSelectTool?: (tool: AnnotationToolType) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onAddStamp?: (file: File) => void;
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
}

export function PdfFloatingToolbar({
  activeTool = "select",
  canUndo = false,
  canRedo = false,
  onSelectTool,
  onUndo,
  onRedo,
  onAddStamp,
  zoomLevel,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}: PdfFloatingToolbarProps) {
  const { t } = useI18n();
  const stampInputRef = useRef<HTMLInputElement>(null);

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

  const getToolButtonStyle = (tool: AnnotationToolType): React.CSSProperties => {
    const isActive = activeTool === tool;
    return {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "var(--control-sm)",
      height: "var(--control-sm)",
      borderRadius: "var(--radius-sm)",
      border: isActive ? "1px solid var(--btn-primary-bg)" : "1px solid transparent",
      backgroundColor: isActive ? "var(--btn-primary-bg)" : "transparent",
      color: isActive ? "var(--btn-primary-text)" : "var(--text-main)",
      cursor: "pointer",
      boxSizing: "border-box",
      transition: "background-color 150ms ease, color 150ms ease, border-color 150ms ease",
    };
  };

  const getActionButtonStyle = (disabled: boolean): React.CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "var(--control-sm)",
    height: "var(--control-sm)",
    borderRadius: "var(--radius-sm)",
    border: "1px solid transparent",
    backgroundColor: "transparent",
    color: disabled ? "var(--text-muted)" : "var(--text-main)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1,
    boxSizing: "border-box",
    transition: "background-color 150ms ease, opacity 150ms ease",
  });

  return (
    <aside
      className="pdf-floating-toolbar"
      aria-label="PDF Annotation and Zoom Controls"
      data-testid="pdf-floating-toolbar"
      style={{
        position: "absolute",
        top: "var(--space-2)",
        insetInlineStart: "var(--space-2)",
        zIndex: 30,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "var(--space-1)",
        padding: "var(--space-1)",
        backgroundColor: "var(--bg-surface)",
        boxShadow: "var(--shadow-3)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border-card)",
        boxSizing: "border-box",
        userSelect: "none",
        maxHeight: "calc(100% - var(--space-4))",
        overflowY: "auto",
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

      {/* Top Group: Essential Annotation Tools */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-1)",
          alignItems: "center",
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
          onMouseEnter={(e) => {
            if (activeTool !== "select") {
              e.currentTarget.style.backgroundColor = "var(--btn-outline-hover-bg)";
            }
          }}
          onMouseLeave={(e) => {
            if (activeTool !== "select") {
              e.currentTarget.style.backgroundColor = "transparent";
            }
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 3l7 18 3-7 7-3L3 3z" />
          </svg>
        </button>

        {/* Highlight Tool */}
        <button
          type="button"
          onClick={() => onSelectTool?.("highlight")}
          data-testid="pdf-tool-highlight"
          style={getToolButtonStyle("highlight")}
          title={t("pdf.toolHighlight")}
          aria-label={t("pdf.toolHighlight")}
          onMouseEnter={(e) => {
            if (activeTool !== "highlight") {
              e.currentTarget.style.backgroundColor = "var(--btn-outline-hover-bg)";
            }
          }}
          onMouseLeave={(e) => {
            if (activeTool !== "highlight") {
              e.currentTarget.style.backgroundColor = "transparent";
            }
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m9 11-6 6v3h3l6-6" />
            <path d="m22 7-4.5-4.5a2.12 2.12 0 0 0-3 0L10 7l4 4 4.5-4.5a2.12 2.12 0 0 0 0-3Z" />
          </svg>
        </button>

        {/* Ink / Draw Tool */}
        <button
          type="button"
          onClick={() => onSelectTool?.("ink")}
          data-testid="pdf-tool-ink"
          style={getToolButtonStyle("ink")}
          title={t("pdf.toolInk")}
          aria-label={t("pdf.toolInk")}
          onMouseEnter={(e) => {
            if (activeTool !== "ink") {
              e.currentTarget.style.backgroundColor = "var(--btn-outline-hover-bg)";
            }
          }}
          onMouseLeave={(e) => {
            if (activeTool !== "ink") {
              e.currentTarget.style.backgroundColor = "transparent";
            }
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
          </svg>
        </button>

        {/* FreeText Tool */}
        <button
          type="button"
          onClick={() => onSelectTool?.("freeText")}
          data-testid="pdf-tool-text"
          style={getToolButtonStyle("freeText")}
          title={t("pdf.toolText")}
          aria-label={t("pdf.toolText")}
          onMouseEnter={(e) => {
            if (activeTool !== "freeText") {
              e.currentTarget.style.backgroundColor = "var(--btn-outline-hover-bg)";
            }
          }}
          onMouseLeave={(e) => {
            if (activeTool !== "freeText") {
              e.currentTarget.style.backgroundColor = "transparent";
            }
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="4 7 4 4 20 4 20 7" />
            <line x1="12" y1="4" x2="12" y2="20" />
          </svg>
        </button>

        {/* Stamp Tool */}
        <button
          type="button"
          onClick={handleStampClick}
          data-testid="pdf-tool-stamp"
          style={getToolButtonStyle("stamp")}
          title={t("pdf.toolStamp")}
          aria-label={t("pdf.toolStamp")}
          onMouseEnter={(e) => {
            if (activeTool !== "stamp") {
              e.currentTarget.style.backgroundColor = "var(--btn-outline-hover-bg)";
            }
          }}
          onMouseLeave={(e) => {
            if (activeTool !== "stamp") {
              e.currentTarget.style.backgroundColor = "transparent";
            }
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 22h14" />
            <path d="M19.27 13.73A2.5 2.5 0 0 0 17.5 13h-11a2.5 2.5 0 0 0-1.77.73l-1.5 1.5A1 1 0 0 0 4 17v2h16v-2a1 1 0 0 0-.23-.67l-1.5-1.6Z" />
            <path d="M14 13V8a2 2 0 0 0-4 0v5" />
          </svg>
        </button>
      </div>

      {/* Divider */}
      <div
        style={{
          width: "100%",
          height: "1px",
          backgroundColor: "var(--border-card)",
          marginBlock: "var(--space-1)",
        }}
      />

      {/* Middle Group: History (Undo, Redo) */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-1)",
          alignItems: "center",
        }}
      >
        {/* Undo */}
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          aria-label={t("pdf.undo")}
          title={t("pdf.undo")}
          data-testid="pdf-undo-button"
          style={getActionButtonStyle(!canUndo)}
          onMouseEnter={(e) => {
            if (canUndo) {
              e.currentTarget.style.backgroundColor = "var(--btn-outline-hover-bg)";
            }
          }}
          onMouseLeave={(e) => {
            if (canUndo) {
              e.currentTarget.style.backgroundColor = "transparent";
            }
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 7v6h6" />
            <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
          </svg>
        </button>

        {/* Redo */}
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          aria-label={t("pdf.redo")}
          title={t("pdf.redo")}
          data-testid="pdf-redo-button"
          style={getActionButtonStyle(!canRedo)}
          onMouseEnter={(e) => {
            if (canRedo) {
              e.currentTarget.style.backgroundColor = "var(--btn-outline-hover-bg)";
            }
          }}
          onMouseLeave={(e) => {
            if (canRedo) {
              e.currentTarget.style.backgroundColor = "transparent";
            }
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 7v6h-6" />
            <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
          </svg>
        </button>
      </div>

      {/* Divider */}
      <div
        style={{
          width: "100%",
          height: "1px",
          backgroundColor: "var(--border-card)",
          marginBlock: "var(--space-1)",
        }}
      />

      {/* Bottom Group: Zoom Controls */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-1)",
          alignItems: "center",
        }}
      >
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
            border: "1px solid transparent",
            backgroundColor: "transparent",
            color: "var(--text-main)",
            cursor: "pointer",
            boxSizing: "border-box",
            transition: "background-color 150ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--btn-outline-hover-bg)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        </button>

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
            border: "1px solid transparent",
            backgroundColor: "transparent",
            color: "var(--text-main)",
            cursor: "pointer",
            boxSizing: "border-box",
            transition: "background-color 150ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--btn-outline-hover-bg)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
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
            width: "var(--control-sm)",
            height: "var(--control-sm)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-card)",
            backgroundColor: "var(--bg-subtle)",
            color: "var(--text-main)",
            cursor: "pointer",
            fontSize: "11px",
            fontWeight: 600,
            fontVariantNumeric: "tabular-nums",
            fontFamily: "var(--font-sans)",
            boxSizing: "border-box",
            transition: "background-color 150ms ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--btn-outline-hover-bg)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "var(--bg-subtle)";
          }}
        >
          {Math.round(zoomLevel * 100)}%
        </button>
      </div>
    </aside>
  );
}
