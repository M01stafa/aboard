"use client";

import React from "react";
import { useI18n } from "@/i18n/provider";

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
}: PdfToolbarProps) {
  const { t } = useI18n();

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
        flexShrink: 0,
      }}
    >
      {/* Left side: Thumbnails toggle & Document title */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-8)",
          minWidth: 0,
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
            height: "32px",
            paddingInline: "var(--space-8)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-input)",
            backgroundColor: showThumbnails ? "var(--accent-text)" : "var(--bg-subtle)",
            color: showThumbnails ? "#ffffff" : "var(--text-main)",
            cursor: "pointer",
            fontSize: "14px",
            fontWeight: 500,
          }}
        >
          {t("pdf.thumbnails")}
        </button>

        {documentTitle && (
          <span
            style={{
              fontSize: "14px",
              fontWeight: 500,
              color: "var(--text-muted)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              maxWidth: "320px",
            }}
            title={documentTitle}
          >
            {documentTitle}
          </span>
        )}
      </div>

      {/* Center: Page Navigation Controls */}
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
          }}
        >
          ‹
        </button>

        <div
          dir="ltr"
          data-testid="pdf-page-display"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "var(--space-8)",
            fontSize: "14px",
            fontVariantNumeric: "tabular-nums",
            color: "var(--text-main)",
            paddingInline: "var(--space-8)",
          }}
        >
          <span>{currentPage}</span>
          <span style={{ color: "var(--text-muted)" }}>/</span>
          <span>{totalPages || 1}</span>
        </div>

        <button
          type="button"
          onClick={onNextPage}
          disabled={totalPages > 0 && currentPage >= totalPages}
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
            cursor: totalPages > 0 && currentPage >= totalPages ? "not-allowed" : "pointer",
            opacity: totalPages > 0 && currentPage >= totalPages ? 0.5 : 1,
            fontSize: "16px",
          }}
        >
          ›
        </button>
      </div>

      {/* Right side: Zoom Controls */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-8)",
        }}
      >
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
