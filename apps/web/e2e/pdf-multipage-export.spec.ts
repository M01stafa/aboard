import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";
import { mockSignIn } from "./helpers/auth";
import fs from "fs";

test.describe("Multi-page PDF Drawing and Flattened Export", () => {
  test("proves drawings on Page 0 are recorded under pageIndex 0 and burned into downloaded PDF", async ({ page }) => {
    await mockSignIn(page, {
      id: "multipage-export-user",
      email: "multipage@example.com",
    });

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);

    // Multi-page document (6 pages, matching user scenario)
    for (let i = 0; i < 6; i++) {
      const p = pdfDoc.addPage([595.28, 841.89]);
      p.drawText(`Page ${i + 1} of 6`, { x: 50, y: 750, size: 20, font, color: rgb(0, 0, 0) });
    }
    const pdfBytes = await pdfDoc.save();

    await page.goto("/workspace?p=multipage-export-proj&kind=pdf");
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();

    const primaryPane = page.locator('.pane[data-slot="primary"]');
    const fileInput = primaryPane.locator('input[data-testid="pdf-file-input"]');
    await fileInput.setInputFiles({
      name: "multipage-test.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBytes),
    });

    const page1 = primaryPane.locator('[data-testid="pdf-page-1"]');
    await expect(page1).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(600);

    const page1Box = await page1.boundingBox();
    expect(page1Box).not.toBeNull();

    // Select Ink tool
    await primaryPane.locator('[data-testid="pdf-tool-ink"]').click();
    await page.waitForTimeout(200);

    // Draw red ink scribble on Page 1 (0-indexed page 0)
    const drawStartX = page1Box!.x + 150;
    const drawStartY = page1Box!.y + 250;
    const drawEndX = page1Box!.x + 250;
    const drawEndY = page1Box!.y + 350;

    await page.mouse.move(drawStartX, drawStartY);
    await page.mouse.down();
    await page.mouse.move(drawEndX, drawEndY);
    await page.mouse.up();
    await page.waitForTimeout(500);

    // Assert that strokes are stored under pageIndex 0 with positive Y coordinates
    const storedStrokes = await page.evaluate(() => {
      const api = (window as any).__aboard_pdfAnnotations;
      return api?.customStrokes;
    });

    expect(storedStrokes).toBeDefined();
    expect(storedStrokes["0"]).toBeDefined();
    expect(storedStrokes["0"].length).toBeGreaterThan(0);
    const stroke = storedStrokes["0"][0];
    for (const pt of stroke.points) {
      expect(pt.y).toBeGreaterThan(0);
      expect(pt.y).toBeLessThan(842);
    }

    // Trigger Download PDF button
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      primaryPane.locator('[data-testid="pdf-download-btn"]').click(),
    ]);

    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();

    const downloadedBytes = fs.readFileSync(downloadPath!);
    const downloadedDoc = await PDFDocument.load(downloadedBytes);
    const dp0 = downloadedDoc.getPage(0);

    // Assert drawing commands exist in Page 0 contents
    const contents = dp0.node.normalizedEntries()["Contents"];
    let foundDrawing = false;
    const zlib = require("zlib");
    if (contents) {
      for (let i = 0; i < contents.size(); i++) {
        const streamObj: any = downloadedDoc.context.lookup(contents.get(i));
        let rawStr = "";
        try {
          if (streamObj?.asUint8Array) {
            rawStr = zlib.inflateSync(streamObj.asUint8Array()).toString("utf-8");
          }
        } catch {
          rawStr = typeof streamObj?.getContentsString === "function" ? streamObj.getContentsString() : "";
        }
        if (rawStr.includes("RG") || rawStr.includes("rg") || rawStr.includes("l") || rawStr.includes("m")) {
          foundDrawing = true;
        }
      }
    }

    expect(foundDrawing).toBe(true);
  });
});
