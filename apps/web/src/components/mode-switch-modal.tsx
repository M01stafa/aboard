"use client";

import React, { useState, useEffect, useRef } from "react";
import { useI18n } from "@/i18n/provider";
import { projectService, type ProjectService } from "@/core/storage";

export interface ModeSwitchModalProps {
  projectId: string;
  projectTitle: string;
  targetMode: "drive" | "local";
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  projectServiceOverride?: ProjectService;
}

export function ModeSwitchModal({
  projectId,
  projectTitle,
  targetMode,
  isOpen,
  onClose,
  onSuccess,
  projectServiceOverride,
}: ModeSwitchModalProps) {
  const { t } = useI18n();
  const ps = projectServiceOverride ?? projectService;

  const [stage, setStage] = useState<"idle" | "running" | "prompt-trash" | "done" | "error">("idle");
  const [progressPercent, setProgressPercent] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryBtnRef = useRef<HTMLButtonElement>(null);

  // Focus management and keyboard accessibility (R5 & modal focus trap)
  useEffect(() => {
    if (!isOpen) return;

    const timer = setTimeout(() => {
      primaryBtnRef.current?.focus();
    }, 50);

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && stage !== "running") {
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
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, stage, onClose]);

  if (!isOpen) return null;

  async function handleStart() {
    setStage("running");
    setProgressPercent(10);
    setProgressText(
      targetMode === "drive"
        ? t("modeSwitch.movingToDrive")
        : t("modeSwitch.movingToLocal")
    );

    try {
      if (targetMode === "drive") {
        await ps.moveProject(projectId, "drive", {
          onProgress: (currentStage, current, total) => {
            const base = currentStage === "files" ? 20 : currentStage === "items" ? 60 : 85;
            const portion = total > 0 ? (current / total) * 30 : 0;
            setProgressPercent(Math.min(95, Math.round(base + portion)));
            if (currentStage === "files") {
              setProgressText(t("modeSwitch.uploadingFiles", { current: String(current), total: String(total) }));
            } else if (currentStage === "items") {
              setProgressText(t("modeSwitch.uploadingFiles", { current: String(current), total: String(total) }));
            }
          },
        });
        setProgressPercent(100);
        setStage("done");
        setTimeout(() => {
          onSuccess?.();
          onClose();
        }, 800);
      } else {
        // Drive -> Local
        await ps.moveProject(projectId, "local", {
          onProgress: (currentStage, current, total) => {
            const base = currentStage === "files" ? 20 : currentStage === "items" ? 60 : 85;
            const portion = total > 0 ? (current / total) * 30 : 0;
            setProgressPercent(Math.min(95, Math.round(base + portion)));
            if (currentStage === "files") {
              setProgressText(t("modeSwitch.downloadingFiles", { current: String(current), total: String(total) }));
            } else if (currentStage === "items") {
              setProgressText(t("modeSwitch.downloadingFiles", { current: String(current), total: String(total) }));
            }
          },
        });
        setProgressPercent(100);
        // Prompt whether to trash the folder in Drive
        setStage("prompt-trash");
      }
    } catch (err: unknown) {
      setStage("error");
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("quota") || msg.includes("storageQuotaExceeded")) {
        setErrorMessage(t("driveErrors.quotaExceeded"));
      } else {
        setErrorMessage(msg);
      }
    }
  }

  async function handleTrashChoice(trash: boolean) {
    if (trash) {
      try {
        const { DriveProvider } = await import("@/core/drive/drive-provider");
        const { trashFile } = await import("@/core/drive/api");
        const { driveTokenManager } = await import("@/core/drive/tokens");
        const dp = new DriveProvider();
        const folderId = await dp.getProjectFolderId(projectId);
        await trashFile(folderId, driveTokenManager);
      } catch (err) {
        console.warn("Could not trash Drive folder:", err);
      }
    }
    setStage("done");
    setTimeout(() => {
      onSuccess?.();
      onClose();
    }, 400);
  }

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "var(--overlay-backdrop, rgba(0, 0, 0, 0.6))",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-3)",
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && stage !== "running") {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="mode-switch-title"
        data-testid="mode-switch-modal"
        style={{
          width: "100%",
          maxWidth: "48ch",
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
        <h2
          id="mode-switch-title"
          style={{
            margin: 0,
            fontSize: "1.25rem",
            fontWeight: 600,
            color: "var(--text-main)",
          }}
        >
          {stage === "prompt-trash"
            ? t("modeSwitch.trashPromptTitle")
            : targetMode === "drive"
            ? t("modeSwitch.moveToDrive")
            : t("modeSwitch.moveToLocal")}
        </h2>

        {stage === "prompt-trash" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <p
              style={{
                margin: 0,
                fontSize: "0.875rem",
                color: "var(--text-muted)",
                lineHeight: 1.5,
              }}
            >
              {t("modeSwitch.trashPromptDescription")}
            </p>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "var(--space-2)",
                marginTop: "var(--space-2)",
              }}
            >
              <button
                type="button"
                data-testid="keep-drive-folder"
                onClick={() => handleTrashChoice(false)}
                className="btn-subtle"
                style={{
                  height: "var(--control-sm)",
                  paddingInline: "var(--space-2)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-input)",
                  backgroundColor: "var(--bg-subtle)",
                  color: "var(--text-main)",
                  fontSize: "0.875rem",
                  cursor: "pointer",
                }}
              >
                {t("modeSwitch.trashKeep")}
              </button>

              <button
                ref={primaryBtnRef}
                type="button"
                data-testid="confirm-trash-drive-folder"
                onClick={() => handleTrashChoice(true)}
                style={{
                  height: "var(--control-sm)",
                  paddingInline: "var(--space-3)",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  backgroundColor: "var(--danger-fill)",
                  color: "var(--btn-primary-text)",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {t("modeSwitch.trashConfirm")}
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <p
              style={{
                margin: 0,
                fontSize: "0.875rem",
                color: "var(--text-muted)",
                lineHeight: 1.5,
              }}
            >
              {targetMode === "drive"
                ? t("modeSwitch.movingToDriveDesc", { title: projectTitle })
                : t("modeSwitch.movingToLocalDesc", { title: projectTitle })}
            </p>

            {/* Progress Bar */}
            {stage === "running" && (
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "var(--space-1)",
                  marginBlock: "var(--space-1)",
                }}
              >
                <div
                  role="progressbar"
                  aria-valuenow={progressPercent}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  data-testid="mode-switch-progress"
                  style={{
                    width: "100%",
                    height: "var(--space-1)",
                    backgroundColor: "var(--bg-subtle)",
                    borderRadius: "var(--radius-full)",
                    overflow: "hidden",
                    border: "1px solid var(--border-card)",
                  }}
                >
                  <div
                    style={{
                      width: "100%",
                      height: "100%",
                      backgroundColor: "var(--accent-text)",
                      transform: `scaleX(${progressPercent / 100})`,
                      transformOrigin: "inline-start",
                      transition: "transform 200ms ease",
                    }}
                  />
                </div>
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  {progressText}
                </span>
              </div>
            )}

            {/* Error Message */}
            {stage === "error" && errorMessage && (
              <div
                role="alert"
                data-testid="mode-switch-error"
                style={{
                  padding: "var(--space-1) var(--space-2)",
                  backgroundColor: "var(--danger-bg)",
                  border: "1px solid var(--danger-fill)",
                  borderRadius: "var(--radius-sm)",
                  color: "var(--danger-text)",
                  fontSize: "0.875rem",
                }}
              >
                {errorMessage}
              </div>
            )}

            {/* Actions */}
            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "var(--space-2)",
                marginTop: "var(--space-1)",
              }}
            >
              <button
                type="button"
                data-testid="mode-switch-cancel-btn"
                disabled={stage === "running"}
                onClick={onClose}
                style={{
                  height: "var(--control-sm)",
                  paddingInline: "var(--space-2)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-card)",
                  backgroundColor: "var(--bg-subtle)",
                  color: "var(--text-main)",
                  fontSize: "0.875rem",
                  cursor: stage === "running" ? "not-allowed" : "pointer",
                }}
              >
                {t("common.cancel")}
              </button>

              <button
                ref={primaryBtnRef}
                type="button"
                data-testid="mode-switch-submit-btn"
                disabled={stage === "running"}
                onClick={handleStart}
                style={{
                  height: "var(--control-sm)",
                  paddingInline: "var(--space-3)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-card)",
                  background: "var(--btn-gold-bg)",
                  color: "var(--btn-gold-text)",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  cursor: stage === "running" ? "wait" : "pointer",
                }}
              >
                {stage === "running"
                  ? t("common.loading")
                  : targetMode === "drive"
                  ? t("modeSwitch.moveToDrive")
                  : t("modeSwitch.moveToLocal")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
