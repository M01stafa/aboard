"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthGuard } from "./auth-guard";
import { signOut } from "@/core/supabase";
import { useI18n } from "@/i18n/provider";
import type { User } from "@supabase/supabase-js";

export function LauncherContent({ user }: { user: User }) {
  const { t } = useI18n();
  const router = useRouter();
  const [alphaNotice, setAlphaNotice] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  function createPlaceholderProject(kind: "board" | "pdf" | "circuit") {
    const projectId =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}`;
    router.push(`/workspace?p=${projectId}&kind=${kind}`);
  }

  async function handleSignOut() {
    setSigningOut(true);
    await signOut();
    router.replace("/login");
  }

  return (
    <main
      style={{
        paddingInline: "var(--space-4)",
        paddingBlock: "var(--space-6)",
        maxInlineSize: "72ch",
        marginInline: "auto",
        fontFamily: "var(--font-sans)",
        color: "var(--text-main)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-6)",
      }}
    >
      <style>{`
        .launcher-card {
          position: relative;
          background-color: var(--bg-surface);
          border: 1px solid var(--border-card);
          border-radius: var(--radius-md);
          padding: var(--space-4);
          box-shadow: var(--shadow-1);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          justifyContent: space-between;
          gap: var(--space-4);
          transition: transform var(--motion-base) var(--ease-standard),
                      box-shadow var(--motion-base) var(--ease-standard),
                      border-color var(--motion-fast) var(--ease-standard);
        }
        .launcher-card::before {
          content: "";
          position: absolute;
          inset-block-start: 0;
          inset-inline-start: 0;
          inline-size: 100%;
          block-size: 2px;
          background: var(--gradient-accent);
        }
        .btn-gold {
          background-color: var(--btn-gold-bg);
          color: var(--btn-gold-text);
          border: 0;
          border-radius: var(--radius-sm);
          blockSize: var(--control-md);
          padding-inline: var(--space-3);
          font-weight: var(--weight-semibold);
          font-size: 0.875rem;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-1);
          transition: background-color var(--motion-fast) var(--ease-standard),
                      box-shadow var(--motion-base) var(--ease-standard);
        }
        .btn-primary {
          background-color: var(--btn-primary-bg);
          color: var(--btn-primary-text);
          border: 0;
          border-radius: var(--radius-sm);
          blockSize: var(--control-md);
          padding-inline: var(--space-3);
          font-weight: var(--weight-semibold);
          font-size: 0.875rem;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-1);
          transition: background-color var(--motion-fast) var(--ease-standard),
                      box-shadow var(--motion-base) var(--ease-standard);
        }
        .btn-tech {
          background-color: transparent;
          color: var(--accent-text);
          border: 2px solid var(--accent-text);
          border-radius: var(--radius-sm);
          blockSize: var(--control-md);
          padding-inline: var(--space-3);
          font-weight: var(--weight-semibold);
          font-size: 0.875rem;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-1);
          transition: background-color var(--motion-fast) var(--ease-standard),
                      color var(--motion-fast) var(--ease-standard),
                      box-shadow var(--motion-base) var(--ease-standard);
        }
        .btn-subtle {
          background-color: var(--bg-subtle);
          color: var(--text-main);
          border: 1px solid var(--border-card);
          border-radius: var(--radius-sm);
          blockSize: var(--control-md);
          padding-inline: var(--space-3);
          font-weight: var(--weight-medium);
          font-size: 0.875rem;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-1);
          text-decoration: none;
          transition: background-color var(--motion-fast) var(--ease-standard);
        }
        .btn-danger-outline {
          background-color: transparent;
          color: var(--color-danger-text);
          border: 1px solid var(--color-danger-border);
          border-radius: var(--radius-sm);
          blockSize: var(--control-sm);
          padding-inline: var(--space-2);
          font-weight: var(--weight-medium);
          font-size: 0.8125rem;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          transition: background-color var(--motion-fast) var(--ease-standard);
        }
        .btn-gold:focus-visible,
        .btn-primary:focus-visible,
        .btn-tech:focus-visible,
        .btn-subtle:focus-visible,
        .btn-danger-outline:focus-visible,
        .launcher-card:focus-visible {
          outline: 2px solid var(--focus-ring);
          outline-offset: 2px;
        }
        @media (hover: hover) {
          .launcher-card:hover {
            transform: translateY(-2px);
            box-shadow: var(--shadow-2);
          }
          .btn-gold:hover {
            background-color: var(--btn-gold-hover);
            box-shadow: var(--glow-gold);
          }
          .btn-primary:hover {
            background-color: var(--btn-primary-hover);
            box-shadow: var(--shadow-2);
          }
          .btn-tech:hover {
            background-color: var(--btn-outline-hover-bg);
            color: var(--accent-text-strong);
            box-shadow: var(--glow-tech);
          }
          .btn-subtle:hover {
            background-color: var(--bg-surface);
          }
          .btn-danger-outline:hover {
            background-color: var(--color-danger-bg);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .launcher-card:hover {
            transform: none;
          }
        }
        .cards-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
          gap: var(--space-4);
        }
      `}</style>

      {/* Top Header Bar */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexWrap: "wrap",
          gap: "var(--space-3)",
          paddingBlockEnd: "var(--space-4)",
          borderBlockEnd: "1px solid var(--border-card)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
          <div
            style={{
              inlineSize: "32px",
              blockSize: "32px",
              borderRadius: "var(--radius-sm)",
              background: "var(--gradient-accent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--btn-gold-text)",
              fontWeight: "var(--weight-bold)",
              fontSize: "1rem",
            }}
          >
            α
          </div>
          <span
            style={{
              fontSize: "1.25rem",
              fontWeight: "var(--weight-bold)",
              color: "var(--text-main)",
            }}
          >
            {t("common.appName")}
          </span>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "var(--space-2)",
          }}
        >
          <span
            style={{
              fontSize: "0.875rem",
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {user.email}
          </span>

          <Link href="/settings" className="btn-subtle" style={{ blockSize: "var(--control-sm)" }}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            {t("common.settings")}
          </Link>

          <button
            type="button"
            onClick={handleSignOut}
            disabled={signingOut}
            className="btn-danger-outline"
          >
            {signingOut ? t("auth.signingOut") : t("auth.signOut")}
          </button>
        </div>
      </header>

      {/* Hero Welcome */}
      <section style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
        <h1
          style={{
            margin: "0",
            fontSize: "2rem",
            fontWeight: "var(--weight-bold)",
            color: "var(--text-main)",
          }}
        >
          {t("launcher.pageTitle")}
        </h1>
        <p
          style={{
            margin: "0",
            fontSize: "1rem",
            color: "var(--text-muted)",
          }}
        >
          {t("launcher.tagline")}
        </p>
      </section>

      {/* Action Bar (Open .alpha file stub) */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-2)" }}>
        <button
          type="button"
          onClick={() => setAlphaNotice(true)}
          className="btn-subtle"
          data-testid="open-alpha-btn"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" x2="12" y1="15" y2="3" />
          </svg>
          {t("launcher.openAlpha")}
        </button>

        {alphaNotice && (
          <span
            role="status"
            style={{
              fontSize: "0.875rem",
              color: "var(--color-info-text)",
              backgroundColor: "var(--color-info-bg)",
              paddingBlock: "var(--space-1)",
              paddingInline: "var(--space-2)",
              borderRadius: "var(--radius-sm)",
              border: "1px solid var(--color-info-border)",
            }}
          >
            {t("launcher.openAlphaComingSoon")}
          </span>
        )}
      </div>

      {/* Three Cards Grid */}
      <section
        aria-label={t("launcher.pageTitle")}
        className="cards-grid"
      >
        {/* Card 1: New Whiteboard (R7: Gold CTA button) */}
        <article className="launcher-card" data-testid="card-whiteboard">
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <div
              style={{
                inlineSize: "var(--control-md)",
                blockSize: "var(--control-md)",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--badge-gold-bg)",
                color: "var(--badge-gold-text)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m18 5-3-3H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2" />
                <path d="M8 18h1" />
                <path d="M18.4 9.6a2 2 0 1 1 3 3L14 20l-4 1 1-4Z" />
              </svg>
            </div>

            <h2
              style={{
                margin: "0",
                fontSize: "1.25rem",
                fontWeight: "var(--weight-semibold)",
                color: "var(--text-main)",
              }}
            >
              {t("launcher.newWhiteboard")}
            </h2>
            <p
              style={{
                margin: "0",
                fontSize: "0.875rem",
                color: "var(--text-muted)",
                lineHeight: "1.5rem",
              }}
            >
              {t("launcher.newWhiteboardDesc")}
            </p>
          </div>

          {/* R7 Gold CTA: The ONLY gold button on the screen */}
          <button
            type="button"
            onClick={() => createPlaceholderProject("board")}
            className="btn-gold"
            data-testid="create-whiteboard-btn"
          >
            {t("launcher.newWhiteboardCta")}
          </button>
        </article>

        {/* Card 2: New PDF (Primary button) */}
        <article className="launcher-card" data-testid="card-pdf">
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <div
              style={{
                inlineSize: "var(--control-md)",
                blockSize: "var(--control-md)",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--badge-primary-bg)",
                color: "var(--badge-primary-text)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" x2="8" y1="13" y2="13" />
                <line x1="16" x2="8" y1="17" y2="17" />
                <line x1="10" x2="8" y1="9" y2="9" />
              </svg>
            </div>

            <h2
              style={{
                margin: "0",
                fontSize: "1.25rem",
                fontWeight: "var(--weight-semibold)",
                color: "var(--text-main)",
              }}
            >
              {t("launcher.newPdf")}
            </h2>
            <p
              style={{
                margin: "0",
                fontSize: "0.875rem",
                color: "var(--text-muted)",
                lineHeight: "1.5rem",
              }}
            >
              {t("launcher.newPdfDesc")}
            </p>
          </div>

          <button
            type="button"
            onClick={() => createPlaceholderProject("pdf")}
            className="btn-primary"
            data-testid="create-pdf-btn"
          >
            {t("launcher.newPdfCta")}
          </button>
        </article>

        {/* Card 3: New Circuit (Tech outline button) */}
        <article className="launcher-card" data-testid="card-circuit">
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
            <div
              style={{
                inlineSize: "var(--control-md)",
                blockSize: "var(--control-md)",
                borderRadius: "var(--radius-sm)",
                backgroundColor: "var(--badge-tech-bg)",
                color: "var(--badge-tech-text)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect width="18" height="18" x="3" y="3" rx="2" />
                <path d="M7 7h10" />
                <path d="M7 12h10" />
                <path d="M7 17h10" />
              </svg>
            </div>

            <h2
              style={{
                margin: "0",
                fontSize: "1.25rem",
                fontWeight: "var(--weight-semibold)",
                color: "var(--text-main)",
              }}
            >
              {t("launcher.newCircuit")}
            </h2>
            <p
              style={{
                margin: "0",
                fontSize: "0.875rem",
                color: "var(--text-muted)",
                lineHeight: "1.5rem",
              }}
            >
              {t("launcher.newCircuitDesc")}
            </p>
          </div>

          <button
            type="button"
            onClick={() => createPlaceholderProject("circuit")}
            className="btn-tech"
            data-testid="create-circuit-btn"
          >
            {t("launcher.newCircuitCta")}
          </button>
        </article>
      </section>

      {/* Recent Projects Area (Empty State for now) */}
      <section
        aria-labelledby="recent-projects-heading"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
          marginBlockStart: "var(--space-4)",
        }}
      >
        <h2
          id="recent-projects-heading"
          style={{
            margin: "0",
            fontSize: "1.25rem",
            fontWeight: "var(--weight-semibold)",
            color: "var(--text-main)",
          }}
        >
          {t("launcher.recentProjects")}
        </h2>

        <div
          style={{
            backgroundColor: "var(--bg-subtle)",
            border: "1px dashed var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            padding: "var(--space-6)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: "var(--space-2)",
          }}
        >
          <svg
            width="32"
            height="32"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            color="var(--text-muted)"
            aria-hidden="true"
          >
            <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
          </svg>

          <span
            style={{
              fontSize: "0.9375rem",
              fontWeight: "var(--weight-medium)",
              color: "var(--text-main)",
            }}
          >
            {t("launcher.recentProjectsEmpty")}
          </span>
          <span
            style={{
              fontSize: "0.8125rem",
              color: "var(--text-muted)",
            }}
          >
            {t("launcher.recentProjectsHint")}
          </span>
        </div>
      </section>

      {/* Footer Navigation */}
      <footer
        style={{
          marginBlockStart: "var(--space-6)",
          paddingBlockStart: "var(--space-4)",
          borderBlockStart: "1px solid var(--border-card)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "var(--space-2)",
          fontSize: "0.8125rem",
          color: "var(--text-muted)",
        }}
      >
        <span>
          © {new Date().getFullYear()} {t("common.appName")}
        </span>

        <nav style={{ display: "flex", gap: "var(--space-3)" }}>
          <Link
            href="/privacy"
            style={{
              color: "var(--text-muted)",
              textDecoration: "none",
            }}
          >
            {t("legal.privacyTitle")}
          </Link>
          <Link
            href="/terms"
            style={{
              color: "var(--text-muted)",
              textDecoration: "none",
            }}
          >
            {t("legal.termsTitle")}
          </Link>
          <Link
            href="/licenses"
            style={{
              color: "var(--text-muted)",
              textDecoration: "none",
            }}
          >
            {t("legal.licensesTitle")}
          </Link>
        </nav>
      </footer>
    </main>
  );
}

export default function LauncherPage() {
  return (
    <AuthGuard>
      {({ user }) => <LauncherContent user={user} />}
    </AuthGuard>
  );
}
