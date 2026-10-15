"use client";

import React, { useEffect, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { saveQueue, type SaveStatus } from "@/core/storage";

/**
 * Purely informational save status indicator for the workspace top bar (WS-3).
 * Renders exactly five states via i18n keys, non-interactive with role="status".
 */
export function SaveStatusIndicator() {
  const { t } = useI18n();
  const [status, setStatus] = useState<SaveStatus>(() => saveQueue.getStatus());

  useEffect(() => {
    return saveQueue.subscribe((nextStatus) => {
      setStatus(nextStatus);
    });
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
      data-status={status}
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
          backgroundColor: getDotColor(status),
          flexShrink: 0,
        }}
      />
      <span>{getStatusLabel(status)}</span>
    </div>
  );
}
