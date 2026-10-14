"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { AuthGuard } from "../auth-guard";
import { useI18n } from "@/i18n/provider";

function WorkspaceContent() {
  const searchParams = useSearchParams();
  const { t } = useI18n();
  const projectId = searchParams.get("p");

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
        <div>
          <h1
            style={{
              marginBlockStart: "0",
              marginBlockEnd: "var(--space-1)",
              fontSize: "1.75rem",
              fontWeight: "var(--weight-bold)",
              color: "var(--text-main)",
            }}
          >
            {t("workspace.title")}
          </h1>
          <p
            style={{
              marginBlockStart: "0",
              marginBlockEnd: "0",
              fontSize: "0.875rem",
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)",
            }}
          >
            {projectId
              ? t("workspace.projectId", { id: projectId })
              : t("workspace.noProject")}
          </p>
        </div>

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
          {t("workspace.backToLauncher")}
        </Link>
      </header>

      {/* Placeholder card */}
      <section
        style={{
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-card)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-6)",
          boxShadow: "var(--shadow-1)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          gap: "var(--space-3)",
        }}
      >
        <div
          style={{
            inlineSize: "48px",
            blockSize: "48px",
            borderRadius: "var(--radius-full)",
            backgroundColor: "var(--badge-primary-bg)",
            color: "var(--accent-text)",
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
            <path d="M9 3v18" />
            <path d="m14 9 3 3-3 3" />
          </svg>
        </div>

        <h2
          style={{
            marginBlockStart: "0",
            marginBlockEnd: "0",
            fontSize: "1.25rem",
            fontWeight: "var(--weight-semibold)",
            color: "var(--text-main)",
          }}
        >
          {t("workspace.title")}
        </h2>

        <p
          style={{
            marginBlockStart: "0",
            marginBlockEnd: "var(--space-2)",
            color: "var(--text-muted)",
            fontSize: "0.9375rem",
            maxInlineSize: "50ch",
            lineHeight: "1.5rem",
          }}
        >
          {t("workspace.placeholderNotice")}
        </p>
      </section>
    </main>
  );
}

export default function WorkspacePage() {
  return (
    <AuthGuard>
      <Suspense
        fallback={
          <div
            style={{
              padding: "var(--space-6)",
              textAlign: "center",
              color: "var(--text-muted)",
              fontFamily: "var(--font-sans)",
            }}
          >
            ...
          </div>
        }
      >
        <WorkspaceContent />
      </Suspense>
    </AuthGuard>
  );
}
