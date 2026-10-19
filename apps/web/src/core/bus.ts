import mitt from "mitt";

export type SaveState =
  | "saved-local"
  | "saving-local"
  | "saved-drive"
  | "syncing-drive"
  | "offline"
  | "error";

export type AppEvents = {
  "pdf:page-to-board": {
    docItemId: string;
    page: number;
    image: Blob;
    width: number;
    height: number;
    targetBoardTabId?: string;
    sourceTabId?: string;
  };
  "circuit:to-board": {
    circuitItemId: string;
    svg: string;
    targetBoardTabId?: string;
    sourceTabId?: string;
  };
  "board:to-pdf": {
    boardItemId: string;
    image: Blob;
    targetPdfItemId?: string;
    sourceTabId?: string;
  };
  "pdf:selection": {
    docItemId: string;
    page: number;
    text: string;
    targetBoardTabId?: string;
    sourceTabId?: string;
  };
  "pdf:navigate-page": {
    itemId?: string;
    page: number;
  };
  "pdf:item-updated": {
    itemId: string;
  };
  "navigate:alpha": {
    url: string;
  };
  "save:status": {
    projectId: string;
    state: SaveState;
  };
  "drive:reconnect-required": { reason?: string } | Record<string, never>;
  "drive:connected": { email?: string | null };
  "drive:disconnected": Record<string, never>;
  "drive:quota-exceeded": { exceeded: boolean };
  "drive:open-export-dialog": Record<string, never>;
};

export const bus = mitt<AppEvents>();

