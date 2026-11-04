import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";
import { mockSignIn } from "./helpers/auth";

test.describe("PDF Text Tool RTL/LTR Direction & Arabic Shaping E2E", () => {
  const testUserId = "test-pdf-bidi-user";
  const projectId = "pdf-bidi-rtl-project";

  test.beforeEach(async ({ page }) => {
    await mockSignIn(page, {
      id: testUserId,
      email: "bidi.test@example.com",
    });
  });

  test("English text persists LTR on blur in Arabic RTL environment, Arabic text persists RTL, and mixed text renders correctly", async ({
    page,
  }) => {
    // 1. Create a test PDF
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pdfPage = pdfDoc.addPage([595.28, 841.89]);
    pdfPage.drawText("Aboard Bidi Test Document", { x: 50, y: 800, size: 18, font, color: rgb(0, 0, 0) });
    const pdfBytes = await pdfDoc.save();

    // 2. Open workspace in Arabic mode
    await page.goto(`/workspace?p=${projectId}&kind=pdf`);
    await page.evaluate(() => {
      localStorage.setItem("aboard:language", "ar");
    });
    await page.reload();
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();

    const htmlDir = await page.evaluate(() => document.documentElement.dir);
    expect(htmlDir).toBe("rtl");

    const primaryPane = page.locator('.pane[data-slot="primary"]');
    const fileInput = primaryPane.locator('input[data-testid="pdf-file-input"]');
    await expect(fileInput).toBeAttached();

    await fileInput.setInputFiles({
      name: "bidi-test.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBytes),
    });

    const activeViewer = primaryPane.locator('[data-testid="pdf-pane-active"]');
    await expect(activeViewer).toBeVisible({ timeout: 15000 });

    // Wait for annotation API
    await expect.poll(async () => {
      return await page.evaluate(() => {
        return Boolean((window as unknown as { __aboard_pdfAnnotations?: { addText?: unknown } }).__aboard_pdfAnnotations?.addText);
      });
    }, { timeout: 10000 }).toBe(true);

    // 3. Add English Text Box: "Hello World"
    const enBoxId = await page.evaluate(() => {
      const api = (window as unknown as {
        __aboard_pdfAnnotations: {
          addText: (pageIndex: number, coords: { x: number; y: number; text: string }) => string;
        };
      }).__aboard_pdfAnnotations;
      return api.addText(0, { x: 50, y: 150, text: "Hello World" });
    });

    const enDisplay = page.locator(`[data-testid="pdf-text-box-${enBoxId}"]`);
    await expect(enDisplay).toBeVisible({ timeout: 5000 });

    // Verify English computed style: direction = "ltr", textAlign = "left"
    const enStyles = await enDisplay.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return {
        dirAttr: el.getAttribute("dir"),
        direction: cs.direction,
        textAlign: cs.textAlign,
      };
    });
    expect(enStyles.dirAttr).toBe("ltr");
    expect(enStyles.direction).toBe("ltr");
    expect(enStyles.textAlign).toBe("left");

    // 4. Add Arabic Text Box: "مرحبا بالعالم"
    const arBoxId = await page.evaluate(() => {
      const api = (window as unknown as {
        __aboard_pdfAnnotations: {
          addText: (pageIndex: number, coords: { x: number; y: number; text: string }) => string;
        };
      }).__aboard_pdfAnnotations;
      return api.addText(0, { x: 50, y: 250, text: "مرحبا بالعالم" });
    });

    const arDisplay = page.locator(`[data-testid="pdf-text-box-${arBoxId}"]`);
    await expect(arDisplay).toBeVisible({ timeout: 5000 });

    // Verify Arabic computed style: direction = "rtl", textAlign = "right"
    const arStyles = await arDisplay.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return {
        dirAttr: el.getAttribute("dir"),
        direction: cs.direction,
        textAlign: cs.textAlign,
      };
    });
    expect(arStyles.dirAttr).toBe("rtl");
    expect(arStyles.direction).toBe("rtl");
    expect(arStyles.textAlign).toBe("right");

    // 5. Add Mixed Text Box (Latin strong): "Hello مرحبا"
    const mixedBoxId = await page.evaluate(() => {
      const api = (window as unknown as {
        __aboard_pdfAnnotations: {
          addText: (pageIndex: number, coords: { x: number; y: number; text: string }) => string;
        };
      }).__aboard_pdfAnnotations;
      return api.addText(0, { x: 50, y: 350, text: "Hello مرحبا" });
    });

    const mixedDisplay = page.locator(`[data-testid="pdf-text-box-${mixedBoxId}"]`);
    await expect(mixedDisplay).toBeVisible({ timeout: 5000 });

    const mixedStyles = await mixedDisplay.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return {
        dirAttr: el.getAttribute("dir"),
        direction: cs.direction,
        textAlign: cs.textAlign,
      };
    });
    expect(mixedStyles.dirAttr).toBe("ltr");
    expect(mixedStyles.direction).toBe("ltr");
    expect(mixedStyles.textAlign).toBe("left");

    // Take screenshot of all three text boxes in Arabic RTL environment
    await page.screenshot({ path: "scripts/e2e-bidi-test-result.png" });
  });
});
