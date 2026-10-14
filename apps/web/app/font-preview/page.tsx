// Temporary test page to visually preview Geist and Alexandria fonts across weights, scales, rules, and numerals.
"use client";

import Link from "next/link";
import { useI18n } from "@/i18n/provider";

export default function FontPreviewPage() {
  const { t } = useI18n();

  const weights = [
    { labelKey: "fontPreview.weightRegular" as const, token: "var(--weight-regular)" },
    { labelKey: "fontPreview.weightMedium" as const, token: "var(--weight-medium)" },
    { labelKey: "fontPreview.weightSemibold" as const, token: "var(--weight-semibold)" },
    { labelKey: "fontPreview.weightBold" as const, token: "var(--weight-bold)" },
  ];

  const scaleItems = [
    {
      labelKey: "fontPreview.scaleDisplay" as const,
      latinSize: "3rem",
      latinLine: "3.5rem",
      arabicLine: "4rem",
      weight: "var(--weight-bold)",
      tracking: "var(--tracking-display)",
    },
    {
      labelKey: "fontPreview.scaleH1" as const,
      latinSize: "2rem",
      latinLine: "2.5rem",
      arabicLine: "3rem",
      weight: "var(--weight-bold)",
      tracking: "var(--tracking-h1)",
    },
    {
      labelKey: "fontPreview.scaleH2" as const,
      latinSize: "1.5rem",
      latinLine: "2rem",
      arabicLine: "2rem",
      weight: "var(--weight-semibold)",
      tracking: "normal",
    },
    {
      labelKey: "fontPreview.scaleH3" as const,
      latinSize: "1.125rem",
      latinLine: "1.5rem",
      arabicLine: "1.5rem",
      weight: "var(--weight-semibold)",
      tracking: "normal",
    },
    {
      labelKey: "fontPreview.scaleBodyLarge" as const,
      latinSize: "1.25rem",
      latinLine: "2rem",
      arabicLine: "2rem",
      weight: "var(--weight-regular)",
      tracking: "normal",
    },
    {
      labelKey: "fontPreview.scaleBody" as const,
      latinSize: "1rem",
      latinLine: "1.5rem",
      arabicLine: "1.5rem",
      weight: "var(--weight-regular)",
      tracking: "normal",
    },
    {
      labelKey: "fontPreview.scaleLabel" as const,
      latinSize: "0.875rem",
      latinLine: "1.5rem",
      arabicLine: "1.5rem",
      weight: "var(--weight-medium)",
      tracking: "var(--tracking-label)",
    },
    {
      labelKey: "fontPreview.scaleMicro" as const,
      latinSize: "0.75rem",
      latinLine: "1rem",
      arabicLine: "1rem",
      weight: "var(--weight-semibold)",
      tracking: "var(--tracking-micro)",
    },
  ];

  const sampleNumbers = ["1,234,567.89", "9,876,543.21", "   42,109.50", "8,111,222.03"];

  return (
    <div
      style={{
        backgroundColor: "var(--bg-body)",
        color: "var(--text-main)",
        minHeight: "100vh",
        padding: "var(--space-6)",
        fontFamily: "var(--font-sans)",
      }}
    >
      {/* Header */}
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
            {t("fontPreview.pageTitle")}
          </h1>
          <p
            style={{
              marginBlockStart: "0",
              marginBlockEnd: "0",
              color: "var(--text-muted)",
              fontSize: "0.875rem",
            }}
          >
            {t("fontPreview.pageDesc")}
          </p>
        </div>
        <Link
          href="/settings"
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
          {t("fontPreview.backToSettings")}
        </Link>
      </header>

      {/* Section A: Weights */}
      <section
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-card)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-4)",
          marginBlockEnd: "var(--space-5)",
          boxShadow: "var(--shadow-1)",
        }}
      >
        <h2
          style={{
            marginBlockStart: "0",
            marginBlockEnd: "var(--space-1)",
            fontSize: "1.25rem",
            fontWeight: "var(--weight-semibold)",
          }}
        >
          {t("fontPreview.sectionATitle")}
        </h2>
        <p
          style={{
            marginBlockStart: "0",
            marginBlockEnd: "var(--space-4)",
            color: "var(--text-muted)",
            fontSize: "0.875rem",
          }}
        >
          {t("fontPreview.sectionADesc")}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
          {weights.map((w) => (
            <div
              key={w.token}
              style={{
                padding: "var(--space-3)",
                backgroundColor: "var(--bg-subtle)",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-card)",
              }}
            >
              <span
                style={{
                  display: "block",
                  fontSize: "0.75rem",
                  fontWeight: "var(--weight-semibold)",
                  color: "var(--accent-text)",
                  marginBlockEnd: "var(--space-1)",
                }}
              >
                {t(w.labelKey)}
              </span>
              <p
                style={{
                  marginBlockStart: "0",
                  marginBlockEnd: "var(--space-1)",
                  fontSize: "1.125rem",
                  lineHeight: "1.5rem",
                  fontWeight: w.token,
                }}
              >
                {t("fontPreview.sampleEn")}
              </p>
              <p
                lang="ar"
                dir="rtl"
                style={{
                  marginBlockStart: "0",
                  marginBlockEnd: "0",
                  fontSize: "1.125rem",
                  lineHeight: "1.5rem",
                  fontWeight: w.token,
                }}
              >
                {t("fontPreview.sampleAr")}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Section B: Scale */}
      <section
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-card)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-4)",
          marginBlockEnd: "var(--space-5)",
          boxShadow: "var(--shadow-1)",
        }}
      >
        <h2
          style={{
            marginBlockStart: "0",
            marginBlockEnd: "var(--space-1)",
            fontSize: "1.25rem",
            fontWeight: "var(--weight-semibold)",
          }}
        >
          {t("fontPreview.sectionBTitle")}
        </h2>
        <p
          style={{
            marginBlockStart: "0",
            marginBlockEnd: "var(--space-4)",
            color: "var(--text-muted)",
            fontSize: "0.875rem",
          }}
        >
          {t("fontPreview.sectionBDesc")}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}>
          {scaleItems.map((item) => (
            <div
              key={item.labelKey}
              style={{
                paddingBlockEnd: "var(--space-3)",
                borderBlockEnd: "1px solid var(--border-card)",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  fontSize: "0.75rem",
                  fontWeight: "var(--weight-semibold)",
                  color: "var(--accent-text)",
                  marginBlockEnd: "var(--space-1)",
                }}
              >
                {t(item.labelKey)}
              </span>
              <p
                style={{
                  marginBlockStart: "0",
                  marginBlockEnd: "var(--space-2)",
                  fontSize: item.latinSize,
                  lineHeight: item.latinLine,
                  fontWeight: item.weight,
                  letterSpacing: item.tracking,
                }}
              >
                {t("fontPreview.sampleEn")}
              </p>
              <p
                lang="ar"
                dir="rtl"
                style={{
                  marginBlockStart: "0",
                  marginBlockEnd: "0",
                  fontSize: item.latinSize,
                  lineHeight: item.arabicLine,
                  fontWeight: item.weight,
                }}
              >
                {t("fontPreview.sampleAr")}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Section C: Arabic Rules */}
      <section
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-card)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-4)",
          marginBlockEnd: "var(--space-5)",
          boxShadow: "var(--shadow-1)",
        }}
      >
        <h2
          style={{
            marginBlockStart: "0",
            marginBlockEnd: "var(--space-1)",
            fontSize: "1.25rem",
            fontWeight: "var(--weight-semibold)",
          }}
        >
          {t("fontPreview.sectionCTitle")}
        </h2>
        <p
          style={{
            marginBlockStart: "0",
            marginBlockEnd: "var(--space-4)",
            color: "var(--text-muted)",
            fontSize: "0.875rem",
          }}
        >
          {t("fontPreview.sectionCDesc")}
        </p>

        {/* 1. RTL Arabic Paragraph */}
        <div
          style={{
            padding: "var(--space-3)",
            backgroundColor: "var(--bg-subtle)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-card)",
            marginBlockEnd: "var(--space-3)",
          }}
        >
          <span
            style={{
              display: "block",
              fontSize: "0.75rem",
              fontWeight: "var(--weight-semibold)",
              color: "var(--accent-text)",
              marginBlockEnd: "var(--space-1)",
            }}
          >
            {t("fontPreview.arabicParagraphTitle")}
          </span>
          <p
            lang="ar"
            dir="rtl"
            style={{
              margin: "0",
              fontSize: "1rem",
              lineHeight: "1.5rem",
              fontWeight: "var(--weight-regular)",
            }}
          >
            {t("fontPreview.arabicParagraphContent")}
          </p>
        </div>

        {/* 2. Micro Rule (>= 14px for Arabic) */}
        <div
          style={{
            padding: "var(--space-3)",
            backgroundColor: "var(--bg-subtle)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-card)",
            marginBlockEnd: "var(--space-3)",
          }}
        >
          <span
            style={{
              display: "block",
              fontSize: "0.75rem",
              fontWeight: "var(--weight-semibold)",
              color: "var(--accent-text)",
              marginBlockEnd: "var(--space-2)",
            }}
          >
            {t("fontPreview.microRuleTitle")}
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-4)" }}>
            <div style={{ flex: "1 1 240px" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block" }}>
                {t("fontPreview.microLatinLabel")}
              </span>
              <p
                style={{
                  margin: "0",
                  fontSize: "0.75rem",
                  lineHeight: "1rem",
                  fontWeight: "var(--weight-semibold)",
                  letterSpacing: "var(--tracking-micro)",
                }}
              >
                {t("fontPreview.sampleEn")}
              </p>
            </div>
            <div style={{ flex: "1 1 240px" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block" }}>
                {t("fontPreview.microArabicLabel")}
              </span>
              <p
                lang="ar"
                dir="rtl"
                style={{
                  margin: "0",
                  fontSize: "0.875rem",
                  lineHeight: "1.5rem",
                  fontWeight: "var(--weight-medium)",
                }}
              >
                {t("fontPreview.sampleAr")}
              </p>
            </div>
          </div>
        </div>

        {/* 3. Letter-Spacing Contrast */}
        <div
          style={{
            padding: "var(--space-3)",
            backgroundColor: "var(--bg-subtle)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-card)",
          }}
        >
          <span
            style={{
              display: "block",
              fontSize: "0.75rem",
              fontWeight: "var(--weight-semibold)",
              color: "var(--accent-text)",
              marginBlockEnd: "var(--space-2)",
            }}
          >
            {t("fontPreview.trackingRuleTitle")}
          </span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-4)" }}>
            <div style={{ flex: "1 1 240px" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block" }}>
                {t("fontPreview.trackingLatinLabel")}
              </span>
              <p
                style={{
                  margin: "0",
                  fontSize: "1rem",
                  lineHeight: "1.5rem",
                  fontWeight: "var(--weight-semibold)",
                  letterSpacing: "var(--tracking-micro)",
                }}
              >
                {t("fontPreview.sampleEn")}
              </p>
            </div>
            <div style={{ flex: "1 1 240px" }}>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "block" }}>
                {t("fontPreview.trackingArabicLabel")}
              </span>
              <p
                lang="ar"
                dir="rtl"
                style={{
                  margin: "0",
                  fontSize: "1rem",
                  lineHeight: "1.5rem",
                  fontWeight: "var(--weight-semibold)",
                }}
              >
                {t("fontPreview.sampleAr")}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section D: Numerals and Technical Code */}
      <section
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-card)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-4)",
          marginBlockEnd: "var(--space-5)",
          boxShadow: "var(--shadow-1)",
        }}
      >
        <h2
          style={{
            marginBlockStart: "0",
            marginBlockEnd: "var(--space-1)",
            fontSize: "1.25rem",
            fontWeight: "var(--weight-semibold)",
          }}
        >
          {t("fontPreview.sectionDTitle")}
        </h2>
        <p
          style={{
            marginBlockStart: "0",
            marginBlockEnd: "var(--space-4)",
            color: "var(--text-muted)",
            fontSize: "0.875rem",
          }}
        >
          {t("fontPreview.sectionDDesc")}
        </p>

        {/* Tabular vs Proportional */}
        <div
          style={{
            padding: "var(--space-3)",
            backgroundColor: "var(--bg-subtle)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-card)",
            marginBlockEnd: "var(--space-3)",
          }}
        >
          <span
            style={{
              display: "block",
              fontSize: "0.75rem",
              fontWeight: "var(--weight-semibold)",
              color: "var(--accent-text)",
              marginBlockEnd: "var(--space-2)",
            }}
          >
            {t("fontPreview.tabularTitle")}
          </span>
          <p
            style={{
              marginBlockStart: "0",
              marginBlockEnd: "var(--space-3)",
              fontSize: "0.875rem",
              color: "var(--text-muted)",
            }}
          >
            {t("fontPreview.tabularDesc")}
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-6)" }}>
            <div>
              <span
                style={{
                  display: "block",
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                  marginBlockEnd: "var(--space-1)",
                }}
              >
                {t("fontPreview.tabularLabel")}
              </span>
              <div
                dir="ltr"
                style={{
                  fontVariantNumeric: "tabular-nums",
                  fontFamily: "var(--font-sans)",
                  fontSize: "1.125rem",
                  lineHeight: "1.5rem",
                  fontWeight: "var(--weight-medium)",
                }}
              >
                {sampleNumbers.map((num) => (
                  <div key={num}>{num}</div>
                ))}
              </div>
            </div>
            <div>
              <span
                style={{
                  display: "block",
                  fontSize: "0.75rem",
                  color: "var(--text-muted)",
                  marginBlockEnd: "var(--space-1)",
                }}
              >
                {t("fontPreview.proportionalLabel")}
              </span>
              <div
                dir="ltr"
                style={{
                  fontVariantNumeric: "normal",
                  fontFamily: "var(--font-sans)",
                  fontSize: "1.125rem",
                  lineHeight: "1.5rem",
                  fontWeight: "var(--weight-medium)",
                }}
              >
                {sampleNumbers.map((num) => (
                  <div key={num}>{num}</div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* LTR Monospace Code */}
        <div
          style={{
            padding: "var(--space-3)",
            backgroundColor: "var(--bg-subtle)",
            borderRadius: "var(--radius-sm)",
            border: "1px solid var(--border-card)",
          }}
        >
          <span
            style={{
              display: "block",
              fontSize: "0.75rem",
              fontWeight: "var(--weight-semibold)",
              color: "var(--accent-text)",
              marginBlockEnd: "var(--space-2)",
            }}
          >
            {t("fontPreview.codeTitle")}
          </span>
          <pre
            dir="ltr"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.875rem",
              lineHeight: "1.5rem",
              backgroundColor: "var(--bg-surface)",
              color: "var(--text-main)",
              padding: "var(--space-2)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--border-card)",
              margin: "0",
              overflowX: "auto",
            }}
          >
            <code>{`// Aboard workspace initialization\nconst session = await createWorkspace({\n  storage: "google_drive",\n  activeTools: ["board", "pdf", "circuit"],\n  theme: "dark",\n  direction: "rtl",\n});`}</code>
          </pre>
        </div>
      </section>
    </div>
  );
}
