// @vitest-environment happy-dom
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  executeStirlingTool,
  hasAcceptedPdfToolsNotice,
  markPdfToolsNoticeAccepted,
  resolveGatewayToolUrl,
  StirlingApiError,
  PDF_TOOLS_NOTICE_ACCEPTED_KEY,
} from "./stirling";

describe("Stirling Client Library (Task 41 / §7.4, PDFX-1..5)", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("One-time Notice (PDFX-5)", () => {
    it("returns false initially when notice has not been accepted", () => {
      expect(hasAcceptedPdfToolsNotice()).toBe(false);
    });

    it("returns true and persists in localStorage when accepted", () => {
      markPdfToolsNoticeAccepted();
      expect(hasAcceptedPdfToolsNotice()).toBe(true);
      expect(localStorage.getItem(PDF_TOOLS_NOTICE_ACCEPTED_KEY)).toBe("true");
    });
  });

  describe("resolveGatewayToolUrl", () => {
    it("resolves tool url correctly when base ends with /pdf", () => {
      const url = resolveGatewayToolUrl("ocr", "http://localhost/pdf");
      expect(url).toBe("http://localhost/pdf/ocr");
    });

    it("resolves tool url correctly when base ends with trailing slash", () => {
      const url = resolveGatewayToolUrl("compress", "http://localhost/pdf/");
      expect(url).toBe("http://localhost/pdf/compress");
    });

    it("resolves tool url correctly when base does not include /pdf", () => {
      const url = resolveGatewayToolUrl("office-to-pdf", "http://localhost:8787");
      expect(url).toBe("http://localhost:8787/pdf/office-to-pdf");
    });
  });

  describe("executeStirlingTool validation", () => {
    it("rejects unknown or forbidden tools with 400 invalid_tool", async () => {
      await expect(
        executeStirlingTool({
          tool: "arbitrary-tool" as unknown as Parameters<typeof executeStirlingTool>[0]["tool"],
          file: new Blob(["test"], { type: "application/pdf" }),
          jwtOverride: "mock-jwt",
        })
      ).rejects.toThrow(StirlingApiError);
    });

    it("rejects when no JWT is provided and no session exists", async () => {
      await expect(
        executeStirlingTool({
          tool: "ocr",
          file: new Blob(["test"], { type: "application/pdf" }),
        })
      ).rejects.toMatchObject({
        status: 401,
        code: "unauthorized",
      });
    });

    it("aborts immediately if AbortSignal is already aborted", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        executeStirlingTool({
          tool: "compress",
          file: new Blob(["test"], { type: "application/pdf" }),
          jwtOverride: "mock-jwt",
          signal: controller.signal,
        })
      ).rejects.toThrow("The user aborted a request.");
    });
  });

  describe("XHR Execution & Progress Tracking", () => {
    it("tracks progress and resolves Blob on successful 200 response", async () => {
      const progressList: unknown[] = [];
      const mockResultBlob = new Blob(["%PDF-1.4 output"], { type: "application/pdf" });

      // Mock XMLHttpRequest
      const mockXHR = {
        open: vi.fn(),
        setRequestHeader: vi.fn(),
        send: vi.fn(function (this: {
          onload?: () => void;
          upload: { onprogress?: (e: ProgressEvent) => void; onload?: () => void };
          status: number;
          response: Blob;
        }) {
          // Simulate upload progress
          this.upload.onprogress?.({
            lengthComputable: true,
            loaded: 50,
            total: 100,
          } as ProgressEvent);

          this.upload.onprogress?.({
            lengthComputable: true,
            loaded: 100,
            total: 100,
          } as ProgressEvent);

          this.upload.onload?.();

          // Simulate 200 OK response
          this.status = 200;
          this.response = mockResultBlob;
          this.onload?.();
        }),
        upload: {
          onprogress: null as unknown,
          onload: null as unknown,
        },
        status: 200,
        response: mockResultBlob,
        onload: null as unknown,
        onerror: null as unknown,
        onabort: null as unknown,
        responseType: "",
      };

      vi.stubGlobal("XMLHttpRequest", function (this: unknown) {
        return mockXHR;
      });

      const result = await executeStirlingTool({
        tool: "compress",
        file: new Blob(["%PDF-1.4 test"], { type: "application/pdf" }),
        fileName: "input.pdf",
        jwtOverride: "valid-jwt",
        gatewayUrlOverride: "http://localhost/pdf",
        onProgress: (p) => progressList.push(p),
      });

      expect(mockXHR.open).toHaveBeenCalledWith("POST", "http://localhost/pdf/compress");
      expect(mockXHR.setRequestHeader).toHaveBeenCalledWith("Authorization", "Bearer valid-jwt");
      expect(result).toBe(mockResultBlob);
      expect(progressList.length).toBeGreaterThan(0);
      expect(progressList).toContainEqual(
        expect.objectContaining({ stage: "processing", percent: 100 })
      );
    });

    it("rejects with 413 payload_too_large when file exceeds limit", async () => {
      const errorJson = JSON.stringify({
        error: "payload_too_large",
        message: "File is too large for online processing (max 50 MB).",
      });

      const mockXHR = {
        open: vi.fn(),
        setRequestHeader: vi.fn(),
        send: vi.fn(function (this: {
          onload?: () => void;
          status: number;
          response: Blob;
        }) {
          this.status = 413;
          this.response = new Blob([errorJson], { type: "application/json" });
          this.onload?.();
        }),
        upload: {},
        status: 413,
        response: new Blob([errorJson], { type: "application/json" }),
        onload: null as unknown,
        onerror: null as unknown,
        onabort: null as unknown,
      };

      vi.stubGlobal("XMLHttpRequest", function (this: unknown) {
        return mockXHR;
      });

      await expect(
        executeStirlingTool({
          tool: "ocr",
          file: new Blob(["oversized content"], { type: "application/pdf" }),
          jwtOverride: "valid-jwt",
        })
      ).rejects.toMatchObject({
        status: 413,
        code: "payload_too_large",
      });
    });

    it("rejects with 429 rate_limit_exceeded on rate limit error", async () => {
      const errorJson = JSON.stringify({
        error: "rate_limit_exceeded",
        message: "Rate limit reached. Please wait a minute before submitting again.",
      });

      const mockXHR = {
        open: vi.fn(),
        setRequestHeader: vi.fn(),
        send: vi.fn(function (this: {
          onload?: () => void;
          status: number;
          response: Blob;
        }) {
          this.status = 429;
          this.response = new Blob([errorJson], { type: "application/json" });
          this.onload?.();
        }),
        upload: {},
        status: 429,
        response: new Blob([errorJson], { type: "application/json" }),
        onload: null as unknown,
      };

      vi.stubGlobal("XMLHttpRequest", function (this: unknown) {
        return mockXHR;
      });

      await expect(
        executeStirlingTool({
          tool: "compress",
          file: new Blob(["test"], { type: "application/pdf" }),
          jwtOverride: "valid-jwt",
        })
      ).rejects.toMatchObject({
        status: 429,
        code: "rate_limit_exceeded",
      });
    });

    it("aborts in-flight XHR when signal is triggered", async () => {
      const controller = new AbortController();
      let abortCalled = false;

      const mockXHR = {
        open: vi.fn(),
        setRequestHeader: vi.fn(),
        abort: vi.fn(() => {
          abortCalled = true;
          mockXHR.onabort?.();
        }),
        send: vi.fn(() => {
          // Simulate user cancelling during processing
          setTimeout(() => {
            controller.abort();
          }, 10);
        }),
        upload: {},
        onload: null as (() => void) | null,
        onabort: null as (() => void) | null,
      };

      vi.stubGlobal("XMLHttpRequest", function (this: unknown) {
        return mockXHR;
      });

      await expect(
        executeStirlingTool({
          tool: "ocr",
          file: new Blob(["test"], { type: "application/pdf" }),
          jwtOverride: "valid-jwt",
          signal: controller.signal,
        })
      ).rejects.toThrow("The user aborted a request.");

      expect(abortCalled).toBe(true);
    });
  });
});
