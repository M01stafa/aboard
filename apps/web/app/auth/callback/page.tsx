"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase, refreshAndPurgeProviderTokens } from "@/core/supabase";
import { useI18n } from "@/i18n/provider";

export default function AuthCallbackPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function processCallback() {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const errorParam =
          url.searchParams.get("error_description") || url.searchParams.get("error");

        if (errorParam) {
          throw new Error(errorParam);
        }

        if (code) {
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) throw exchangeError;
        }

        // Purge Google provider tokens immediately via refreshSession (SEC-2)
        const { error: refreshError } = await refreshAndPurgeProviderTokens();
        if (refreshError) throw refreshError;

        if (active) {
          router.replace("/");
        }
      } catch (err: unknown) {
        if (active) {
          setErrorMessage(
            err instanceof Error ? err.message : t("auth.genericError")
          );
        }
      }
    }

    processCallback();

    return () => {
      active = false;
    };
  }, [router, t]);

  if (errorMessage) {
    return (
      <main
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "60vh",
          padding: "var(--space-6)",
          fontFamily: "var(--font-sans)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            maxWidth: "48ch",
            width: "100%",
            padding: "var(--space-4)",
            backgroundColor: "var(--surface-sunken)",
            borderRadius: "var(--radius-md)",
            border: "1px solid var(--border-subtle)",
          }}
        >
          <h1
            style={{
              marginBlockStart: "0",
              marginBlockEnd: "var(--space-2)",
              fontSize: "1.25rem",
              fontWeight: "var(--weight-bold)",
              color: "var(--text-main)",
            }}
          >
            {t("auth.callbackFailedTitle")}
          </h1>
          <p
            style={{
              marginBlockStart: "0",
              marginBlockEnd: "var(--space-4)",
              color: "var(--text-muted)",
              fontSize: "0.875rem",
              lineHeight: "1.5rem",
            }}
          >
            {errorMessage}
          </p>
          <Link
            href="/login"
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              height: "var(--control-md)",
              paddingInline: "var(--space-3)",
              backgroundColor: "var(--btn-primary-bg)",
              color: "var(--btn-primary-text)",
              borderRadius: "var(--radius-sm)",
              textDecoration: "none",
              fontWeight: "var(--weight-semibold)",
              fontSize: "0.875rem",
            }}
          >
            {t("auth.backToSignIn")}
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "60vh",
        padding: "var(--space-6)",
        fontFamily: "var(--font-sans)",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "var(--space-2)",
        }}
      >
        <div
          style={{
            width: "32px",
            height: "32px",
            border: "3px solid var(--border-subtle)",
            borderTopColor: "var(--btn-primary-bg)",
            borderRadius: "var(--radius-full)",
            animation: "spin 1s linear infinite",
          }}
        />
        <p
          style={{
            marginBlockStart: "var(--space-2)",
            marginBlockEnd: "0",
            color: "var(--text-muted)",
            fontSize: "0.875rem",
          }}
        >
          {t("auth.completingSignIn")}
        </p>
      </div>
    </main>
  );
}
