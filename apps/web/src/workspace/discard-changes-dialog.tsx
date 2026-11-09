"use client";

import React, { useEffect, useRef } from "react";
import { useI18n } from "@/i18n/provider";

export interface DiscardChangesDialogProps {
  isOpen: boolean;
  tabTitle?: string;
  tabKind?: "board" | "pdf" | "circuit" | string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function DiscardChangesDialog({
  isOpen,
  tabKind,
  onConfirm,
  onCancel,
}: DiscardChangesDialogProps) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const confirmBtnRef = useRef<HTMLButtonElement>(null);

  // Focus management and keyboard accessibility (Esc to cancel, Enter to confirm)
  useEffect(() => {
    if (!isOpen) return;

    // Default focus to confirm (discard) button so Enter immediately confirms
    const timer = setTimeout(() => {
      confirmBtnRef.current?.focus();
    }, 50);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
        return;
      }

      if (e.key === "Enter") {
        if (document.activeElement === cancelBtnRef.current) {
          e.preventDefault();
          e.stopPropagation();
          onCancel();
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        onConfirm();
        return;
      }

      if (e.key === "Tab" && dialogRef.current) {
        const focusableElements = [cancelBtnRef.current, confirmBtnRef.current].filter(
          Boolean
        ) as HTMLElement[];
        if (focusableElements.length === 0) return;

        const first = focusableElements[0];
        const last = focusableElements[focusableElements.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onCancel, onConfirm]);

  if (!isOpen) return null;

  const message =
    tabKind === "circuit"
      ? t("workspace.discardCircuitMessage")
      : t("workspace.discardChangesMessage");

  return (
    <div
      role="presentation"
      style={{
        position: "fixed",
        inset: 0,
        backgroundColor: "var(--overlay-backdrop, rgba(0, 0, 0, 0.5))",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "var(--space-2)",
        zIndex: 1000,
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onCancel();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="discard-dialog-title"
        aria-describedby="discard-dialog-desc"
        data-testid="discard-changes-dialog"
        style={{
          inlineSize: "100%",
          maxInlineSize: "calc(var(--space-8) * 6)",
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-card)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-3)",
          boxShadow: "var(--shadow-3)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-2)",
          boxSizing: "border-box",
          color: "var(--text-main)",
        }}
      >
        <h2
          id="discard-dialog-title"
          data-testid="discard-dialog-title"
          style={{
            margin: 0,
            fontSize: "1.125rem",
            fontWeight: "var(--weight-semibold, 600)",
            color: "var(--text-main)",
          }}
        >
          {t("workspace.discardChangesTitle")}
        </h2>

        <p
          id="discard-dialog-desc"
          data-testid="discard-dialog-desc"
          style={{
            margin: 0,
            fontSize: "0.875rem",
            color: "var(--text-muted)",
            lineHeight: 1.5,
          }}
        >
          {message}
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
            ref={cancelBtnRef}
            type="button"
            data-testid="discard-changes-cancel-btn"
            onClick={onCancel}
            style={{
              blockSize: "var(--control-sm)",
              paddingInline: "var(--space-2)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-card)",
              backgroundColor: "transparent",
              color: "var(--text-main)",
              fontSize: "0.875rem",
              fontWeight: "var(--weight-normal, 400)",
              cursor: "pointer",
              transition:
                "background-color var(--motion-fast) var(--ease-standard), border-color var(--motion-fast) var(--ease-standard)",
            }}
          >
            {t("common.cancel")}
          </button>

          <button
            ref={confirmBtnRef}
            type="button"
            data-testid="discard-changes-confirm-btn"
            onClick={onConfirm}
            style={{
              blockSize: "var(--control-sm)",
              paddingInline: "var(--space-3)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--danger-fill)",
              backgroundColor: "var(--danger-fill)",
              color: "#FFFFFF",
              fontSize: "0.875rem",
              fontWeight: "var(--weight-semibold, 600)",
              cursor: "pointer",
              transition:
                "opacity var(--motion-fast) var(--ease-standard), filter var(--motion-fast) var(--ease-standard)",
            }}
          >
            {t("workspace.discard")}
          </button>
        </div>
      </div>
    </div>
  );
}
