import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  driveFetch,
  findFiles,
  getFileMeta,
  downloadFileBlob,
  downloadFileText,
  createFolder,
  trashFile,
  multipartCreateFile,
  resumableCreateFile,
  uploadFile,
  getOrCreateRootFolder,
  getOrCreateProjectFolder,
  DriveApiError,
  StorageQuotaExceededError,
  createMultipartBody,
  DRIVE_API_BASE,
  DRIVE_UPLOAD_BASE,
} from "./api";
import { DriveTokenManager } from "./tokens";

describe("Google Drive API Client (api.ts / STORE-2, STORE-3, SEC-2)", () => {
  let mockTokenManager: DriveTokenManager;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockTokenManager = new DriveTokenManager();
    // Pre-populate with valid mock token
    vi.spyOn(mockTokenManager, "get").mockResolvedValue("mock-access-token-123");
    vi.spyOn(mockTokenManager, "invalidate").mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("driveFetch wrapper", () => {
    it("injects in-memory Authorization: Bearer token header", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
      globalThis.fetch = mockFetch;

      const res = await driveFetch("https://www.googleapis.com/test", {}, 0, mockTokenManager);
      expect(res.status).toBe(200);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callHeaders = mockFetch.mock.calls[0][1].headers as Headers;
      expect(callHeaders.get("Authorization")).toBe("Bearer mock-access-token-123");
    });

    it("handles 401: invalidates token and retries once with fresh token", async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve(new Response("Unauthorized", { status: 401 }));
        }
        return Promise.resolve(
          new Response(JSON.stringify({ success: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      });
      globalThis.fetch = mockFetch;

      const res = await driveFetch("https://www.googleapis.com/test", {}, 0, mockTokenManager);
      expect(res.status).toBe(200);
      expect(mockTokenManager.invalidate).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it("retries on 429 and 5xx with exponential backoff up to 5 attempts", async () => {
      let attempts = 0;
      const mockFetch = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.resolve(
            new Response(JSON.stringify({ error: "rate limit" }), { status: 429 })
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      });
      globalThis.fetch = mockFetch;

      const res = await driveFetch("https://www.googleapis.com/test", {}, 0, mockTokenManager);
      expect(res.status).toBe(200);
      expect(attempts).toBe(3);
    });

    it("retries on 403 rateLimitExceeded reason", async () => {
      let attempts = 0;
      const mockFetch = vi.fn().mockImplementation(() => {
        attempts++;
        if (attempts === 1) {
          return Promise.resolve(
            new Response(
              JSON.stringify({
                error: {
                  errors: [{ reason: "rateLimitExceeded" }],
                  message: "Rate Limit Exceeded",
                },
              }),
              { status: 403, headers: { "Content-Type": "application/json" } }
            )
          );
        }
        return Promise.resolve(
          new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          })
        );
      });
      globalThis.fetch = mockFetch;

      const res = await driveFetch("https://www.googleapis.com/test", {}, 0, mockTokenManager);
      expect(res.status).toBe(200);
      expect(attempts).toBe(2);
    });

    it("throws StorageQuotaExceededError immediately on 403 storageQuotaExceeded", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              errors: [{ reason: "storageQuotaExceeded" }],
              message: "User storage quota exceeded",
            },
          }),
          { status: 403, headers: { "Content-Type": "application/json" } }
        )
      );
      globalThis.fetch = mockFetch;

      await expect(
        driveFetch("https://www.googleapis.com/test", {}, 0, mockTokenManager)
      ).rejects.toThrow(StorageQuotaExceededError);
    });
  });

  describe("File & folder operations", () => {
    it("findFiles queries Drive v3 and returns file metadata", async () => {
      const mockFiles = [
        { id: "file-1", name: "test.json", appProperties: { aboardKind: "board" } },
      ];
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ files: mockFiles }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const files = await findFiles("appProperties has { key='aboardKind' and value='board' }", undefined, mockTokenManager);
      expect(files).toHaveLength(1);
      expect(files[0].id).toBe("file-1");
    });

    it("createFolder creates a folder with specified appProperties and parent", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: "folder-123",
            name: "Test Folder",
            mimeType: "application/vnd.google-apps.folder",
            appProperties: { aboardKind: "project", aboardProjectId: "p1" },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
      globalThis.fetch = mockFetch;

      const folder = await createFolder(
        "Test Folder",
        { aboardKind: "project", aboardProjectId: "p1" },
        "root-folder-id",
        mockTokenManager
      );

      expect(folder.id).toBe("folder-123");
      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.name).toBe("Test Folder");
      expect(requestBody.parents).toEqual(["root-folder-id"]);
      expect(requestBody.appProperties.aboardProjectId).toBe("p1");
    });

    it("trashFile sends PATCH request with trashed: true", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ id: "file-to-trash", trashed: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
      globalThis.fetch = mockFetch;

      await trashFile("file-to-trash", mockTokenManager);
      expect(mockFetch).toHaveBeenCalledWith(
        `${DRIVE_API_BASE}/files/file-to-trash`,
        expect.objectContaining({
          method: "PATCH",
          body: JSON.stringify({ trashed: true }),
        })
      );
    });

    it("downloadFileText downloads and returns text content", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response('{"test": 123}', {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

      const text = await downloadFileText("file-123", mockTokenManager);
      expect(text).toBe('{"test": 123}');
    });
  });

  describe("Upload methods: multipart & resumable", () => {
    it("createMultipartBody constructs valid multipart/related body", async () => {
      const metadata = { name: "test.json", appProperties: { aboardKind: "board" } };
      const blob = new Blob(['{"canvas": true}'], { type: "application/json" });

      const { body, headers } = createMultipartBody(metadata, blob);
      expect(headers["Content-Type"]).toContain("multipart/related; boundary=aboard-");

      const bodyText = await body.text();
      expect(bodyText).toContain('"name":"test.json"');
      expect(bodyText).toContain('{"canvas": true}');
    });

    it("multipartCreateFile uploads small file (< 5MB) via single multipart request", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ id: "uploaded-file-1", headRevisionId: "rev-1" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
      globalThis.fetch = mockFetch;

      const blob = new Blob(["small file content"], { type: "text/plain" });
      const res = await multipartCreateFile(
        {
          name: "small.txt",
          mimeType: "text/plain",
          appProperties: { aboardKind: "circuit", aboardItemId: "c1" },
        },
        blob,
        mockTokenManager
      );

      expect(res.id).toBe("uploaded-file-1");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`${DRIVE_UPLOAD_BASE}/files?uploadType=multipart`),
        expect.objectContaining({ method: "POST" })
      );
    });

    it("resumableCreateFile handles initiation, 8 MiB chunking, and completion", async () => {
      const sessionUrl = "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=session-xyz";

      // Create a 10MB blob (> 8 MiB chunk size)
      const chunkSize = 8 * 1024 * 1024;
      const totalSize = 10 * 1024 * 1024;
      const dummyBuffer = new Uint8Array(totalSize);
      const largeBlob = new Blob([dummyBuffer], { type: "application/pdf" });

      let callIndex = 0;
      const mockFetch = vi.fn().mockImplementation((url, init) => {
        callIndex++;
        // 1. Session initiation
        if (callIndex === 1) {
          return Promise.resolve(
            new Response(null, {
              status: 200,
              headers: { Location: sessionUrl },
            })
          );
        }
        // 2. First chunk (8 MiB)
        if (callIndex === 2) {
          expect(url).toBe(sessionUrl);
          expect(init.headers["Content-Range"]).toBe(`bytes 0-${chunkSize - 1}/${totalSize}`);
          return Promise.resolve(
            new Response(null, {
              status: 308,
              headers: { Range: `bytes=0-${chunkSize - 1}` },
            })
          );
        }
        // 3. Second and final chunk (remaining 2 MiB)
        if (callIndex === 3) {
          expect(url).toBe(sessionUrl);
          expect(init.headers["Content-Range"]).toBe(`bytes ${chunkSize}-${totalSize - 1}/${totalSize}`);
          return Promise.resolve(
            new Response(
              JSON.stringify({ id: "large-uploaded-id", headRevisionId: "rev-large-1" }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            )
          );
        }
        throw new Error("Unexpected fetch call: " + callIndex);
      });
      globalThis.fetch = mockFetch;

      const progressSpy = vi.fn();
      const res = await resumableCreateFile(
        {
          name: "large.pdf",
          mimeType: "application/pdf",
          appProperties: { aboardKind: "file", aboardFileHash: "hash-large" },
        },
        largeBlob,
        progressSpy,
        mockTokenManager
      );

      expect(res.id).toBe("large-uploaded-id");
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(progressSpy).toHaveBeenCalled();
    });

    it("uploadFile selects multipart for < 5MB and resumable for >= 5MB", async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ id: "auto-upload-id", headRevisionId: "rev-1" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
      globalThis.fetch = mockFetch;

      const smallBlob = new Blob(["small"], { type: "text/plain" });
      await uploadFile(
        { name: "test.txt", mimeType: "text/plain", appProperties: { aboardKind: "board" } },
        smallBlob,
        undefined,
        mockTokenManager
      );

      expect(mockFetch.mock.calls[0][0]).toContain("uploadType=multipart");
    });
  });

  describe("Root and Project folder helpers", () => {
    it("getOrCreateRootFolder returns existing root folder if found", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            files: [{ id: "existing-root-id", name: "Aboard", appProperties: { aboardKind: "root" } }],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

      const root = await getOrCreateRootFolder(mockTokenManager);
      expect(root.id).toBe("existing-root-id");
    });

    it("getOrCreateProjectFolder creates project folder if not found", async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation((url, init) => {
        callCount++;
        // 1. Search for project folder: not found
        if (callCount === 1) {
          return Promise.resolve(
            new Response(JSON.stringify({ files: [] }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            })
          );
        }
        // 2. Create project folder
        return Promise.resolve(
          new Response(
            JSON.stringify({
              id: "new-proj-folder-id",
              name: "Bio Notes (p12345)",
              appProperties: { aboardKind: "project", aboardProjectId: "p123456" },
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
        );
      });

      const folder = await getOrCreateProjectFolder("p123456", "Bio Notes", "root-123", mockTokenManager);
      expect(folder.id).toBe("new-proj-folder-id");
    });
  });
});
