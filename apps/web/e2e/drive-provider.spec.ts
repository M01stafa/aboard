import { test, expect } from "@playwright/test";
import { mockSignIn } from "./helpers/auth";

interface MockDriveFile {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  appProperties?: Record<string, string>;
  content?: string;
  trashed?: boolean;
  headRevisionId?: string;
}

test.describe("DriveProvider & Drive API Layer (Task 35 / STORE-2, STORE-3, STORE-7)", () => {
  const testUser = {
    id: "user-drive-35-1111-2222-3333-444444444444",
    email: "student.drive@example.com",
  };

  const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "access-control-expose-headers": "Location, Range",
  };

  test("creates a project in Drive mode, uploads manifest and items with appProperties, and survives a reload", async ({
    page,
  }) => {
    // In-memory Google Drive mock storage
    const mockFiles = new Map<string, MockDriveFile>();
    const resumableSessions = new Map<string, { metadata: Partial<MockDriveFile>; chunks: Buffer[] }>();

    // 1. Authenticate user
    await mockSignIn(page, testUser);

    // 2. Intercept get_drive_status RPC (connected: true)
    await page.route("**/rest/v1/rpc/get_drive_status*", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 200, headers: corsHeaders });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: corsHeaders,
        body: JSON.stringify([
          {
            connected: true,
            google_email: "student.drive@example.com",
            linked_at: new Date().toISOString(),
            reconnect_required: false,
          },
        ]),
      });
    });

    // 3. Intercept drive-token Edge Function
    await page.route("**/functions/v1/drive-token*", async (route) => {
      if (route.request().method() === "OPTIONS") {
        await route.fulfill({ status: 200, headers: corsHeaders });
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: corsHeaders,
        body: JSON.stringify({
          access_token: "mock-google-access-token-xyz",
          expires_at: Date.now() + 3600_000,
        }),
      });
    });

    // 4. Intercept Supabase projects REST endpoint for index syncer
    const mockSupabaseProjects: Array<Record<string, unknown>> = [];
    await page.route("**/rest/v1/projects*", async (route) => {
      const method = route.request().method();
      if (method === "OPTIONS") {
        await route.fulfill({ status: 200, headers: corsHeaders });
        return;
      }
      if (method === "POST") {
        const body = route.request().postDataJSON() || {};
        mockSupabaseProjects.push(body);
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          headers: corsHeaders,
          body: JSON.stringify(body),
        });
        return;
      }
      if (method === "GET") {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: corsHeaders,
          body: JSON.stringify(mockSupabaseProjects),
        });
        return;
      }
      await route.fulfill({ status: 200, headers: corsHeaders, body: "{}" });
    });

    // 5. Intercept Google Drive API v3 endpoints
    await page.route("https://www.googleapis.com/**", async (route) => {
      const req = route.request();
      const method = req.method();
      const url = new URL(req.url());

      if (method === "OPTIONS") {
        await route.fulfill({ status: 200, headers: corsHeaders });
        return;
      }

      // Assert Authorization header is present with in-memory token
      const authHeader = req.headers()["authorization"] || "";
      expect(authHeader).toBe("Bearer mock-google-access-token-xyz");

      // --- Query or file metadata / download ---
      if (url.pathname === "/drive/v3/files") {
        if (method === "GET") {
          const q = url.searchParams.get("q") || "";
          const matched: MockDriveFile[] = [];

          for (const file of mockFiles.values()) {
            if (file.trashed) continue;

            let matches = true;

            // Parent folder listing match
            if (q.includes("in parents")) {
              const parentMatch = q.match(/'([^']+)' in parents/);
              if (parentMatch && !file.parents?.includes(parentMatch[1])) {
                matches = false;
              }
            }

            // aboardKind filter
            if (matches && q.includes("aboardKind")) {
              const kindMatch = q.match(/aboardKind'\s+and\s+value='([^']+)'/);
              if (kindMatch && file.appProperties?.aboardKind !== kindMatch[1]) {
                matches = false;
              }
            }

            // aboardProjectId filter
            if (matches && q.includes("aboardProjectId")) {
              const projIdMatch = q.match(/aboardProjectId'\s+and\s+value='([^']+)'/);
              if (projIdMatch && file.appProperties?.aboardProjectId !== projIdMatch[1]) {
                matches = false;
              }
            }

            // Item match
            if (matches && q.includes("aboardItemId")) {
              const itemMatch = q.match(/aboardItemId'\s+and\s+value='([^']+)'/);
              if (itemMatch && file.appProperties?.aboardItemId !== itemMatch[1]) {
                matches = false;
              }
            }

            // File hash match
            if (matches && q.includes("aboardFileHash")) {
              const hashMatch = q.match(/aboardFileHash'\s+and\s+value='([^']+)'/);
              if (hashMatch && file.appProperties?.aboardFileHash !== hashMatch[1]) {
                matches = false;
              }
            }

            if (matches) {
              matched.push(file);
            }
          }

          await route.fulfill({
            status: 200,
            contentType: "application/json",
            headers: corsHeaders,
            body: JSON.stringify({ files: matched }),
          });
          return;
        }

        if (method === "POST") {
          // Folder creation
          const body = JSON.parse(req.postData() || "{}");
          const folderId = `folder-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const folder: MockDriveFile = {
            id: folderId,
            name: body.name || "Untitled Folder",
            mimeType: body.mimeType || "application/vnd.google-apps.folder",
            parents: body.parents,
            appProperties: body.appProperties,
            headRevisionId: "1",
            trashed: false,
          };
          mockFiles.set(folderId, folder);

          await route.fulfill({
            status: 200,
            contentType: "application/json",
            headers: corsHeaders,
            body: JSON.stringify(folder),
          });
          return;
        }
      }

      // Single file operations: /drive/v3/files/{id}
      const fileIdMatch = url.pathname.match(/\/drive\/v3\/files\/([^/?]+)/);
      if (fileIdMatch && !url.pathname.includes("/upload/")) {
        const fileId = fileIdMatch[1];
        const existing = mockFiles.get(fileId);

        if (method === "GET") {
          if (!existing || existing.trashed) {
            await route.fulfill({ status: 404, headers: corsHeaders, body: "Not found" });
            return;
          }

          if (url.searchParams.get("alt") === "media") {
            // Download content
            await route.fulfill({
              status: 200,
              contentType: existing.mimeType || "application/octet-stream",
              headers: corsHeaders,
              body: existing.content || "",
            });
            return;
          }

          // Metadata read
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            headers: corsHeaders,
            body: JSON.stringify(existing),
          });
          return;
        }

        if (method === "PATCH") {
          // Soft delete / trash or metadata update
          const body = JSON.parse(req.postData() || "{}");
          if (existing) {
            if (body.trashed !== undefined) existing.trashed = body.trashed;
            if (body.name !== undefined) existing.name = body.name;
          }
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            headers: corsHeaders,
            body: JSON.stringify(existing || { id: fileId, trashed: true }),
          });
          return;
        }
      }

      // Upload endpoints: /upload/drive/v3/files...
      if (url.pathname.startsWith("/upload/drive/v3/files")) {
        const uploadType = url.searchParams.get("uploadType");

        // 1. Multipart create (< 5 MB)
        if (uploadType === "multipart" && method === "POST") {
          const rawBuffer = req.postDataBuffer() || Buffer.alloc(0);
          const rawText = rawBuffer.toString("utf-8");

          // Parse metadata and content from multipart body
          const boundaryMatch = (req.headers()["content-type"] || "").match(/boundary=([^;]+)/);
          const boundary = boundaryMatch ? boundaryMatch[1].trim() : "aboard-";
          const rawParts = rawText.split(new RegExp(`--${boundary}(?:--)?`));
          let metaJson: { name?: string; mimeType?: string; parents?: string[]; appProperties?: Record<string, string> } = {};
          let fileContent = "";

          // rawParts[1] is metadata, rawParts[2] is media content
          if (rawParts.length >= 2) {
            const part1 = rawParts[1];
            const metaHeaderEnd = part1.indexOf("\r\n\r\n");
            if (metaHeaderEnd !== -1) {
              try {
                metaJson = JSON.parse(part1.slice(metaHeaderEnd + 4).trim());
              } catch {}
            }
          }
          if (rawParts.length >= 3) {
            const part2 = rawParts[2];
            const contentHeaderEnd = part2.indexOf("\r\n\r\n");
            if (contentHeaderEnd !== -1) {
              fileContent = part2.slice(contentHeaderEnd + 4).replace(/\r\n$/, "");
            }
          }

          const fileId = `file-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const newFile: MockDriveFile = {
            id: fileId,
            name: metaJson.name || "file",
            mimeType: metaJson.mimeType || "application/octet-stream",
            parents: metaJson.parents,
            appProperties: metaJson.appProperties,
            content: fileContent,
            headRevisionId: "1",
            trashed: false,
          };
          mockFiles.set(fileId, newFile);

          await route.fulfill({
            status: 200,
            contentType: "application/json",
            headers: corsHeaders,
            body: JSON.stringify({ id: fileId, headRevisionId: "1" }),
          });
          return;
        }

        // 2. Resumable initiation (>= 5 MB)
        if (uploadType === "resumable" && method === "POST") {
          const metaJson = JSON.parse(req.postData() || "{}");
          const uploadSessionId = `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          resumableSessions.set(uploadSessionId, { metadata: metaJson, chunks: [] });

          await route.fulfill({
            status: 200,
            headers: {
              ...corsHeaders,
              Location: `https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&upload_id=${uploadSessionId}`,
            },
            body: "",
          });
          return;
        }

        // 3. Resumable chunk upload (PUT)
        if (uploadType === "resumable" && method === "PUT") {
          const uploadId = url.searchParams.get("upload_id") || "";
          const session = resumableSessions.get(uploadId);
          const contentRange = req.headers()["content-range"] || "";
          const rangeMatch = contentRange.match(/bytes\s+(\d+)-(\d+)\/(\d+|\*)/);

          const chunkBuf = req.postDataBuffer() || Buffer.alloc(0);
          if (session) session.chunks.push(chunkBuf);

          if (rangeMatch) {
            const end = parseInt(rangeMatch[2], 10);
            const total = parseInt(rangeMatch[3], 10);

            if (end + 1 < total) {
              // 308 Resume Incomplete
              await route.fulfill({
                status: 308,
                headers: {
                  ...corsHeaders,
                  Range: `bytes=0-${end}`,
                },
                body: "",
              });
              return;
            }
          }

          // Completed resumable upload
          const fileId = `resumable-file-${Date.now()}`;
          const fullContent = session ? Buffer.concat(session.chunks).toString("utf-8") : "";
          mockFiles.set(fileId, {
            id: fileId,
            name: session?.metadata.name || "large-file",
            mimeType: session?.metadata.mimeType || "application/octet-stream",
            parents: session?.metadata.parents,
            appProperties: session?.metadata.appProperties,
            content: fullContent,
            headRevisionId: "1",
            trashed: false,
          });

          await route.fulfill({
            status: 200,
            contentType: "application/json",
            headers: corsHeaders,
            body: JSON.stringify({ id: fileId, headRevisionId: "1" }),
          });
          return;
        }

        // 4. Update existing file content (PATCH)
        const updateMatch = url.pathname.match(/\/upload\/drive\/v3\/files\/([^/?]+)/);
        if (updateMatch && method === "PATCH") {
          const fileId = updateMatch[1];
          const existing = mockFiles.get(fileId);
          const newContent = (req.postDataBuffer() || Buffer.alloc(0)).toString("utf-8");

          if (existing) {
            existing.content = newContent;
            existing.headRevisionId = "2";
          }

          await route.fulfill({
            status: 200,
            contentType: "application/json",
            headers: corsHeaders,
            body: JSON.stringify({ id: fileId, headRevisionId: "2" }),
          });
          return;
        }
      }

      // Default fallback for any unmatched Google Drive route
      await route.fulfill({ status: 200, headers: corsHeaders, body: "{}" });
    });

    // 5. Open workspace
    await page.goto("/workspace?p=test-drive-init");
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();
    await page.waitForFunction(() => {
      const win = window as unknown as { __aboard_DriveProvider?: unknown };
      return typeof win.__aboard_DriveProvider !== "undefined";
    });

    // 6. Execute DriveProvider workflow inside browser context
    const creationResult = await page.evaluate(async () => {
      const win = window as unknown as {
        __aboard_projectService?: {
          setProvider: (p: unknown) => void;
          createProject: (
            title: string,
            subject?: string,
            opts?: { storage?: "local" | "drive" }
          ) => Promise<{ project: { id: string; title: string } }>;
          saveBoard: (pId: string, itemId: string, payload: string, title?: string) => Promise<void>;
          putFile: (
            pId: string,
            blob: Blob,
            meta?: { name?: string; mime: string }
          ) => Promise<{ key: string }>;
          readItem: (pId: string, itemId: string) => Promise<string>;
          getFile: (pId: string, key: string) => Promise<Blob>;
        };
        __aboard_DriveProvider?: new () => unknown;
        __aboard_saveQueue?: {
          flushNow: () => Promise<void>;
        };
      };

      try {
        if (!win.__aboard_projectService || !win.__aboard_DriveProvider || !win.__aboard_saveQueue) {
          throw new Error("Required global Aboard services are not available on window");
        }

        // Set DriveProvider as the active storage provider
        const driveProvider = new win.__aboard_DriveProvider();
        win.__aboard_projectService.setProvider(driveProvider);

        // Create a new project in Drive mode
        const manifest = await win.__aboard_projectService.createProject(
          "Mechanical Design 101",
          "Physics",
          { storage: "drive" }
        );
        const projectId = manifest.project.id;

        // Save a board item (JSON payload)
        await win.__aboard_projectService.saveBoard(
          projectId,
          "board-gear-calc",
          JSON.stringify({ gears: 4, ratio: 2.5, updatedAt: Date.now() }),
          "Gear Calculation Board"
        );

        // Store a binary file (< 5MB multipart)
        const mockBlob = new Blob(["test-binary-diagram-content-xyz"], { type: "text/plain" });
        const { key: fileHash } = await win.__aboard_projectService.putFile(
          projectId,
          mockBlob,
          { name: "diagram.txt", mime: "text/plain" }
        );

        // Flush SaveQueue to push outbox items and manifest to Drive
        await win.__aboard_saveQueue.flushNow();

        return { projectId, fileHash };
      } catch (err: unknown) {
        const message = err instanceof Error ? err.stack || err.message : JSON.stringify(err);
        throw new Error(`creation evaluate failed: ${message}`);
      }
    });

    // 7. Verify Drive mock state: assert appProperties are strictly used for identification
    expect(creationResult.projectId).toBeTruthy();
    expect(creationResult.fileHash).toBeTruthy();

    const createdFiles = Array.from(mockFiles.values());

    // Root folder verification
    const rootFolder = createdFiles.find((f) => f.appProperties?.aboardKind === "root");
    expect(rootFolder).toBeDefined();
    expect(rootFolder?.mimeType).toBe("application/vnd.google-apps.folder");

    // Project folder verification
    const projectFolder = createdFiles.find(
      (f) =>
        f.appProperties?.aboardKind === "project" &&
        f.appProperties?.aboardProjectId === creationResult.projectId
    );
    expect(projectFolder).toBeDefined();
    expect(projectFolder?.parents).toContain(rootFolder?.id);

    // Manifest verification
    const manifestFile = createdFiles.find(
      (f) =>
        f.appProperties?.aboardKind === "manifest" &&
        f.appProperties?.aboardProjectId === creationResult.projectId
    );
    expect(manifestFile).toBeDefined();
    expect(manifestFile?.content).toContain("Mechanical Design 101");

    // Board item verification
    const itemFile = createdFiles.find(
      (f) =>
        f.appProperties?.aboardKind === "board" &&
        f.appProperties?.aboardProjectId === creationResult.projectId &&
        f.appProperties?.aboardItemId === "board-gear-calc"
    );
    expect(itemFile).toBeDefined();
    expect(itemFile?.content).toContain('"gears":4');

    // Binary file verification
    const binaryFile = createdFiles.find(
      (f) =>
        f.appProperties?.aboardKind === "file" &&
        f.appProperties?.aboardProjectId === creationResult.projectId &&
        f.appProperties?.aboardFileHash === creationResult.fileHash
    );
    expect(binaryFile).toBeDefined();
    expect(binaryFile?.content).toBe("test-binary-diagram-content-xyz");

    // 8. Reload the page to test persistence across navigation and reload
    await page.reload();
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();
    await page.waitForFunction(() => {
      const win = window as unknown as { __aboard_DriveProvider?: unknown };
      return typeof win.__aboard_DriveProvider !== "undefined";
    });

    // 9. Read the item and file back through DriveProvider after reload
    const readBackResult = await page.evaluate(
      async ({ projectId, fileHash }) => {
        const win = window as unknown as {
          __aboard_projectService?: {
            setProvider: (p: unknown) => void;
            readItem: (pId: string, itemId: string) => Promise<string>;
            getFile: (pId: string, key: string) => Promise<Blob>;
          };
          __aboard_DriveProvider?: new () => unknown;
        };

        if (!win.__aboard_projectService || !win.__aboard_DriveProvider) {
          throw new Error("Services not found after reload");
        }

        // Re-wire DriveProvider for the session
        const driveProvider = new win.__aboard_DriveProvider();
        win.__aboard_projectService.setProvider(driveProvider);

        const itemPayload = await win.__aboard_projectService.readItem(projectId, "board-gear-calc");
        const blob = await win.__aboard_projectService.getFile(projectId, fileHash);
        const fileText = await blob.text();

        return { itemPayload, fileText };
      },
      { projectId: creationResult.projectId, fileHash: creationResult.fileHash }
    );

    const parsedItem = JSON.parse(readBackResult.itemPayload);
    expect(parsedItem.gears).toBe(4);
    expect(parsedItem.ratio).toBe(2.5);
    expect(readBackResult.fileText).toBe("test-binary-diagram-content-xyz");
  });
});
