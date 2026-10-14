"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  signInWithGoogle,
  signInWithEmailOtp,
  verifyEmailOtp,
} from "@/core/supabase";
import { env } from "@/core/env";
import { useI18n } from "@/i18n/provider";

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement | string,
        options: {
          sitekey: string;
          callback?: (token: string) => void;
          "error-callback"?: (error?: unknown) => void;
          "expired-callback"?: () => void;
          theme?: "light" | "dark" | "auto";
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();

  const [email, setEmail] = useState("");
  const [otpToken, setOtpToken] = useState("");
  const [step, setStep] = useState<"email" | "otp">("email");
  const [isSharedComputer, setIsSharedComputer] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const turnstileContainerRef = useRef<HTMLDivElement>(null);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const widgetIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || step !== "email") return;

    let mounted = true;
    let timer: NodeJS.Timeout;

    function renderWidget() {
      if (!mounted) return;
      if (
        turnstileContainerRef.current &&
        window.turnstile &&
        env.NEXT_PUBLIC_TURNSTILE_SITE_KEY &&
        !widgetIdRef.current
      ) {
        try {
          widgetIdRef.current = window.turnstile.render(
            turnstileContainerRef.current,
            {
              sitekey: env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
              callback: (token: string) => {
                if (mounted) {
                  setCaptchaToken(token);
                  setErrorMessage(null);
                }
              },
              "expired-callback": () => {
                if (mounted) {
                  setCaptchaToken(null);
                  setErrorMessage(t("auth.captchaExpired"));
                }
              },
              "error-callback": () => {
                if (mounted) {
                  setCaptchaToken(null);
                  setErrorMessage(t("auth.captchaFailed"));
                }
              },
              theme: "auto",
            }
          );
        } catch (e) {
          // ignore duplicate render in strict mode
        }
      }
    }

    if (window.turnstile) {
      renderWidget();
    } else {
      timer = setInterval(() => {
        if (window.turnstile) {
          clearInterval(timer);
          renderWidget();
        }
      }, 100);
    }

    return () => {
      mounted = false;
      if (timer) clearInterval(timer);
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch (e) {
          // ignore
        }
        widgetIdRef.current = null;
      }
    };
  }, [step, t]);

  async function handleGoogleSignIn() {
    setLoading(true);
    setErrorMessage(null);
    try {
      if (typeof window !== "undefined" && isSharedComputer) {
        sessionStorage.setItem("aboard:shared_computer", "true");
      }
      const { error } = await signInWithGoogle();
      if (error) throw error;
    } catch (err: unknown) {
      setLoading(false);
      setErrorMessage(
        err instanceof Error ? err.message : t("auth.genericError")
      );
    }
  }

  async function handleSendEmailOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;

    if (!captchaToken) {
      setErrorMessage(t("auth.captchaRequired"));
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    try {
      if (typeof window !== "undefined" && isSharedComputer) {
        sessionStorage.setItem("aboard:shared_computer", "true");
      }
      const { error } = await signInWithEmailOtp(email.trim(), {
        captchaToken,
      });
      if (error) {
        if (
          error.message?.includes("captcha") ||
          (error as { code?: string }).code === "captcha_failed"
        ) {
          if (widgetIdRef.current && window.turnstile) {
            window.turnstile.reset(widgetIdRef.current);
          }
          setCaptchaToken(null);
          throw new Error(t("auth.captchaFailed"));
        }
        throw error;
      }
      setStep("otp");
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : t("auth.genericError")
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyOtp(e: React.FormEvent) {
    e.preventDefault();
    if (!otpToken.trim()) return;

    setLoading(true);
    setErrorMessage(null);
    try {
      const { error } = await verifyEmailOtp(email.trim(), otpToken.trim());
      if (error) throw error;
      router.push("/");
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : t("auth.genericError")
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "80vh",
        padding: "var(--space-6)",
        fontFamily: "var(--font-sans)",
      }}
    >
      <script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js"
        async
        defer
      />
      <div
        style={{
          width: "100%",
          maxWidth: "48ch",
          backgroundColor: "var(--bg-surface)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md)",
          padding: "var(--space-6)",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <div style={{ marginBlockEnd: "var(--space-6)", textAlign: "center" }}>
          <h1
            style={{
              marginBlockStart: "0",
              marginBlockEnd: "var(--space-1)",
              fontSize: "1.5rem",
              fontWeight: "var(--weight-bold)",
              color: "var(--text-main)",
            }}
          >
            {t("auth.signInTitle")}
          </h1>
          <p
            style={{
              marginBlockStart: "0",
              marginBlockEnd: "0",
              fontSize: "0.875rem",
              color: "var(--text-muted)",
              lineHeight: "1.5rem",
            }}
          >
            {t("auth.signInSubtitle")}
          </p>
        </div>

        {errorMessage && (
          <div
            style={{
              padding: "var(--space-3)",
              marginBlockEnd: "var(--space-4)",
              backgroundColor: "var(--color-danger-bg)",
              color: "var(--color-danger-text)",
              border: "1px solid var(--color-danger-border)",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.875rem",
              lineHeight: "1.25rem",
            }}
          >
            {errorMessage}
          </div>
        )}

        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "var(--control-lg)",
            paddingInline: "var(--space-4)",
            backgroundColor: "var(--bg-subtle)",
            color: "var(--text-main)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            fontWeight: "var(--weight-semibold)",
            fontSize: "0.9375rem",
            cursor: loading ? "not-allowed" : "pointer",
            gap: "var(--space-2)",
            opacity: loading ? 0.7 : 1,
            transition: "background-color 0.15s ease",
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
            />
          </svg>
          {t("auth.continueWithGoogle")}
        </button>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginBlock: "var(--space-6)",
            gap: "var(--space-2)",
          }}
        >
          <div
            style={{
              flex: 1,
              height: "1px",
              backgroundColor: "var(--border-subtle)",
            }}
          />
          <span
            style={{
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
            }}
          >
            {t("auth.orContinueWithEmail")}
          </span>
          <div
            style={{
              flex: 1,
              height: "1px",
              backgroundColor: "var(--border-subtle)",
            }}
          />
        </div>

        {step === "email" ? (
          <form onSubmit={handleSendEmailOtp}>
            <div style={{ marginBlockEnd: "var(--space-4)" }}>
              <label
                htmlFor="auth-email-input"
                style={{
                  display: "block",
                  marginBlockEnd: "var(--space-1)",
                  fontSize: "0.875rem",
                  fontWeight: "var(--weight-medium)",
                  color: "var(--text-main)",
                }}
              >
                {t("auth.emailLabel")}
              </label>
              <input
                id="auth-email-input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("auth.emailPlaceholder")}
                style={{
                  width: "100%",
                  height: "var(--control-md)",
                  paddingInline: "var(--space-3)",
                  backgroundColor: "var(--surface-sunken)",
                  color: "var(--text-main)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.9375rem",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "var(--space-2)",
                marginBlockEnd: "var(--space-6)",
              }}
            >
              <input
                id="auth-shared-checkbox"
                type="checkbox"
                checked={isSharedComputer}
                onChange={(e) => setIsSharedComputer(e.target.checked)}
                style={{
                  marginBlockStart: "var(--space-1)",
                  cursor: "pointer",
                }}
              />
              <label
                htmlFor="auth-shared-checkbox"
                style={{
                  fontSize: "0.8125rem",
                  color: "var(--text-muted)",
                  lineHeight: "1.25rem",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    display: "block",
                    fontWeight: "var(--weight-medium)",
                    color: "var(--text-main)",
                  }}
                >
                  {t("auth.sharedComputerLabel")}
                </span>
                {t("auth.sharedComputerHint")}
              </label>
            </div>

            <div
              ref={turnstileContainerRef}
              style={{
                display: "flex",
                justifyContent: "center",
                alignItems: "center",
                minHeight: "64px",
                marginBlockEnd: "var(--space-4)",
              }}
            />

            <button
              type="submit"
              disabled={loading || !email.trim() || !captchaToken}
              style={{
                width: "100%",
                height: "var(--control-lg)",
                backgroundColor: "var(--btn-primary-bg)",
                color: "var(--btn-primary-text)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                fontWeight: "var(--weight-semibold)",
                fontSize: "0.9375rem",
                cursor:
                  loading || !email.trim() || !captchaToken
                    ? "not-allowed"
                    : "pointer",
                opacity: loading || !email.trim() || !captchaToken ? 0.7 : 1,
              }}
            >
              {loading ? t("auth.sendingCode") : t("auth.sendCode")}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerifyOtp}>
            <div style={{ marginBlockEnd: "var(--space-4)" }}>
              <p
                style={{
                  marginBlockStart: "0",
                  marginBlockEnd: "var(--space-3)",
                  fontSize: "0.875rem",
                  color: "var(--text-muted)",
                }}
              >
                {t("auth.codeSentNotice").replace("{email}", email)}
              </p>
              <label
                htmlFor="auth-otp-input"
                style={{
                  display: "block",
                  marginBlockEnd: "var(--space-1)",
                  fontSize: "0.875rem",
                  fontWeight: "var(--weight-medium)",
                  color: "var(--text-main)",
                }}
              >
                {t("auth.codeLabel")}
              </label>
              <input
                id="auth-otp-input"
                type="text"
                required
                maxLength={6}
                value={otpToken}
                onChange={(e) => setOtpToken(e.target.value.replace(/\D/g, ""))}
                placeholder={t("auth.codePlaceholder")}
                style={{
                  width: "100%",
                  height: "var(--control-md)",
                  paddingInline: "var(--space-3)",
                  backgroundColor: "var(--surface-sunken)",
                  color: "var(--text-main)",
                  border: "1px solid var(--border-subtle)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "1.25rem",
                  letterSpacing: "0.25em",
                  textAlign: "center",
                  fontVariantNumeric: "tabular-nums",
                  boxSizing: "border-box",
                }}
              />
            </div>

            <button
              type="submit"
              disabled={loading || otpToken.length < 6}
              style={{
                width: "100%",
                height: "var(--control-lg)",
                backgroundColor: "var(--btn-primary-bg)",
                color: "var(--btn-primary-text)",
                border: "none",
                borderRadius: "var(--radius-sm)",
                fontWeight: "var(--weight-semibold)",
                fontSize: "0.9375rem",
                cursor: loading || otpToken.length < 6 ? "not-allowed" : "pointer",
                opacity: loading || otpToken.length < 6 ? 0.7 : 1,
                marginBlockEnd: "var(--space-3)",
              }}
            >
              {loading ? t("auth.verifyingCode") : t("auth.verifyCode")}
            </button>

            <button
              type="button"
              onClick={handleSendEmailOtp}
              disabled={loading}
              style={{
                width: "100%",
                backgroundColor: "transparent",
                color: "var(--accent-text)",
                border: "none",
                fontSize: "0.875rem",
                cursor: "pointer",
                padding: "var(--space-1)",
              }}
            >
              {t("auth.resendCode")}
            </button>
          </form>
        )}

        <div
          style={{
            marginBlockStart: "var(--space-6)",
            textAlign: "center",
            fontSize: "0.75rem",
            color: "var(--text-muted)",
          }}
        >
          {t("auth.turnstileNotice")}
        </div>
      </div>

      <div
        style={{
          marginBlockStart: "var(--space-4)",
          display: "flex",
          gap: "var(--space-3)",
        }}
      >
        <Link
          href="/"
          style={{
            color: "var(--text-muted)",
            fontSize: "0.875rem",
            textDecoration: "none",
          }}
        >
          {t("settings.backToHome")}
        </Link>
      </div>
    </main>
  );
}
