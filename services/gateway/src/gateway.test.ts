import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { createGatewayApp } from "./app.js";
import { setCustomJwtVerifier } from "./auth.js";
import { UserLimitsManager } from "./limits.js";

interface GatewayErrorResponse {
  error: string;
  message?: string;
}

interface GatewayHealthResponse {
  status: string;
  service: string;
  allowedTools: string[];
  timestamp: string;
}

describe("PDF Gateway Service (Task 40 / SEC-8, §7.4, §13)", () => {
  let limitsManager: UserLimitsManager;
  let app: ReturnType<typeof createGatewayApp>;

  beforeEach(() => {
    limitsManager = new UserLimitsManager({
      maxUploadBytes: 10 * 1024 * 1024, // 10 MB for testing
      maxConcurrencyPerUser: 1,
      rateLimitWindowMs: 60_000,
      maxRequestsPerWindow: 3, // 3 requests per minute for testing
    });

    // Default mock verifier: token === "valid-token" -> user-123
    setCustomJwtVerifier(async (token: string) => {
      if (token === "valid-token") {
        return { valid: true, userId: "user-123" };
      }
      if (token === "user-2-token") {
        return { valid: true, userId: "user-456" };
      }
      return { valid: false, error: "jwt expired or invalid" };
    });

    app = createGatewayApp({
      supabaseUrl: "https://mock.supabase.co",
      stirlingUrl: "http://mock-stirling:8080",
      allowedOrigins: ["http://localhost:3000", "https://aboard.example.com"],
      limitsManager,
    });
  });

  afterEach(() => {
    setCustomJwtVerifier(null);
    limitsManager.reset();
    vi.restoreAllMocks();
  });

  describe("Health check", () => {
    it("returns 200 with service status and allowed tools on /health and /pdf/health", async () => {
      const res1 = await app.request("/health");
      expect(res1.status).toBe(200);
      const json1 = (await res1.json()) as GatewayHealthResponse;
      expect(json1.status).toBe("ok");
      expect(json1.allowedTools).toEqual(["ocr", "compress", "office-to-pdf"]);

      const res2 = await app.request("/pdf/health");
      expect(res2.status).toBe(200);
      const json2 = (await res2.json()) as GatewayHealthResponse;
      expect(json2.status).toBe("ok");
    });
  });

  describe("Authentication & Authorization (JWT)", () => {
    it("rejects request missing Authorization header with 401", async () => {
      const res = await app.request("/pdf/ocr", {
        method: "POST",
      });
      expect(res.status).toBe(401);
      const json = (await res.json()) as GatewayErrorResponse;
      expect(json.error).toBe("unauthorized");
    });

    it("rejects invalid or expired token with 401", async () => {
      const res = await app.request("/pdf/ocr", {
        method: "POST",
        headers: {
          Authorization: "Bearer bad-token",
        },
      });
      expect(res.status).toBe(401);
      const json = (await res.json()) as GatewayErrorResponse;
      expect(json.error).toBe("unauthorized");
    });
  });

  describe("Tool Allow-List & Validation", () => {
    it("rejects unknown or arbitrary tool with 400", async () => {
      const res = await app.request("/pdf/arbitrary-tool", {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-token",
        },
      });
      expect(res.status).toBe(400);
      const json = (await res.json()) as GatewayErrorResponse;
      expect(json.error).toBe("unknown_tool");
      expect(json.message).toContain("not in allow-list");
    });

    it("rejects missing file in multipart request with 400", async () => {
      const formData = new FormData();
      formData.append("someOtherParam", "value");

      const res = await app.request("/pdf/ocr", {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-token",
        },
        body: formData,
      });
      expect(res.status).toBe(400);
      const json = (await res.json()) as GatewayErrorResponse;
      expect(json.error).toBe("missing_file");
    });
  });

  describe("Magic Bytes Validation (SEC-8)", () => {
    it("rejects non-PDF file for ocr tool with 400", async () => {
      const formData = new FormData();
      const fakeFile = new Blob(["NOT_A_PDF_CONTENT"], { type: "text/plain" });
      formData.append("fileInput", fakeFile, "test.txt");

      const res = await app.request("/pdf/ocr", {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-token",
        },
        body: formData,
      });
      expect(res.status).toBe(400);
      const json = (await res.json()) as GatewayErrorResponse;
      expect(json.error).toBe("invalid_file_type");
      expect(json.message).toContain("%PDF");
    });

    it("rejects non-PDF file for compress tool with 400", async () => {
      const formData = new FormData();
      const fakeFile = new Blob(["GARBAGE_BYTES_123"], { type: "application/octet-stream" });
      formData.append("fileInput", fakeFile, "corrupted.pdf");

      const res = await app.request("/pdf/compress", {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-token",
        },
        body: formData,
      });
      expect(res.status).toBe(400);
      const json = (await res.json()) as GatewayErrorResponse;
      expect(json.error).toBe("invalid_file_type");
    });

    it("rejects arbitrary file for office-to-pdf if magic bytes are not PDF or Office with 400", async () => {
      const formData = new FormData();
      const fakeFile = new Blob(["<script>alert(1)</script>"], { type: "text/html" });
      formData.append("fileInput", fakeFile, "malicious.html");

      const res = await app.request("/pdf/office-to-pdf", {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-token",
        },
        body: formData,
      });
      expect(res.status).toBe(400);
      const json = (await res.json()) as GatewayErrorResponse;
      expect(json.error).toBe("invalid_file_type");
    });
  });

  describe("Per-User Limits (Rate Limiting & Concurrency)", () => {
    it("enforces rate limit and returns 429 when threshold exceeded", async () => {
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x31, 0x2e, 0x34, 0x0a]); // %PDF-1.4

      // Mock downstream fetch
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(
          new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
            status: 200,
            headers: { "Content-Type": "application/pdf" },
          })
        )
      );

      // Max requests configured is 3 per window
      for (let i = 0; i < 3; i++) {
        const formData = new FormData();
        formData.append("fileInput", new Blob([pdfBytes], { type: "application/pdf" }), "doc.pdf");

        const res = await app.request("/pdf/compress", {
          method: "POST",
          headers: {
            Authorization: "Bearer valid-token",
          },
          body: formData,
        });
        expect(res.status).toBe(200);
      }

      // 4th request should exceed rate limit
      const formData4 = new FormData();
      formData4.append("fileInput", new Blob([pdfBytes], { type: "application/pdf" }), "doc.pdf");
      const res4 = await app.request("/pdf/compress", {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-token",
        },
        body: formData4,
      });
      expect(res4.status).toBe(429);
      const json4 = (await res4.json()) as GatewayErrorResponse;
      expect(json4.error).toBe("rate_limit_exceeded");
    });

    it("enforces concurrency limit and returns 429 when another task is running for the same user", async () => {
      const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x31, 0x2e, 0x34, 0x0a]); // %PDF-1.4

      let resolveSlowFetch: (val: Response) => void;
      const slowFetchPromise = new Promise<Response>((resolve) => {
        resolveSlowFetch = resolve;
      });

      vi.stubGlobal(
        "fetch",
        vi.fn().mockImplementation(() => slowFetchPromise)
      );

      const formData1 = new FormData();
      formData1.append("fileInput", new Blob([pdfBytes], { type: "application/pdf" }), "doc1.pdf");

      // Start first request (hangs until slowFetchPromise resolves)
      const req1Promise = app.request("/pdf/ocr", {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-token",
        },
        body: formData1,
      });

      // Second request immediately for same user -> should be rejected with 429
      const formData2 = new FormData();
      formData2.append("fileInput", new Blob([pdfBytes], { type: "application/pdf" }), "doc2.pdf");

      const res2 = await app.request("/pdf/ocr", {
        method: "POST",
        headers: {
          Authorization: "Bearer valid-token",
        },
        body: formData2,
      });

      expect(res2.status).toBe(429);
      const json2 = (await res2.json()) as GatewayErrorResponse;
      expect(json2.error).toBe("concurrency_limit_exceeded");

      // Resolve first request
      resolveSlowFetch!(
        new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
          status: 200,
          headers: { "Content-Type": "application/pdf" },
        })
      );

      const res1 = await req1Promise;
      expect(res1.status).toBe(200);
    });
  });

  describe("CORS & Security Headers", () => {
    it("sets CORS header for allowed origin and handles OPTIONS preflight with 204", async () => {
      const optRes = await app.request("/pdf/ocr", {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:3000",
        },
      });
      expect(optRes.status).toBe(204);
      expect(optRes.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");

      const unallowedRes = await app.request("/pdf/ocr", {
        method: "OPTIONS",
        headers: {
          Origin: "http://malicious-site.com",
        },
      });
      expect(unallowedRes.status).toBe(204);
      expect(unallowedRes.headers.get("access-control-allow-origin")).toBeNull();
    });

    it("sends nosniff header on all responses", async () => {
      const res = await app.request("/health");
      expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    });
  });
});
