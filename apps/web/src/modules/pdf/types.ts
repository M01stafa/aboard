import type { Tab } from "@/workspace/types";
import type { ProjectService } from "@/core/storage";

/**
 * Payload stored for an immutable PDF item within a project.
 * Conforms to docs/specs/modules.md §7.3 and docs/specs/alpha-format.md §12.3.
 */
export interface PdfItemPayload {
  type: "alpha-pdf";
  version: 1;
  fileKey: string; // Content-addressed SHA-256 hash of the immutable PDF binary
  name?: string;
  lastPage: number; // 1-based page number last viewed by the student
}

export interface PdfPaneProps {
  projectId: string;
  tab: Tab;
  visible: boolean;
  onMount?: (tabId: string, token: string) => void;
  projectServiceOverride?: ProjectService;
}
