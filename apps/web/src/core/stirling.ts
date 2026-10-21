/**
 * stirling.ts — Client library for Stirling-PDF online tools via Aboard API Gateway.
 * Implements docs/specs/modules.md §7.4 and docs/specs/security.md §14.8.
 * Supports:
 * - JWT authentication via Supabase Auth session
 * - Tool allow-list: "ocr" | "compress" | "office-to-pdf"
 * - Streaming upload/download progress tracking
 * - Request cancellation via AbortSignal
 * - Strict error classification (401, 413, 429, etc.)
 */

import { supabase } from "./supabase";

export type StirlingTool = "ocr" | "compress" | "office-to-pdf";

export const ALLOWED_STIRLING_TOOLS: readonly StirlingTool[] = [
  "ocr",
  "compress",
  "office-to-pdf",
] as const;

export const PDF_TOOLS_NOTICE_ACCEPTED_KEY = "aboard:pdf-tools-notice-accepted";

export interface StirlingProgress {
  stage: "uploading" | "processing" | "downloading";
  percent: number; // 0 to 100
  loadedBytes: number;
  totalBytes: number;
}

export interface ExecuteStirlingToolOptions {
  tool: StirlingTool;
  file: File | Blob;
  fileName?: string;
  signal?: AbortSignal;
  onProgress?: (progress: StirlingProgress) => void;
  // Optional dependency injection for testing and flexible base URL resolution
  jwtOverride?: string;
  gatewayUrlOverride?: string;
}

export class StirlingApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "StirlingApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Checks whether the user has already accepted the one-time PDF tools server processing notice (PDFX-5).
 */
export function hasAcceptedPdfToolsNotice(): boolean {
  if (typeof window === "undefined" || !window.localStorage) {
    return false;
  }
  return window.localStorage.getItem(PDF_TOOLS_NOTICE_ACCEPTED_KEY) === "true";
}

/**
 * Records that the user has accepted the one-time PDF tools server processing notice (PDFX-5).
 */
export function markPdfToolsNoticeAccepted(): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  window.localStorage.setItem(PDF_TOOLS_NOTICE_ACCEPTED_KEY, "true");
}

/**
 * Resolves the absolute Gateway URL for a specific Stirling tool.
 */
export function resolveGatewayToolUrl(tool: StirlingTool, gatewayUrlOverride?: string): string {
  const rawBase =
    gatewayUrlOverride ??
    (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_PDF_API_URL
      ? process.env.NEXT_PUBLIC_PDF_API_URL
      : "http://localhost/pdf");

  const base = rawBase.replace(/\/+$/, "");
  const path = base.endsWith("/pdf") ? `/${tool}` : `/pdf/${tool}`;
  return `${base}${path}`;
}

/**
 * Executes a Stirling PDF tool request through the Aboard API Gateway.
 */
export async function executeStirlingTool(options: ExecuteStirlingToolOptions): Promise<Blob> {
  const { tool, file, fileName, signal, onProgress, jwtOverride, gatewayUrlOverride } = options;

  if (!ALLOWED_STIRLING_TOOLS.includes(tool)) {
    throw new StirlingApiError(400, "invalid_tool", `Tool "${tool}" is not permitted.`);
  }

  // 1. Fetch Supabase JWT
  let token = jwtOverride;
  if (!token) {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) {
      throw new StirlingApiError(
        401,
        "unauthorized",
        "You must be signed in to use online PDF tools."
      );
    }
    token = data.session.access_token;
  }

  const targetUrl = resolveGatewayToolUrl(tool, gatewayUrlOverride);
  const resolvedFileName =
    fileName ?? (file instanceof File ? file.name : `document-${tool}.pdf`);

  // Fast abort check
  if (signal?.aborted) {
    throw new DOMException("The user aborted a request.", "AbortError");
  }

  // 2. Perform request with XHR (for granular upload/download progress in browsers)
  if (typeof XMLHttpRequest !== "undefined") {
    return new Promise<Blob>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", targetUrl);
      xhr.responseType = "blob";
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);

      // Track Upload Progress
      xhr.upload.onprogress = (event: ProgressEvent) => {
        if (event.lengthComputable && event.total > 0) {
          const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
          onProgress?.({
            stage: percent >= 100 ? "processing" : "uploading",
            percent,
            loadedBytes: event.loaded,
            totalBytes: event.total,
          });
        }
      };

      // Transition to processing once upload completes
      xhr.upload.onload = () => {
        onProgress?.({
          stage: "processing",
          percent: 100,
          loadedBytes: file.size,
          totalBytes: file.size,
        });
      };

      // Track Download Progress (if server provides Content-Length)
      xhr.onprogress = (event: ProgressEvent) => {
        if (event.lengthComputable && event.total > 0) {
          const percent = Math.min(100, Math.round((event.loaded / event.total) * 100));
          onProgress?.({
            stage: "downloading",
            percent,
            loadedBytes: event.loaded,
            totalBytes: event.total,
          });
        }
      };

      // Handle Completion
      xhr.onload = async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          const responseBlob = xhr.response as Blob;
          onProgress?.({
            stage: "downloading",
            percent: 100,
            loadedBytes: responseBlob.size,
            totalBytes: responseBlob.size,
          });
          resolve(responseBlob);
          return;
        }

        // Error responses
        let errCode = "error";
        let errMsg = `Server returned HTTP ${xhr.status}`;

        if (xhr.status === 401) {
          errCode = "unauthorized";
          errMsg = "Unauthorized: invalid or expired session.";
        } else if (xhr.status === 413) {
          errCode = "payload_too_large";
          errMsg = "File is too large for online processing (max 50 MB).";
        } else if (xhr.status === 429) {
          errCode = "rate_limit_exceeded";
          errMsg = "Too many requests or another operation is already in progress.";
        }

        try {
          if (xhr.response instanceof Blob) {
            const text = await xhr.response.text();
            if (text) {
              const json = JSON.parse(text);
              if (json.error) errCode = json.error;
              if (json.message) errMsg = json.message;
            }
          }
        } catch {
          // ignore parsing error, keep standard fallback message
        }

        reject(new StirlingApiError(xhr.status, errCode, errMsg));
      };

      xhr.onerror = () => {
        reject(
          new StirlingApiError(
            0,
            "network_error",
            "Network error: Unable to reach the PDF Gateway service."
          )
        );
      };

      xhr.onabort = () => {
        reject(new DOMException("The user aborted a request.", "AbortError"));
      };

      if (signal) {
        signal.addEventListener("abort", () => {
          xhr.abort();
        });
      }

      const formData = new FormData();
      formData.append("fileInput", file, resolvedFileName);
      xhr.send(formData);
    });
  }

  // 3. Fallback for non-XHR environments (e.g. Node.js / unit tests with global fetch)
  const formData = new FormData();
  formData.append("fileInput", file, resolvedFileName);

  onProgress?.({ stage: "uploading", percent: 50, loadedBytes: 0, totalBytes: file.size });

  const response = await fetch(targetUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
    signal,
  });

  if (!response.ok) {
    let errCode = "error";
    let errMsg = `Server returned HTTP ${response.status}`;

    if (response.status === 401) {
      errCode = "unauthorized";
      errMsg = "Unauthorized: invalid or expired session.";
    } else if (response.status === 413) {
      errCode = "payload_too_large";
      errMsg = "File is too large for online processing (max 50 MB).";
    } else if (response.status === 429) {
      errCode = "rate_limit_exceeded";
      errMsg = "Too many requests or another operation is already in progress.";
    }

    try {
      const json = await response.json();
      if (json.error) errCode = json.error;
      if (json.message) errMsg = json.message;
    } catch {
      // ignore
    }

    throw new StirlingApiError(response.status, errCode, errMsg);
  }

  onProgress?.({ stage: "downloading", percent: 100, loadedBytes: file.size, totalBytes: file.size });
  return response.blob();
}
