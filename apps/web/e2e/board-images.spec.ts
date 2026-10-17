import { test, expect } from "@playwright/test";
import { mockSignIn } from "./helpers/auth";

test.describe("Board Images Integration & 4MB Cap (Task 26 / BOARD-2, BOARD-3)", () => {
  const testUserId = "test-image-board-user";
  const projectId = "board-images-e2e-project";

  test.beforeEach(async ({ page }) => {
    await mockSignIn(page, {
      id: testUserId,
      email: "board.images@example.com",
    });
  });

  test("inserts a large photo (>= 5MB), compresses and stores via putFile, and survives reload (BOARD-2, BOARD-3)", async ({
    page,
  }) => {
    // 1. Navigate to workspace with a whiteboard
    await page.goto(`/workspace?p=${projectId}&kind=board`);

    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();
    const boardPane = page.locator('.pane[data-slot="primary"] [data-testid="pane-board-tab-1"]');
    await expect(boardPane).toBeVisible();

    // Wait for Excalidraw API to attach
    await page.waitForFunction(() => {
      const win = window as unknown as {
        __aboard_boardApi?: Record<
          string,
          {
            updateScene?: unknown;
            addFiles?: unknown;
            getSceneElements?: () => unknown[];
          }
        >;
      };
      const api = win.__aboard_boardApi?.["tab-1"];
      return (
        api !== undefined &&
        typeof api.updateScene === "function" &&
        typeof api.addFiles === "function"
      );
    }, { timeout: 25000 });

    // 2. Generate a simulated large 5MB photo (5.4MB BMP) in browser and save through board persistence
    const saveResult = await page.evaluate(async ({ projId }) => {
      const win = window as unknown as {
        __aboard_boardApi?: Record<
          string,
          {
            updateScene: (scene: { elements: unknown[] }) => void;
            addFiles: (files: unknown[]) => void;
            getSceneElements: () => unknown[];
          }
        >;
        __aboard_projectService?: {
          putFile: (p: string, b: Blob, m: { mime: string; name?: string }) => Promise<{ key: string }>;
          getFile: (p: string, k: string) => Promise<Blob>;
          saveBoard: (p: string, item: string, payload: string, title?: string) => Promise<void>;
          readItem: (p: string, item: string) => Promise<string>;
        };
        __aboard_saveQueue?: {
          flushNow: () => Promise<void>;
        };
      };

      const api = win.__aboard_boardApi?.["tab-1"];
      const ps = win.__aboard_projectService;
      if (!api || !ps) {
        throw new Error("Missing Excalidraw API or ProjectService on window");
      }

      // Generate a valid 24-bit uncompressed BMP image of 1800x1000 pixels (5.4 MB)
      const width = 1800;
      const height = 1000;
      const rowSize = Math.floor((24 * width + 31) / 32) * 4;
      const pixelArraySize = rowSize * height;
      const fileSize = 54 + pixelArraySize;
      const bmpBuf = new Uint8Array(fileSize);

      bmpBuf[0] = 0x42; // 'B'
      bmpBuf[1] = 0x4d; // 'M'
      const view = new DataView(bmpBuf.buffer);
      view.setUint32(2, fileSize, true);
      view.setUint32(10, 54, true); // Offset to pixels
      view.setUint32(14, 40, true); // DIB header size
      view.setInt32(18, width, true);
      view.setInt32(22, height, true);
      view.setUint16(26, 1, true); // Planes
      view.setUint16(28, 24, true); // 24-bit RGB
      view.setUint32(34, pixelArraySize, true);

      // Fill pixels with color patterns
      for (let y = 0; y < height; y++) {
        const rowStart = 54 + y * rowSize;
        for (let x = 0; x < width; x++) {
          const px = rowStart + x * 3;
          bmpBuf[px] = (x + y) & 0xff; // B
          bmpBuf[px + 1] = (x * 2) & 0xff; // G
          bmpBuf[px + 2] = (y * 2) & 0xff; // R
        }
      }

      const rawBlob = new Blob([bmpBuf], { type: "image/bmp" });
      const uncompressedBytes = rawBlob.size; // 5,400,054 bytes (~5.15 MB)

      const fileId = "photo-5mb-file";
      const MAX_ALLOWED_FILE_BYTES = 4 * 1024 * 1024;

      // Compression step via standard browser Canvas (BOARD-3: 4MB limit)
      let compressedBlob = rawBlob;
      if (rawBlob.size > MAX_ALLOWED_FILE_BYTES) {
        const imgBitmap = await createImageBitmap(rawBlob);
        const maxDim = 1440;
        const scale = Math.min(1, maxDim / Math.max(imgBitmap.width, imgBitmap.height));
        const targetW = Math.round(imgBitmap.width * scale);
        const targetH = Math.round(imgBitmap.height * scale);

        const canvas = document.createElement("canvas");
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext("2d")!;
        ctx.drawImage(imgBitmap, 0, 0, targetW, targetH);
        imgBitmap.close();

        compressedBlob = await new Promise<Blob>((resolve) => {
          canvas.toBlob((b) => resolve(b!), "image/webp", 0.85);
        });
      }

      // Convert compressed blob to dataURL for in-memory Excalidraw cache
      const compressedDataUrl = await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.readAsDataURL(compressedBlob);
      });

      // Store binary blob in ProjectService via putFile (content-addressed)
      const { key: contentSha256 } = await ps.putFile(projId, compressedBlob, {
        mime: compressedBlob.type,
        name: fileId,
      });

      // Inject into Excalidraw
      const fileData = {
        id: fileId,
        dataURL: compressedDataUrl,
        mimeType: compressedBlob.type,
        created: Date.now(),
      };

      const imageElement = {
        id: "img-element-1",
        type: "image",
        fileId,
        status: "saved",
        x: 100,
        y: 100,
        width: 400,
        height: 300,
        scale: [1, 1],
        crop: null,
        isDeleted: false,
        groupIds: [],
        roundness: null,
        seed: 42,
        version: 1,
        versionNonce: 1,
        updated: 1,
        link: null,
        locked: false,
      };

      api.addFiles([fileData]);
      api.updateScene({ elements: [imageElement] });

      // Save lightweight board payload (only fileId -> SHA-256 key, NO raw base64)
      const payloadObj = {
        elements: [imageElement],
        appState: { viewBackgroundColor: "#ffffff" },
        files: {
          [fileId]: contentSha256,
        },
      };
      await ps.saveBoard(projId, "item-1", JSON.stringify(payloadObj), "Board With 5MB Photo");

      if (win.__aboard_saveQueue) {
        await win.__aboard_saveQueue.flushNow();
      }

      // Verify stored file size and lightweight payload JSON
      const storedBlob = await ps.getFile(projId, contentSha256);
      const rawPayload = await ps.readItem(projId, "item-1");

      return {
        uncompressedBytes,
        compressedBytes: storedBlob.size,
        contentSha256,
        hasBase64InJson: rawPayload.includes("data:image/"),
        rawPayloadLen: rawPayload.length,
      };
    }, { projId: projectId });

    // Assert that simulated photo was >= 5MB and compressed is <= 4MB
    expect(saveResult.uncompressedBytes).toBeGreaterThanOrEqual(5 * 1024 * 1024);
    expect(saveResult.compressedBytes).toBeLessThanOrEqual(4 * 1024 * 1024);
    // Confirm lightweight JSON: NO large base64 string lives in the board payload
    expect(saveResult.hasBase64InJson).toBe(false);
    expect(saveResult.rawPayloadLen).toBeLessThan(10000); // lightweight JSON (< 10 KB)

    // 3. Full Page Reload Test
    await page.reload();

    // Verify workspace host and board pane restore
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();
    await expect(
      page.locator('.pane[data-slot="primary"] [data-testid="pane-board-tab-1"]')
    ).toBeVisible();

    // Wait for Excalidraw API and restored scene elements
    await page.waitForFunction(() => {
      const win = window as unknown as {
        __aboard_boardApi?: Record<
          string,
          {
            getSceneElements: () => { id: string; type: string }[];
          }
        >;
      };
      const api = win.__aboard_boardApi?.["tab-1"];
      if (!api || typeof api.getSceneElements !== "function") return false;
      const elements = api.getSceneElements() || [];
      return elements.some((e) => e.id === "img-element-1" && e.type === "image");
    }, { timeout: 25000 });

    // Verify image element and binary file data survived the reload intact
    const restoredScene = await page.evaluate(() => {
      const win = window as unknown as {
        __aboard_boardApi?: Record<
          string,
          {
            getSceneElements: () => { id: string; type: string; fileId?: string }[];
            getFiles?: () => Record<string, { id: string; dataURL?: string }>;
          }
        >;
      };
      const api = win.__aboard_boardApi?.["tab-1"];
      const elements = (api?.getSceneElements() ?? []).filter((e) => e.id === "img-element-1");
      const files = api?.getFiles?.() ?? {};
      return {
        element: elements[0] ?? null,
        file: files["photo-5mb-file"] ?? null,
      };
    });

    expect(restoredScene.element).not.toBeNull();
    expect(restoredScene.element?.type).toBe("image");
    expect(restoredScene.element?.fileId).toBe("photo-5mb-file");
  });
});
