"use client";

import React, { useState, useEffect, useRef } from "react";
import { bus } from "@/core/bus";
import { useI18n } from "@/i18n/provider";
import { exportAlpha, ExportCapExceededError, safeFileName } from "./export";
import { projectService as defaultProjectService, type ProjectService } from "@/core/storage";

export interface ProjectPdfInfo {
  id: string;
  title: string;
  fileKey: string;
}

export async function getProjectPdfs(
  projectId: string,
  ps: ProjectService
): Promise<ProjectPdfInfo[]> {
  const result: ProjectPdfInfo[] = [];

  // 1. From manifest items
  try {
    const manifest = await ps.openProject(projectId);
    for (const it of manifest.items || []) {
      if (it.kind === "pdf" && it.fileKey) {
        result.push({
          id: it.id,
          title: it.title || "document.pdf",
          fileKey: it.fileKey,
        });
      }
    }
  } catch {
    // Non-fatal
  }

  // 2. From Dexie stored items (if manifest was not updated or item was just added)
  try {
    const { getDb } = await import("@/core/db");
    const db = getDb();
    if (db) {
      const storedItems = await db.items.where("projectId").equals(projectId).toArray();
      for (const it of storedItems) {
        if (it.kind === "pdf") {
          const fileKey = (it as unknown as { fileKey?: string }).fileKey || "";
          if (fileKey && !result.some((r) => r.id === it.id || r.fileKey === fileKey)) {
            result.push({
              id: it.id,
              title: it.title || "document.pdf",
              fileKey,
            });
          }
        }
      }
    }
  } catch {
    // Non-fatal
  }

  // 3. Fallback: Check files table in provider / Dexie for any application/pdf
  if (result.length === 0) {
    try {
      const files = await ps.listFiles(projectId);
      const pdfFiles = files.filter((f) => f.mime === "application/pdf");
      for (const pf of pdfFiles) {
        result.push({
          id: pf.key,
          title: pf.name || "document.pdf",
          fileKey: pf.key,
        });
      }
    } catch {
      // Non-fatal
    }
  }

  return result;
}

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
  // .alpha Backup options
  const [includePdfs, setIncludePdfs] = useState(true);
  const [includeAnnotated, setIncludeAnnotated] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // PDF-only Drive Export options
  const [pdfExportType, setPdfExportType] = useState<"editable" | "flattened" | "clean">("editable");
  const [folderName, setFolderName] = useState("");
  const [isExportingDrive, setIsExportingDrive] = useState(false);
  const [driveSuccess, setDriveSuccess] = useState(false);
  const [projectPdfs, setProjectPdfs] = useState<ProjectPdfInfo[] | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [errorHint, setErrorHint] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const exportBtnRef = useRef<HTMLButtonElement>(null);

  // Load project PDFs on modal open
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const ps = projectService ?? defaultProjectService;

    (async () => {
      try {
        const pdfs = await getProjectPdfs(projectId, ps);
        if (!cancelled) {
          setProjectPdfs(pdfs);
          if (pdfs.length > 0) {
            setFolderName((prev) => prev || pdfs[0].title.replace(/\.pdf$/i, ""));
          }
        }
      } catch {
        if (!cancelled) setProjectPdfs([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isOpen, projectId, projectService]);

  // Close on Escape key & trap focus inside dialog (R5)
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !isExporting && !isExportingDrive) {
        onClose();
        return;
      }

      if (e.key === "Tab" && dialogRef.current) {
        const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isExporting, isExportingDrive, onClose]);

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

  // Button 1: Export .alpha Backup (saving the project so it can be reopened later)
  const handleExport = async () => {
    if (isExporting || isExportingDrive) return;
    setIsExporting(true);
    setError(null);
    setErrorHint(null);

    const ps = projectService ?? defaultProjectService;

    try {
      bus.emit("workspace:flush", {});
      await ps.flushNow?.();

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

  // Button 2: Export PDFs to Drive (standard flattened or clean PDF, no JSON files)
  const handleExportToDrive = async () => {
    if (isExporting || isExportingDrive) return;
    setIsExportingDrive(true);
    setError(null);
    setErrorHint(null);

    const ps = projectService ?? defaultProjectService;

    try {
      bus.emit("workspace:flush", {});
      await new Promise((r) => setTimeout(r, 250));
      // 1. Flush save queue to ensure latest annotations are persisted
      await ps.flushNow?.();

      // 2. Discover PDFs in this project
      const pdfs = await getProjectPdfs(projectId, ps);
      if (pdfs.length === 0) {
        throw new Error(t("export.pdfExportNoPdfs"));
      }

      const { uploadExportToDrive } = await import("@/core/drive/api");
      const { driveTokenManager } = await import("@/core/drive/tokens");

      // 3. Export each PDF according to selected type (editable folder vs flattened vs clean)
      for (const pdfDoc of pdfs) {
        const rawBlob = await ps.getFile(projectId, pdfDoc.fileKey);
        if (!rawBlob) {
          throw new Error(`File content for "${pdfDoc.title}" could not be retrieved.`);
        }
        const baseName = (pdfDoc.title || "document").replace(/\.pdf$/i, "");

        if (pdfExportType === "editable") {
          // Editable Folder: creates Aboard/Exports/<targetFolderName> with original PDF and annotations.json
          const annotationsJson =
            (await ps.readAnnotations(projectId, `pdf-${pdfDoc.fileKey}`).catch(() => "")) ||
            (await ps.readAnnotations(projectId, pdfDoc.fileKey).catch(() => "")) ||
            (await ps.readAnnotations(projectId, `anno-${pdfDoc.id}`).catch(() => "")) ||
            (await ps.readAnnotations(projectId, pdfDoc.id).catch(() => "")) ||
            "";

          const { exportPdfFolderToDrive } = await import("@/core/drive/api");
          const targetFolderName = folderName.trim() || baseName;
          await exportPdfFolderToDrive(
            targetFolderName,
            rawBlob,
            pdfDoc.title || `${baseName}.pdf`,
            annotationsJson,
            undefined,
            driveTokenManager
          );
        } else if (pdfExportType === "flattened") {
          const pdfBuffer = await rawBlob.arrayBuffer();
          // Flattened: read annotations and burn custom ink, stamps, highlights into PDF pages
          const annotationsJson =
            (await ps.readAnnotations(projectId, `pdf-${pdfDoc.fileKey}`).catch(() => "")) ||
            (await ps.readAnnotations(projectId, pdfDoc.fileKey).catch(() => "")) ||
            (await ps.readAnnotations(projectId, `anno-${pdfDoc.id}`).catch(() => "")) ||
            (await ps.readAnnotations(projectId, pdfDoc.id).catch(() => "")) ||
            "";

          const { burnAnnotationsWithPdfLib } = await import("@/modules/pdf/page-operations");
          const burnedBytes = await burnAnnotationsWithPdfLib(
            pdfBuffer,
            annotationsJson,
            projectId,
            ps
          );
          const finalBlob = new Blob([burnedBytes.buffer as ArrayBuffer], { type: "application/pdf" });
          const fileName = `${safeFileName(baseName)}-flattened.pdf`;

          await uploadExportToDrive(
            fileName,
            finalBlob,
            undefined,
            driveTokenManager,
            "application/pdf"
          );
        } else {
          const pdfBuffer = await rawBlob.arrayBuffer();
          // Clean: original PDF document with all annotations stripped
          const finalBlob = new Blob([pdfBuffer], { type: "application/pdf" });
          const fileName = `${safeFileName(baseName)}-clean.pdf`;

          await uploadExportToDrive(
            fileName,
            finalBlob,
            undefined,
            driveTokenManager,
            "application/pdf"
          );
        }
      }

      setDriveSuccess(true);
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("quota") || msg.includes("storageQuotaExceeded")) {
        setError(t("driveErrors.quotaExceeded"));
      } else {
        setError(msg);
      }
    } finally {
      setIsExportingDrive(false);
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
        if (e.target === e.currentTarget && !isExporting && !isExportingDrive) {
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
          maxWidth: "calc(var(--space-8) * 9)",
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-card)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-3)",
          boxShadow: "0 16px 32px rgba(0, 0, 0, 0.4)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
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

        {/* SECTION 1: PDF Export to Drive (PDF-Only) */}
        <div
          data-testid="export-pdf-section"
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
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
              <span style={{ fontSize: "1rem" }}>📄</span>
              <h3
                style={{
                  margin: 0,
                  fontSize: "0.9375rem",
                  fontWeight: 600,
                  color: "var(--text-main)",
                }}
              >
                {t("export.pdfSectionTitle")}
              </h3>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                lineHeight: 1.4,
              }}
            >
              {t("export.pdfSectionDesc")}
            </p>
          </div>

          {/* Project Name / Folder Name Input */}
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            <label
              htmlFor="export-folder-name"
              style={{
                fontSize: "0.8125rem",
                fontWeight: 500,
                color: "var(--text-main)",
              }}
            >
              {t("export.folderNameLabel")}
            </label>
            <input
              id="export-folder-name"
              type="text"
              data-testid="export-folder-name-input"
              value={folderName}
              onChange={(e) => setFolderName(e.target.value)}
              placeholder={t("export.folderNamePlaceholder")}
              disabled={isExportingDrive || isExporting}
              style={{
                height: "var(--control-sm)",
                paddingInline: "var(--space-2)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-card)",
                backgroundColor: "var(--bg-surface)",
                color: "var(--text-main)",
                fontSize: "0.875rem",
                boxSizing: "border-box",
                width: "100%",
                outline: "none",
              }}
            />
          </div>

          {/* Option A: Editable Folder (PDF + JSON) */}
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "var(--space-2)",
              cursor: isExportingDrive || isExporting ? "not-allowed" : "pointer",
              userSelect: "none",
            }}
          >
            <input
              type="radio"
              name="pdf-export-mode"
              data-testid="export-pdf-editable"
              value="editable"
              checked={pdfExportType === "editable"}
              disabled={isExportingDrive || isExporting}
              onChange={() => setPdfExportType("editable")}
              style={{
                width: "16px",
                height: "16px",
                marginBlockStart: "var(--space-0)",
                accentColor: "var(--accent-text)",
                cursor: "pointer",
              }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-0)" }}>
              <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text-main)" }}>
                {t("export.pdfExportEditable")}
              </span>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                {t("export.pdfExportEditableHint")}
              </span>
            </div>
          </label>

          {/* Option B: Flattened PDF */}
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "var(--space-2)",
              cursor: isExportingDrive || isExporting ? "not-allowed" : "pointer",
              userSelect: "none",
            }}
          >
            <input
              type="radio"
              name="pdf-export-mode"
              data-testid="export-pdf-flattened"
              value="flattened"
              checked={pdfExportType === "flattened"}
              disabled={isExportingDrive || isExporting}
              onChange={() => setPdfExportType("flattened")}
              style={{
                width: "16px",
                height: "16px",
                marginBlockStart: "var(--space-0)",
                accentColor: "var(--accent-text)",
                cursor: "pointer",
              }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-0)" }}>
              <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text-main)" }}>
                {t("export.pdfExportFlattened")}
              </span>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                {t("export.pdfExportFlattenedHint")}
              </span>
            </div>
          </label>

          {/* Option C: Clean PDF */}
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "var(--space-2)",
              cursor: isExportingDrive || isExporting ? "not-allowed" : "pointer",
              userSelect: "none",
            }}
          >
            <input
              type="radio"
              name="pdf-export-mode"
              data-testid="export-pdf-clean"
              value="clean"
              checked={pdfExportType === "clean"}
              disabled={isExportingDrive || isExporting}
              onChange={() => setPdfExportType("clean")}
              style={{
                width: "16px",
                height: "16px",
                marginBlockStart: "var(--space-0)",
                accentColor: "var(--accent-text)",
                cursor: "pointer",
              }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-0)" }}>
              <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text-main)" }}>
                {t("export.pdfExportClean")}
              </span>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                {t("export.pdfExportCleanHint")}
              </span>
            </div>
          </label>

          {projectPdfs !== null && projectPdfs.length === 0 && (
            <span
              style={{
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                fontStyle: "italic",
                paddingInlineStart: "var(--space-3)",
              }}
            >
              {t("export.pdfExportNoPdfs")}
            </span>
          )}
        </div>

        {/* SECTION 2: Project Backup (.alpha) */}
        <div
          data-testid="export-alpha-section"
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
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
              <span style={{ fontSize: "1rem" }}>📦</span>
              <h3
                style={{
                  margin: 0,
                  fontSize: "0.9375rem",
                  fontWeight: 600,
                  color: "var(--text-main)",
                }}
              >
                {t("export.alphaSectionTitle")}
              </h3>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: "0.75rem",
                color: "var(--text-muted)",
                lineHeight: 1.4,
              }}
            >
              {t("export.alphaSectionDesc")}
            </p>
          </div>

          {/* Option 1: Include PDFs */}
          <label
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "var(--space-2)",
              cursor: isExporting ? "not-allowed" : "pointer",
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
                marginBlockStart: "var(--space-0)",
                accentColor: "var(--accent-text)",
                cursor: "pointer",
              }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-0)" }}>
              <span style={{ fontSize: "0.875rem", fontWeight: 500, color: "var(--text-main)" }}>
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
              cursor: isExporting || !includePdfs ? "not-allowed" : "pointer",
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
                marginBlockStart: "var(--space-0)",
                accentColor: "var(--accent-text)",
                cursor: isExporting || !includePdfs ? "not-allowed" : "pointer",
              }}
            />
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-0)" }}>
              <span
                style={{
                  fontSize: "0.875rem",
                  fontWeight: 500,
                  color: "var(--text-main)",
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

        {/* Error notification */}
        {error && (
          <div
            role="alert"
            data-testid="export-error"
            style={{
              padding: "var(--space-1) var(--space-2)",
              backgroundColor: "var(--danger-bg)",
              border: "1px solid var(--danger-fill)",
              borderRadius: "var(--radius-sm)",
              color: "var(--danger-text)",
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
            justifyContent: "space-between",
            gap: "var(--space-2)",
            marginBlockStart: "var(--space-1)",
            flexWrap: "nowrap",
          }}
        >
          <button
            type="button"
            data-testid="export-cancel-btn"
            disabled={isExporting || isExportingDrive}
            onClick={onClose}
            style={{
              height: "var(--space-5)",
              paddingInline: "var(--space-2)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-card)",
              backgroundColor: "var(--bg-subtle)",
              color: "var(--text-main)",
              fontSize: "0.875rem",
              fontWeight: 500,
              cursor: isExporting || isExportingDrive ? "not-allowed" : "pointer",
              whiteSpace: "nowrap",
              flexShrink: 0,
            }}
          >
            {t("export.cancel")}
          </button>

          <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)", flexShrink: 0 }}>
            {/* Button 2: Export PDFs to Drive */}
            <button
              type="button"
              data-testid="export-drive-btn"
              disabled={isExporting || isExportingDrive || (projectPdfs !== null && projectPdfs.length === 0)}
              onClick={handleExportToDrive}
              title={
                projectPdfs !== null && projectPdfs.length === 0
                  ? t("export.pdfExportNoPdfs")
                  : t("export.exportPdfsToDrive")
              }
              style={{
                height: "var(--space-5)",
                paddingInline: "var(--space-2)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--accent-text)",
                backgroundColor: "var(--btn-outline-hover-bg)",
                color: "var(--accent-text-strong)",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor:
                  isExporting || isExportingDrive
                    ? "wait"
                    : projectPdfs !== null && projectPdfs.length === 0
                    ? "not-allowed"
                    : "pointer",
                opacity: projectPdfs !== null && projectPdfs.length === 0 ? 0.5 : 1,
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--space-1)",
                whiteSpace: "nowrap",
                flexShrink: 0,
                transition: "background-color 150ms ease, opacity 150ms ease",
              }}
            >
              <span>☁</span>
              <span>
                {driveSuccess
                  ? t("export.exportedPdfsToDrive")
                  : isExportingDrive
                  ? t("export.exportingPdfsToDrive")
                  : t("export.exportPdfsToDrive")}
              </span>
            </button>

            {/* Button 1: Export .alpha */}
            <button
              ref={exportBtnRef}
              type="button"
              data-testid="export-submit-btn"
              disabled={isExporting || isExportingDrive}
              onClick={handleExport}
              style={{
                height: "var(--space-5)",
                paddingInline: "var(--space-2)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-card)",
                background: "var(--btn-gold-bg)",
                color: "var(--btn-gold-text)",
                fontSize: "0.875rem",
                fontWeight: 600,
                cursor: isExporting || isExportingDrive ? "wait" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "var(--space-1)",
                whiteSpace: "nowrap",
                flexShrink: 0,
                transition: "opacity 150ms ease",
              }}
            >
              <span>⤓</span>
              <span>{isExporting ? t("export.exporting") : t("export.action")}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
