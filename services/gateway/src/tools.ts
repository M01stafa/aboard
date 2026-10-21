/**
 * Stirling-PDF tool endpoint mappings and allow-list.
 * Implements spec §7.4 and Task 40.
 */

export interface ToolDefinition {
  name: string;
  endpoint: string;
  description: string;
}

export const ALLOWED_TOOLS: Record<string, ToolDefinition> = {
  ocr: {
    name: "ocr",
    endpoint: "/api/v1/misc/ocr-pdf",
    description: "Optical Character Recognition (OCR) on PDF documents",
  },
  compress: {
    name: "compress",
    endpoint: "/api/v1/misc/compress-pdf",
    description: "Compress PDF document to reduce file size",
  },
  "office-to-pdf": {
    name: "office-to-pdf",
    endpoint: "/api/v1/convert/file/pdf",
    description: "Convert LibreOffice/MS Office/image documents to PDF",
  },
};

export const ALLOWED_TOOL_NAMES = Object.keys(ALLOWED_TOOLS);

export function getToolDefinition(name: string): ToolDefinition | undefined {
  return ALLOWED_TOOLS[name];
}
