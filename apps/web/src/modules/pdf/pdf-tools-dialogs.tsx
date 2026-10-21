"use client";

import React, { useEffect } from "react";
import { useI18n } from "@/i18n/provider";
import type { StirlingProgress, StirlingTool } from "@/core/stirling";

export interface PdfToolsNoticeModalProps {
  open: boolean;
  onAccept: () => void;
  onCancel: () => void;
}

export function PdfToolsNoticeModal({ open, onAccept, onCancel }: PdfToolsNoticeModalProps) {
  const { t } = useI18n();

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="pdf-tools-notice-title"
      data-testid="pdf-tools-notice-modal"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "var(--overlay-backdrop)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "var(--space-2)",
        boxSizing: "border-box",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-card)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-3)",
          maxWidth: "calc(var(--space-8) * 6)",
          width: "100%",
          boxShadow: "var(--shadow-3)",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
          fontFamily: "var(--font-sans)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
          <span style={{ fontSize: "20px" }}>🔒</span>
          <h3
            id="pdf-tools-notice-title"
            style={{
              margin: 0,
              fontSize: "18px",
              fontWeight: 600,
              color: "var(--text-main)",
            }}
          >
            {t("pdf.toolsNoticeTitle")}
          </h3>
        </div>

        <p
          style={{
            margin: 0,
            fontSize: "14px",
            lineHeight: "24px",
            color: "var(--text-muted)",
          }}
        >
          {t("pdf.toolsNoticeBody")}
        </p>

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: "var(--space-1)",
            marginTop: "var(--space-1)",
          }}
        >
          <button
            type="button"
            data-testid="pdf-tools-notice-cancel-btn"
            onClick={onCancel}
            style={{
              height: "var(--control-sm)",
              paddingInline: "var(--space-2)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-card)",
              backgroundColor: "var(--bg-subtle)",
              color: "var(--text-main)",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 500,
              fontFamily: "var(--font-sans)",
              transition: "background-color 150ms ease",
            }}
          >
            {t("pdf.toolsNoticeCancel")}
          </button>
          <button
            type="button"
            data-testid="pdf-tools-notice-accept-btn"
            onClick={onAccept}
            style={{
              height: "var(--control-sm)",
              paddingInline: "var(--space-2)",
              borderRadius: "var(--radius-sm)",
              border: "none",
              backgroundColor: "var(--btn-primary-bg)",
              color: "var(--btn-primary-text)",
              cursor: "pointer",
              fontSize: "13px",
              fontWeight: 600,
              fontFamily: "var(--font-sans)",
              transition: "background-color 150ms ease",
            }}
          >
            {t("pdf.toolsNoticeAccept")}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface PdfProcessingModalProps {
  active: boolean;
  tool: StirlingTool | null;
  progress: StirlingProgress | null;
  onCancel: () => void;
  isCancelling?: boolean;
}

export function PdfProcessingModal({
  active,
  tool,
  progress,
  onCancel,
  isCancelling = false,
}: PdfProcessingModalProps) {
  const { t } = useI18n();

  useEffect(() => {
    if (!active) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isCancelling) {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, onCancel, isCancelling]);

  if (!active || !tool) return null;

  const toolName =
    tool === "ocr"
      ? t("pdf.toolOcr")
      : tool === "compress"
      ? t("pdf.toolCompress")
      : t("pdf.toolOfficeToPdf");

  const stageLabel =
    progress?.stage === "uploading"
      ? t("pdf.stageUploading")
      : progress?.stage === "processing"
      ? t("pdf.stageProcessing")
      : progress?.stage === "downloading"
      ? t("pdf.stageDownloading")
      : t("pdf.stageProcessing");

  const percent = progress?.percent ?? 0;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${toolName} ${stageLabel}`}
      data-testid="pdf-processing-modal"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "var(--overlay-backdrop)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "var(--space-2)",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-card)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-3)",
          maxWidth: "calc(var(--space-8) * 5)",
          width: "100%",
          boxShadow: "var(--shadow-3)",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
          fontFamily: "var(--font-sans)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
          <span style={{ fontSize: "20px" }}>⚡</span>
          <div>
            <h4
              style={{
                margin: 0,
                fontSize: "16px",
                fontWeight: 600,
                color: "var(--text-main)",
              }}
            >
              {toolName}
            </h4>
            <span
              style={{
                fontSize: "12px",
                color: "var(--text-muted)",
              }}
            >
              {stageLabel}
            </span>
          </div>
        </div>

        {/* Progress Bar Container */}
        <div
          style={{
            width: "100%",
            height: "var(--space-1)",
            backgroundColor: "var(--bg-subtle)",
            borderRadius: "var(--radius-sm)",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            role="progressbar"
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
            data-testid="pdf-processing-progress-bar"
            style={{
              width: "100%",
              height: "100%",
              backgroundColor: "var(--btn-primary-bg)",
              transformOrigin: "inline-start",
              transform: `scaleX(${Math.max(0, Math.min(100, percent)) / 100})`,
              transition: "transform 200ms ease",
            }}
          />
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <span
            data-testid="pdf-processing-percent"
            style={{
              fontSize: "12px",
              fontWeight: 500,
              color: "var(--text-muted)",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {percent}%
          </span>

          <button
            type="button"
            data-testid="pdf-cancel-processing-btn"
            disabled={isCancelling}
            onClick={onCancel}
            style={{
              height: "var(--control-sm)",
              paddingInline: "var(--space-2)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-card)",
              backgroundColor: "var(--bg-subtle)",
              color: "var(--text-main)",
              cursor: isCancelling ? "wait" : "pointer",
              opacity: isCancelling ? 0.6 : 1,
              fontSize: "13px",
              fontWeight: 500,
              fontFamily: "var(--font-sans)",
              transition: "background-color 150ms ease",
            }}
          >
            {isCancelling ? t("pdf.cancellingProcessing") : t("pdf.cancelProcessing")}
          </button>
        </div>
      </div>
    </div>
  );
}
