"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/provider";
import type { PdfPaneProps } from "./types";
import { usePdfPersistence } from "./use-pdf-persistence";
import { PdfViewer } from "./pdf-viewer";

export function isMobileDevice(): boolean {
  if (typeof window === "undefined") return false;
  const isCoarse = window.matchMedia("(pointer: coarse)").matches;
  const isNarrow = window.innerWidth < 768;
  return isCoarse || isNarrow;
}

export function PdfPane({
  projectId,
  tab,
  visible,
  onMount,
  projectServiceOverride,
}: PdfPaneProps) {
  const { t } = useI18n();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Persistent identity token for mount tracking & Strict Mode safety (WS-1)
  const [identityToken] = useState(() => {
    return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `pane-${tab.id}-pdf`;
  });

  useEffect(() => {
    onMount?.(tab.id, identityToken);
  }, [tab.id, identityToken, onMount]);

  const {
    payload,
    blob,
    isLoaded,
    hashingProgress,
    saveLastPage,
    addPdfFile,
    error,
  } = usePdfPersistence({
    projectId,
    itemId: tab.itemId,
    title: tab.title,
    projectServiceOverride,
  });

  // Mobile > 100MB warning dialog state (PDF-7)
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const processFile = useCallback(
    async (file: File) => {
      if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        return;
      }

      // PDF-7: Check if file > 100MB on mobile device
      const isLarge = file.size > 100 * 1024 * 1024;
      if (isLarge && isMobileDevice()) {
        setPendingFile(file);
        return;
      }

      await addPdfFile(file, file.name);
    },
    [addPdfFile]
  );

  const handleConfirmLargeFile = useCallback(async () => {
    if (!pendingFile) return;
    const file = pendingFile;
    setPendingFile(null);
    await addPdfFile(file, file.name);
  }, [pendingFile, addPdfFile]);

  const handleCancelLargeFile = useCallback(() => {
    setPendingFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  if (!isLoaded) {
    return (
      <div
        data-testid="pdf-pane-loading"
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

  // Active viewing mode: Blob exists, lazy-load PDFium and render EmbedPDF
  if (blob) {
    return (
      <div
        data-testid="pdf-pane-active"
        style={{
          width: "100%",
          height: "100%",
          position: "relative",
          display: visible ? "flex" : "none",
          flexDirection: "column",
        }}
      >
        <PdfViewer
          documentId={`pdf-doc-${tab.itemId}`}
          blob={blob}
          documentTitle={payload?.name || tab.title}
          initialPage={payload?.lastPage || 1}
          onPageChange={saveLastPage}
          projectId={projectId}
          pdfHash={payload?.fileKey || tab.itemId}
          projectServiceOverride={projectServiceOverride}
          onSaveRestructuredPdf={addPdfFile}
        />
      </div>
    );
  }

  // Empty state: "Add PDF" dropzone and file selection
  return (
    <div
      data-testid="pdf-pane-empty"
      style={{
        display: visible ? "flex" : "none",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        padding: "var(--space-24)",
        boxSizing: "border-box",
        backgroundColor: "var(--bg-body)",
        position: "relative",
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="application/pdf"
        onChange={handleFileChange}
        style={{ display: "none" }}
        data-testid="pdf-file-input"
      />

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        data-testid="pdf-dropzone"
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "var(--space-32)",
          border: `2px dashed ${
            isDragging ? "var(--accent-text)" : "var(--border-card)"
          }`,
          borderRadius: "var(--radius-md)",
          backgroundColor: isDragging ? "var(--bg-subtle)" : "var(--bg-surface)",
          cursor: "pointer",
          maxWidth: "320px",
          width: "100%",
          textAlign: "center",
          boxSizing: "border-box",
          transition: "border-color 150ms ease, background-color 150ms ease",
        }}
      >
        <div
          style={{
            fontSize: "32px",
            marginBottom: "var(--space-16)",
            color: "var(--text-muted)",
          }}
        >
          📄
        </div>

        <h3
          style={{
            margin: "0 0 var(--space-8) 0",
            fontSize: "18px",
            fontWeight: 600,
            color: "var(--text-main)",
          }}
        >
          {t("pdf.addPdf")}
        </h3>

        <p
          style={{
            margin: "0 0 var(--space-16) 0",
            fontSize: "14px",
            color: "var(--text-muted)",
          }}
        >
          {t("pdf.dropHint")}
        </p>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            fileInputRef.current?.click();
          }}
          data-testid="pdf-select-button"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            height: "48px",
            paddingInline: "var(--space-16)",
            borderRadius: "var(--radius-sm)",
            backgroundColor: "var(--brand-primary)",
            color: "#ffffff",
            fontWeight: 600,
            fontSize: "14px",
            border: "none",
            cursor: "pointer",
          }}
        >
          {t("pdf.selectFile")}
        </button>

        {/* Progress bar during streaming SHA-256 computation and loading */}
        {hashingProgress !== null && (
          <div
            data-testid="pdf-hashing-progress"
            style={{
              marginTop: "var(--space-24)",
              width: "100%",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "var(--space-8)",
            }}
          >
            <div
              style={{
                width: "100%",
                height: "var(--space-1)",
                backgroundColor: "var(--bg-subtle)",
                borderRadius: "var(--radius-sm)",
                overflow: "hidden",
                border: "1px solid var(--border-card)",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: "100%",
                  transform: `scaleX(${hashingProgress})`,
                  transformOrigin: "left",
                  backgroundColor: "var(--accent-text)",
                  transition: "transform 100ms ease",
                }}
              />
            </div>
            <span
              dir="ltr"
              style={{
                fontSize: "12px",
                color: "var(--text-muted)",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {t("pdf.hashingProgress", {
                percent: Math.round(hashingProgress * 100).toString(),
              })}
            </span>
          </div>
        )}

        {error && (
          <p
            data-testid="pdf-error-notice"
            style={{
              marginTop: "var(--space-16)",
              fontSize: "13px",
              color: "var(--danger-text, #ef4444)",
            }}
          >
            {error}
          </p>
        )}
      </div>

      {/* PDF-7 Mobile > 100MB confirmation modal */}
      {pendingFile && (
        <div
          data-testid="pdf-large-file-modal"
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "var(--space-16)",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-card)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-24)",
              maxWidth: "320px",
              width: "100%",
              boxShadow: "0 8px 32px rgba(0, 0, 0, 0.3)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-16)",
            }}
          >
            <h4
              style={{
                margin: 0,
                fontSize: "18px",
                fontWeight: 600,
                color: "var(--text-main)",
              }}
            >
              {t("pdf.largeFileWarningTitle")}
            </h4>

            <p
              style={{
                margin: 0,
                fontSize: "14px",
                color: "var(--text-muted)",
                lineHeight: 1.5,
              }}
            >
              {t("pdf.largeFileWarningText", {
                size: Math.round(pendingFile.size / (1024 * 1024)).toString(),
              })}
            </p>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "var(--space-8)",
                marginTop: "var(--space-8)",
              }}
            >
              <button
                type="button"
                onClick={handleCancelLargeFile}
                data-testid="pdf-cancel-large-file"
                style={{
                  height: "32px",
                  paddingInline: "var(--space-16)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-input)",
                  backgroundColor: "var(--bg-subtle)",
                  color: "var(--text-main)",
                  fontWeight: 500,
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                {t("pdf.cancel")}
              </button>

              <button
                type="button"
                onClick={handleConfirmLargeFile}
                data-testid="pdf-confirm-large-file"
                style={{
                  height: "32px",
                  paddingInline: "var(--space-16)",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  backgroundColor: "var(--brand-primary)",
                  color: "#ffffff",
                  fontWeight: 600,
                  fontSize: "14px",
                  cursor: "pointer",
                }}
              >
                {t("pdf.continueLoading")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
