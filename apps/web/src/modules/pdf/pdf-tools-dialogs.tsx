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
        backgroundColor: "rgba(0, 0, 0, 0.6)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "var(--space-16)",
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
          padding: "var(--space-24)",
          maxWidth: "calc(var(--space-32) * 15)",
          width: "100%",
          boxShadow: "0 16px 32px rgba(0, 0, 0, 0.3)",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-16)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-8)" }}>
          <span style={{ fontSize: "24px" }}>🔒</span>
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
            gap: "var(--space-8)",
            marginTop: "var(--space-8)",
          }}
        >
          <button
            type="button"
            data-testid="pdf-tools-notice-cancel-btn"
            onClick={onCancel}
            style={{
              height: "32px",
              paddingInline: "var(--space-16)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-input)",
              backgroundColor: "var(--bg-subtle)",
              color: "var(--text-main)",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 500,
            }}
          >
            {t("pdf.toolsNoticeCancel")}
          </button>
          <button
            type="button"
            data-testid="pdf-tools-notice-accept-btn"
            onClick={onAccept}
            style={{
              height: "32px",
              paddingInline: "var(--space-16)",
              borderRadius: "var(--radius-sm)",
              border: "none",
              backgroundColor: "var(--accent-primary, #3b82f6)",
              color: "#ffffff",
              cursor: "pointer",
              fontSize: "14px",
              fontWeight: 600,
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

  if (!active || !tool) return null;

  const percent = progress?.percent ?? 0;
  const stage = progress?.stage ?? "uploading";

  let stageLabel = t("pdf.stageUploading");
  if (stage === "processing") {
    stageLabel = t("pdf.stageProcessing");
  } else if (stage === "downloading") {
    stageLabel = t("pdf.stageDownloading");
  }

  let toolName = "";
  if (tool === "ocr") {
    toolName = t("pdf.toolOcr");
  } else if (tool === "compress") {
    toolName = t("pdf.toolCompress");
  } else if (tool === "office-to-pdf") {
    toolName = t("pdf.toolOfficeToPdf");
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("pdf.processingTitle")}
      data-testid="pdf-processing-modal"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "rgba(0, 0, 0, 0.5)",
        backdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "var(--space-16)",
        boxSizing: "border-box",
      }}
    >
      <div
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-card)",
          borderRadius: "var(--radius-lg)",
          padding: "var(--space-24)",
          maxWidth: "calc(var(--space-32) * 12 + var(--space-16))",
          width: "100%",
          boxShadow: "0 16px 32px rgba(0, 0, 0, 0.3)",
          boxSizing: "border-box",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-16)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-8)" }}>
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
            height: "var(--space-8)",
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
              backgroundColor: "var(--accent-primary, #3b82f6)",
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
              height: "32px",
              paddingInline: "var(--space-16)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-input)",
              backgroundColor: "var(--bg-subtle)",
              color: "var(--text-main)",
              cursor: isCancelling ? "wait" : "pointer",
              opacity: isCancelling ? 0.6 : 1,
              fontSize: "14px",
              fontWeight: 500,
            }}
          >
            {isCancelling ? t("pdf.cancellingProcessing") : t("pdf.cancelProcessing")}
          </button>
        </div>
      </div>
    </div>
  );
}
