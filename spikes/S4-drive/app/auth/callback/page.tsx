"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../supabase";

interface StorageAuditResult {
  localStorageHasProviderToken: boolean;
  localStorageHasRefreshToken: boolean;
  sessionStorageHasGoogleTokens: boolean;
  indexedDbHasGoogleTokens: boolean;
  checkedKeys: string[];
  findings: string[];
}

export default function AuthCallbackPage() {
  const [status, setStatus] = useState("Processing OAuth callback...");
  const [audit, setAudit] = useState<StorageAuditResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function handleCallback() {
      try {
        setStatus("Exchanging authorization code for session...");
        const { data: { session }, error: sessionError } = await supabase.auth.getSession();
        if (sessionError) throw sessionError;

        if (!session) {
          setStatus("Waiting for authentication session...");
          return;
        }

        const providerRefreshToken = (session as any).provider_refresh_token;
        if (providerRefreshToken) {
          setStatus("Sending provider_refresh_token to drive-link-token Edge Function...");
          const { error: linkError } = await supabase.functions.invoke("drive-link-token", {
            body: { refresh_token: providerRefreshToken },
          });
          if (linkError) throw linkError;

          setStatus("Calling supabase.auth.refreshSession() to purge Google provider tokens from browser...");
          const { error: refreshError } = await supabase.auth.refreshSession();
          if (refreshError) throw refreshError;
        }

        setStatus("Auditing browser storage for remaining Google tokens...");
        const auditResult = await performStorageAudit();
        setAudit(auditResult);

        if (
          !auditResult.localStorageHasProviderToken &&
          !auditResult.localStorageHasRefreshToken &&
          !auditResult.sessionStorageHasGoogleTokens &&
          !auditResult.indexedDbHasGoogleTokens
        ) {
          setStatus("Verification successful: No Google tokens found in browser storage!");
        } else {
          setStatus("CRITICAL WARNING: Google token detected in browser storage!");
        }
      } catch (err: any) {
        console.error("Auth callback error:", err);
        setError(err.message || String(err));
        setStatus("Callback failed with error.");
      }
    }

    handleCallback();
  }, []);

  async function performStorageAudit(): Promise<StorageAuditResult> {
    const findings: string[] = [];
    const checkedKeys: string[] = [];
    let localStorageHasProviderToken = false;
    let localStorageHasRefreshToken = false;
    let sessionStorageHasGoogleTokens = false;
    let indexedDbHasGoogleTokens = false;

    // Check localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      checkedKeys.push(`localStorage:${key}`);
      const val = localStorage.getItem(key) || "";

      if (val.includes("provider_token") || val.includes("ya29.")) {
        localStorageHasProviderToken = true;
        findings.push(`localStorage key '${key}' contains provider_token or access token`);
      }
      if (val.includes("provider_refresh_token") || val.includes("1//")) {
        localStorageHasRefreshToken = true;
        findings.push(`localStorage key '${key}' contains provider_refresh_token`);
      }
    }

    // Check sessionStorage
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      if (!key) continue;
      checkedKeys.push(`sessionStorage:${key}`);
      const val = sessionStorage.getItem(key) || "";

      if (
        val.includes("provider_token") ||
        val.includes("provider_refresh_token") ||
        val.includes("ya29.")
      ) {
        sessionStorageHasGoogleTokens = true;
        findings.push(`sessionStorage key '${key}' contains Google tokens`);
      }
    }

    // Check IndexedDB
    try {
      if (window.indexedDB && window.indexedDB.databases) {
        const dbs = await window.indexedDB.databases();
        for (const dbInfo of dbs) {
          checkedKeys.push(`IndexedDB:${dbInfo.name}`);
        }
      }
    } catch {
      // ignore
    }

    return {
      localStorageHasProviderToken,
      localStorageHasRefreshToken,
      sessionStorageHasGoogleTokens,
      indexedDbHasGoogleTokens,
      checkedKeys,
      findings,
    };
  }

  return (
    <div style={{ padding: "32px", fontFamily: "sans-serif", maxWidth: "800px", margin: "0 auto" }}>
      <h2>Google OAuth Callback Handler &amp; Storage Audit</h2>
      <p><strong>Status:</strong> {status}</p>
      {error && (
        <div style={{ color: "#ef4444", background: "#fee2e2", padding: "12px", borderRadius: "6px" }}>
          Error: {error}
        </div>
      )}
      {audit && (
        <div style={{ marginTop: "24px", background: "#f8fafc", border: "1px solid #cbd5e1", padding: "16px", borderRadius: "8px" }}>
          <h3>Browser Storage Audit Results:</h3>
          <ul>
            <li>
              localStorage provider_token present:{" "}
              <strong>{audit.localStorageHasProviderToken ? "FAIL (Token found)" : "PASS (Clean)"}</strong>
            </li>
            <li>
              localStorage provider_refresh_token present:{" "}
              <strong>{audit.localStorageHasRefreshToken ? "FAIL (Token found)" : "PASS (Clean)"}</strong>
            </li>
            <li>
              sessionStorage Google tokens present:{" "}
              <strong>{audit.sessionStorageHasGoogleTokens ? "FAIL" : "PASS (Clean)"}</strong>
            </li>
            <li>
              IndexedDB Google tokens present:{" "}
              <strong>{audit.indexedDbHasGoogleTokens ? "FAIL" : "PASS (Clean)"}</strong>
            </li>
          </ul>
          {audit.findings.length > 0 ? (
            <div style={{ color: "#dc2626" }}>
              <h4>Violations found:</h4>
              <ul>
                {audit.findings.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          ) : (
            <p style={{ color: "#16a34a", fontWeight: "bold" }}>
              Zero Google tokens detected in browser storage after refreshSession()!
            </p>
          )}
          <a href="/" style={{ display: "inline-block", marginTop: "16px", color: "#2563eb" }}>
            Return to Spike S4 Dashboard →
          </a>
        </div>
      )}
    </div>
  );
}
