import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";

const apis = new Map<string, ExcalidrawImperativeAPI>();
const waitQueue = new Map<string, Array<(api: ExcalidrawImperativeAPI) => void>>();

/**
 * Registry holding active Excalidraw imperative APIs keyed by workspace tab ID.
 * Allows cross-tool integration actions (INT-1, INT-2) to cleanly target
 * and update whiteboard scenes without re-mounting or tight coupling.
 */
export const boardRegistry = {
  register(tabId: string, api: ExcalidrawImperativeAPI): void {
    apis.set(tabId, api);

    if (typeof window !== "undefined") {
      const win = window as unknown as {
        __aboard_boardApi?: Record<string, ExcalidrawImperativeAPI>;
      };
      win.__aboard_boardApi = win.__aboard_boardApi || {};
      win.__aboard_boardApi[tabId] = api;
    }

    const waiting = waitQueue.get(tabId);
    if (waiting && waiting.length > 0) {
      waiting.forEach((cb) => cb(api));
      waitQueue.delete(tabId);
    }
  },

  unregister(tabId: string): void {
    apis.delete(tabId);

    if (typeof window !== "undefined") {
      const win = window as unknown as {
        __aboard_boardApi?: Record<string, ExcalidrawImperativeAPI>;
      };
      if (win.__aboard_boardApi) {
        delete win.__aboard_boardApi[tabId];
      }
    }
  },

  get(tabId: string): ExcalidrawImperativeAPI | undefined {
    return apis.get(tabId);
  },

  waitFor(tabId: string, timeoutMs = 5000): Promise<ExcalidrawImperativeAPI> {
    const existing = apis.get(tabId);
    if (existing) {
      return Promise.resolve(existing);
    }

    return new Promise<ExcalidrawImperativeAPI>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout>;

      const listener = (api: ExcalidrawImperativeAPI) => {
        clearTimeout(timer);
        resolve(api);
      };

      timer = setTimeout(() => {
        const queue = waitQueue.get(tabId);
        if (queue) {
          const idx = queue.indexOf(listener);
          if (idx !== -1) queue.splice(idx, 1);
        }
        reject(new Error(`Timed out waiting for board API for tab: ${tabId}`));
      }, timeoutMs);

      const queue = waitQueue.get(tabId) || [];
      queue.push(listener);
      waitQueue.set(tabId, queue);
    });
  },

  clear(): void {
    apis.clear();
    waitQueue.clear();
  },
};
