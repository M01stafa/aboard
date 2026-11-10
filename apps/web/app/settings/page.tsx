"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { AuthGuard } from "../auth-guard";
import { useI18n } from "@/i18n/provider";
import type { Language, Theme } from "@/i18n/types";
import { useDriveStore } from "@/core/drive";
import { supabase } from "@/core/supabase";
import { deleteUserDb } from "@/core/db";
import { isGoogleDriveEnabled } from "@/core/feature-flags";

function SettingsContent() {
  const { language, setLanguage, theme, setTheme, t } = useI18n();
  const router = useRouter();
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
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
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

  const handleDeleteAccount = async () => {
    if (deleteConfirmText.trim().toUpperCase() !== "DELETE") {
      return;
    }
    setDeleting(true);
    setLocalMessage(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const userId = sessionData?.session?.user?.id;

      const { error } = await supabase.functions.invoke("account-delete", {
        method: "POST",
      });
      if (error) {
        throw error;
      }

      if (userId) {
        try {
          await deleteUserDb(userId);
        } catch {
          // Non-fatal if DB was already closed or not opened
        }
      }

      await supabase.auth.signOut();
      router.push("/?account_deleted=1");
    } catch (err: unknown) {
      setDeleting(false);
      setDeleteModalOpen(false);
      setLocalMessage({
        type: "error",
        text: t("settings.deleteError", {
          reason: err instanceof Error ? err.message : "Deletion failed",
        }),
      });
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
      {isGoogleDriveEnabled() && displayMessage && (
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
          {isGoogleDriveEnabled() && (
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
          )}
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

        {!isGoogleDriveEnabled() ? (
          <div
            data-testid="drive-coming-soon-notice"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--space-2)",
              padding: "var(--space-3)",
              backgroundColor: "var(--bg-subtle)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-card)",
              fontSize: "0.875rem",
              color: "var(--text-muted)",
              lineHeight: "1.5",
            }}
          >
            <span aria-hidden="true" style={{ fontSize: "1.125rem" }}>☁</span>
            <span>{t("settings.driveComingSoon")}</span>
          </div>
        ) : (
          <>
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
          </>
        )}
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

      {/* Danger Zone: Account Deletion (LEGAL-3, AUTH-4) */}
      <section
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-error, #fca5a5)",
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
            color: "var(--color-danger, #ef4444)",
          }}
        >
          {t("settings.dangerZoneTitle")}
        </h2>
        <p
          style={{
            marginBlockStart: "0",
            marginBlockEnd: "var(--space-3)",
            color: "var(--text-muted)",
            fontSize: "0.875rem",
          }}
        >
          {t("settings.dangerZoneDesc")}
        </p>

        <button
          data-testid="delete-account-btn"
          type="button"
          onClick={() => {
            setDeleteConfirmText("");
            setDeleteModalOpen(true);
          }}
          style={{
            height: "var(--control-md)",
            paddingInline: "var(--space-3)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-error, #ef4444)",
            backgroundColor: "transparent",
            color: "var(--color-danger, #ef4444)",
            fontWeight: "var(--weight-semibold)",
            cursor: "pointer",
            fontSize: "0.875rem",
            whiteSpace: "nowrap",
          }}
        >
          {t("settings.deleteAccountBtn")}
        </button>
      </section>

      {/* Account Deletion Confirmation Dialog */}
      {deleteModalOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-dialog-title"
          data-testid="delete-account-modal"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "var(--space-4)",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-card)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-5)",
              maxInlineSize: "48ch",
              inlineSize: "100%",
              boxShadow: "var(--shadow-2)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
            }}
          >
            <h2
              id="delete-dialog-title"
              style={{
                margin: 0,
                fontSize: "1.25rem",
                fontWeight: "var(--weight-bold)",
                color: "var(--color-danger, #ef4444)",
              }}
            >
              {t("settings.deleteModalTitle")}
            </h2>

            <div
              style={{
                padding: "var(--space-2)",
                backgroundColor: "var(--bg-subtle)",
                borderRadius: "var(--radius-sm)",
                display: "flex",
                flexDirection: "column",
                gap: "var(--space-1)",
              }}
            >
              <strong style={{ fontSize: "0.875rem", color: "var(--color-danger, #ef4444)" }}>
                {t("settings.deleteModalNotice")}
              </strong>
              <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--text-main)", lineHeight: "1.4" }}>
                {t("settings.deleteModalExplain")}
              </p>
            </div>

            <p
              style={{
                margin: 0,
                fontSize: "0.8125rem",
                color: "var(--text-muted)",
                lineHeight: "1.4",
              }}
            >
              {t("settings.deleteModalFilesNotice")}
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
              <label
                htmlFor="confirm-delete-input"
                style={{
                  fontSize: "0.8125rem",
                  fontWeight: "var(--weight-medium)",
                  color: "var(--text-main)",
                }}
              >
                {t("settings.deleteModalTypeConfirm")}
              </label>
              <input
                id="confirm-delete-input"
                data-testid="delete-confirm-input"
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder={t("settings.deleteModalConfirmWord")}
                disabled={deleting}
                autoFocus
                style={{
                  height: "var(--control-md)",
                  paddingInline: "var(--space-3)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-input)",
                  backgroundColor: "var(--bg-surface)",
                  color: "var(--text-main)",
                  fontSize: "0.875rem",
                  outline: "none",
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "var(--space-2)",
                marginBlockStart: "var(--space-2)",
                flexWrap: "wrap",
              }}
            >
              <button
                type="button"
                data-testid="delete-cancel-btn"
                disabled={deleting}
                onClick={() => setDeleteModalOpen(false)}
                style={{
                  height: "var(--control-md)",
                  paddingInline: "var(--space-3)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-card)",
                  backgroundColor: "var(--bg-subtle)",
                  color: "var(--text-main)",
                  fontSize: "0.875rem",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                }}
              >
                {t("settings.deleteModalCancelBtn")}
              </button>
              <button
                type="button"
                data-testid="delete-confirm-btn"
                disabled={deleteConfirmText.trim().toUpperCase() !== "DELETE" || deleting}
                onClick={handleDeleteAccount}
                style={{
                  height: "var(--control-md)",
                  paddingInline: "var(--space-3)",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  backgroundColor:
                    deleteConfirmText.trim().toUpperCase() === "DELETE" && !deleting
                      ? "var(--color-danger, #ef4444)"
                      : "var(--bg-subtle)",
                  color:
                    deleteConfirmText.trim().toUpperCase() === "DELETE" && !deleting
                      ? "#ffffff"
                      : "var(--text-muted)",
                  fontWeight: "var(--weight-semibold)",
                  fontSize: "0.875rem",
                  cursor:
                    deleteConfirmText.trim().toUpperCase() === "DELETE" && !deleting
                      ? "pointer"
                      : "not-allowed",
                  whiteSpace: "nowrap",
                }}
              >
                {deleting ? t("settings.deletingAccount") : t("settings.deleteModalConfirmBtn")}
              </button>
            </div>
          </div>
        </div>
      )}

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
