import { describe, it, expect } from "vitest";
import { processStampImage } from "./image-stamp-utils";

describe("processStampImage", () => {
  it("computes proportional dimensions for an image without stretching", async () => {
    // 1x1 base64 transparent PNG
    const pngBase64 =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const binary = Buffer.from(pngBase64, "base64");
    const file = new File([binary], "test.png", { type: "image/png" });

    const result = await processStampImage(file);
    expect(result).toBeDefined();
    expect(result.buffer).toBeInstanceOf(ArrayBuffer);
    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });
});
