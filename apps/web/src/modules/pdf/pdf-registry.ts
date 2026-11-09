import type { CustomInkStroke } from "./pdf-custom-ink-layer";
import type { CustomStickyNote, CustomTextBox } from "./annotation-storage";
import type { BurnStampItem } from "./page-operations";

export interface PdfImperativeAPI {
  addStamp: (
    file: File,
    options?: { pageIndex?: number; x?: number; y?: number; width?: number; height?: number }
  ) => Promise<void>;
  getCurrentPage: () => number;
  getCurrentInkData?: () => {
    customStrokes: Record<number, CustomInkStroke[]>;
    customStickyNotes: Record<number, CustomStickyNote[]>;
    customTextBoxes: Record<number, CustomTextBox[]>;
  };
  getLiveStamps?: () => Promise<BurnStampItem[]>;
  flushAnnotations?: () => Promise<void>;
}

const apis = new Map<string, PdfImperativeAPI>();
const waitQueue = new Map<string, Array<(api: PdfImperativeAPI) => void>>();

/**
 * Registry holding active PDF imperative APIs keyed by workspace tab ID or item ID.
 * Allows cross-tool integration actions (e.g. Board -> PDF overlay) to cleanly target
 * and update PDF scenes without re-mounting or tight coupling.
 */
export const pdfRegistry = {
  register(id: string, api: PdfImperativeAPI): void {
    apis.set(id, api);

    if (typeof window !== "undefined") {
      const win = window as unknown as {
        __aboard_pdfApi?: Record<string, PdfImperativeAPI>;
      };
      win.__aboard_pdfApi = win.__aboard_pdfApi || {};
      win.__aboard_pdfApi[id] = api;
    }

    const waiting = waitQueue.get(id);
    if (waiting && waiting.length > 0) {
      waiting.forEach((cb) => cb(api));
      waitQueue.delete(id);
    }
  },

  unregister(id: string): void {
    apis.delete(id);

    if (typeof window !== "undefined") {
      const win = window as unknown as {
        __aboard_pdfApi?: Record<string, PdfImperativeAPI>;
      };
      if (win.__aboard_pdfApi) {
        delete win.__aboard_pdfApi[id];
      }
    }
  },

  get(id: string): PdfImperativeAPI | undefined {
    return apis.get(id);
  },

  getAll(): PdfImperativeAPI[] {
    return Array.from(apis.values());
  },

  waitFor(id: string, timeoutMs = 5000): Promise<PdfImperativeAPI> {
    const existing = apis.get(id);
    if (existing) {
      return Promise.resolve(existing);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const queue = waitQueue.get(id) || [];
        waitQueue.set(
          id,
          queue.filter((cb) => cb !== callback)
        );
        reject(new Error(`Timed out waiting for PDF API: ${id}`));
      }, timeoutMs);

      const callback = (api: PdfImperativeAPI) => {
        clearTimeout(timer);
        resolve(api);
      };

      const queue = waitQueue.get(id) || [];
      queue.push(callback);
      waitQueue.set(id, queue);
    });
  },

  clear(): void {
    apis.clear();
    waitQueue.clear();
  },
};

