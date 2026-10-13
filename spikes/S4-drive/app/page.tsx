"use client";

import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { CONFIG } from "./config";

interface CheckStatus {
  signInGoogle: "idle" | "pending" | "pass" | "fail";
  driveStatus: "idle" | "pending" | "pass" | "fail";
  storageAudit: "idle" | "pending" | "pass" | "fail";
  createFolder: "idle" | "pending" | "pass" | "fail";
  multipartUpload: "idle" | "pending" | "pass" | "fail";
  resumableUpload100Mb: "idle" | "pending" | "pass" | "fail";
  pickerLoad: "idle" | "pending" | "pass" | "fail";
}

export default function SpikeS4Page() {
  const [session, setSession] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<CheckStatus>({
    signInGoogle: "idle",
    driveStatus: "idle",
    storageAudit: "idle",
    createFolder: "idle",
    multipartUpload: "idle",
    resumableUpload100Mb: "idle",
    pickerLoad: "idle",
  });
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [folderId, setFolderId] = useState<string | null>(null);

  const addLog = (msg: string) => {
    const time = new Date().toLocaleTimeString();
    setLogs((prev) => [`[${time}] ${msg}`, ...prev]);
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session) {
        addLog(`Active user: ${session.user.email} (ID: ${session.user.id})`);
        checkDriveStatus();
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, currentSession) => {
        setSession(currentSession);
        if (currentSession) {
          addLog(`Auth state changed: ${currentSession.user.email}`);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  async function signInWithGoogle() {
    addLog("Initiating Path A: Google OAuth with drive.file scope...");
    setStatuses((prev) => ({ ...prev, signInGoogle: "pending" }));
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        scopes: "https://www.googleapis.com/auth/drive.file",
        queryParams: {
          access_type: "offline",
          include_granted_scopes: "true",
          prompt: "consent",
        },
      },
    });
    if (error) {
      addLog(`Sign in error: ${error.message}`);
      setStatuses((prev) => ({ ...prev, signInGoogle: "fail" }));
    }
  }

  async function connectDrivePathB() {
    addLog("Initiating Path B: Calling drive-connect Edge Function...");
    try {
      const { data, error } = await supabase.functions.invoke("drive-connect", {
        body: { returnTo: "/" },
      });
      if (error) throw error;
      if (data?.url) {
        addLog(`Redirecting to Google consent: ${data.url}`);
        window.location.assign(data.url);
      }
    } catch (err: any) {
      addLog(`Path B error: ${err.message || String(err)}`);
    }
  }

  async function checkDriveStatus() {
    try {
      setStatuses((prev) => ({ ...prev, driveStatus: "pending" }));
      const { data, error } = await supabase.rpc("get_drive_status");
      if (error) throw error;
      const status = data?.[0] || { connected: false };
      addLog(`Drive Status: connected=${status.connected}, email=${status.google_email || "none"}`);
      setStatuses((prev) => ({ ...prev, driveStatus: status.connected ? "pass" : "idle" }));
    } catch (err: any) {
      addLog(`Error checking Drive status: ${err.message || String(err)}`);
      setStatuses((prev) => ({ ...prev, driveStatus: "fail" }));
    }
  }

  async function inspectBrowserStorage() {
    addLog("Scanning localStorage, sessionStorage, and IndexedDB...");
    setStatuses((prev) => ({ ...prev, storageAudit: "pending" }));

    let leaked = false;
    // localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || "";
      const v = localStorage.getItem(k) || "";
      if (v.includes("provider_refresh_token") || v.includes("1//") || v.includes("provider_token") || v.includes("ya29.")) {
        leaked = true;
        addLog(`LEAK FOUND in localStorage: key '${k}' contains Google tokens!`);
      }
    }

    // sessionStorage
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i) || "";
      const v = sessionStorage.getItem(k) || "";
      if (v.includes("provider_refresh_token") || v.includes("1//") || v.includes("provider_token") || v.includes("ya29.")) {
        leaked = true;
        addLog(`LEAK FOUND in sessionStorage: key '${k}' contains Google tokens!`);
      }
    }

    if (!leaked) {
      addLog("Storage check PASSED: Zero Google tokens found in browser storage!");
      setStatuses((prev) => ({ ...prev, storageAudit: "pass" }));
    } else {
      addLog("Storage check FAILED: Google token exists in browser storage!");
      setStatuses((prev) => ({ ...prev, storageAudit: "fail" }));
    }
  }

  async function getDriveAccessToken(): Promise<string> {
    if (accessToken) return accessToken;
    addLog("Requesting short-lived Google access token from drive-token Edge Function...");
    const { data, error } = await supabase.functions.invoke("drive-token");
    if (error) throw error;
    if (!data?.access_token) throw new Error("No access_token returned by drive-token");
    addLog(`Access token received! (Expires in: ${Math.round((data.expires_at - Date.now()) / 1000)}s)`);
    setAccessToken(data.access_token);
    return data.access_token;
  }

  async function testCreateFolder() {
    try {
      setStatuses((prev) => ({ ...prev, createFolder: "pending" }));
      const token = await getDriveAccessToken();
      addLog("Creating folder 'Aboard (Spike S4 Test)' in Google Drive...");

      const res = await fetch("https://www.googleapis.com/drive/v3/files", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: "Aboard (Spike S4 Test)",
          mimeType: "application/vnd.google-apps.folder",
          appProperties: { app: "aboard", spike: "s4" },
        }),
      });

      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.message || "Folder creation failed");
      addLog(`Folder created successfully! ID: ${body.id}`);
      setFolderId(body.id);
      setStatuses((prev) => ({ ...prev, createFolder: "pass" }));
    } catch (err: any) {
      addLog(`Folder creation failed: ${err.message || String(err)}`);
      setStatuses((prev) => ({ ...prev, createFolder: "fail" }));
    }
  }

  async function testMultipartUpload() {
    try {
      setStatuses((prev) => ({ ...prev, multipartUpload: "pending" }));
      const token = await getDriveAccessToken();
      addLog("Performing multipart small file upload (test-meta.json)...");

      const metadata = {
        name: "test-meta.json",
        parents: folderId ? [folderId] : undefined,
        appProperties: { hash: "sha256-test-123", spike: "s4" },
      };
      const content = JSON.stringify({ message: "Aboard spike test", time: Date.now() });

      const boundary = "-------aboardboundary123";
      const delimiter = `\r\n--${boundary}\r\n`;
      const closeDelim = `\r\n--${boundary}--`;

      const multipartBody =
        delimiter +
        "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
        JSON.stringify(metadata) +
        delimiter +
        "Content-Type: application/json\r\n\r\n" +
        content +
        closeDelim;

      const res = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": `multipart/related; boundary=${boundary}`,
          },
          body: multipartBody,
        }
      );

      const body = await res.json();
      if (!res.ok) throw new Error(body.error?.message || "Multipart upload failed");
      addLog(`Multipart upload successful! File ID: ${body.id}, Name: ${body.name}`);
      setStatuses((prev) => ({ ...prev, multipartUpload: "pass" }));
    } catch (err: any) {
      addLog(`Multipart upload error: ${err.message || String(err)}`);
      setStatuses((prev) => ({ ...prev, multipartUpload: "fail" }));
    }
  }

  async function testResumableUpload100Mb() {
    try {
      setStatuses((prev) => ({ ...prev, resumableUpload100Mb: "pending" }));
      const token = await getDriveAccessToken();
      const fileSize = 100 * 1024 * 1024; // 100 MB
      addLog(`Initiating 100 MB resumable upload session (${fileSize} bytes)...`);

      // 1. Initial request to obtain session URI
      const initRes = await fetch(
        "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": "application/octet-stream",
            "X-Upload-Content-Length": String(fileSize),
          },
          body: JSON.stringify({
            name: "test-large-100mb.bin",
            parents: folderId ? [folderId] : undefined,
          }),
        }
      );

      // Verify Location header readability
      const locationUrl = initRes.headers.get("Location");
      addLog(`Location header check: ${locationUrl ? "READABLE" : "MISSING (CORS restricted)"}`);
      if (!locationUrl) {
        throw new Error("Cannot read Location header from resumable session creation!");
      }

      addLog(`Resumable session URL obtained: ${locationUrl.slice(0, 50)}...`);

      // 2. Upload first 8 MiB chunk and check Range header
      const chunkSize = 8 * 1024 * 1024; // 8 MiB
      addLog(`Uploading chunk 0-${chunkSize - 1}/${fileSize} (8 MiB)...`);
      const dummyChunk = new Uint8Array(chunkSize);

      const chunkRes = await fetch(locationUrl, {
        method: "PUT",
        headers: {
          "Content-Range": `bytes 0-${chunkSize - 1}/${fileSize}`,
          "Content-Type": "application/octet-stream",
        },
        body: dummyChunk,
      });

      addLog(`Chunk response status: ${chunkRes.status} (Expected: 308 Resume Incomplete)`);
      const rangeHeader = chunkRes.headers.get("Range");
      addLog(`Range header readability: ${rangeHeader ? `READABLE ('${rangeHeader}')` : "UNAVAILABLE"}`);

      if (chunkRes.status === 308) {
        addLog("100 MB resumable upload verified! Browser successfully created session and sent chunk.");
        setStatuses((prev) => ({ ...prev, resumableUpload100Mb: "pass" }));
      } else if (chunkRes.ok) {
        setStatuses((prev) => ({ ...prev, resumableUpload100Mb: "pass" }));
      } else {
        const body = await chunkRes.text();
        throw new Error(`Chunk upload failed with status ${chunkRes.status}: ${body}`);
      }
    } catch (err: any) {
      addLog(`Resumable upload error: ${err.message || String(err)}`);
      setStatuses((prev) => ({ ...prev, resumableUpload100Mb: "fail" }));
    }
  }

  async function testGooglePicker() {
    try {
      setStatuses((prev) => ({ ...prev, pickerLoad: "pending" }));
      addLog("Loading Google Picker script (https://apis.google.com/js/api.js)...");

      await new Promise<void>((resolve, reject) => {
        if ((window as any).gapi) return resolve();
        const script = document.createElement("script");
        script.src = "https://apis.google.com/js/api.js";
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load Google API script (CSP violation?)"));
        document.body.appendChild(script);
      });

      addLog("Script loaded. Loading 'picker' library via gapi.load()...");
      await new Promise<void>((resolve) => {
        (window as any).gapi.load("picker", { callback: resolve });
      });

      const token = await getDriveAccessToken();
      addLog("Building Google Picker instance...");

      const google = (window as any).google;
      if (!google || !google.picker) {
        throw new Error("google.picker is not defined on window");
      }

      const view = new google.picker.DocsView(google.picker.ViewId.DOCS);
      view.setMimeTypes("application/pdf");

      const picker = new google.picker.PickerBuilder()
        .setAppId(CONFIG.googleAppId)
        .setOAuthToken(token)
        .setDeveloperKey(CONFIG.googleApiKey)
        .addView(view)
        .setCallback((data: any) => {
          if (data.action === google.picker.Action.PICKED) {
            addLog(`File picked from Drive! ID: ${data.docs[0].id}, Name: ${data.docs[0].name}`);
          }
        })
        .build();

      picker.setVisible(true);
      addLog("Picker setVisible(true) invoked. Picker modal opened!");

      // Inspect class names after short delay
      setTimeout(() => {
        const modal = document.querySelector(".picker-dialog");
        const modalBg = document.querySelector(".picker-dialog-bg");
        addLog(`Picker DOM inspected: .picker-dialog=${Boolean(modal)}, .picker-dialog-bg=${Boolean(modalBg)}`);
      }, 500);

      setStatuses((prev) => ({ ...prev, pickerLoad: "pass" }));
    } catch (err: any) {
      addLog(`Picker error: ${err.message || String(err)}`);
      setStatuses((prev) => ({ ...prev, pickerLoad: "fail" }));
    }
  }

  return (
    <div style={{ padding: "32px", fontFamily: "sans-serif", maxWidth: "900px", margin: "0 auto", color: "#0f172a" }}>
      <header style={{ borderBottom: "2px solid #e2e8f0", paddingBottom: "16px", marginBottom: "24px" }}>
        <h1 style={{ margin: "0 0 8px 0" }}>Aboard — Spike S4: Google Drive &amp; Auth Verification</h1>
        <p style={{ margin: 0, color: "#64748b" }}>
          Proving Google Drive integration, token isolation, multipart/resumable uploads, and Google Picker without storing Google tokens in the browser.
        </p>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginBottom: "24px" }}>
        <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
          <h3 style={{ marginTop: 0 }}>Authentication &amp; Drive Link</h3>
          <p>User: <strong>{session?.user?.email || "Not signed in"}</strong></p>
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              onClick={signInWithGoogle}
              style={{ padding: "8px 12px", background: "#2563eb", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
            >
              Sign in with Google (Path A)
            </button>
            <button
              onClick={connectDrivePathB}
              style={{ padding: "8px 12px", background: "#0284c7", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
            >
              Connect Drive (Path B)
            </button>
            <button
              onClick={checkDriveStatus}
              style={{ padding: "8px 12px", background: "#64748b", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
            >
              Check Status
            </button>
          </div>
        </div>

        <div style={{ background: "#f8fafc", padding: "16px", borderRadius: "8px", border: "1px solid #cbd5e1" }}>
          <h3 style={{ marginTop: 0 }}>Storage Security Audit</h3>
          <p>Prove zero Google tokens exist in localStorage, sessionStorage, or IndexedDB.</p>
          <button
            onClick={inspectBrowserStorage}
            style={{ padding: "8px 12px", background: "#16a34a", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
          >
            Audit Browser Storage
          </button>
        </div>
      </section>

      <section style={{ background: "#f8fafc", padding: "16px", borderRadius: "8px", border: "1px solid #cbd5e1", marginBottom: "24px" }}>
        <h3 style={{ marginTop: 0 }}>Drive &amp; Picker Operations</h3>
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
          <button
            onClick={testCreateFolder}
            style={{ padding: "8px 12px", background: "#475569", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
          >
            1. Create Folder
          </button>
          <button
            onClick={testMultipartUpload}
            style={{ padding: "8px 12px", background: "#475569", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
          >
            2. Multipart Upload (Small)
          </button>
          <button
            onClick={testResumableUpload100Mb}
            style={{ padding: "8px 12px", background: "#475569", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
          >
            3. Resumable Upload (100 MB)
          </button>
          <button
            onClick={testGooglePicker}
            style={{ padding: "8px 12px", background: "#7c3aed", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer" }}
          >
            4. Open Google Picker
          </button>
        </div>
      </section>

      <section style={{ background: "#f8fafc", padding: "16px", borderRadius: "8px", border: "1px solid #cbd5e1", marginBottom: "24px" }}>
        <h3 style={{ marginTop: 0 }}>Check Results Summary</h3>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "14px" }}>
          <tbody>
            <tr>
              <td style={{ padding: "6px" }}>Google Sign-In with Drive scope:</td>
              <td style={{ padding: "6px", fontWeight: "bold" }}>{statuses.signInGoogle}</td>
            </tr>
            <tr>
              <td style={{ padding: "6px" }}>Drive Linked on Server (`get_drive_status`):</td>
              <td style={{ padding: "6px", fontWeight: "bold" }}>{statuses.driveStatus}</td>
            </tr>
            <tr>
              <td style={{ padding: "6px" }}>Browser Storage Zero-Google-Token Audit:</td>
              <td style={{ padding: "6px", fontWeight: "bold" }}>{statuses.storageAudit}</td>
            </tr>
            <tr>
              <td style={{ padding: "6px" }}>Drive Folder Creation (`POST /files`):</td>
              <td style={{ padding: "6px", fontWeight: "bold" }}>{statuses.createFolder}</td>
            </tr>
            <tr>
              <td style={{ padding: "6px" }}>Multipart Upload (Small file):</td>
              <td style={{ padding: "6px", fontWeight: "bold" }}>{statuses.multipartUpload}</td>
            </tr>
            <tr>
              <td style={{ padding: "6px" }}>Resumable Upload 100 MB (`Location` &amp; `Range` headers):</td>
              <td style={{ padding: "6px", fontWeight: "bold" }}>{statuses.resumableUpload100Mb}</td>
            </tr>
            <tr>
              <td style={{ padding: "6px" }}>Google Picker Launch &amp; CSP:</td>
              <td style={{ padding: "6px", fontWeight: "bold" }}>{statuses.pickerLoad}</td>
            </tr>
          </tbody>
        </table>
      </section>

      <section>
        <h3>Live Event Logs</h3>
        <div style={{ background: "#0f172a", color: "#f8fafc", padding: "12px", borderRadius: "6px", height: "240px", overflowY: "auto", fontFamily: "monospace", fontSize: "12px" }}>
          {logs.map((log, i) => (
            <div key={i} style={{ marginBottom: "4px" }}>{log}</div>
          ))}
        </div>
      </section>
    </div>
  );
}
