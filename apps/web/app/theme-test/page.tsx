// Temporary test page to visually verify theme tokens in light and dark mode; will be removed in a later task.
"use client";

import { useState } from "react";

export default function ThemeTestPage() {
  const [activeTheme, setActiveTheme] = useState<"light" | "dark">("light");

  return (
    <div
      data-theme={activeTheme}
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
          marginBottom: "var(--space-4)",
          paddingBottom: "var(--space-2)",
          borderBottom: "1px solid var(--border-card)",
        }}
      >
        <h1 style={{ margin: "0", fontSize: "1.5rem" }}>Aboard Theme Tokens Verification</h1>
        <button
          type="button"
          onClick={() => setActiveTheme(activeTheme === "light" ? "dark" : "light")}
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
          Toggle Theme (Current: {activeTheme})
        </button>
      </header>

      {/* Brand & Surfaces */}
      <section style={{ marginBottom: "var(--space-4)" }}>
        <h2 style={{ fontSize: "1.25rem", marginBottom: "var(--space-2)" }}>Surfaces & Semantic Cards</h2>
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
            <h3 style={{ margin: "0 0 var(--space-1) 0" }}>Surface Card (--bg-surface)</h3>
            <p style={{ margin: "0", color: "var(--text-muted)" }}>This is muted text on standard card surface.</p>
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
            <h3 style={{ margin: "0 0 var(--space-1) 0" }}>Subtle Card (--bg-subtle)</h3>
            <p style={{ margin: "0", color: "var(--text-muted)" }}>Subtle container background.</p>
          </div>
        </div>
      </section>

      {/* Buttons */}
      <section style={{ marginBottom: "var(--space-4)" }}>
        <h2 style={{ fontSize: "1.25rem", marginBottom: "var(--space-2)" }}>Buttons</h2>
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
            Primary Button
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
            Gold CTA Button
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
            Tech Outline Button
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
            Bronze Button
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
            Disabled Button
          </button>
        </div>
      </section>

      {/* Badges */}
      <section style={{ marginBottom: "var(--space-4)" }}>
        <h2 style={{ fontSize: "1.25rem", marginBottom: "var(--space-2)" }}>Badges & Status</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-2)" }}>
          <span style={{ backgroundColor: "var(--badge-primary-bg)", color: "var(--badge-primary-fg)", border: "1px solid var(--badge-primary-bd)", borderRadius: "var(--radius-full)", paddingInline: "var(--space-1)", height: "24px", display: "inline-flex", alignItems: "center" }}>
            Primary Badge
          </span>
          <span style={{ backgroundColor: "var(--badge-gold-bg)", color: "var(--badge-gold-fg)", border: "1px solid var(--badge-gold-bd)", borderRadius: "var(--radius-full)", paddingInline: "var(--space-1)", height: "24px", display: "inline-flex", alignItems: "center" }}>
            Gold Badge
          </span>
          <span style={{ backgroundColor: "var(--badge-tech-bg)", color: "var(--badge-tech-fg)", border: "1px solid var(--badge-tech-bd)", borderRadius: "var(--radius-full)", paddingInline: "var(--space-1)", height: "24px", display: "inline-flex", alignItems: "center" }}>
            Tech Badge
          </span>
          <span style={{ backgroundColor: "var(--badge-bronze-bg)", color: "var(--badge-bronze-fg)", border: "1px solid var(--badge-bronze-bd)", borderRadius: "var(--radius-full)", paddingInline: "var(--space-1)", height: "24px", display: "inline-flex", alignItems: "center" }}>
            Bronze Badge
          </span>
          <span style={{ backgroundColor: "var(--success-bg)", color: "var(--success-text)", border: "1px solid var(--success-fill)", borderRadius: "var(--radius-full)", paddingInline: "var(--space-1)", height: "24px", display: "inline-flex", alignItems: "center" }}>
            Success
          </span>
          <span style={{ backgroundColor: "var(--warning-bg)", color: "var(--warning-text)", border: "1px solid var(--warning-fill)", borderRadius: "var(--radius-full)", paddingInline: "var(--space-1)", height: "24px", display: "inline-flex", alignItems: "center" }}>
            Warning
          </span>
          <span style={{ backgroundColor: "var(--danger-bg)", color: "var(--danger-text)", border: "1px solid var(--danger-fill)", borderRadius: "var(--radius-full)", paddingInline: "var(--space-1)", height: "24px", display: "inline-flex", alignItems: "center" }}>
            Danger
          </span>
          <span style={{ backgroundColor: "var(--info-bg)", color: "var(--info-text)", border: "1px solid var(--info-fill)", borderRadius: "var(--radius-full)", paddingInline: "var(--space-1)", height: "24px", display: "inline-flex", alignItems: "center" }}>
            Info
          </span>
        </div>
      </section>

      {/* Accent Gradient */}
      <section style={{ marginBottom: "var(--space-4)" }}>
        <h2 style={{ fontSize: "1.25rem", marginBottom: "var(--space-2)" }}>Accent Gradient (--gradient-accent)</h2>
        <div style={{ height: "var(--space-2)", background: "var(--gradient-accent)", borderRadius: "var(--radius-sm)" }} />
      </section>
    </div>
  );
}
