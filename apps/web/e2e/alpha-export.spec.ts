import { test, expect } from "@playwright/test";
import { ZipReader, BlobReader, TextWriter } from "@zip.js/zip.js";
import { mockSignIn } from "./helpers/auth";

test.describe(".alpha Project Export (Task 31 / ALPHA-1, ALPHA-5, ALPHA-6, ALPHA-8)", () => {
  const testUserId = "test-export-user";
  const projectId = "alpha-export-e2e-project";

  test.beforeEach(async ({ page }) => {
    await mockSignIn(page, {
      id: testUserId,
      email: "export.student@example.com",
    });
  });

  test("opens export dialog, submits export, downloads .alpha container and asserts ZIP layout with uncompressed mimetype", async ({
    page,
  }) => {
    // 1. Remove showSaveFilePicker in headless test runner so browser download event is triggered
    await page.addInitScript(() => {
      // @ts-expect-error test environment override
      delete window.showSaveFilePicker;
    });

    // 2. Open workspace with test project
    await page.goto(`/workspace?p=${projectId}&kind=board`);
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();

    // 2b. Wait for Excalidraw to mount and API to attach
    await page.waitForFunction(() => {
      const win = window as unknown as {
        __aboard_boardApi?: Record<
          string,
          {
            updateScene?: unknown;
            getSceneElements?: () => unknown[];
            refresh?: unknown;
          }
        >;
      };
      const api = win.__aboard_boardApi?.["tab-1"];
      return (
        api !== undefined &&
        typeof api.updateScene === "function" &&
        typeof api.refresh === "function"
      );
    }, { timeout: 25000 });

    const testElements = [
      {
        id: "rect-e2e-export",
        type: "rectangle",
        x: 120,
        y: 140,
        width: 220,
        height: 120,
        strokeColor: "#1e1e1e",
        backgroundColor: "#e03131",
        fillStyle: "solid",
        strokeWidth: 2,
        roughness: 1,
        opacity: 100,
        isDeleted: false,
      },
    ];

    await page.evaluate(
      async ({ elements, projId }) => {
        const win = window as unknown as {
          __aboard_boardApi?: Record<
            string,
            {
              updateScene: (scene: { elements: unknown[]; appState?: Record<string, unknown> }) => void;
            }
          >;
          __aboard_projectService?: {
            saveBoard: (p: string, item: string, payload: string, title?: string) => Promise<void>;
          };
          __aboard_saveQueue?: {
            flushNow: () => Promise<void>;
          };
        };
        const api = win.__aboard_boardApi?.["tab-1"];
        if (api) {
          api.updateScene({ elements, appState: { viewBackgroundColor: "#ffffff" } });
        }
        if (win.__aboard_projectService) {
          await win.__aboard_projectService.saveBoard(
            projId,
            "item-1",
            JSON.stringify({ elements, appState: { viewBackgroundColor: "#ffffff" } }),
            "Whiteboard 1"
          );
        }
        if (win.__aboard_saveQueue) {
          await win.__aboard_saveQueue.flushNow();
        }
      },
      { elements: testElements, projId: projectId }
    );

    // 3. Click the Export button in the top navigation bar
    const exportBtn = page.locator('[data-testid="workspace-export-btn"]');
    await expect(exportBtn).toBeVisible({ timeout: 10000 });
    await exportBtn.click();

    // 3. Verify Export Dialog is open with default options
    const dialog = page.locator('[data-testid="alpha-export-dialog"]');
    await expect(dialog).toBeVisible();

    const pdfsCheckbox = dialog.locator('[data-testid="export-include-pdfs"]');
    await expect(pdfsCheckbox).toBeChecked(); // default ON per ALPHA-6

    const annotatedCheckbox = dialog.locator('[data-testid="export-include-annotated"]');
    await expect(annotatedCheckbox).not.toBeChecked(); // default OFF per ALPHA-6

    // 4. Trigger Export and listen for download event
    const submitBtn = dialog.locator('[data-testid="export-submit-btn"]');
    await expect(submitBtn).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    await submitBtn.click();
    const download = await downloadPromise;

    // 5. Verify filename extension strictly ends with .alpha
    const fileName = download.suggestedFilename();
    expect(fileName).toMatch(/\.alpha$/i);

    // 6. Read downloaded bytes into memory
    const downloadStream = await download.createReadStream();
    if (!downloadStream) throw new Error("No download stream returned");

    const chunks: Buffer[] = [];
    for await (const chunk of downloadStream) {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    }
    const downloadedBuffer = Buffer.concat(chunks);
    expect(downloadedBuffer.length).toBeGreaterThan(100);

    // 7. Inspect archive container structure with @zip.js/zip.js
    const zipBlob = new Blob([downloadedBuffer as unknown as BlobPart], {
      type: "application/octet-stream",
    });
    const zipReader = new ZipReader(new BlobReader(zipBlob));
    const entries = await zipReader.getEntries();

    // Assert entries include mimetype, manifest.json, and board payload
    expect(entries.length).toBeGreaterThanOrEqual(3);

    // Assertion 1: First entry MUST be "mimetype"
    const firstEntry = entries[0];
    expect(firstEntry.filename).toBe("mimetype");
    expect(firstEntry.uncompressedSize).toBe(27);
    // Compression method 0 = STORED (uncompressed) per §12.1
    expect(firstEntry.compressionMethod).toBe(0);

    const mimeContent = await (firstEntry as { getData: (writer: TextWriter) => Promise<string> }).getData(
      new TextWriter()
    );
    expect(mimeContent).toBe("application/x-alpha-project");

    // Assertion 2: Second entry MUST be "manifest.json"
    const secondEntry = entries[1];
    expect(secondEntry.filename).toBe("manifest.json");

    const manifestText = await (secondEntry as { getData: (writer: TextWriter) => Promise<string> }).getData(
      new TextWriter()
    );
    const manifest = JSON.parse(manifestText);
    expect(manifest.format).toBe("alpha-project");
    expect(manifest.formatVersion).toBe(1);
    expect(manifest.app.name).toBe("Aboard");
    expect(manifest.project).toBeDefined();
    expect(manifest.items).toBeDefined();
    expect(manifest.items.length).toBeGreaterThanOrEqual(1);

    // Assertion 3: Board entry exists, is not empty, and contains the saved drawing elements
    const boardItem = manifest.items.find((it: { kind: string }) => it.kind === "board");
    expect(boardItem).toBeDefined();

    const boardEntry = entries.find((e) => e.filename === boardItem.path);
    expect(boardEntry).toBeDefined();
    expect(boardEntry!.uncompressedSize).toBeGreaterThan(0);

    const boardText = await (boardEntry as { getData: (writer: TextWriter) => Promise<string> }).getData(
      new TextWriter()
    );
    const boardData = JSON.parse(boardText);
    expect(boardData.elements).toBeDefined();
    expect(boardData.elements.length).toBeGreaterThan(0);
    expect(boardData.elements[0].id).toBe("rect-e2e-export");

    await zipReader.close();
  });
});
