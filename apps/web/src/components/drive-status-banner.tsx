"use client";

import React from "react";
import { useI18n } from "@/i18n/provider";
import { useDriveStore } from "@/core/drive/drive-store";
import { bus } from "@/core/bus";

export interface DriveStatusBannerProps {
  onExportClick?: () => void;
}

/**
 * DriveStatusBanner: global persistent warning banner for Google Drive error states.
 * - Handles 403 storageQuotaExceeded (Drive full -> local saving continues, offers export).
 * - Handles 401/409/invalid_grant (reconnect required -> local saving continues, offers reconnect).
 * Follows DESIGN.md tokens and .agents/rules/spacing.md 8-point grid.
 */
export function DriveStatusBanner({ onExportClick }: DriveStatusBannerProps) {
  const { t } = useI18n();
  const reconnectRequired = useDriveStore((s) => s.reconnectRequired);
  const quotaExceeded = useDriveStore((s) => s.quotaExceeded);
  const connect = useDriveStore((s) => s.connect);

  if (!reconnectRequired && !quotaExceeded) {
    return null;
  }

  const handleReconnect = async () => {
    try {
      const url = await connect("/settings");
      if (url && typeof window !== "undefined") {
        window.location.href = url;
      }
    } catch {
      // Handled in store
    }
  };

  const handleExport = () => {
    if (onExportClick) {
      onExportClick();
    } else {
      bus.emit("drive:open-export-dialog", {});
    }
  };

  return (
    <div
      role="alert"
      aria-live="polite"
      data-testid="drive-status-banner"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        flexWrap: "wrap",
        gap: "var(--space-2)",
        paddingBlock: "var(--space-2)",
        paddingInline: "var(--space-3)",
        backgroundColor: "var(--bg-subtle)",
        borderBottom: "1px solid var(--border-card)",
        color: "var(--text-primary)",
        fontSize: "0.875rem",
        zIndex: 50,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
          flex: 1,
        }}
      >
        <span
          aria-hidden="true"
          style={{
            inlineSize: "var(--space-2)",
            blockSize: "var(--space-2)",
            borderRadius: "var(--radius-full)",
            backgroundColor: "var(--warning-fill)",
            flexShrink: 0,
          }}
        />
        <span>
          {reconnectRequired
            ? t("driveErrors.reconnectBanner")
            : t("driveErrors.quotaBanner")}
        </span>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-2)",
        }}
      >
        {reconnectRequired && (
          <button
            type="button"
            onClick={handleReconnect}
            data-testid="drive-reconnect-btn"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              paddingBlock: "var(--space-1)",
              paddingInline: "var(--space-3)",
              fontSize: "0.8125rem",
              fontWeight: 500,
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--btn-primary-bg)",
              color: "var(--btn-primary-text)",
              border: "none",
              cursor: "pointer",
            }}
          >
            {t("driveErrors.reconnectAction")}
          </button>
        )}

        {quotaExceeded && (
          <button
            type="button"
            onClick={handleExport}
            data-testid="drive-export-btn"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              paddingBlock: "var(--space-1)",
              paddingInline: "var(--space-3)",
              fontSize: "0.8125rem",
              fontWeight: 500,
              borderRadius: "var(--radius-sm)",
              backgroundColor: "var(--btn-gold-bg)",
              color: "var(--btn-gold-text)",
              border: "none",
              cursor: "pointer",
            }}
          >
            {t("driveErrors.exportAction")}
          </button>
        )}
      </div>
    </div>
  );
}
