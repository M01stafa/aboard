// Temporary test page to visually verify theme tokens in light and dark mode; will be removed in a later task.
"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";

export default function ThemeTestPage() {
  const { theme, setTheme, t } = useI18n();

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <div
      style={{
        backgroundColor: "var(--bg-body)",
        color: "var(--text-main)",
        minHeight: "100vh",
        padding: "var(--space-4)",
        fontFamily: "var(--font-sans)",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBlockEnd: "var(--space-4)",
          paddingBlockEnd: "var(--space-2)",
          borderBlockEnd: "1px solid var(--border-card)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          <h1 style={{ margin: "0", fontSize: "1.5rem" }}>{t("themeTest.pageTitle")}</h1>
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
        <button
          type="button"
          onClick={toggleTheme}
          style={{
            backgroundColor: "var(--btn-primary-bg)",
            color: "var(--btn-primary-text)",
            border: "none",
            borderRadius: "var(--radius-sm)",
            height: "var(--control-md)",
            paddingInline: "var(--space-3)",
            cursor: "pointer",
            fontWeight: "var(--weight-semibold)",
          }}
        >
          {t("themeTest.toggleButton", { theme })}
        </button>
      </header>

      {/* Brand & Surfaces */}
      <section style={{ marginBlockEnd: "var(--space-4)" }}>
        <h2 style={{ fontSize: "1.25rem", marginBlockEnd: "var(--space-2)" }}>{t("themeTest.surfacesSection")}</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "var(--space-3)" }}>
          <div
            style={{
              backgroundColor: "var(--bg-surface)",
              border: "1px solid var(--border-card)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-3)",
              boxShadow: "var(--shadow-1)",
            }}
          >
            <h3 style={{ marginBlockStart: "0", marginBlockEnd: "var(--space-1)" }}>{t("themeTest.surfaceCardTitle")}</h3>
            <p style={{ margin: "0", color: "var(--text-muted)" }}>{t("themeTest.surfaceCardDesc")}</p>
          </div>
          <div
            style={{
              backgroundColor: "var(--bg-subtle)",
              border: "1px solid var(--border-card)",
              borderRadius: "var(--radius-md)",
              padding: "var(--space-3)",
              boxShadow: "var(--shadow-1)",
            }}
          >
            <h3 style={{ marginBlockStart: "0", marginBlockEnd: "var(--space-1)" }}>{t("themeTest.subtleCardTitle")}</h3>
            <p style={{ margin: "0", color: "var(--text-muted)" }}>{t("themeTest.subtleCardDesc")}</p>
          </div>
        </div>
      </section>

      {/* Buttons */}
      <section style={{ marginBlockEnd: "var(--space-4)" }}>
        <h2 style={{ fontSize: "1.25rem", marginBlockEnd: "var(--space-2)" }}>{t("themeTest.buttonsSection")}</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)", alignItems: "center" }}>
          <button
            type="button"
            style={{
              backgroundColor: "var(--btn-primary-bg)",
              color: "var(--btn-primary-text)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              height: "var(--control-md)",
              paddingInline: "var(--space-3)",
              cursor: "pointer",
            }}
          >
            {t("themeTest.primaryButton")}
          </button>
          <button
            type="button"
            style={{
              backgroundColor: "var(--btn-gold-bg)",
              color: "var(--btn-gold-text)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              height: "var(--control-md)",
              paddingInline: "var(--space-3)",
              cursor: "pointer",
            }}
          >
            {t("themeTest.goldButton")}
          </button>
          <button
            type="button"
            style={{
              backgroundColor: "transparent",
              color: "var(--accent-text)",
              border: "2px solid var(--accent-text)",
              borderRadius: "var(--radius-sm)",
              height: "var(--control-md)",
              paddingInline: "var(--space-3)",
              cursor: "pointer",
            }}
          >
            {t("themeTest.techButton")}
          </button>
          <button
            type="button"
            style={{
              backgroundColor: "var(--btn-bronze-bg)",
              color: "var(--btn-bronze-text)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              height: "var(--control-md)",
              paddingInline: "var(--space-3)",
              cursor: "pointer",
            }}
          >
            {t("themeTest.bronzeButton")}
          </button>
          <button
            type="button"
            disabled
            style={{
              backgroundColor: "var(--bg-subtle)",
              color: "var(--text-muted)",
              border: "1px solid var(--border-card)",
              borderRadius: "var(--radius-sm)",
              height: "var(--control-md)",
              paddingInline: "var(--space-3)",
              cursor: "not-allowed",
            }}
          >
            {t("themeTest.disabledButton")}
          </button>
        </div>
      </section>

      {/* Badges */}
      <section style={{ marginBlockEnd: "var(--space-4)" }}>
        <h2 style={{ fontSize: "1.25rem", marginBlockEnd: "var(--space-2)" }}>{t("themeTest.badgesSection")}</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
          <span style={{ backgroundColor: "var(--badge-primary-bg)", color: "var(--badge-primary-fg)", border: "1px solid var(--badge-primary-bd)", borderRadius: "var(--radius-full)", paddingInline: "var(--space-1)", height: "24px", display: "inline-flex", alignItems: "center" }}>
            {t("themeTest.primaryBadge")}
          </span>
          <span style={{ backgroundColor: "var(--badge-gold-bg)", color: "var(--badge-gold-fg)", border: "1px solid var(--badge-gold-bd)", borderRadius: "var(--radius-full)", paddingInline: "var(--space-1)", height: "24px", display: "inline-flex", alignItems: "center" }}>
            {t("themeTest.goldBadge")}
          </span>
          <span style={{ backgroundColor: "var(--badge-tech-bg)", color: "var(--badge-tech-fg)", border: "1px solid var(--badge-tech-bd)", borderRadius: "var(--radius-full)", paddingInline: "var(--space-1)", height: "24px", display: "inline-flex", alignItems: "center" }}>
            {t("themeTest.techBadge")}
          </span>
          <span style={{ backgroundColor: "var(--badge-bronze-bg)", color: "var(--badge-bronze-fg)", border: "1px solid var(--badge-bronze-bd)", borderRadius: "var(--radius-full)", paddingInline: "var(--space-1)", height: "24px", display: "inline-flex", alignItems: "center" }}>
            {t("themeTest.bronzeBadge")}
          </span>
          <span style={{ backgroundColor: "var(--success-bg)", color: "var(--success-text)", border: "1px solid var(--success-fill)", borderRadius: "var(--radius-full)", paddingInline: "var(--space-1)", height: "24px", display: "inline-flex", alignItems: "center" }}>
            {t("themeTest.statusSuccess")}
          </span>
          <span style={{ backgroundColor: "var(--warning-bg)", color: "var(--warning-text)", border: "1px solid var(--warning-fill)", borderRadius: "var(--radius-full)", paddingInline: "var(--space-1)", height: "24px", display: "inline-flex", alignItems: "center" }}>
            {t("themeTest.statusWarning")}
          </span>
          <span style={{ backgroundColor: "var(--danger-bg)", color: "var(--danger-text)", border: "1px solid var(--danger-fill)", borderRadius: "var(--radius-full)", paddingInline: "var(--space-1)", height: "24px", display: "inline-flex", alignItems: "center" }}>
            {t("themeTest.statusDanger")}
          </span>
          <span style={{ backgroundColor: "var(--info-bg)", color: "var(--info-text)", border: "1px solid var(--info-fill)", borderRadius: "var(--radius-full)", paddingInline: "var(--space-1)", height: "24px", display: "inline-flex", alignItems: "center" }}>
            {t("themeTest.statusInfo")}
          </span>
        </div>
      </section>

      {/* Accent Gradient */}
      <section style={{ marginBlockEnd: "var(--space-4)" }}>
        <h2 style={{ fontSize: "1.25rem", marginBlockEnd: "var(--space-2)" }}>{t("themeTest.gradientSection")}</h2>
        <div style={{ height: "var(--space-2)", background: "var(--gradient-accent)", borderRadius: "var(--radius-sm)" }} />
      </section>
    </div>
  );
}
