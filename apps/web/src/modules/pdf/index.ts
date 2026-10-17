import dynamic from "next/dynamic";
import type { PdfPaneProps } from "./types";

/**
 * PdfPane loaded on client-only via next/dynamic with ssr: false,
 * preventing server-side rendering issues with the PDFium WASM binary (ADR-5).
 */
export const PdfPane = dynamic<PdfPaneProps>(
  () => import("./pdf-pane").then((m) => m.PdfPane),
  { ssr: false }
);

export type { PdfPaneProps, PdfItemPayload } from "./types";
export { isMobileDevice } from "./pdf-pane";
