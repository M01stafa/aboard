"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";

export default function HomePage() {
  const { t } = useI18n();

  return (
    <main
      style={{
        padding: "var(--space-6)",
        maxWidth: "65ch",
        marginInline: "auto",
        fontFamily: "var(--font-sans)",
      }}
    >
      <h1
        style={{
          marginBlockStart: "0",
          marginBlockEnd: "var(--space-2)",
          fontSize: "2rem",
          fontWeight: "var(--weight-bold)",
          color: "var(--text-main)",
        }}
      >
        {t("home.title")}
      </h1>
      <p
        style={{
          marginBlockStart: "0",
          marginBlockEnd: "var(--space-4)",
          color: "var(--text-muted)",
          fontSize: "1rem",
        }}
      >
        {t("home.subtitle")}
      </p>

      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <Link
          href="/settings"
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: "var(--control-md)",
            paddingInline: "var(--space-3)",
            backgroundColor: "var(--btn-primary-bg)",
            color: "var(--btn-primary-text)",
            borderRadius: "var(--radius-sm)",
            textDecoration: "none",
            fontWeight: "var(--weight-semibold)",
          }}
        >
          {t("home.goToSettings")}
        </Link>
        <Link
          href="/theme-test"
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: "var(--control-md)",
            paddingInline: "var(--space-3)",
            backgroundColor: "transparent",
            color: "var(--accent-text)",
            border: "2px solid var(--accent-text)",
            borderRadius: "var(--radius-sm)",
            textDecoration: "none",
            fontWeight: "var(--weight-semibold)",
          }}
        >
          {t("home.goToThemeTest")}
        </Link>
      </div>
    </main>
  );
}
