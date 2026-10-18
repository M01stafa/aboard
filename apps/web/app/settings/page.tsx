"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthGuard } from "../auth-guard";
import { useI18n } from "@/i18n/provider";
import type { Language, Theme } from "@/i18n/types";
import { useDriveStore } from "@/core/drive";

function SettingsContent() {
  const { language, setLanguage, theme, setTheme, t } = useI18n();
  const searchParams = useSearchParams();
  const driveParam = searchParams.get("drive");
  const reasonParam = searchParams.get("reason");

  const {
    connected,
    googleEmail,
    linkedAt,
    reconnectRequired,
    loading: driveLoading,
    error: driveError,
    fetchStatus,
    connect,
    disconnect,
  } = useDriveStore();

  const [actionLoading, setActionLoading] = useState(false);
  const [localMessage, setLocalMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const searchParamMessage =
    driveParam === "connected"
      ? {
          type: "success" as const,
          text: t("settings.driveConnectedSuccess"),
        }
      : driveParam === "error"
      ? {
          type: "error" as const,
          text: t("settings.driveError", { reason: reasonParam || "unknown" }),
        }
      : null;

  const displayMessage = localMessage || searchParamMessage;

  const languageOptions: {
    id: Language;
    labelKey: "common.english" | "common.arabic";
  }[] = [
    { id: "en", labelKey: "common.english" },
    { id: "ar", labelKey: "common.arabic" },
  ];

  const themeOptions: {
    id: Theme;
    labelKey: "common.light" | "common.dark" | "common.system";
  }[] = [
    { id: "light", labelKey: "common.light" },
    { id: "dark", labelKey: "common.dark" },
    { id: "system", labelKey: "common.system" },
  ];

  const handleConnect = async () => {
    setActionLoading(true);
    setLocalMessage(null);
    try {
      const url = await connect("/settings");
      window.location.assign(url);
    } catch (err: unknown) {
      setActionLoading(false);
      setLocalMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Connect failed",
      });
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm(t("settings.driveDisconnectConfirm"))) {
      return;
    }
    setActionLoading(true);
    setLocalMessage(null);
    try {
      await disconnect();
    } catch (err: unknown) {
      setLocalMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Disconnect failed",
      });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <main
      style={{
        padding: "var(--space-6)",
        maxWidth: "65ch",
        marginInline: "auto",
        fontFamily: "var(--font-sans)",
        color: "var(--text-main)",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBlockEnd: "var(--space-6)",
          paddingBlockEnd: "var(--space-3)",
          borderBlockEnd: "1px solid var(--border-card)",
        }}
      >
        <div>
          <h1
            style={{
              marginBlockStart: "0",
              marginBlockEnd: "var(--space-1)",
              fontSize: "1.75rem",
              fontWeight: "var(--weight-bold)",
            }}
          >
            {t("settings.title")}
          </h1>
          <p
            style={{
              marginBlockStart: "0",
              marginBlockEnd: "0",
              color: "var(--text-muted)",
              fontSize: "0.875rem",
            }}
          >
            {t("settings.description")}
          </p>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
          }}
        >
          <Link
            href="/font-preview"
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: "var(--control-sm)",
              paddingInline: "var(--space-2)",
              backgroundColor: "var(--bg-subtle)",
              color: "var(--text-main)",
              border: "1px solid var(--border-card)",
              borderRadius: "var(--radius-sm)",
              textDecoration: "none",
              fontSize: "0.875rem",
              fontWeight: "var(--weight-medium)",
            }}
          >
            {t("settings.fontPreviewLink")}
          </Link>
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              height: "var(--control-sm)",
              paddingInline: "var(--space-2)",
              backgroundColor: "var(--bg-subtle)",
              color: "var(--text-main)",
              border: "1px solid var(--border-card)",
              borderRadius: "var(--radius-sm)",
              textDecoration: "none",
              fontSize: "0.875rem",
              fontWeight: "var(--weight-medium)",
            }}
          >
            {t("settings.backToHome")}
          </Link>
        </div>
      </header>

      {/* Drive Status Banner / Messages */}
      {displayMessage && (
        <div
          data-testid="drive-status-banner"
          role="status"
          style={{
            marginBlockEnd: "var(--space-4)",
            padding: "var(--space-3)",
            borderRadius: "var(--radius-sm)",
            fontSize: "0.875rem",
            backgroundColor:
              displayMessage.type === "success"
                ? "var(--surface-info)"
                : "var(--surface-error)",
            color:
              displayMessage.type === "success"
                ? "var(--text-info)"
                : "var(--text-error)",
            border: `1px solid ${
              displayMessage.type === "success"
                ? "var(--border-info)"
                : "var(--border-error)"
            }`,
          }}
        >
          {displayMessage.text}
        </div>
      )}

      {/* Google Drive Section (Task 34) */}
      <section
        data-testid="settings-drive-section"
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-card)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-4)",
          marginBlockEnd: "var(--space-4)",
          boxShadow: "var(--shadow-1)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBlockEnd: "var(--space-1)",
          }}
        >
          <h2
            style={{
              margin: "0",
              fontSize: "1.125rem",
              fontWeight: "var(--weight-semibold)",
            }}
          >
            {t("settings.driveTitle")}
          </h2>
          <span
            data-testid="drive-status-badge"
            style={{
              display: "inline-flex",
              alignItems: "center",
              paddingInline: "var(--space-2)",
              paddingBlock: "var(--space-1)",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.75rem",
              fontWeight: "var(--weight-semibold)",
              backgroundColor: reconnectRequired
                ? "var(--surface-warning)"
                : connected
                ? "var(--surface-success)"
                : "var(--surface-sunken)",
              color: reconnectRequired
                ? "var(--text-warning)"
                : connected
                ? "var(--text-success)"
                : "var(--text-muted)",
              border: `1px solid ${
                reconnectRequired
                  ? "var(--border-warning)"
                  : connected
                  ? "var(--border-success)"
                  : "var(--border-subtle)"
              }`,
            }}
          >
            {reconnectRequired
              ? t("settings.driveStatusReconnectRequired")
              : connected
              ? t("settings.driveStatusConnected")
              : t("settings.driveStatusDisconnected")}
          </span>
        </div>

        <p
          style={{
            marginBlockStart: "0",
            marginBlockEnd: "var(--space-3)",
            color: "var(--text-muted)",
            fontSize: "0.875rem",
          }}
        >
          {t("settings.driveDesc")}
        </p>

        {connected && googleEmail && (
          <div
            style={{
              marginBlockEnd: "var(--space-3)",
              fontSize: "0.875rem",
              color: "var(--text-muted)",
            }}
          >
            <span style={{ fontWeight: "var(--weight-medium)", color: "var(--text-main)" }}>
              {t("settings.driveEmailLabel")}:
            </span>{" "}
            {googleEmail}
          </div>
        )}

        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
          {reconnectRequired ? (
            <button
              data-testid="drive-reconnect-btn"
              type="button"
              disabled={actionLoading || driveLoading}
              onClick={handleConnect}
              style={{
                height: "var(--control-md)",
                paddingInline: "var(--space-3)",
                borderRadius: "var(--radius-sm)",
                border: "none",
                backgroundColor: "var(--btn-warning-bg)",
                color: "var(--btn-warning-text)",
                fontWeight: "var(--weight-semibold)",
                cursor: "pointer",
                fontSize: "0.875rem",
              }}
            >
              {t("settings.driveReconnectBtn")}
            </button>
          ) : connected ? (
            <button
              data-testid="drive-disconnect-btn"
              type="button"
              disabled={actionLoading || driveLoading}
              onClick={handleDisconnect}
              style={{
                height: "var(--control-md)",
                paddingInline: "var(--space-3)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-error)",
                backgroundColor: "var(--bg-surface)",
                color: "var(--text-error)",
                fontWeight: "var(--weight-semibold)",
                cursor: "pointer",
                fontSize: "0.875rem",
              }}
            >
              {t("settings.driveDisconnectBtn")}
            </button>
          ) : (
            <button
              data-testid="drive-connect-btn"
              type="button"
              disabled={actionLoading || driveLoading}
              onClick={handleConnect}
              style={{
                height: "var(--control-md)",
                paddingInline: "var(--space-3)",
                borderRadius: "var(--radius-sm)",
                border: "none",
                backgroundColor: "var(--btn-primary-bg)",
                color: "var(--btn-primary-text)",
                fontWeight: "var(--weight-semibold)",
                cursor: "pointer",
                fontSize: "0.875rem",
              }}
            >
              {t("settings.driveConnectBtn")}
            </button>
          )}

          {(actionLoading || driveLoading) && (
            <span
              style={{
                fontSize: "0.875rem",
                color: "var(--text-muted)",
              }}
            >
              ...
            </span>
          )}
        </div>
      </section>

      {/* Language Section */}
      <section
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-card)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-4)",
          marginBlockEnd: "var(--space-4)",
          boxShadow: "var(--shadow-1)",
        }}
      >
        <h2
          style={{
            marginBlockStart: "0",
            marginBlockEnd: "var(--space-1)",
            fontSize: "1.125rem",
            fontWeight: "var(--weight-semibold)",
          }}
        >
          {t("settings.languageTitle")}
        </h2>
        <p
          style={{
            marginBlockStart: "0",
            marginBlockEnd: "var(--space-3)",
            color: "var(--text-muted)",
            fontSize: "0.875rem",
          }}
        >
          {t("settings.languageDesc")}
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
          {languageOptions.map((opt) => {
            const isSelected = language === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setLanguage(opt.id)}
                style={{
                  height: "var(--control-md)",
                  paddingInline: "var(--space-3)",
                  borderRadius: "var(--radius-sm)",
                  border: isSelected
                    ? "2px solid var(--focus-ring)"
                    : "1px solid var(--border-input)",
                  backgroundColor: isSelected
                    ? "var(--btn-primary-bg)"
                    : "var(--bg-surface)",
                  color: isSelected
                    ? "var(--btn-primary-text)"
                    : "var(--text-main)",
                  fontWeight: isSelected
                    ? "var(--weight-semibold)"
                    : "var(--weight-regular)",
                  cursor: "pointer",
                }}
              >
                {t(opt.labelKey)}
              </button>
            );
          })}
        </div>
      </section>

      {/* Theme Section */}
      <section
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-card)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-4)",
          marginBlockEnd: "var(--space-4)",
          boxShadow: "var(--shadow-1)",
        }}
      >
        <h2
          style={{
            marginBlockStart: "0",
            marginBlockEnd: "var(--space-1)",
            fontSize: "1.125rem",
            fontWeight: "var(--weight-semibold)",
          }}
        >
          {t("settings.themeTitle")}
        </h2>
        <p
          style={{
            marginBlockStart: "0",
            marginBlockEnd: "var(--space-3)",
            color: "var(--text-muted)",
            fontSize: "0.875rem",
          }}
        >
          {t("settings.themeDesc")}
        </p>

        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
          {themeOptions.map((opt) => {
            const isSelected = theme === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setTheme(opt.id)}
                style={{
                  height: "var(--control-md)",
                  paddingInline: "var(--space-3)",
                  borderRadius: "var(--radius-sm)",
                  border: isSelected
                    ? "2px solid var(--focus-ring)"
                    : "1px solid var(--border-input)",
                  backgroundColor: isSelected
                    ? "var(--btn-primary-bg)"
                    : "var(--bg-surface)",
                  color: isSelected
                    ? "var(--btn-primary-text)"
                    : "var(--text-main)",
                  fontWeight: isSelected
                    ? "var(--weight-semibold)"
                    : "var(--weight-regular)",
                  cursor: "pointer",
                }}
              >
                {t(opt.labelKey)}
              </button>
            );
          })}
        </div>
      </section>

      <footer
        style={{
          paddingBlockStart: "var(--space-2)",
          color: "var(--text-muted)",
          fontSize: "0.875rem",
          textAlign: "start",
        }}
      >
        <p style={{ margin: "0" }}>{t("settings.storageNotice")}</p>
      </footer>
    </main>
  );
}

export default function SettingsPage() {
  return (
    <AuthGuard>
      <Suspense fallback={null}>
        <SettingsContent />
      </Suspense>
    </AuthGuard>
  );
}
