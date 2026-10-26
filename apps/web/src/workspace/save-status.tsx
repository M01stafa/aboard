"use client";

import React, { useEffect, useRef, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { saveQueue, type SaveStatus } from "@/core/storage";

/**
 * Purely informational save status indicator for the workspace top bar (WS-3).
 * Renders exactly five states via i18n keys, non-interactive with role="status".
 */
export interface SaveStatusIndicatorProps {
  debounceMs?: number;
}

/**
 * Purely informational save status indicator for the workspace top bar (WS-3).
 * Renders exactly five states via i18n keys, non-interactive with role="status".
 * Includes a debounce mechanism so that "Saved" status is only shown after
 * 10 seconds of inactivity to prevent UI flickering during continuous editing.
 */
export function SaveStatusIndicator({ debounceMs = 10000 }: SaveStatusIndicatorProps = {}) {
  const { t } = useI18n();
  const [displayedStatus, setDisplayedStatus] = useState<SaveStatus>(() => saveQueue.getStatus());
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return saveQueue.subscribe((nextStatus) => {
      // If a save is actively in progress or starting, show it immediately and cancel any pending "saved" transition
      if (nextStatus === "saving") {
        if (pendingTimerRef.current) {
          clearTimeout(pendingTimerRef.current);
          pendingTimerRef.current = null;
        }
        setDisplayedStatus("saving");
        return;
      }

      // If transition to saved (saved-local or saved-drive)
      if (nextStatus === "saved-local" || nextStatus === "saved-drive") {
        // If we are currently displaying "saving", debounce the switch to "saved"
        // so active editing doesn't flicker between "Saving" and "Saved"
        if (pendingTimerRef.current) {
          clearTimeout(pendingTimerRef.current);
        }
        pendingTimerRef.current = setTimeout(() => {
          setDisplayedStatus(nextStatus);
          pendingTimerRef.current = null;
        }, debounceMs);
        return;
      }

      // Other states (e.g. waiting-connection, reconnect-drive) update immediately
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
        pendingTimerRef.current = null;
      }
      setDisplayedStatus(nextStatus);
    });
  }, [debounceMs]);

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (pendingTimerRef.current) {
        clearTimeout(pendingTimerRef.current);
      }
    };
  }, []);

  const getStatusLabel = (s: SaveStatus): string => {
    switch (s) {
      case "saved-drive":
        return t("saveStatus.savedDrive");
      case "saving":
        return t("saveStatus.saving");
      case "saved-local":
        return t("saveStatus.savedLocal");
      case "waiting-connection":
        return t("saveStatus.waitingConnection");
      case "reconnect-drive":
        return t("saveStatus.reconnectDrive");
    }
  };

  const getDotColor = (s: SaveStatus): string => {
    switch (s) {
      case "saving":
        return "var(--gold-500)";
      case "waiting-connection":
      case "reconnect-drive":
        return "var(--warning-fill)";
      case "saved-drive":
      case "saved-local":
      default:
        return "var(--success-fill)";
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      data-status={displayedStatus}
      data-testid="save-status-indicator"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "var(--space-1)",
        fontSize: "0.8125rem",
        color: "var(--text-muted)",
        paddingBlock: "var(--space-1)",
        paddingInline: "var(--space-2)",
        borderRadius: "var(--radius-sm)",
        userSelect: "none",
        boxSizing: "border-box",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          inlineSize: "var(--space-1)",
          blockSize: "var(--space-1)",
          borderRadius: "var(--radius-full)",
          backgroundColor: getDotColor(displayedStatus),
          flexShrink: 0,
        }}
      />
      <span>{getStatusLabel(displayedStatus)}</span>
    </div>
  );
}
