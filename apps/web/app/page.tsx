"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AuthGuard } from "./auth-guard";
import { signOut } from "@/core/supabase";
import { useI18n } from "@/i18n/provider";
import { Card } from "@/components/card";
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
        maxInlineSize: "120ch",
        marginInline: "auto",
        fontFamily: "var(--font-sans)",
        color: "var(--text-main)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-6)",
        boxSizing: "border-box",
        inlineSize: "100%",
      }}
    >
      <style>{`
        .launcher-card {
          position: relative;
          background-color: var(--bg-surface);
          border: 1px solid var(--border-card);
          border-radius: var(--radius-md);
          padding: var(--space-3);
          box-shadow: var(--shadow-1);
          overflow: hidden;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          inline-size: 100%;
          box-sizing: border-box;
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
        .cards-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: var(--space-3);
          inline-size: 100%;
        }
        @media (min-width: 640px) {
          .cards-grid {
            grid-template-columns: repeat(2, 1fr);
          }
          .cards-grid > article:nth-child(3) {
            grid-column: span 2;
            max-inline-size: 56ch;
            margin-inline: auto;
            inline-size: 100%;
          }
        }
        @media (min-width: 960px) {
          .cards-grid {
            grid-template-columns: repeat(3, 1fr);
          }
          .cards-grid > article:nth-child(3) {
            grid-column: auto;
            max-inline-size: 100%;
            margin-inline: 0;
          }
        }
        .btn-gold {
          background-color: var(--btn-gold-bg);
          color: var(--btn-gold-text);
          border: 0;
          border-radius: var(--radius-sm);
          block-size: var(--control-md);
          padding-block: 0;
          padding-inline: var(--space-3);
          font-weight: var(--weight-semibold);
          font-size: 0.875rem;
          font-family: var(--font-sans);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-1);
          box-sizing: border-box;
          inline-size: 100%;
          transition: background-color var(--motion-fast) var(--ease-standard),
                      box-shadow var(--motion-base) var(--ease-standard);
        }
        .btn-primary {
          background-color: var(--btn-primary-bg);
          color: var(--btn-primary-text);
          border: 0;
          border-radius: var(--radius-sm);
          block-size: var(--control-md);
          padding-block: 0;
          padding-inline: var(--space-3);
          font-weight: var(--weight-semibold);
          font-size: 0.875rem;
          font-family: var(--font-sans);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-1);
          box-sizing: border-box;
          inline-size: 100%;
          transition: background-color var(--motion-fast) var(--ease-standard),
                      box-shadow var(--motion-base) var(--ease-standard);
        }
        .btn-tech {
          background-color: transparent;
          color: var(--accent-text);
          border: 2px solid var(--accent-text);
          border-radius: var(--radius-sm);
          block-size: var(--control-md);
          padding-block: 0;
          padding-inline: var(--space-3);
          font-weight: var(--weight-semibold);
          font-size: 0.875rem;
          font-family: var(--font-sans);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-1);
          box-sizing: border-box;
          inline-size: 100%;
          transition: background-color var(--motion-fast) var(--ease-standard),
                      color var(--motion-fast) var(--ease-standard),
                      box-shadow var(--motion-base) var(--ease-standard);
        }
        .btn-subtle {
          background-color: var(--bg-subtle);
          color: var(--text-main);
          border: 1px solid var(--border-card);
          border-radius: var(--radius-sm);
          block-size: var(--control-md);
          padding-block: 0;
          padding-inline: var(--space-3);
          font-weight: var(--weight-medium);
          font-size: 0.875rem;
          font-family: var(--font-sans);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: var(--space-1);
          box-sizing: border-box;
          text-decoration: none;
          transition: background-color var(--motion-fast) var(--ease-standard),
                      border-color var(--motion-fast) var(--ease-standard);
        }
        .btn-danger-outline {
          background-color: transparent;
          color: var(--color-danger-text);
          border: 1px solid var(--color-danger-border);
          border-radius: var(--radius-sm);
          block-size: var(--control-sm);
          padding-block: 0;
          padding-inline: var(--space-2);
          font-weight: var(--weight-medium);
          font-size: 0.8125rem;
          font-family: var(--font-sans);
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          box-sizing: border-box;
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
            border-color: var(--border-input);
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
          boxSizing: "border-box",
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
              boxSizing: "border-box",
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
            <bdi dir="ltr">{user.email}</bdi>
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

      {/* Hero / Title Area with Integrated Secondary Action */}
      <section
        aria-label={t("launcher.pageTitle")}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-1)",
            maxInlineSize: "65ch",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: "2rem",
              lineHeight: "2.5rem",
              fontWeight: "var(--weight-bold)",
              color: "var(--text-main)",
            }}
          >
            {t("launcher.pageTitle")}
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: "1rem",
              lineHeight: "1.5rem",
              color: "var(--text-muted)",
            }}
          >
            {t("launcher.tagline")}
          </p>
        </div>

        {/* Secondary Action: Open .alpha file */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "var(--space-2)",
            marginBlockStart: "var(--space-1)",
          }}
        >
          <button
            type="button"
            onClick={() => setAlphaNotice((prev) => !prev)}
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
            <span>{t("launcher.openAlpha")}</span>
          </button>

          {alphaNotice && (
            <div
              role="status"
              style={{
                fontSize: "0.8125rem",
                color: "var(--accent-text-strong)",
                backgroundColor: "var(--badge-tech-bg)",
                border: "1px solid var(--badge-tech-bd)",
                paddingBlock: "var(--space-1)",
                paddingInline: "var(--space-2)",
                borderRadius: "var(--radius-sm)",
                lineHeight: "1.25rem",
                boxSizing: "border-box",
              }}
            >
              {t("launcher.openAlphaComingSoon")}
            </div>
          )}
        </div>
      </section>

      {/* Balanced 3-Card Tool Grid */}
      <section
        aria-label={t("launcher.pageTitle")}
        className="cards-grid"
      >
        {/* Card 1: New Whiteboard (R7: Gold CTA button) */}
        <Card
          testId="card-whiteboard"
          iconBg="var(--badge-gold-bg)"
          iconColor="var(--badge-gold-text)"
          iconBorder="var(--badge-gold-bd)"
          icon={
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
          }
          title={t("launcher.newWhiteboard")}
          description={t("launcher.newWhiteboardDesc")}
          action={
            <button
              type="button"
              onClick={() => createPlaceholderProject("board")}
              className="btn-gold"
              data-testid="create-whiteboard-btn"
            >
              {t("launcher.newWhiteboardCta")}
            </button>
          }
        />

        {/* Card 2: New PDF (Primary button) */}
        <Card
          testId="card-pdf"
          iconBg="var(--badge-primary-bg)"
          iconColor="var(--badge-primary-text)"
          iconBorder="var(--badge-primary-bd)"
          icon={
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
          }
          title={t("launcher.newPdf")}
          description={t("launcher.newPdfDesc")}
          action={
            <button
              type="button"
              onClick={() => createPlaceholderProject("pdf")}
              className="btn-primary"
              data-testid="create-pdf-btn"
            >
              {t("launcher.newPdfCta")}
            </button>
          }
        />

        {/* Card 3: New Circuit (Tech outline button) */}
        <Card
          testId="card-circuit"
          iconBg="var(--badge-tech-bg)"
          iconColor="var(--badge-tech-text)"
          iconBorder="var(--badge-tech-bd)"
          icon={
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
          }
          title={t("launcher.newCircuit")}
          description={t("launcher.newCircuitDesc")}
          action={
            <button
              type="button"
              onClick={() => createPlaceholderProject("circuit")}
              className="btn-tech"
              data-testid="create-circuit-btn"
            >
              {t("launcher.newCircuitCta")}
            </button>
          }
        />
      </section>

      {/* Recent Projects Section with Graceful Empty State */}
      <section
        aria-labelledby="recent-projects-heading"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-3)",
          marginBlockStart: "var(--space-2)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-2)",
          }}
        >
          <h2
            id="recent-projects-heading"
            style={{
              margin: 0,
              fontSize: "1.25rem",
              lineHeight: "1.75rem",
              fontWeight: "var(--weight-semibold)",
              color: "var(--text-main)",
            }}
          >
            {t("launcher.recentProjects")}
          </h2>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              blockSize: "var(--space-3)",
              paddingInline: "var(--space-1)",
              borderRadius: "var(--radius-full)",
              backgroundColor: "var(--bg-subtle)",
              border: "1px solid var(--border-card)",
              fontSize: "0.75rem",
              fontWeight: "var(--weight-medium)",
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)",
              boxSizing: "border-box",
            }}
          >
            0
          </span>
        </div>

        <div
          style={{
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-card)",
            borderRadius: "var(--radius-md)",
            paddingBlock: "var(--space-6)",
            paddingInline: "var(--space-4)",
            boxShadow: "var(--shadow-1)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: "var(--space-2)",
            boxSizing: "border-box",
          }}
        >
          <div
            style={{
              inlineSize: "var(--control-lg)",
              blockSize: "var(--control-lg)",
              borderRadius: "var(--radius-full)",
              backgroundColor: "var(--bg-subtle)",
              border: "1px solid var(--border-card)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--accent-text)",
              boxSizing: "border-box",
            }}
          >
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.75"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />
            </svg>
          </div>

          <span
            style={{
              fontSize: "1rem",
              fontWeight: "var(--weight-medium)",
              color: "var(--text-main)",
              lineHeight: "1.5rem",
            }}
          >
            {t("launcher.recentProjectsEmpty")}
          </span>
          <p
            style={{
              margin: 0,
              fontSize: "0.875rem",
              color: "var(--text-muted)",
              lineHeight: "1.5rem",
              maxInlineSize: "45ch",
            }}
          >
            {t("launcher.recentProjectsHint")}
          </p>
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
          boxSizing: "border-box",
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
