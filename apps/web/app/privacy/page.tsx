import Link from "next/link";
import { getTranslation } from "@/i18n/i18n";

export const metadata = {
  title: "Privacy Policy — Aboard",
  description: "Privacy policy for Aboard.",
};

export default function PrivacyPage() {
  const titleEn = getTranslation("en", "legal.privacyTitle");
  const noteEn = getTranslation("en", "legal.toBePublished");
  const backEn = getTranslation("en", "legal.backToLauncher");

  const titleAr = getTranslation("ar", "legal.privacyTitle");
  const noteAr = getTranslation("ar", "legal.toBePublished");
  const backAr = getTranslation("ar", "legal.backToLauncher");

  return (
    <main
      style={{
        padding: "var(--space-6)",
        maxInlineSize: "72ch",
        marginInline: "auto",
        fontFamily: "var(--font-sans)",
        color: "var(--text-main)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-6)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBlockEnd: "var(--space-4)",
          borderBlockEnd: "1px solid var(--border-card)",
        }}
      >
        <h1
          style={{
            margin: "0",
            fontSize: "1.75rem",
            fontWeight: "var(--weight-bold)",
            color: "var(--text-main)",
          }}
        >
          {titleEn} / {titleAr}
        </h1>

        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            blockSize: "var(--control-md)",
            paddingInline: "var(--space-3)",
            backgroundColor: "var(--bg-subtle)",
            color: "var(--text-main)",
            border: "1px solid var(--border-card)",
            borderRadius: "var(--radius-sm)",
            textDecoration: "none",
            fontSize: "0.875rem",
            fontWeight: "var(--weight-medium)",
          }}
        >
          {backEn} · {backAr}
        </Link>
      </header>

      <article
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-card)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-5)",
          boxShadow: "var(--shadow-1)",
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-4)",
        }}
      >
        <section lang="en" dir="ltr">
          <h2
            style={{
              marginBlockStart: "0",
              marginBlockEnd: "var(--space-2)",
              fontSize: "1.125rem",
              fontWeight: "var(--weight-semibold)",
              color: "var(--text-main)",
            }}
          >
            {titleEn}
          </h2>
          <p
            style={{
              margin: "0",
              color: "var(--text-muted)",
              fontSize: "0.9375rem",
              lineHeight: "1.5rem",
            }}
          >
            {noteEn}
          </p>
        </section>

        <hr
          style={{
            margin: "0",
            border: "0",
            borderBlockStart: "1px solid var(--border-card)",
          }}
        />

        <section lang="ar" dir="rtl">
          <h2
            style={{
              marginBlockStart: "0",
              marginBlockEnd: "var(--space-2)",
              fontSize: "1.125rem",
              fontWeight: "var(--weight-semibold)",
              color: "var(--text-main)",
            }}
          >
            {titleAr}
          </h2>
          <p
            style={{
              margin: "0",
              color: "var(--text-muted)",
              fontSize: "0.9375rem",
              lineHeight: "1.5rem",
            }}
          >
            {noteAr}
          </p>
        </section>
      </article>
    </main>
  );
}
