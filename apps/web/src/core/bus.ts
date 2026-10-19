import mitt from "mitt";

export type AppEvents = {
  "drive:reconnect-required": { reason?: string } | Record<string, never>;
  "drive:connected": { email?: string | null };
  "drive:disconnected": Record<string, never>;
  "drive:quota-exceeded": { exceeded: boolean };
  "drive:open-export-dialog": Record<string, never>;
};

export const bus = mitt<AppEvents>();
