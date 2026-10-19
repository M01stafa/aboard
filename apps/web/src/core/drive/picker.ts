import { driveTokenManager, type DriveTokenManager } from "./tokens";
import { downloadFileBlob } from "./api";

/**
 * Google Picker API interfaces conforming to official gapi / Google Picker v1 API.
 * Confirmed in Spike S4 report (VERIFY V09, docs/spikes/S4.md).
 */
export interface GooglePickerBuilder {
  setAppId(appId: string): this;
  setOAuthToken(token: string): this;
  setDeveloperKey(key: string): this;
  addView(view: unknown): this;
  setLocale(locale: string): this;
  setCallback(callback: (data: Record<string, unknown>) => void): this;
  setTitle(title: string): this;
  build(): { setVisible(visible: boolean): void };
}

export interface GoogleDocsView {
  setMimeTypes(mimeTypes: string): this;
}

export interface PickedFileResult {
  fileId: string;
  name: string;
  mimeType: string;
  blob: Blob;
}

export interface OpenPickerOptions {
  mimeTypes?: string;
  locale?: string;
  title?: string;
  tokenManager?: DriveTokenManager;
}

declare global {
  interface Window {
    gapi?: {
      load: (
        api: string,
        callbacks: { callback: () => void; onerror?: (err: unknown) => void }
      ) => void;
    };
    google?: {
      picker: {
        PickerBuilder: new () => GooglePickerBuilder;
        DocsView: new (viewId: unknown) => GoogleDocsView;
        ViewId: {
          DOCS: unknown;
        };
        Action: {
          PICKED: string;
          CANCEL: string;
        };
        Response: {
          ACTION: string;
          DOCUMENTS: string;
        };
        Document: {
          ID: string;
          NAME: string;
          MIME_TYPE: string;
        };
      };
    };
  }
}

/**
 * Dynamically loads https://apis.google.com/js/api.js and the 'picker' module.
 * Confirmed safe under application CSP in Spike S4 (V09, V14).
 */
export async function loadPickerApi(): Promise<void> {
  if (typeof window === "undefined") return;

  // 1. Ensure https://apis.google.com/js/api.js script tag is injected
  if (!window.gapi) {
    await new Promise<void>((resolve, reject) => {
      const existingScript = document.querySelector(
        'script[src="https://apis.google.com/js/api.js"]'
      );
      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(), { once: true });
        existingScript.addEventListener("error", (e) => reject(e), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = "https://apis.google.com/js/api.js";
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = (e) => {
        reject(new Error(`Failed to load Google API script (${e instanceof Event ? "CSP or Network error" : String(e)})`));
      };
      document.head.appendChild(script);
    });
  }

  // 2. Load the 'picker' module via gapi.load
  if (!window.google?.picker) {
    await new Promise<void>((resolve, reject) => {
      if (!window.gapi?.load) {
        reject(new Error("gapi.load is not available on window.gapi"));
        return;
      }
      window.gapi.load("picker", {
        callback: () => resolve(),
        onerror: (err: unknown) => {
          reject(new Error(`Failed to load Google Picker module: ${String(err)}`));
        },
      });
    });
  }
}

/**
 * Opens Google Picker dialog allowing the user to select a Drive file.
 * With the drive.file scope, picking a file grants the application access to that file only.
 * Implements docs/specs/google-drive.md §10.11.
 */
export async function openGooglePicker(
  options: OpenPickerOptions = {}
): Promise<PickedFileResult | null> {
  await loadPickerApi();

  const tm = options.tokenManager ?? driveTokenManager;
  const token = await tm.get();
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_API_KEY || "";
  const appId = process.env.NEXT_PUBLIC_GOOGLE_APP_ID || "";

  if (!window.google?.picker) {
    throw new Error("Google Picker library failed to initialize");
  }

  return new Promise<PickedFileResult | null>((resolve, reject) => {
    try {
      const { picker } = window.google!;
      const docsView = new picker.DocsView(picker.ViewId.DOCS);

      if (options.mimeTypes) {
        docsView.setMimeTypes(options.mimeTypes);
      }

      const builder = new picker.PickerBuilder()
        .setAppId(appId)
        .setOAuthToken(token)
        .setDeveloperKey(apiKey)
        .addView(docsView)
        .setLocale(options.locale || "en");

      if (options.title) {
        builder.setTitle(options.title);
      }

      builder.setCallback(async (data: Record<string, unknown>) => {
        const action = data[picker.Response.ACTION];
        if (action === picker.Action.CANCEL) {
          resolve(null);
          return;
        }

        if (action === picker.Action.PICKED) {
          const docs = data[picker.Response.DOCUMENTS] as
            | Array<Record<string, unknown>>
            | undefined;

          if (!docs || docs.length === 0) {
            resolve(null);
            return;
          }

          const doc = docs[0];
          const fileId = String(doc[picker.Document.ID]);
          const name = String(doc[picker.Document.NAME] || "google-drive-file");
          const mimeType = String(
            doc[picker.Document.MIME_TYPE] || "application/octet-stream"
          );

          try {
            const blob = await downloadFileBlob(fileId, tm);
            resolve({ fileId, name, mimeType, blob });
          } catch (downloadErr) {
            reject(downloadErr);
          }
        }
      });

      const dialog = builder.build();
      dialog.setVisible(true);
    } catch (err) {
      reject(err);
    }
  });
}
