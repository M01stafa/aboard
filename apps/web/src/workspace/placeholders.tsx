import React, { useEffect, useState } from "react";
import type { Tab } from "./types";
import { useI18n } from "@/i18n/provider";

export interface PaneProps {
  tab: Tab;
  visible: boolean;
  onMount?: (tabId: string, token: string) => void;
}

export function StaticPlaceholder({ tab, visible, onMount }: PaneProps) {
  const { t } = useI18n();
  // Persistent identity token: created once upon component instantiation and preserved across renders
  const [identityToken] = useState(() => {
    return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `pane-${tab.id}-static`;
  });

  useEffect(() => {
    onMount?.(tab.id, identityToken);
  }, [tab.id, identityToken, onMount]);

  return (
    <div
      data-testid={`pane-static-${tab.id}`}
      data-pane-id={tab.id}
      data-identity-token={identityToken}
      style={{
        inlineSize: "100%",
        blockSize: "100%",
        backgroundColor: "var(--bg-surface)",
        padding: "var(--space-4)",
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        gap: "var(--space-2)",
        fontFamily: "var(--font-sans)",
        color: "var(--text-main)",
      }}
    >
      <div
        style={{
          inlineSize: "var(--control-lg)",
          blockSize: "var(--control-lg)",
          borderRadius: "var(--radius-sm)",
          backgroundColor:
            tab.kind === "board"
              ? "var(--badge-gold-bg)"
              : tab.kind === "pdf"
              ? "var(--badge-primary-bg)"
              : "var(--badge-tech-bg)",
          color:
            tab.kind === "board"
              ? "var(--badge-gold-text)"
              : tab.kind === "pdf"
              ? "var(--badge-primary-text)"
              : "var(--badge-tech-text)",
          border: `1px solid ${
            tab.kind === "board"
              ? "var(--badge-gold-bd)"
              : tab.kind === "pdf"
              ? "var(--badge-primary-bd)"
              : "var(--badge-tech-bd)"
          }`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box",
        }}
      >
        <span style={{ fontSize: "1.25rem", fontWeight: "var(--weight-bold)" }}>
          {tab.kind === "board" ? "B" : tab.kind === "pdf" ? "P" : "C"}
        </span>
      </div>

      <h3
        style={{
          margin: 0,
          fontSize: "1.125rem",
          lineHeight: "1.5rem",
          fontWeight: "var(--weight-semibold)",
        }}
      >
        {tab.title}
      </h3>

      <p
        style={{
          margin: 0,
          fontSize: "0.875rem",
          lineHeight: "1.5rem",
          color: "var(--text-muted)",
          maxInlineSize: "40ch",
        }}
      >
        {t("workspace.staticPlaceholderDesc")}
      </p>

      <span
        style={{
          fontSize: "0.75rem",
          fontFamily: "var(--font-mono)",
          color: "var(--text-muted)",
          backgroundColor: "var(--bg-subtle)",
          paddingBlock: "var(--space-1)",
          paddingInline: "var(--space-2)",
          borderRadius: "var(--radius-sm)",
          border: "1px solid var(--border-card)",
          boxSizing: "border-box",
        }}
      >
        slot-status: {visible ? "active" : "hidden-keep-alive"}
      </span>
    </div>
  );
}
