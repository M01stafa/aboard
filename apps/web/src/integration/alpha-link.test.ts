import { describe, it, expect } from "vitest";
import { parseAlphaLink, formatAlphaLink } from "./alpha-link";

describe("alpha-link", () => {
  describe("parseAlphaLink", () => {
    it("parses valid alpha://pdf/<itemId>#page=<n> link", () => {
      const parsed = parseAlphaLink("alpha://pdf/anatomy-doc#page=5");
      expect(parsed).toEqual({
        type: "pdf",
        itemId: "anatomy-doc",
        page: 5,
      });
    });

    it("defaults page to 1 when fragment is missing", () => {
      const parsed = parseAlphaLink("alpha://pdf/lecture-notes");
      expect(parsed).toEqual({
        type: "pdf",
        itemId: "lecture-notes",
        page: 1,
      });
    });

    it("handles invalid or non-numeric page gracefully", () => {
      const parsed = parseAlphaLink("alpha://pdf/lecture-notes#page=invalid");
      expect(parsed).toEqual({
        type: "pdf",
        itemId: "lecture-notes",
        page: 1,
      });
    });

    it("returns null for external URLs", () => {
      expect(parseAlphaLink("https://example.com/doc#page=2")).toBeNull();
      expect(parseAlphaLink("http://localhost:3000")).toBeNull();
      expect(parseAlphaLink("mailto:test@example.com")).toBeNull();
    });

    it("returns null for malformed alpha links", () => {
      expect(parseAlphaLink("")).toBeNull();
      expect(parseAlphaLink("alpha://")).toBeNull();
      expect(parseAlphaLink("alpha://circuit/123")).toBeNull(); // unsupported kind
      expect(parseAlphaLink("alpha://pdf/")).toBeNull(); // missing itemId
    });
  });

  describe("formatAlphaLink", () => {
    it("formats itemId and page number into canonical alpha:// link", () => {
      expect(formatAlphaLink("doc-123", 4)).toBe("alpha://pdf/doc-123#page=4");
      expect(formatAlphaLink("doc-456", 1)).toBe("alpha://pdf/doc-456#page=1");
    });

    it("clamps negative or zero page numbers to 1", () => {
      expect(formatAlphaLink("doc-123", 0)).toBe("alpha://pdf/doc-123#page=1");
      expect(formatAlphaLink("doc-123", -5)).toBe("alpha://pdf/doc-123#page=1");
    });
  });
});
