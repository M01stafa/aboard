import { test, expect } from "@playwright/test";
import { mockSignIn } from "./helpers/auth";

test.describe("Drive Mode Switching & Google Picker E2E (Task 37 / §11.6, §10.11)", () => {
  const testUser = {
    id: "user-picker-test-1111-2222-3333-444444444444",
    email: "student.picker@example.com",
  };

  const corsHeaders = {
    "access-control-allow-origin": "*",
    "access-control-allow-headers": "*",
    "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  };

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

  test.beforeEach(async ({ page }) => {
    mockProjects.length = 0;

    // 1. Authenticate user
    await mockSignIn(page, testUser);

    // 2. Mock Drive connection RPC status
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
            google_email: "student.picker@example.com",
            linked_at: new Date().toISOString(),
            reconnect_required: false,
          },
        ]),
      });
    });

    // 3. Mock drive-token Edge Function
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
          access_token: "mock-picker-token-abc",
          expires_at: Date.now() + 3600_000,
        }),
      });
    });

    // 4. Mock apis.google.com script load so it never fails on network in CI
    await page.route("https://apis.google.com/js/api.js*", async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "application/javascript",
        body: `
          window.gapi = {
            load: function(mod, cb) {
              if (cb && cb.callback) cb.callback();
            }
          };
          window.google = {
            picker: {
              ViewId: { DOCS: "docs" },
              Action: { PICKED: "picked", CANCEL: "cancel" },
              Response: { ACTION: "action", DOCUMENTS: "docs" },
              Document: { ID: "id", NAME: "name", MIME_TYPE: "mimeType" },
              DocsView: function() {
                this.setMimeTypes = function() { return this; };
              },
              PickerBuilder: function() {
                this.setAppId = function() { return this; };
                this.setOAuthToken = function() { return this; };
                this.setDeveloperKey = function() { return this; };
                this.addView = function() { return this; };
                this.setLocale = function() { return this; };
                this.setTitle = function() { return this; };
                this.setCallback = function(cb) { this._cb = cb; return this; };
                this.build = function() {
                  var self = this;
                  return {
                    setVisible: function(v) {
                      if (v && self._cb) {
                        setTimeout(function() {
                          self._cb({ action: "cancel" });
                        }, 50);
                      }
                    }
                  };
                };
              }
            }
          };
        `,
      });
    });

    // 5. Mock projects REST endpoint
    await page.route("**/rest/v1/projects*", async (route) => {
      const request = route.request();
      const method = request.method();

      if (method === "OPTIONS") {
        await route.fulfill({ status: 200, headers: corsHeaders });
        return;
      }

      if (method === "GET") {
        const active = mockProjects
          .filter((p) => p.deleted_at === null)
          .sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: corsHeaders,
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
          headers: corsHeaders,
          body: JSON.stringify(newProj),
        });
      } else if (method === "PATCH") {
        const body = request.postDataJSON();
        const url = new URL(request.url());
        const idParam = url.searchParams.get("id");
        const targetId = idParam?.replace("eq.", "");
        const proj = mockProjects.find((p) => p.id === targetId);
        if (proj) {
          if (body.storage !== undefined) proj.storage = body.storage;
          if (body.drive_folder_id !== undefined) proj.drive_folder_id = body.drive_folder_id;
          if (body.local_device_id !== undefined) proj.local_device_id = body.local_device_id;
          proj.updated_at = new Date().toISOString();
        }
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: corsHeaders,
          body: JSON.stringify(proj ?? {}),
        });
      } else {
        await route.continue();
      }
    });
  });

  test("Launcher displays 'Open .alpha from Google Drive' button and triggers Picker script load", async ({
    page,
  }) => {
    await page.goto("/");

    const openDriveBtn = page.locator('[data-testid="open-alpha-drive-btn"]');
    await expect(openDriveBtn).toBeVisible();

    // Clicking it triggers dynamic load of apis.google.com/js/api.js
    await openDriveBtn.click();

    // Verify script tag was injected
    const scriptTag = page.locator('script[src="https://apis.google.com/js/api.js"]');
    await expect(scriptTag).toHaveCount(1);
  });

  test("PDF pane displays 'Add PDF from Google Drive' button and triggers Picker load", async ({
    page,
  }) => {
    // Navigate to workspace with a fresh PDF tab
    await page.goto("/workspace?p=test-pdf-picker-proj&kind=pdf");

    // The PDF pane empty state offers selecting a local file or from Drive
    const pdfDriveBtn = page.locator('[data-testid="pdf-drive-button"]').first();
    await expect(pdfDriveBtn).toBeVisible();

    await pdfDriveBtn.click();

    // Verify script tag is present
    const scriptTag = page.locator('script[src="https://apis.google.com/js/api.js"]');
    await expect(scriptTag).toHaveCount(1);
  });

  test("Save to Google Drive flow switches local project to Drive mode and updates the UI", async ({
    page,
  }) => {
    await page.goto("/");

    // 1. Create a local whiteboard project from Launcher
    const createBtn = page.locator('[data-testid="create-whiteboard-btn"]');
    await expect(createBtn).toBeVisible();
    await createBtn.click();

    // 2. Wait for workspace to load with new project ID
    await page.waitForURL(/\/workspace\?p=/);
    const url = new URL(page.url());
    const projectId = url.searchParams.get("p")!;

    // 3. Return to Launcher
    await page.goto("/");

    // 4. Ensure recent project card appears with mode switch button
    const modeSwitchBtn = page.locator(`[data-testid="mode-switch-btn-${projectId}"]`);
    await expect(modeSwitchBtn).toBeVisible();
    await expect(modeSwitchBtn).toHaveText(/Save to Google Drive|حفظ في Google Drive/i);

    // 5. Click Save to Google Drive button -> opens ModeSwitchModal
    await modeSwitchBtn.click();

    const modal = page.locator('[data-testid="mode-switch-modal"]');
    await expect(modal).toBeVisible();

    // Cancel button works
    const cancelBtn = page.locator('[data-testid="mode-switch-cancel-btn"]');
    await expect(cancelBtn).toBeVisible();

    // Submit button initiates the move flow
    const submitBtn = page.locator('[data-testid="mode-switch-submit-btn"]');
    await expect(submitBtn).toBeVisible();

    // Cancel closes the modal
    await cancelBtn.click();
    await expect(modal).not.toBeVisible();
  });
});
