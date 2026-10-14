"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase, signOut } from "@/core/supabase";
import { useI18n } from "@/i18n/provider";
import type { User } from "@supabase/supabase-js";

export default function HomePage() {
  const { t } = useI18n();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  async function handleSignOut() {
    await signOut();
    setUser(null);
  }

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

      {/* User Session Info Card */}
      {!loading && (
        <div
          style={{
            padding: "var(--space-4)",
            marginBlockEnd: "var(--space-6)",
            backgroundColor: "var(--bg-surface)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            gap: "var(--space-3)",
          }}
        >
          {user ? (
            <>
              <div>
                <span
                  style={{
                    fontSize: "0.8125rem",
                    color: "var(--text-muted)",
                    display: "block",
                  }}
                >
                  {t("auth.signedInAs")}
                </span>
                <span
                  style={{
                    fontSize: "0.9375rem",
                    fontWeight: "var(--weight-semibold)",
                    color: "var(--text-main)",
                  }}
                >
                  {user.email}
                </span>
              </div>
              <button
                type="button"
                onClick={handleSignOut}
                style={{
                  height: "var(--control-md)",
                  paddingInline: "var(--space-3)",
                  backgroundColor: "transparent",
                  color: "var(--color-danger-text)",
                  border: "1px solid var(--color-danger-border)",
                  borderRadius: "var(--radius-sm)",
                  fontWeight: "var(--weight-medium)",
                  fontSize: "0.875rem",
                  cursor: "pointer",
                }}
              >
                {t("auth.signOut")}
              </button>
            </>
          ) : (
            <>
              <span
                style={{
                  fontSize: "0.9375rem",
                  color: "var(--text-muted)",
                }}
              >
                {t("auth.signInSubtitle")}
              </span>
              <Link
                href="/login"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  height: "var(--control-md)",
                  paddingInline: "var(--space-4)",
                  backgroundColor: "var(--btn-primary-bg)",
                  color: "var(--btn-primary-text)",
                  borderRadius: "var(--radius-sm)",
                  textDecoration: "none",
                  fontWeight: "var(--weight-semibold)",
                  fontSize: "0.875rem",
                }}
              >
                {t("auth.signIn")}
              </Link>
            </>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: "var(--space-2)" }}>
        <Link
          href="/settings"
          style={{
            display: "inline-flex",
            alignItems: "center",
            height: "var(--control-md)",
            paddingInline: "var(--space-3)",
            backgroundColor: "var(--bg-subtle)",
            color: "var(--text-main)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            textDecoration: "none",
            fontWeight: "var(--weight-semibold)",
            fontSize: "0.875rem",
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
            fontSize: "0.875rem",
          }}
        >
          {t("home.goToThemeTest")}
        </Link>
      </div>
    </main>
  );
}

