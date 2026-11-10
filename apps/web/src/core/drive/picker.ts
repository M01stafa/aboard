import { driveTokenManager, type DriveTokenManager } from "./tokens";
import { downloadFileBlob } from "./api";
import { bus } from "@/core/bus";
import { env } from "@/core/env";

/**
 * Google Picker API interfaces conforming to official gapi / Google Picker v1 API.
 * Confirmed in Spike S4 report (VERIFY V09, docs/spikes/S4.md).
 */
export interface GooglePickerBuilder {
  setAppId(appId: string): this;
  setOAuthToken(token: string): this;
  setDeveloperKey(key: string): this;
  setOrigin(origin: string): this;
  addView(view: unknown): this;
  setLocale(locale: string): this;
  setCallback(callback: (data: Record<string, unknown>) => void): this;
  setTitle(title: string): this;
  build(): { setVisible(visible: boolean): void };
}

export interface GoogleDocsView {
  setMimeTypes(mimeTypes: string): this;
  setIncludeFolders?(includeFolders: boolean): this;
  setSelectFolderEnabled?(selectFolder: boolean): this;
  setParent?(parentId: string): this;
  setInitialDir?(id: string): this;
}

export interface PickedFileResult {
  fileId: string;
  name: string;
  mimeType: string;
  blob?: Blob;
  isFolder?: boolean;
}

export interface OpenPickerOptions {
  mimeTypes?: string;
  locale?: string;
  title?: string;
  tokenManager?: DriveTokenManager;
  parentId?: string;
  selectFolder?: boolean;
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
      const existingScript = document.querySelector<HTMLScriptElement>(
        'script[src*="apis.google.com/js/api.js"]'
      );
      if (existingScript) {
        if (window.gapi) {
          resolve();
          return;
        }
        existingScript.addEventListener("load", () => resolve(), { once: true });
        existingScript.addEventListener("error", (e) => reject(e), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = `https://apis.google.com/js/api.js?cachebust=${Date.now()}`;
      script.async = true;
      script.defer = true;
      script.onload = () => resolve();
      script.onerror = (e) => {
        reject(
          new Error(
            `Failed to load Google API script (${e instanceof Event ? "CSP or Network error" : String(e)})`
          )
        );
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
  let accessToken: string;
  try {
    // Check if token is expired or null, and refresh via drive-token Edge Function before opening Picker
    const peeked = tm.peekToken();
    const isExpiredOrNull =
      !peeked?.value || Date.now() >= peeked.exp - 60_000;

    // Retrieve fresh access token directly from DriveTokenManager right before opening Picker
    accessToken = await tm.get(isExpiredOrNull || true);

    if (!accessToken || typeof accessToken !== "string" || !accessToken.trim()) {
      accessToken = await tm.get(true);
    }

    if (!accessToken || typeof accessToken !== "string" || !accessToken.trim()) {
      throw new Error("Received empty or invalid access token from DriveTokenManager.");
    }
  } catch (err: unknown) {
    bus.emit("drive:reconnect-required", { reason: "token_fetch_failed" });
    throw new Error(
      "Google Drive is not connected or your session has expired. Please sign in or reconnect Google Drive."
    );
  }

  const apiKey =
    process.env.NEXT_PUBLIC_GOOGLE_API_KEY ||
    (typeof env !== "undefined" ? env.NEXT_PUBLIC_GOOGLE_API_KEY : "") ||
    "";
  const appId =
    process.env.NEXT_PUBLIC_GOOGLE_APP_ID ||
    (typeof env !== "undefined" ? env.NEXT_PUBLIC_GOOGLE_APP_ID : "") ||
    "";
  const origin =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "http://localhost:3000";

  if (!window.google?.picker) {
    throw new Error("Google Picker library failed to initialize");
  }

  return new Promise<PickedFileResult | null>((resolve, reject) => {
    try {
      const { picker } = window.google!;
      const docsView = new picker.DocsView(picker.ViewId.DOCS);

      if (typeof docsView.setIncludeFolders === "function") {
        docsView.setIncludeFolders(true);
      }
      if (typeof docsView.setSelectFolderEnabled === "function") {
        docsView.setSelectFolderEnabled(options.selectFolder ?? false);
      }
      if (options.parentId) {
        if (typeof docsView.setParent === "function") {
          docsView.setParent(options.parentId);
        } else if (typeof docsView.setInitialDir === "function") {
          docsView.setInitialDir(options.parentId);
        }
      }

      if (options.mimeTypes) {
        const rawTypes = options.mimeTypes.split(",").map((t) => t.trim());
        const validMimes: string[] = [];

        for (const t of rawTypes) {
          if (!t) continue;
          if (t.toLowerCase() === ".alpha" || t.toLowerCase() === "alpha") {
            const alphaMimes = [
              "application/octet-stream",
              "application/zip",
              "application/x-zip-compressed",
              "application/x-zip",
            ];
            for (const am of alphaMimes) {
              if (!validMimes.includes(am)) validMimes.push(am);
            }
          } else if (!t.startsWith(".")) {
            if (!validMimes.includes(t)) validMimes.push(t);
          }
        }

        if (options.selectFolder && !validMimes.includes("application/vnd.google-apps.folder")) {
          validMimes.push("application/vnd.google-apps.folder");
        }

        if (validMimes.length > 0) {
          docsView.setMimeTypes(validMimes.join(","));
        }
      }

      const builder = new picker.PickerBuilder()
        .setOAuthToken(accessToken)
        .setDeveloperKey(apiKey);

      if (appId) {
        builder.setAppId(appId);
      }

      if (typeof builder.setOrigin === "function") {
        builder.setOrigin(origin);
      }

      builder
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
          const type = String((doc as Record<string, unknown>).type || "");
          const isFolder =
            mimeType === "application/vnd.google-apps.folder" ||
            type === "folder" ||
            Boolean((doc as Record<string, unknown>).isFolder);

          if (isFolder) {
            resolve({
              fileId,
              name,
              mimeType: "application/vnd.google-apps.folder",
              isFolder: true,
            });
            return;
          }

          try {
            const blob = await downloadFileBlob(fileId, tm);
            resolve({ fileId, name, mimeType, blob, isFolder: false });
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
