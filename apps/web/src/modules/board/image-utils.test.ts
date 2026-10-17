// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import {
  blobToDataURL,
  compressImageIfNeeded,
  dataURLToBlob,
  extractImageFileIds,
  MAX_ALLOWED_FILE_BYTES,
} from "./image-utils";

describe("image-utils (BOARD-2, BOARD-3)", () => {
  describe("dataURLToBlob & blobToDataURL roundtrip", () => {
    it("converts a base64 data URL to a binary Blob with correct MIME type", async () => {
      // 4-pixel transparent PNG
      const pngDataURL =
        "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVQIW2Nk+M/wn4GBgYGJgQEACOID/9mO2xIAAAAASUVORK5CYII=";

      const blob = dataURLToBlob(pngDataURL);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe("image/png");
      expect(blob.size).toBeGreaterThan(0);

      const roundtrippedURL = await blobToDataURL(blob);
      expect(roundtrippedURL).toBe(pngDataURL);
    });

    it("handles arbitrary MIME types in data URLs", async () => {
      const webpDataURL = "data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";
      const blob = dataURLToBlob(webpDataURL);
      expect(blob.type).toBe("image/webp");
      expect(blob.size).toBeGreaterThan(0);
    });

    it("returns an empty blob for malformed data URLs without comma", () => {
      const blob = dataURLToBlob("not-a-valid-data-url");
      expect(blob.size).toBe(0);
      expect(blob.type).toBe("application/octet-stream");
    });
  });

  describe("extractImageFileIds", () => {
    it("extracts unique file IDs from image elements", () => {
      const elements = [
        { id: "e1", type: "rectangle", x: 10, y: 10 },
        { id: "e2", type: "image", fileId: "file-abc", x: 20, y: 20 },
        { id: "e3", type: "image", fileId: "file-xyz", x: 30, y: 30 },
        { id: "e4", type: "image", fileId: "file-abc", x: 40, y: 40 }, // duplicate
        { id: "e5", type: "image", fileId: "", x: 50, y: 50 }, // empty
        { id: "e6", type: "ellipse", x: 60, y: 60 },
      ];

      const ids = extractImageFileIds(elements);
      expect(ids.sort()).toEqual(["file-abc", "file-xyz"].sort());
    });

    it("returns empty array for invalid or empty elements", () => {
      // @ts-expect-error test non-array
      expect(extractImageFileIds(null)).toEqual([]);
      // @ts-expect-error test non-array
      expect(extractImageFileIds(undefined)).toEqual([]);
      expect(extractImageFileIds([])).toEqual([]);
    });
  });

  describe("compressImageIfNeeded (4MB cap / BOARD-3)", () => {
    it("leaves small images under 4MB untouched", async () => {
      const smallBlob = new Blob([new Uint8Array(1024 * 100)], { type: "image/png" });
      const result = await compressImageIfNeeded(smallBlob);
      expect(result).toBe(smallBlob);
      expect(result.size).toBe(1024 * 100);
    });

    it("leaves SVGs untouched regardless of size", async () => {
      const svgBlob = new Blob(["<svg></svg>"], { type: "image/svg+xml" });
      const result = await compressImageIfNeeded(svgBlob);
      expect(result).toBe(svgBlob);
    });

    it("compresses simulated 5MB image down to within 4MB cap", async () => {
      // Simulate a 5MB image
      const fiveMbSize = 5 * 1024 * 1024;
      const largeBlob = new Blob([new Uint8Array(fiveMbSize)], { type: "image/jpeg" });

      const compressed = await compressImageIfNeeded(largeBlob, MAX_ALLOWED_FILE_BYTES);

      expect(compressed.size).toBeLessThanOrEqual(MAX_ALLOWED_FILE_BYTES);
    });

    it("uses canvas 2D downscaling when canvas context is available", async () => {
      const canvasMock = {
        width: 0,
        height: 0,
        getContext: vi.fn(() => ({
          clearRect: vi.fn(),
          drawImage: vi.fn(),
        })),
        toBlob: vi.fn((cb: (b: Blob) => void) => {
          // Return a 1MB compressed blob
          cb(new Blob([new Uint8Array(1024 * 1024)], { type: "image/webp" }));
        }),
      };

      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, "createElement").mockImplementation((tagName: string) => {
        if (tagName.toLowerCase() === "canvas") {
          return canvasMock as unknown as HTMLCanvasElement;
        }
        return originalCreateElement(tagName);
      });

      // Mock createImageBitmap
      globalThis.createImageBitmap = vi.fn().mockResolvedValue({
        ["width"]: 3840,
        ["height"]: 2160,
        close: vi.fn(),
      } as unknown as ImageBitmap);

      const fiveMbSize = 5 * 1024 * 1024;
      const largeBlob = new Blob([new Uint8Array(fiveMbSize)], { type: "image/jpeg" });

      const compressed = await compressImageIfNeeded(largeBlob);

      expect(compressed.size).toBe(1024 * 1024);
      expect(compressed.size).toBeLessThan(MAX_ALLOWED_FILE_BYTES);
    });
  });
});
