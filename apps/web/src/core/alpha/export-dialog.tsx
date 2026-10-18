"use client";

import React, { useState, useEffect, useRef } from "react";
import { useI18n } from "@/i18n/provider";
import { exportAlpha, ExportCapExceededError } from "./export";
import type { ProjectService } from "@/core/storage";

export interface ExportDialogProps {
  projectId: string;
  isOpen: boolean;
  onClose: () => void;
  projectService?: ProjectService;
}

export function ExportDialog({
  projectId,
  isOpen,
  onClose,
  projectService,
}: ExportDialogProps) {
  const { t } = useI18n();
  const [includePdfs, setIncludePdfs] = useState(true);
  const [includeAnnotated, setIncludeAnnotated] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorHint, setErrorHint] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const exportBtnRef = useRef<HTMLButtonElement>(null);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !isExporting) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isExporting, onClose]);

  // Focus dialog on open
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => {
        exportBtnRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleExport = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setError(null);
    setErrorHint(null);

    try {
      await exportAlpha(projectId, {
        includePdfs,
        includeAnnotated,
        streamToDisk: true,
        projectService,
      });

      // Close modal on successful export initiation
      onClose();
    } catch (err: unknown) {
      if (err instanceof ExportCapExceededError) {
        const sizeMb = (err.totalBytes / (1024 * 1024)).toFixed(0);
        const capMb = (err.capBytes / (1024 * 1024)).toFixed(0);
        setError(t("export.capExceeded", { size: sizeMb, cap: capMb }));
        setErrorHint(t("export.capExceededHint"));
      } else if (err instanceof Error && err.message === "Export cancelled by user") {
        // User aborted native save file picker dialog; do not treat as an error
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
        padding: "var(--space-2)",
        boxSizing: "border-box",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !isExporting) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="export-dialog-title"
        data-testid="alpha-export-dialog"
        style={{
          width: "100%",
          maxWidth: "calc(var(--control-lg) * 10)",
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-card)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-3)",
          boxShadow: "0 16px 32px rgba(0, 0, 0, 0.3)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
          boxSizing: "border-box",
          color: "var(--text-main)",
        }}
      >
        <div>
          <h2
            id="export-dialog-title"
            style={{
              margin: 0,
              fontSize: "1.25rem",
              fontWeight: 600,
              color: "var(--text-main)",
            }}
          >
            {t("export.title")}
          </h2>
          <p
            style={{
              margin: "var(--space-1) 0 0 0",
              fontSize: "0.875rem",
              color: "var(--text-muted)",
              lineHeight: 1.5,
            }}
          >
            {t("export.description")}
          </p>
        </div>

        {/* Options */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-2)",
            padding: "var(--space-2)",
            backgroundColor: "var(--bg-subtle)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-card)",
          }}
        >
          {/* Option 1: Include PDFs */}
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "var(--space-2)",
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              data-testid="export-include-pdfs"
              checked={includePdfs}
              disabled={isExporting}
              onChange={(e) => setIncludePdfs(e.target.checked)}
              style={{
                width: "16px",
                height: "16px",
                accentColor: "var(--accent-text)",
                cursor: "pointer",
              }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
              <span style={{ fontSize: "0.875rem", fontWeight: 500 }}>
                {t("export.includePdfs")}
              </span>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                {t("export.includePdfsHint")}
              </span>
            </div>
          </label>

          {/* Option 2: Include Annotated Copies */}
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "var(--space-2)",
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              data-testid="export-include-annotated"
              checked={includeAnnotated}
              disabled={isExporting || !includePdfs}
              onChange={(e) => setIncludeAnnotated(e.target.checked)}
              style={{
                width: "16px",
                height: "16px",
                accentColor: "var(--accent-text)",
                cursor: isExporting || !includePdfs ? "not-allowed" : "pointer",
              }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
              <span
                style={{
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  opacity: !includePdfs ? 0.5 : 1,
                }}
              >
                {t("export.includeAnnotated")}
              </span>
              <span
                style={{
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                  opacity: !includePdfs ? 0.5 : 1,
                }}
              >
                {t("export.includeAnnotatedHint")}
              </span>
            </div>
          </label>
        </div>

        {/* Error notification if cap exceeded */}
        {error && (
          <div
            role="alert"
            data-testid="export-error"
            style={{
              padding: "var(--space-1) var(--space-2)",
              backgroundColor: "rgba(239, 68, 68, 0.1)",
              border: "1px solid var(--brand-danger, #ef4444)",
              borderRadius: "var(--radius-sm)",
              color: "var(--brand-danger, #ef4444)",
              fontSize: "0.875rem",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-1)",
            }}
          >
            <span style={{ fontWeight: 600 }}>{error}</span>
            {errorHint && (
              <span style={{ fontSize: "0.75rem", opacity: 0.9 }}>{errorHint}</span>
            )}
          </div>
        )}

        {/* Dialog Actions */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "flex-end",
            gap: "var(--space-1)",
            marginTop: "var(--space-1)",
          }}
        >
          <button
            type="button"
            data-testid="export-cancel-btn"
            disabled={isExporting}
            onClick={onClose}
            style={{
              height: "32px",
              paddingInline: "var(--space-2)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-input)",
              backgroundColor: "var(--bg-subtle)",
              color: "var(--text-main)",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: isExporting ? "not-allowed" : "pointer",
            }}
          >
            {t("export.cancel")}
          </button>

          <button
            ref={exportBtnRef}
            type="button"
            data-testid="export-submit-btn"
            disabled={isExporting}
            onClick={handleExport}
            style={{
              height: "32px",
              paddingInline: "var(--space-2)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-card)",
              background: "var(--btn-gold-bg, var(--gradient-accent))",
              color: "var(--btn-gold-text, #1e293b)",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: isExporting ? "wait" : "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-1)",
            }}
          >
            <span>⤓</span>
            <span>{isExporting ? t("export.exporting") : t("export.action")}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
