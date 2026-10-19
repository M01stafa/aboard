"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthGuard } from "./auth-guard";
import { signOut } from "@/core/supabase";
import { useI18n } from "@/i18n/provider";
import { Card } from "@/components/card";
import { DriveStatusBanner } from "@/components/drive-status-banner";
import {
  projectService,
  projectIndex,
  getProjectStorageBadge,
  type ProjectIndexRow,
} from "@/core/storage";
import { importAlpha, ImportError } from "@/core/alpha";
import { getDeviceId } from "@/core/db/lifecycle";
import type { I18nKey } from "@/i18n/types";
import type { User } from "@supabase/supabase-js";

export function LauncherContent({ user }: { user: User }) {
  const { t } = useI18n();
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Project index & device state
  const [projects, setProjects] = useState<ProjectIndexRow[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string | null>(null);

  // Card creation & UI action states
  const [creatingKind, setCreatingKind] = useState<"board" | "pdf" | "circuit" | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameTitle, setRenameTitle] = useState<string>("");
  const [deletingProject, setDeletingProject] = useState<ProjectIndexRow | null>(null);
  const [driveNotice, setDriveNotice] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [signingOut, setSigningOut] = useState<boolean>(false);

  // Load device ID and recent project list from Supabase
  const loadRecentProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const devId = await getDeviceId(user.id);
      setDeviceId(devId);
      const list = await projectIndex.fetchRecentProjects();
      setProjects(list);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load projects";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [user.id]);

  useEffect(() => {
    let cancelled = false;
    async function init() {
      try {
        const devId = await getDeviceId(user.id);
        if (cancelled) return;
        setDeviceId(devId);
        const list = await projectIndex.fetchRecentProjects();
        if (cancelled) return;
        setProjects(list);
      } catch (err: unknown) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : "Failed to load projects";
        setError(msg);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }
    init();
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  // Create project via ProjectService (wires Dexie + Supabase project row insert)
  async function handleCreateProject(kind: "board" | "pdf" | "circuit") {
    if (creatingKind) return;
    setCreatingKind(kind);
    try {
      const currentDevId = deviceId ?? (await getDeviceId(user.id));
      const defaultTitle =
        kind === "board"
          ? t("launcher.newWhiteboard")
          : kind === "pdf"
          ? t("launcher.newPdf")
          : t("launcher.newCircuit");

      const manifest = await projectService.createProject(defaultTitle, undefined, {
        storage: "local",
        localDeviceId: currentDevId,
      });

      router.push(`/workspace?p=${manifest.project.id}&kind=${kind}`);
    } catch (err) {
      console.error("Failed to create project:", err);
      setCreatingKind(null);
    }
  }

  // Open project in workspace if interactive
  function handleOpenProject(p: ProjectIndexRow) {
    const badge = getProjectStorageBadge(p, deviceId);
    if (!badge.isInteractive) return;
    router.push(`/workspace?p=${p.id}`);
  }

  // Rename handlers
  function handleStartRename(p: ProjectIndexRow, e?: React.MouseEvent) {
    e?.stopPropagation();
    setRenamingId(p.id);
    setRenameTitle(p.title);
  }

  function handleCancelRename(e?: React.MouseEvent) {
    e?.stopPropagation();
    setRenamingId(null);
  }

  async function handleSaveRename(projectId: string, e?: React.FormEvent) {
    e?.preventDefault();
    const trimmed = renameTitle.trim();
    if (!trimmed) return;
    try {
      await projectService.renameProject(projectId, trimmed);
      setProjects((prev) =>
        prev.map((p) => (p.id === projectId ? { ...p, title: trimmed } : p))
      );
      setRenamingId(null);
    } catch (err) {
      console.error("Failed to rename project:", err);
    }
  }

  // Delete handlers
  function handleStartDelete(p: ProjectIndexRow, e?: React.MouseEvent) {
    e?.stopPropagation();
    setDeletingProject(p);
  }

  async function handleConfirmDelete() {
    if (!deletingProject) return;
    const target = deletingProject;
    try {
      if (target.storage === "local") {
        await projectService.deleteProject(target.id, "local");
        setProjects((prev) => prev.filter((p) => p.id !== target.id));
      } else {
        // Drive project stub
        await projectService.deleteProject(target.id, "drive");
        setProjects((prev) => prev.filter((p) => p.id !== target.id));
        setDriveNotice(t("launcher.driveTrashNotice"));
        setTimeout(() => setDriveNotice(null), 6000);
      }
    } catch (err) {
      console.error("Failed to delete project:", err);
    } finally {
      setDeletingProject(null);
    }
  }

  async function handleImportFile(file: File) {
    if (isImporting) return;
    setIsImporting(true);
    setImportError(null);
    try {
      const result = await importAlpha(file, { userId: user.id });
      router.push(`/workspace?p=${result.projectId}`);
    } catch (err: unknown) {
      console.error("Import error:", err);
      if (err instanceof ImportError) {
        const errorKeyMap: Record<string, I18nKey> = {
          not_alpha_file: "import.errors.not_alpha_file",
          too_many_entries: "import.errors.too_many_entries",
          total_size_exceeded: "import.errors.total_size_exceeded",
          entry_too_large: "import.errors.entry_too_large",
          zip_bomb_detected: "import.errors.zip_bomb_detected",
          path_traversal: "import.errors.path_traversal",
          missing_manifest: "import.errors.missing_manifest",
          invalid_manifest: "import.errors.invalid_manifest",
          newer_format: "import.errors.newer_format",
          hash_mismatch: "import.errors.hash_mismatch",
          missing_file: "import.errors.missing_file",
          missing_item: "import.errors.missing_item",
          corrupted_zip: "import.errors.corrupted_zip",
        };
        const key = errorKeyMap[err.code];
        setImportError(key ? t(key) : err.message);
      } else {
        const msg = err instanceof Error ? err.message : t("import.errors.corrupted_zip");
        setImportError(msg);
      }
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function handleFileInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      handleImportFile(file);
    }
  }

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) {
      handleImportFile(file);
    }
  }

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.replace("/login");
  }

  function formatDateTime(isoString: string): string {
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return isoString;
    }
  }

  return (
    <main
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        position: "relative",
        paddingInline: "var(--space-4)",
        paddingBlock: "var(--space-6)",
        maxInlineSize: "120ch",
        marginInline: "auto",
        fontFamily: "var(--font-sans)",
        color: "var(--text-main)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-6)",
        boxSizing: "border-box",
        inlineSize: "100%",
      }}
    >
      <DriveStatusBanner />
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        style={{ display: "none" }}
        data-testid="launcher-alpha-file-input"
      />
      {isDragging && (
        <div
          data-testid="launcher-drop-overlay"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "var(--overlay-backdrop)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "var(--space-2)",
            border: "3px dashed var(--accent-text)",
            margin: "var(--space-4)",
            borderRadius: "var(--radius-lg)",
            pointerEvents: "none",
            zIndex: 100,
          }}
        >
          <div
            style={{
              fontSize: "1.25rem",
              fontWeight: "var(--weight-bold)",
              color: "var(--text-main)",
            }}
          >
            {t("import.dropToImport")}
          </div>
        </div>
      )}
      <style>{`
        .launcher-card {
          position: relative;
          background-color: var(--bg-surface);
          border: 1px solid var(--border-card);
          border-radius: var(--radius-md);
          padding: var(--space-3);
          box-shadow: var(--shadow-1);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          inline-size: 100%;
          box-sizing: border-box;
          transition: transform var(--motion-base) var(--ease-standard),
                      box-shadow var(--motion-base) var(--ease-standard),
                      border-color var(--motion-fast) var(--ease-standard);
        }
        .launcher-card::before {
          content: "";
          position: absolute;
          inset-block-start: 0;
          inset-inline-start: 0;
          inline-size: 100%;
          block-size: 2px;
          background: var(--gradient-accent);
        }
        .cards-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: var(--space-3);
          inline-size: 100%;
        }
        @media (min-width: 640px) {
          .cards-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .cards-grid > article:nth-child(3) {
            grid-column: span 2;
            max-inline-size: 56ch;
            margin-inline: auto;
            inline-size: 100%;
          }
        }
        @media (min-width: 960px) {
          .cards-grid {
            grid-template-columns: repeat(3, 1fr);
          }
          .cards-grid > article:nth-child(3) {
            grid-column: auto;
            max-inline-size: 100%;
            margin-inline: 0;
          }
        }
        .recent-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: var(--space-3);
          inline-size: 100%;
        }
        @media (min-width: 640px) {
          .recent-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (min-width: 960px) {
          .recent-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
        .recent-card {
          position: relative;
          background-color: var(--bg-surface);
          border: 1px solid var(--border-card);
          border-radius: var(--radius-md);
          padding: var(--space-3);
          box-shadow: var(--shadow-1);
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          gap: var(--space-3);
          box-sizing: border-box;
          inline-size: 100%;
          text-align: start;
          transition: transform var(--motion-base) var(--ease-standard),
                      box-shadow var(--motion-base) var(--ease-standard),
                      border-color var(--motion-fast) var(--ease-standard);
        }
        .recent-card-interactive {
          cursor: pointer;
        }
        .recent-card-disabled {
          opacity: 0.68;
          cursor: not-allowed;
        }
        .btn-gold {
          background-color: var(--btn-gold-bg);
          color: var(--btn-gold-text);
          border: 0;
          border-radius: var(--radius-sm);
          block-size: var(--control-md);
          padding-block: 0;
          padding-inline: var(--space-3);
          font-weight: var(--weight-semibold);
          font-size: 0.875rem;
          font-family: var(--font-sans);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-1);
          box-sizing: border-box;
          inline-size: 100%;
          transition: background-color var(--motion-fast) var(--ease-standard),
                      box-shadow var(--motion-base) var(--ease-standard);
        }
        .btn-primary {
          background-color: var(--btn-primary-bg);
          color: var(--btn-primary-text);
          border: 0;
          border-radius: var(--radius-sm);
          block-size: var(--control-md);
          padding-block: 0;
          padding-inline: var(--space-3);
          font-weight: var(--weight-semibold);
          font-size: 0.875rem;
          font-family: var(--font-sans);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-1);
          box-sizing: border-box;
          inline-size: 100%;
          transition: background-color var(--motion-fast) var(--ease-standard),
                      box-shadow var(--motion-base) var(--ease-standard);
        }
        .btn-tech {
          background-color: transparent;
          color: var(--accent-text);
          border: 2px solid var(--accent-text);
          border-radius: var(--radius-sm);
          block-size: var(--control-md);
          padding-block: 0;
          padding-inline: var(--space-3);
          font-weight: var(--weight-semibold);
          font-size: 0.875rem;
          font-family: var(--font-sans);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-1);
          box-sizing: border-box;
          inline-size: 100%;
          transition: background-color var(--motion-fast) var(--ease-standard),
                      color var(--motion-fast) var(--ease-standard),
                      box-shadow var(--motion-base) var(--ease-standard);
        }
        .btn-subtle {
          background-color: var(--bg-subtle);
          color: var(--text-main);
          border: 1px solid var(--border-card);
          border-radius: var(--radius-sm);
          block-size: var(--control-md);
          padding-block: 0;
          padding-inline: var(--space-3);
          font-weight: var(--weight-medium);
          font-size: 0.875rem;
          font-family: var(--font-sans);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-1);
          box-sizing: border-box;
          text-decoration: none;
          transition: background-color var(--motion-fast) var(--ease-standard),
                      border-color var(--motion-fast) var(--ease-standard);
        }
        .btn-danger-outline {
          background-color: transparent;
          color: var(--danger-text);
          border: 1px solid var(--danger-bg);
          border-radius: var(--radius-sm);
          block-size: var(--control-sm);
          padding-block: 0;
          padding-inline: var(--space-2);
          font-weight: var(--weight-medium);
          font-size: 0.8125rem;
          font-family: var(--font-sans);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
          transition: background-color var(--motion-fast) var(--ease-standard),
                      border-color var(--motion-fast) var(--ease-standard);
        }
        .btn-gold:focus-visible,
        .btn-primary:focus-visible,
        .btn-tech:focus-visible,
        .btn-subtle:focus-visible,
        .btn-danger-outline:focus-visible,
        .launcher-card:focus-visible,
        .recent-card:focus-visible {
          outline: 2px solid var(--focus-ring);
          outline-offset: 2px;
        }
        @media (hover: hover) {
          .launcher-card:hover {
            transform: translateY(-2px);
            box-shadow: var(--shadow-2);
          }
          .recent-card-interactive:hover {
            transform: translateY(-2px);
            box-shadow: var(--shadow-2);
            border-color: var(--border-input);
          }
          .btn-gold:hover {
            background-color: var(--btn-gold-hover);
            box-shadow: var(--glow-gold);
          }
          .btn-primary:hover {
            background-color: var(--btn-primary-hover);
            box-shadow: var(--shadow-2);
          }
          .btn-tech:hover {
            background-color: var(--btn-outline-hover-bg);
            color: var(--accent-text-strong);
            box-shadow: var(--glow-tech);
          }
          .btn-subtle:hover {
            background-color: var(--bg-surface);
            border-color: var(--border-input);
          }
          .btn-danger-outline:hover {
            background-color: var(--danger-bg);
            border-color: var(--danger-text);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .launcher-card:hover,
          .recent-card-interactive:hover {
            transform: none;
          }
        }
      `}</style>

      {/* Top Header Bar */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "var(--space-3)",
          paddingBlockEnd: "var(--space-4)",
          borderBlockEnd: "1px solid var(--border-card)",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <div
            style={{
              inlineSize: "32px",
              blockSize: "32px",
              borderRadius: "var(--radius-sm)",
              background: "var(--gradient-accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--btn-gold-text)",
              fontWeight: "var(--weight-bold)",
              fontSize: "1rem",
              boxSizing: "border-box",
            }}
          >
            α
          </div>
          <span
            style={{
              fontSize: "1.25rem",
              fontWeight: "var(--weight-bold)",
              color: "var(--text-main)",
            }}
          >
            {t("common.appName")}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "var(--space-2)",
          }}
        >
          <span
            style={{
              fontSize: "0.875rem",
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)",
            }}
          >
            <bdi dir="ltr">{user.email}</bdi>
          </span>

          <Link href="/settings" className="btn-subtle" style={{ blockSize: "var(--control-sm)" }}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            {t("common.settings")}
          </Link>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="btn-danger-outline"
            data-testid="sign-out-btn"
          >
            {signingOut ? t("auth.signingOut") : t("auth.signOut")}
          </button>
        </div>
      </header>

      {/* Hero / Title Area */}
      <section
        aria-label={t("launcher.pageTitle")}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-1)",
            maxInlineSize: "65ch",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: "2rem",
              lineHeight: "2.5rem",
              fontWeight: "var(--weight-bold)",
              color: "var(--text-main)",
            }}
          >
            {t("launcher.pageTitle")}
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: "1rem",
              lineHeight: "1.5rem",
              color: "var(--text-muted)",
            }}
          >
            {t("launcher.tagline")}
          </p>
        </div>

        {/* Secondary Action: Open .alpha file */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "var(--space-2)",
            marginBlockStart: "var(--space-1)",
          }}
        >
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isImporting}
            className="btn-subtle"
            data-testid="open-alpha-btn"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" x2="12" y1="15" y2="3" />
            </svg>
            <span>{isImporting ? t("import.importing") : t("launcher.openAlpha")}</span>
          </button>
        </div>

        {/* Import Error Banner */}
        {importError && (
          <div
            role="alert"
            data-testid="launcher-import-error"
            style={{
              fontSize: "0.875rem",
              color: "var(--danger-text)",
              backgroundColor: "var(--danger-bg)",
              border: "1px solid var(--danger-text)",
              paddingBlock: "var(--space-2)",
              paddingInline: "var(--space-3)",
              borderRadius: "var(--radius-sm)",
              lineHeight: "1.25rem",
              boxSizing: "border-box",
              marginBlockStart: "var(--space-1)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--space-2)",
            }}
          >
            <span>{importError}</span>
            <button
              type="button"
              onClick={() => setImportError(null)}
              aria-label={t("launcher.cancel")}
              style={{
                background: "none",
                border: "none",
                color: "var(--danger-text)",
                cursor: "pointer",
                padding: "var(--space-1)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "1rem",
                lineHeight: "1rem",
              }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Transient Drive Notice banner */}
        {driveNotice && (
          <div
            role="status"
            style={{
              fontSize: "0.875rem",
              color: "var(--badge-tech-fg)",
              backgroundColor: "var(--badge-tech-bg)",
              border: "1px solid var(--badge-tech-bd)",
              paddingBlock: "var(--space-2)",
              paddingInline: "var(--space-3)",
              borderRadius: "var(--radius-sm)",
              lineHeight: "1.25rem",
              boxSizing: "border-box",
              marginBlockStart: "var(--space-1)",
            }}
          >
            {driveNotice}
          </div>
        )}
      </section>

      {/* Balanced 3-Card Tool Grid */}
      <section
        aria-label={t("launcher.pageTitle")}
        className="cards-grid"
      >
        {/* Card 1: New Whiteboard (R7: Single Gold CTA button on page) */}
        <Card
          testId="card-whiteboard"
          iconBg="var(--badge-gold-bg)"
          iconColor="var(--badge-gold-fg)"
          iconBorder="var(--badge-gold-bd)"
          icon={
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m18 5-3-3H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2" />
              <path d="M8 18h1" />
              <path d="M18.4 9.6a2 2 0 1 1 3 3L14 20l-4 1 1-4Z" />
            </svg>
          }
          title={t("launcher.newWhiteboard")}
          description={t("launcher.newWhiteboardDesc")}
          action={
            <button
              type="button"
              onClick={() => handleCreateProject("board")}
              disabled={creatingKind !== null}
              className="btn-gold"
              data-testid="create-whiteboard-btn"
            >
              {creatingKind === "board" ? t("saveStatus.saving") : t("launcher.newWhiteboardCta")}
            </button>
          }
        />

        {/* Card 2: New PDF (Primary button) */}
        <Card
          testId="card-pdf"
          iconBg="var(--badge-primary-bg)"
          iconColor="var(--badge-primary-fg)"
          iconBorder="var(--badge-primary-bd)"
          icon={
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" x2="8" y1="13" y2="13" />
              <line x1="16" x2="8" y1="17" y2="17" />
              <line x1="10" x2="8" y1="9" y2="9" />
            </svg>
          }
          title={t("launcher.newPdf")}
          description={t("launcher.newPdfDesc")}
          action={
            <button
              type="button"
              onClick={() => handleCreateProject("pdf")}
              disabled={creatingKind !== null}
              className="btn-primary"
              data-testid="create-pdf-btn"
            >
              {creatingKind === "pdf" ? t("saveStatus.saving") : t("launcher.newPdfCta")}
            </button>
          }
        />

        {/* Card 3: New Circuit (Tech outline button) */}
        <Card
          testId="card-circuit"
          iconBg="var(--badge-tech-bg)"
          iconColor="var(--badge-tech-fg)"
          iconBorder="var(--badge-tech-bd)"
          icon={
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M7 7h10" />
              <path d="M7 12h10" />
              <path d="M7 17h10" />
            </svg>
          }
          title={t("launcher.newCircuit")}
          description={t("launcher.newCircuitDesc")}
          action={
            <button
              type="button"
              onClick={() => handleCreateProject("circuit")}
              disabled={creatingKind !== null}
              className="btn-tech"
              data-testid="create-circuit-btn"
            >
              {creatingKind === "circuit" ? t("saveStatus.saving") : t("launcher.newCircuitCta")}
            </button>
          }
        />
      </section>

      {/* Recent Projects Section */}
      <section
        aria-labelledby="recent-projects-heading"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
          marginBlockStart: "var(--space-2)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
          }}
        >
          <h2
            id="recent-projects-heading"
            data-testid="recent-projects-heading"
            style={{
              margin: 0,
              fontSize: "1.25rem",
              lineHeight: "1.75rem",
              fontWeight: "var(--weight-semibold)",
              color: "var(--text-main)",
            }}
          >
            {t("launcher.recentProjects")}
          </h2>
          <span
            data-testid="recent-projects-count"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              minInlineSize: "var(--space-3)",
              blockSize: "var(--space-3)",
              paddingInline: "var(--space-1)",
              borderRadius: "var(--radius-full)",
              backgroundColor: "var(--bg-subtle)",
              border: "1px solid var(--border-card)",
              fontSize: "0.75rem",
              fontWeight: "var(--weight-medium)",
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)",
              boxSizing: "border-box",
            }}
          >
            {loading ? "…" : projects.length}
          </span>
        </div>

        {/* 1. Loading State */}
        {loading && (
          <div
            data-testid="recent-projects-loading"
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-card)",
              borderRadius: "var(--radius-md)",
              paddingBlock: "var(--space-6)",
              paddingInline: "var(--space-4)",
              textAlign: "center",
              color: "var(--text-muted)",
              fontSize: "0.875rem",
              boxSizing: "border-box",
            }}
          >
            {t("launcher.loadingRecent")}
          </div>
        )}

        {/* 2. Error State */}
        {!loading && error && (
          <div
            data-testid="recent-projects-error"
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-card)",
              borderRadius: "var(--radius-md)",
              paddingBlock: "var(--space-5)",
              paddingInline: "var(--space-4)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "var(--space-2)",
              textAlign: "center",
              boxSizing: "border-box",
            }}
          >
            <span style={{ color: "var(--danger-text)", fontWeight: "var(--weight-medium)" }}>
              {t("launcher.recentError")}
            </span>
            <button
              type="button"
              onClick={loadRecentProjects}
              className="btn-subtle"
              style={{ blockSize: "var(--control-sm)" }}
              data-testid="retry-recent-btn"
            >
              {t("launcher.retry")}
            </button>
          </div>
        )}

        {/* 3. Empty State */}
        {!loading && !error && projects.length === 0 && (
          <div
            data-testid="recent-projects-empty"
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-card)",
              borderRadius: "var(--radius-md)",
              paddingBlock: "var(--space-6)",
              paddingInline: "var(--space-4)",
              boxShadow: "var(--shadow-1)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              gap: "var(--space-2)",
              boxSizing: "border-box",
            }}
          >
            <div
              style={{
                inlineSize: "var(--control-lg)",
                blockSize: "var(--control-lg)",
                borderRadius: "var(--radius-full)",
                backgroundColor: "var(--bg-subtle)",
                border: "1px solid var(--border-card)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "var(--accent-text)",
                boxSizing: "border-box",
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
              </svg>
            </div>

            <span
              style={{
                fontSize: "1rem",
                fontWeight: "var(--weight-medium)",
                color: "var(--text-main)",
                lineHeight: "1.5rem",
              }}
            >
              {t("launcher.recentProjectsEmpty")}
            </span>
            <p
              style={{
                margin: 0,
                fontSize: "0.875rem",
                color: "var(--text-muted)",
                lineHeight: "1.5rem",
                maxInlineSize: "45ch",
              }}
            >
              {t("launcher.recentProjectsHint")}
            </p>
          </div>
        )}

        {/* 4. Populated State */}
        {!loading && !error && projects.length > 0 && (
          <div className="recent-grid" data-testid="recent-projects-list">
            {projects.map((project) => {
              const badge = getProjectStorageBadge(project, deviceId);
              const isRenaming = renamingId === project.id;

              return (
                <article
                  key={project.id}
                  data-testid={`project-card-${project.id}`}
                  className={`recent-card ${
                    badge.isInteractive ? "recent-card-interactive" : "recent-card-disabled"
                  }`}
                  onClick={() => handleOpenProject(project)}
                >
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "var(--space-2)",
                    }}
                  >
                    {/* Header: Storage Badge + Timestamp */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: "var(--space-1)",
                      }}
                    >
                      <span
                        data-testid={`badge-${project.id}`}
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          paddingBlock: "var(--space-1)",
                          paddingInline: "var(--space-2)",
                          borderRadius: "var(--radius-full)",
                          fontSize: "0.75rem",
                          fontWeight: "var(--weight-medium)",
                          lineHeight: "1rem",
                          backgroundColor: `var(${badge.tokenPrefix}-bg)`,
                          color: `var(${badge.tokenPrefix}-fg)`,
                          border: `1px solid var(${badge.tokenPrefix}-bd)`,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {t(badge.labelKey)}
                      </span>

                      <time
                        dateTime={project.updated_at}
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--text-muted)",
                          fontFamily: "var(--font-mono)",
                        }}
                      >
                        {t("launcher.updatedPrefix")} {formatDateTime(project.updated_at)}
                      </time>
                    </div>

                    {/* Title & Subject or Inline Rename Input */}
                    {isRenaming ? (
                      <form
                        onSubmit={(e) => handleSaveRename(project.id, e)}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "var(--space-1)",
                          marginBlockStart: "var(--space-1)",
                        }}
                      >
                        <input
                          type="text"
                          autoFocus
                          value={renameTitle}
                          onChange={(e) => setRenameTitle(e.target.value)}
                          data-testid={`rename-input-${project.id}`}
                          style={{
                            blockSize: "var(--control-sm)",
                            paddingInline: "var(--space-2)",
                            backgroundColor: "var(--input-bg)",
                            border: "1px solid var(--border-input)",
                            borderRadius: "var(--radius-sm)",
                            color: "var(--text-main)",
                            fontSize: "0.875rem",
                            fontFamily: "var(--font-sans)",
                            boxSizing: "border-box",
                            inlineSize: "100%",
                          }}
                        />
                        <div
                          style={{
                            display: "flex",
                            gap: "var(--space-1)",
                            justifyContent: "flex-end",
                          }}
                        >
                          <button
                            type="button"
                            onClick={handleCancelRename}
                            className="btn-subtle"
                            style={{
                              blockSize: "var(--control-sm)",
                              paddingInline: "var(--space-2)",
                              fontSize: "0.8125rem",
                            }}
                          >
                            {t("launcher.cancel")}
                          </button>
                          <button
                            type="submit"
                            className="btn-primary"
                            style={{
                              blockSize: "var(--control-sm)",
                              paddingInline: "var(--space-2)",
                              fontSize: "0.8125rem",
                            }}
                            data-testid={`rename-save-${project.id}`}
                          >
                            {t("launcher.save")}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "var(--space-1)",
                        }}
                      >
                        <h3
                          data-testid={`project-title-${project.id}`}
                          style={{
                            margin: 0,
                            fontSize: "1.0625rem",
                            lineHeight: "1.5rem",
                            fontWeight: "var(--weight-semibold)",
                            color: "var(--text-main)",
                            wordBreak: "break-word",
                          }}
                        >
                          {project.title}
                        </h3>
                        {project.subject && (
                          <span
                            style={{
                              fontSize: "0.8125rem",
                              color: "var(--text-muted)",
                            }}
                          >
                            {project.subject}
                          </span>
                        )}
                        {!badge.isInteractive && (
                          <span
                            data-testid={`disabled-hint-${project.id}`}
                            style={{
                              fontSize: "0.8125rem",
                              color: "var(--text-muted)",
                              fontStyle: "italic",
                              marginBlockStart: "var(--space-1)",
                            }}
                          >
                            {t("launcher.anotherDeviceHint")}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions: Rename / Delete buttons */}
                  {!isRenaming && (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        gap: "var(--space-2)",
                        borderBlockStart: "1px solid var(--border-card)",
                        paddingBlockStart: "var(--space-2)",
                        marginBlockStart: "var(--space-1)",
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={(e) => handleStartRename(project, e)}
                        className="btn-subtle"
                        style={{
                          blockSize: "var(--control-sm)",
                          paddingInline: "var(--space-2)",
                          fontSize: "0.8125rem",
                        }}
                        data-testid={`rename-btn-${project.id}`}
                      >
                        {t("launcher.rename")}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleStartDelete(project, e)}
                        className="btn-danger-outline"
                        data-testid={`delete-btn-${project.id}`}
                      >
                        {t("launcher.delete")}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Delete Confirmation Modal */}
      {deletingProject && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "var(--overlay-backdrop)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "var(--space-3)",
            zIndex: 50,
          }}
          onClick={() => setDeletingProject(null)}
        >
          <div
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-card)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-4)",
              maxInlineSize: "46ch",
              inlineSize: "100%",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
              boxShadow: "var(--shadow-3)",
              boxSizing: "border-box",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              id="delete-dialog-title"
              style={{
                margin: 0,
                fontSize: "1.125rem",
                fontWeight: "var(--weight-semibold)",
                color: "var(--text-main)",
              }}
            >
              {t("launcher.confirmDeleteTitle")}
            </h3>
            <p
              style={{
                margin: 0,
                fontSize: "0.875rem",
                lineHeight: "1.5rem",
                color: "var(--text-muted)",
              }}
            >
              {t("launcher.confirmDelete")}
            </p>
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "var(--space-2)",
                marginBlockStart: "var(--space-1)",
              }}
            >
              <button
                type="button"
                className="btn-subtle"
                style={{ blockSize: "var(--control-sm)" }}
                onClick={() => setDeletingProject(null)}
              >
                {t("launcher.cancel")}
              </button>
              <button
                type="button"
                className="btn-danger-outline"
                style={{
                  blockSize: "var(--control-sm)",
                  backgroundColor: "var(--danger-bg)",
                  color: "var(--danger-text)",
                  borderColor: "var(--danger-text)",
                }}
                onClick={handleConfirmDelete}
                data-testid="confirm-delete-btn"
              >
                {t("launcher.delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Footer Navigation */}
      <footer
        style={{
          marginBlockStart: "var(--space-6)",
          paddingBlockStart: "var(--space-4)",
          borderBlockStart: "1px solid var(--border-card)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "var(--space-2)",
          fontSize: "0.8125rem",
          color: "var(--text-muted)",
          boxSizing: "border-box",
        }}
      >
        <span>
          © {new Date().getFullYear()} {t("common.appName")}
        </span>

        <nav style={{ display: "flex", gap: "var(--space-3)" }}>
          <Link
            href="/privacy"
            style={{
              color: "var(--text-muted)",
              textDecoration: "none",
            }}
          >
            {t("legal.privacyTitle")}
          </Link>
          <Link
            href="/terms"
            style={{
              color: "var(--text-muted)",
              textDecoration: "none",
            }}
          >
            {t("legal.termsTitle")}
          </Link>
          <Link
            href="/licenses"
            style={{
              color: "var(--text-muted)",
              textDecoration: "none",
            }}
          >
            {t("legal.licensesTitle")}
          </Link>
        </nav>
      </footer>
    </main>
  );
}

export default function LauncherPage() {
  return (
    <AuthGuard>
      {({ user }) => <LauncherContent user={user} />}
    </AuthGuard>
  );
}
