import { test, expect } from "@playwright/test";
import { mockSignIn } from "./helpers/auth";

test.describe("Project Index & Recent Projects List (Task 22 / LAUNCH-2, LAUNCH-4)", () => {
  const testUser = {
    id: "user-launch-1111-2222-3333-444444444444",
    email: "engineer@example.com",
  };

  test("creates project in local mode, shows 'This device' badge across reload, renames, and deletes", async ({
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
        // ID filter in query parameter, e.g. id=eq.xxx
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

    // Verify initial empty state
    await expect(page.locator('[data-testid="recent-projects-empty"]')).toBeVisible();
    await expect(page.locator('[data-testid="recent-projects-count"]')).toHaveText("0");

    // 4. Click "Create Whiteboard"
    await page.locator('[data-testid="create-whiteboard-btn"]').click();

    // Wait for navigation to workspace
    await page.waitForURL(/\/workspace\?p=.+&kind=board/);
    const workspaceUrl = new URL(page.url());
    const projectId = workspaceUrl.searchParams.get("p");
    expect(projectId).toBeTruthy();

    // 5. Navigate back to launcher / reload
    await page.goto("/");
    await expect(page.locator('[data-testid="recent-projects-heading"]')).toBeVisible();

    // Assert project appears in recent list with "This device" badge
    const countLocator = page.locator('[data-testid="recent-projects-count"]');
    await expect(countLocator).toHaveText("1");

    const projectCard = page.locator(`[data-testid="project-card-${projectId}"]`);
    await expect(projectCard).toBeVisible();

    const badgeLocator = page.locator(`[data-testid="badge-${projectId}"]`);
    await expect(badgeLocator).toHaveText(/This device/i);

    // 6. Rename project
    const renameBtn = page.locator(`[data-testid="rename-btn-${projectId}"]`);
    await renameBtn.click();

    const renameInput = page.locator(`[data-testid="rename-input-${projectId}"]`);
    await expect(renameInput).toBeVisible();
    await renameInput.fill("Calculus Study Group");

    const saveBtn = page.locator(`[data-testid="rename-save-${projectId}"]`);
    await saveBtn.click();

    // Verify title updated immediately in UI
    const titleLocator = page.locator(`[data-testid="project-title-${projectId}"]`);
    await expect(titleLocator).toHaveText("Calculus Study Group");

    // 7. Reload launcher and assert renamed title persists
    await page.reload();
    await expect(page.locator(`[data-testid="project-title-${projectId}"]`)).toHaveText(
      "Calculus Study Group"
    );
    await expect(badgeLocator).toHaveText(/This device/i);

    // 8. Delete project
    const deleteBtn = page.locator(`[data-testid="delete-btn-${projectId}"]`);
    await deleteBtn.click();

    // Confirmation dialog appears
    const confirmDialog = page.locator('[role="dialog"]');
    await expect(confirmDialog).toBeVisible();

    const confirmDeleteBtn = page.locator('[data-testid="confirm-delete-btn"]');
    await confirmDeleteBtn.click();

    // Assert project disappeared from UI
    await expect(projectCard).not.toBeVisible();
    await expect(countLocator).toHaveText("0");
    await expect(page.locator('[data-testid="recent-projects-empty"]')).toBeVisible();

    // 9. Reload launcher and assert project remains deleted
    await page.reload();
    await expect(page.locator(`[data-testid="project-card-${projectId}"]`)).not.toBeVisible();
    await expect(countLocator).toHaveText("0");
    await expect(page.locator('[data-testid="recent-projects-empty"]')).toBeVisible();
  });
});
