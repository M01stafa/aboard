export interface ParsedAlphaPdfLink {
  type: "pdf";
  itemId: string;
  page: number;
}

/**
 * Parses an internal alpha:// deep link.
 * Format: alpha://pdf/<itemId>#page=<n>
 */
export function parseAlphaLink(linkStr: string): ParsedAlphaPdfLink | null {
  if (!linkStr || typeof linkStr !== "string" || !linkStr.startsWith("alpha://")) {
    return null;
  }

  try {
    const withoutProtocol = linkStr.slice("alpha://".length);
    const [pathPart, fragmentPart] = withoutProtocol.split("#");
    const segments = pathPart.split("/").filter(Boolean);

    if (segments.length < 2) return null;
    const [kind, itemId] = segments;

    if (kind !== "pdf" || !itemId) return null;

    let page = 1;
    if (fragmentPart) {
      const match = fragmentPart.match(/page=(\d+)/i);
      if (match) {
        const parsedPage = parseInt(match[1], 10);
        if (!isNaN(parsedPage) && parsedPage >= 1) {
          page = parsedPage;
        }
      }
    }

    return {
      type: "pdf",
      itemId,
      page,
    };
  } catch {
    return null;
  }
}

/**
 * Formats an internal alpha:// link for a PDF document page.
 * Supports positional (itemId, page) or object ({ itemId, page }) arguments.
 */
export function formatAlphaLink(
  itemIdOrOptions: string | { itemId: string; page?: number; type?: "pdf" },
  pageArg: number = 1
): string {
  if (typeof itemIdOrOptions === "object" && itemIdOrOptions !== null) {
    const safePage = Math.max(1, Math.floor(itemIdOrOptions.page || 1));
    return `alpha://pdf/${itemIdOrOptions.itemId}#page=${safePage}`;
  }
  const safePage = Math.max(1, Math.floor(pageArg || 1));
  return `alpha://pdf/${itemIdOrOptions}#page=${safePage}`;
}
