"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";
import type { Language, Theme } from "@/i18n/types";

export default function SettingsPage() {
  const { language, setLanguage, theme, setTheme, t } = useI18n();

  const languageOptions: { id: Language; labelKey: "common.english" | "common.arabic" }[] = [
    { id: "en", labelKey: "common.english" },
    { id: "ar", labelKey: "common.arabic" },
  ];

  const themeOptions: { id: Theme; labelKey: "common.light" | "common.dark" | "common.system" }[] = [
    { id: "light", labelKey: "common.light" },
    { id: "dark", labelKey: "common.dark" },
    { id: "system", labelKey: "common.system" },
  ];

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
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
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
                  border: isSelected ? "2px solid var(--focus-ring)" : "1px solid var(--border-input)",
                  backgroundColor: isSelected ? "var(--btn-primary-bg)" : "var(--bg-surface)",
                  color: isSelected ? "var(--btn-primary-text)" : "var(--text-main)",
                  fontWeight: isSelected ? "var(--weight-semibold)" : "var(--weight-regular)",
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
                  border: isSelected ? "2px solid var(--focus-ring)" : "1px solid var(--border-input)",
                  backgroundColor: isSelected ? "var(--btn-primary-bg)" : "var(--bg-surface)",
                  color: isSelected ? "var(--btn-primary-text)" : "var(--text-main)",
                  fontWeight: isSelected ? "var(--weight-semibold)" : "var(--weight-regular)",
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
