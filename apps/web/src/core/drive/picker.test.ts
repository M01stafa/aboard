// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { loadPickerApi, openGooglePicker } from "./picker";
import { DriveTokenManager } from "./tokens";

describe("Google Picker Integration (picker.ts / §10.11, PDF-1, ALPHA-2)", () => {
  let mockTokenManager: DriveTokenManager;

  beforeEach(() => {
    vi.restoreAllMocks();
    mockTokenManager = new DriveTokenManager();
    vi.spyOn(mockTokenManager, "get").mockResolvedValue("mock-oauth-token-123");

    process.env.NEXT_PUBLIC_GOOGLE_API_KEY = "mock-api-key";
    process.env.NEXT_PUBLIC_GOOGLE_APP_ID = "123456789";

    delete (window as unknown as { gapi?: unknown }).gapi;
    delete (window as unknown as { google?: unknown }).google;
  });

  afterEach(() => {
    delete (window as unknown as { gapi?: unknown }).gapi;
    delete (window as unknown as { google?: unknown }).google;
  });

  it("injects gapi script tag and calls gapi.load('picker')", async () => {
    let loadedModule = "";
    vi.spyOn(document.head, "appendChild").mockImplementation((node) => {
      if (node instanceof HTMLScriptElement && node.src.includes("apis.google.com/js/api.js")) {
        window.gapi = {
          load: (mod: string, callbacks: { callback: () => void }) => {
            loadedModule = mod;
            window.google = {
              picker: {} as unknown as NonNullable<typeof window.google>["picker"],
            };
            callbacks.callback();
          },
        };
        node.onload?.(new Event("load"));
      }
      return node;
    });

    await loadPickerApi();

    expect(loadedModule).toBe("picker");
  });

  it("opens Google Picker with oauth token and downloads chosen file", async () => {
    let setToken = "";
    let setKey = "";
    let setApp = "";
    let mimeFilter = "";
    let pickerCallback: ((data: Record<string, unknown>) => void) | null = null;
    let dialogVisible = false;

    window.gapi = {
      load: (_mod: string, callbacks: { callback: () => void }) => {
        callbacks.callback();
      },
    };

    window.google = {
      picker: {
        ViewId: { DOCS: "docs" },
        Action: { PICKED: "picked", CANCEL: "cancel" },
        Response: { ACTION: "action", DOCUMENTS: "docs" },
        Document: { ID: "id", NAME: "name", MIME_TYPE: "mimeType" },
        DocsView: class {
          setMimeTypes(types: string) {
            mimeFilter = types;
            return this;
          }
        },
        PickerBuilder: class {
          setAppId(id: string) {
            setApp = id;
            return this;
          }
          setOAuthToken(token: string) {
            setToken = token;
            return this;
          }
          setDeveloperKey(key: string) {
            setKey = key;
            return this;
          }
          addView() {
            return this;
          }
          setLocale() {
            return this;
          }
          setTitle() {
            return this;
          }
          setCallback(cb: (data: Record<string, unknown>) => void) {
            pickerCallback = cb;
            return this;
          }
          build() {
            return {
              setVisible: (v: boolean) => {
                dialogVisible = v;
                setTimeout(() => {
                  pickerCallback?.({
                    action: "picked",
                    docs: [
                      {
                        id: "drive-file-id-456",
                        name: "lecture_slides.pdf",
                        mimeType: "application/pdf",
                      },
                    ],
                  });
                }, 10);
              },
            };
          }
        },
      },
    } as unknown as typeof window.google;

    // Mock downloadFileBlob
    const apiModule = await import("./api");
    vi.spyOn(apiModule, "downloadFileBlob").mockResolvedValue(
      new Blob(["%PDF-1.4 mock pdf data"], { type: "application/pdf" })
    );

    const result = await openGooglePicker({
      mimeTypes: "application/pdf",
      title: "Add PDF from Drive",
      tokenManager: mockTokenManager,
    });

    expect(dialogVisible).toBe(true);
    expect(setToken).toBe("mock-oauth-token-123");
    expect(setKey).toBe("mock-api-key");
    expect(setApp).toBe("123456789");
    expect(mimeFilter).toBe("application/pdf");

    expect(result).not.toBeNull();
    expect(result?.fileId).toBe("drive-file-id-456");
    expect(result?.name).toBe("lecture_slides.pdf");
    expect(result?.blob.size).toBeGreaterThan(0);
  });

  it("resolves null when user cancels Google Picker", async () => {
    window.gapi = {
      load: (_mod: string, callbacks: { callback: () => void }) => {
        callbacks.callback();
      },
    };

    window.google = {
      picker: {
        ViewId: { DOCS: "docs" },
        Action: { PICKED: "picked", CANCEL: "cancel" },
        Response: { ACTION: "action", DOCUMENTS: "docs" },
        Document: { ID: "id", NAME: "name", MIME_TYPE: "mimeType" },
        DocsView: class {
          setMimeTypes() {
            return this;
          }
        },
        PickerBuilder: class {
          setAppId() { return this; }
          setOAuthToken() { return this; }
          setDeveloperKey() { return this; }
          addView() { return this; }
          setLocale() { return this; }
          setTitle() { return this; }
          setCallback(cb: (data: Record<string, unknown>) => void) {
            setTimeout(() => {
              cb({ action: "cancel" });
            }, 10);
            return this;
          }
          build() {
            return {
              setVisible: () => {},
            };
          }
        },
      },
    } as unknown as typeof window.google;

    const result = await openGooglePicker({
      tokenManager: mockTokenManager,
    });

    expect(result).toBeNull();
  });
});
