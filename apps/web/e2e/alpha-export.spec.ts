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

    expect(entries.length).toBeGreaterThanOrEqual(2);

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

    await zipReader.close();
  });
});
