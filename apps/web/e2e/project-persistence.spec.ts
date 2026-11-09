import { test, expect } from "@playwright/test";
import { PDFDocument, StandardFonts, rgb } from "@cantoo/pdf-lib";
import { mockSignIn } from "./helpers/auth";

test.describe("Project State Persistence & Tab Deduplication on Re-entry", () => {
  const testUser = {
    id: "user-persistence-1111-2222-3333-444444444444",
    email: "persister@example.com",
  };

  test("persists whiteboard drawing, PDF annotation, and deduplicates tabs on launcher re-entry", async ({
    page,
  }) => {
    // 1. Maintain in-memory Supabase projects store for mock REST endpoint
    interface MockProject {
      id: string;
      title: string;
      subject: string | null;
      storage: "local" | "drive";
      local_device_id: string | null;
      drive_folder_id: string | null;
      item_count: number;
      created_at: string;
      updated_at: string;
      deleted_at: string | null;
    }

    const mockProjects: MockProject[] = [];

    await page.route("**/rest/v1/projects*", async (route) => {
      const request = route.request();
      const method = request.method();
      const url = new URL(request.url());

      if (method === "GET") {
        const active = mockProjects
          .filter((p) => p.deleted_at === null)
          .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(active),
        });
      } else if (method === "POST") {
        const body = request.postDataJSON();
        const now = new Date().toISOString();
        const newProj: MockProject = {
          id: body.id,
          title: body.title,
          subject: body.subject ?? null,
          storage: body.storage ?? "local",
          local_device_id: body.local_device_id ?? null,
          drive_folder_id: body.drive_folder_id ?? null,
          item_count: body.item_count ?? 0,
          created_at: now,
          updated_at: now,
          deleted_at: null,
        };
        mockProjects.push(newProj);
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify(newProj),
        });
      } else if (method === "PATCH") {
        const body = request.postDataJSON();
        const idParam = url.searchParams.get("id");
        const targetId = idParam?.replace("eq.", "");
        const proj = mockProjects.find((p) => p.id === targetId);
        if (proj) {
          if (body.title !== undefined) proj.title = body.title;
          if (body.deleted_at !== undefined) proj.deleted_at = body.deleted_at;
          if (body.storage !== undefined) proj.storage = body.storage;
          proj.updated_at = new Date().toISOString();
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(proj ?? {}),
        });
      } else if (method === "DELETE") {
        const idParam = url.searchParams.get("id");
        const targetId = idParam?.replace("eq.", "");
        const idx = mockProjects.findIndex((p) => p.id === targetId);
        if (idx !== -1) {
          mockProjects.splice(idx, 1);
        }
        await route.fulfill({
          status: 204,
          body: "",
        });
      } else {
        await route.continue();
      }
    });

    // 2. Sign in as test user
    await mockSignIn(page, testUser);

    // 3. Navigate to launcher
    await page.goto("/");
    await expect(page.locator('[data-testid="recent-projects-heading"]')).toBeVisible();

    // 4. Create new project with whiteboard
    await page.locator('[data-testid="create-whiteboard-btn"]').click();
    await page.waitForURL(/\/workspace\?p=.+&kind=board/);

    const workspaceUrl = new URL(page.url());
    const projectId = workspaceUrl.searchParams.get("p");
    expect(projectId).toBeTruthy();

    // Verify initial single tab
    await expect(page.locator(".ws-tab-btn")).toHaveCount(1);
    const initialBoardTabId = "tab-1";

    // Wait for Excalidraw to mount and API to attach
    await page.waitForFunction((tabId) => {
      const win = window as unknown as {
        __aboard_boardApi?: Record<
          string,
          {
            updateScene?: unknown;
            getSceneElements?: () => unknown[];
          }
        >;
      };
      const api = win.__aboard_boardApi?.[tabId];
      return Boolean(api && typeof api.updateScene === "function");
    }, initialBoardTabId, { timeout: 25000 });

    // Draw on the whiteboard
    await page.evaluate((tabId) => {
      const win = window as unknown as {
        __aboard_boardApi?: Record<
          string,
          {
            updateScene: (scene: { elements: unknown[] }) => void;
          }
        >;
      };
      const api = win.__aboard_boardApi?.[tabId];
      if (!api) throw new Error("Board API not attached");

      api.updateScene({
        elements: [
          {
            id: "rect-persistent-1",
            type: "rectangle",
            x: 120,
            y: 140,
            width: 240,
            height: 160,
            strokeColor: "#002c8c",
            backgroundColor: "#4f9ed5",
            fillStyle: "solid",
            strokeWidth: 2,
            isDeleted: false,
          },
        ],
      });
    }, initialBoardTabId);

    // 5. Open "+" menu and add New PDF tab
    const addTabBtn = page.locator('[data-testid="add-tab-btn"]');
    await addTabBtn.click();
    const addPdfBtn = page.locator('[data-testid="add-tab-pdf"]');
    await expect(addPdfBtn).toBeVisible();
    await addPdfBtn.click();

    // Assert 2 tabs are now open (Board + PDF)
    await expect(page.locator(".ws-tab-btn")).toHaveCount(2);

    // Generate a valid 2-page test PDF buffer using @cantoo/pdf-lib
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    for (let i = 1; i <= 2; i++) {
      const pdfPage = pdfDoc.addPage([595.28, 841.89]);
      pdfPage.drawText(`Aboard Persistence Test Document - Page ${i}`, {
        x: 50,
        y: 800,
        size: 18,
        font,
        color: rgb(0.1, 0.2, 0.6),
      });
    }
    const pdfBytes = await pdfDoc.save();

    // Upload PDF
    const fileInput = page.locator('.pane[data-slot="primary"] input[data-testid="pdf-file-input"]');
    await expect(fileInput).toBeAttached();
    await fileInput.setInputFiles({
      name: "persistence-test.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from(pdfBytes),
    });

    // Wait for PDF viewer and annotation scope to be ready
    await expect(page.locator('[data-testid="pdf-pane-active"]')).toBeVisible({ timeout: 15000 });
    await expect.poll(async () => {
      return await page.evaluate(() => {
        return Boolean((window as unknown as { __aboard_pdfAnnotations?: { scope?: unknown } }).__aboard_pdfAnnotations?.scope);
      });
    }, { timeout: 10000 }).toBe(true);

    // Add a highlight annotation to the PDF
    await page.evaluate(() => {
      const scope = (window as unknown as {
        __aboard_pdfAnnotations?: {
          scope?: {
            createAnnotation: (pageIndex: number, annotation: unknown) => void;
          };
        };
      }).__aboard_pdfAnnotations?.scope;

      if (!scope) throw new Error("AnnotationScope not available");

      scope.createAnnotation(0, {
        id: "persist-highlight-1",
        type: 9, // PdfAnnotationSubtype.HIGHLIGHT
        pageIndex: 0,
        color: "#ffe066",
        rect: { origin: { x: 50, y: 700 }, size: { width: 220, height: 24 } },
        segmentRects: [{ origin: { x: 50, y: 700 }, size: { width: 220, height: 24 } }],
        rects: [{ origin: { x: 50, y: 700 }, size: { width: 220, height: 24 } }],
      });
    });

    // 6. Navigate back to launcher via header logo link
    const homeLink = page.locator('header a[href="/"]');
    await expect(homeLink).toBeVisible();
    await homeLink.click();

    // Wait for navigation back to launcher
    await page.waitForURL("/");
    await expect(page.locator('[data-testid="recent-projects-heading"]')).toBeVisible();

    // 7. Re-open the project from the launcher recent projects list
    const projectCard = page.locator(`[data-testid="project-card-${projectId}"]`);
    await expect(projectCard).toBeVisible();
    await projectCard.click();

    // Wait for navigation to workspace
    await page.waitForURL(new RegExp(`/workspace\\?p=${projectId}`));
    await expect(page.locator('[data-testid="workspace-host"]')).toBeVisible();

    // 8. Assert: exactly ONE tab for each tool (Whiteboard + PDF = exactly 2 tabs, NO duplicate circuit tabs)
    await expect(page.locator(".ws-tab-btn")).toHaveCount(2);
    const tabTexts = await page.locator(".ws-tab-btn").allInnerTexts();
    expect(tabTexts.some((t) => /Board|Whiteboard/i.test(t))).toBe(true);
    expect(tabTexts.some((t) => /persistence-test|PDF/i.test(t))).toBe(true);
    // Ensure no circuit tabs were accidentally spawned
    expect(tabTexts.some((t) => /Circuit/i.test(t))).toBe(false);

    // 9. Assert the whiteboard drawing exists on re-entry
    // Find the whiteboard tab button and click to activate if not primary
    const boardTabBtn = page.locator(".ws-tab-btn").filter({ hasText: /Board|Whiteboard/i });
    await boardTabBtn.click();

    // Wait for Excalidraw scene elements to contain the persistent rectangle
    await expect.poll(async () => {
      return await page.evaluate(() => {
        const win = window as unknown as {
          __aboard_boardApi?: Record<
            string,
            {
              getSceneElements?: () => Array<{ id: string; isDeleted?: boolean }>;
            }
          >;
        };
        const apis = Object.values(win.__aboard_boardApi || {});
        for (const api of apis) {
          if (typeof api?.getSceneElements === "function") {
            const elements = api.getSceneElements();
            if (elements.some((el) => el.id === "rect-persistent-1" && !el.isDeleted)) {
              return true;
            }
          }
        }
        return false;
      });
    }, { timeout: 15000 }).toBe(true);

    // 10. Assert the PDF annotation exists on re-entry
    const pdfTabBtn = page.locator(".ws-tab-btn").filter({ hasText: /persistence-test|PDF/i });
    await pdfTabBtn.click();

    // Wait for PDF annotation scope and verify the highlight annotation is restored
    await expect.poll(async () => {
      return await page.evaluate(async () => {
        const scope = (window as unknown as {
          __aboard_pdfAnnotations?: {
            scope?: {
              exportAnnotations: () => {
                wait: (cb: (items: Array<{ annotation: { id: string } }>) => void) => void;
              };
            };
          };
        }).__aboard_pdfAnnotations?.scope;

        if (!scope || typeof scope.exportAnnotations !== "function") return false;

        return await new Promise<boolean>((resolve) => {
          try {
            scope.exportAnnotations().wait((items) => {
              const hasAnno = items.some((item) => item.annotation.id === "persist-highlight-1");
              resolve(hasAnno);
            });
          } catch {
            resolve(false);
          }
        });
      });
    }, { timeout: 15000 }).toBe(true);
  });
});
