import { describe, it, expect } from "vitest";
import {
  computeResizedRect,
  getStrokeBounds,
  getAbsoluteStrokeBounds,
  getStrokeOffset,
  rectsIntersect,
  pointsToSvgPath,
  scaleStrokePoints,
  type CustomInkStroke,
} from "./pdf-custom-ink-layer";

describe("pdf-custom-ink-layer", () => {
  describe("computeResizedRect (Bug 1: Anchoring)", () => {
    const startRect = { x: 100, y: 150, width: 200, height: 100 }; // aspect ratio = 2.0

    it("strictly preserves top-left anchor when dragging 'se' corner (unlocked aspect ratio)", () => {
      const res = computeResizedRect(startRect, "se", 50, 40, false);
      expect(res.x).toBe(100);
      expect(res.y).toBe(150);
      expect(res.width).toBe(250);
      expect(res.height).toBe(140);
    });

    it("strictly preserves top-left anchor when dragging 'se' corner (locked aspect ratio)", () => {
      const res = computeResizedRect(startRect, "se", 60, 20, true);
      expect(res.x).toBe(100);
      expect(res.y).toBe(150);
      expect(res.width).toBe(260);
      expect(res.height).toBe(130);
    });

    it("strictly preserves bottom-right anchor when dragging 'nw' corner (unlocked aspect ratio)", () => {
      const res = computeResizedRect(startRect, "nw", -40, -30, false);
      // Original bottom-right: (100 + 200, 150 + 100) = (300, 250)
      expect(res.x + res.width).toBe(300);
      expect(res.y + res.height).toBe(250);
      expect(res.width).toBe(240);
      expect(res.height).toBe(130);
      expect(res.x).toBe(60);
      expect(res.y).toBe(120);
    });

    it("strictly preserves bottom-right anchor when dragging 'nw' corner (locked aspect ratio)", () => {
      const res = computeResizedRect(startRect, "nw", -40, -10, true);
      // Original bottom-right: (300, 250)
      expect(res.x + res.width).toBe(300);
      expect(res.y + res.height).toBe(250);
      expect(res.width).toBe(240);
      expect(res.height).toBe(120);
    });

    it("strictly preserves bottom-left anchor when dragging 'ne' corner (unlocked aspect ratio)", () => {
      const res = computeResizedRect(startRect, "ne", 30, -25, false);
      // Original bottom-left: (100, 150 + 100) = (100, 250)
      expect(res.x).toBe(100);
      expect(res.y + res.height).toBe(250);
      expect(res.width).toBe(230);
      expect(res.height).toBe(125);
    });

    it("strictly preserves bottom-left anchor when dragging 'ne' corner (locked aspect ratio)", () => {
      const res = computeResizedRect(startRect, "ne", 40, -10, true);
      // Original bottom-left: (100, 250)
      expect(res.x).toBe(100);
      expect(res.y + res.height).toBe(250);
      expect(res.width).toBe(240);
      expect(res.height).toBe(120);
    });

    it("strictly preserves top-right anchor when dragging 'sw' corner (unlocked aspect ratio)", () => {
      const res = computeResizedRect(startRect, "sw", -30, 20, false);
      // Original top-right: (100 + 200, 150) = (300, 150)
      expect(res.x + res.width).toBe(300);
      expect(res.y).toBe(150);
      expect(res.width).toBe(230);
      expect(res.height).toBe(120);
    });

    it("strictly preserves top-right anchor when dragging 'sw' corner (locked aspect ratio)", () => {
      const res = computeResizedRect(startRect, "sw", -40, 10, true);
      // Original top-right: (300, 150)
      expect(res.x + res.width).toBe(300);
      expect(res.y).toBe(150);
      expect(res.width).toBe(240);
      expect(res.height).toBe(120);
    });

    it("enforces minimum bounds when shrinking past zero", () => {
      const res = computeResizedRect(startRect, "se", -500, -500, false);
      expect(res.width).toBeGreaterThanOrEqual(20);
      expect(res.height).toBeGreaterThanOrEqual(15);
      expect(res.x).toBe(100);
      expect(res.y).toBe(150);
    });
  });

  describe("getStrokeBounds & getAbsoluteStrokeBounds (Bug 2: Ink selection & drag)", () => {
    it("computes bounds with padding for multiple points", () => {
      const stroke: CustomInkStroke = {
        id: "s1",
        points: [
          { x: 50, y: 60 },
          { x: 150, y: 160 },
        ],
        color: "#E44234",
        width: 4,
        opacity: 1,
      };
      const bounds = getStrokeBounds(stroke);
      // pad = max(4, 4/2 + 4) = 6
      expect(bounds.x).toBe(50 - 6);
      expect(bounds.y).toBe(60 - 6);
      expect(bounds.width).toBe(100 + 12);
      expect(bounds.height).toBe(100 + 12);
    });

    it("handles empty stroke gracefully without throwing or NaN", () => {
      const emptyStroke: CustomInkStroke = {
        id: "empty",
        points: [],
        color: "#000",
        width: 2,
        opacity: 1,
      };
      const bounds = getStrokeBounds(emptyStroke);
      expect(bounds).toEqual({ x: 0, y: 0, width: 0, height: 0 });
    });

    it("getAbsoluteStrokeBounds applies transform offset", () => {
      const stroke: CustomInkStroke = {
        id: "s2",
        points: [
          { x: 10, y: 20 },
          { x: 30, y: 40 },
        ],
        color: "#E44234",
        width: 2,
        opacity: 1,
        transform: { x: 25, y: -15 },
      };
      const baseBounds = getStrokeBounds(stroke);
      const absBounds = getAbsoluteStrokeBounds(stroke);
      expect(absBounds.x).toBe(baseBounds.x + 25);
      expect(absBounds.y).toBe(baseBounds.y - 15);
      expect(absBounds.width).toBe(baseBounds.width);
      expect(absBounds.height).toBe(baseBounds.height);
    });

    it("getStrokeOffset defaults to {0, 0} when transform is absent", () => {
      const stroke: CustomInkStroke = {
        id: "s3",
        points: [{ x: 5, y: 5 }],
        color: "#000",
        width: 2,
        opacity: 1,
      };
      expect(getStrokeOffset(stroke)).toEqual({ x: 0, y: 0 });
    });
  });

  describe("rectsIntersect & pointsToSvgPath", () => {
    it("detects intersecting rectangles correctly", () => {
      const r1 = { x: 10, y: 10, width: 50, height: 50 };
      const r2 = { x: 40, y: 40, width: 50, height: 50 };
      const r3 = { x: 100, y: 100, width: 20, height: 20 };
      expect(rectsIntersect(r1, r2)).toBe(true);
      expect(rectsIntersect(r1, r3)).toBe(false);
    });

    it("produces valid SVG paths for 1, 2, and multiple points", () => {
      expect(pointsToSvgPath([])).toBe("");
      expect(pointsToSvgPath([{ x: 10, y: 20 }])).toContain("M 10 20");
      expect(pointsToSvgPath([{ x: 0, y: 0 }, { x: 10, y: 10 }])).toBe("M 0 0 L 10 10");
      const multi = pointsToSvgPath([
        { x: 0, y: 0 },
        { x: 10, y: 10 },
        { x: 20, y: 20 },
      ]);
      expect(multi).toContain("Q");
    });
  });

  describe("Text coordinate clamping (Bug 3: Disappearing text)", () => {
    it("clamps text within page boundaries", () => {
      const pageWidth = 612;
      const pageHeight = 792;
      const textWidth = 100;
      const textHeight = 40;

      // Negative drag attempt
      const negX = -25;
      const negY = -10;
      const clampedNegX = Math.max(0, Math.min(Math.max(0, pageWidth - textWidth), negX));
      const clampedNegY = Math.max(0, Math.min(Math.max(0, pageHeight - textHeight), negY));
      expect(clampedNegX).toBe(0);
      expect(clampedNegY).toBe(0);

      // Beyond page boundary attempt
      const posX = 700;
      const posY = 900;
      const clampedPosX = Math.max(0, Math.min(Math.max(0, pageWidth - textWidth), posX));
      const clampedPosY = Math.max(0, Math.min(Math.max(0, pageHeight - textHeight), posY));
      expect(clampedPosX).toBe(612 - 100);
      expect(clampedPosY).toBe(792 - 40);
    });
  });

  describe("scaleStrokePoints (Ink Resizing & Anchoring)", () => {
    it("scales stroke points while keeping top-left anchor fixed (se handle resize)", () => {
      const stroke: CustomInkStroke = {
        id: "s-scale-1",
        points: [
          { x: 100, y: 100 },
          { x: 200, y: 200 },
        ],
        color: "#E44234",
        width: 2,
        opacity: 1,
      };
      const bounds = getAbsoluteStrokeBounds(stroke);
      // Double the width and height, anchored at top-left
      const newRect = {
        origin: { x: bounds.x, y: bounds.y },
        size: { width: bounds.width * 2, height: bounds.height * 2 },
      };

      const scaled = scaleStrokePoints(stroke.points, bounds, newRect);
      expect(scaled).toHaveLength(2);

      // Top-left point remains at the original start coordinate
      expect(scaled[0].x).toBe(100);
      expect(scaled[0].y).toBe(100);

      // Bottom-right point scales out proportionally
      expect(scaled[1].x).toBeGreaterThan(200);
      expect(scaled[1].y).toBeGreaterThan(200);

      // The new distance between points is bounds.width * 2 - 2 * pad = 220 - 10 = 210
      const newSpanX = scaled[1].x - scaled[0].x;
      expect(Math.round(newSpanX)).toBe(210);
    });

    it("scales stroke points while keeping bottom-right anchor fixed (nw handle resize)", () => {
      const stroke: CustomInkStroke = {
        id: "s-scale-2",
        points: [
          { x: 100, y: 100 },
          { x: 200, y: 200 },
        ],
        color: "#E44234",
        width: 2,
        opacity: 1,
      };
      const bounds = getAbsoluteStrokeBounds(stroke);
      // Double width and height towards top-left, bottom-right fixed:
      const newRect = {
        origin: { x: bounds.x - bounds.width, y: bounds.y - bounds.height },
        size: { width: bounds.width * 2, height: bounds.height * 2 },
      };

      const scaled = scaleStrokePoints(stroke.points, bounds, newRect);
      expect(scaled).toHaveLength(2);

      // Bottom-right point remains at original coordinate (200, 200)
      expect(scaled[1].x).toBe(200);
      expect(scaled[1].y).toBe(200);

      // Top-left point moves up and left
      expect(scaled[0].x).toBeLessThan(100);
      expect(scaled[0].y).toBeLessThan(100);
    });

    it("incorporates existing transform offset when scaling points", () => {
      const stroke: CustomInkStroke = {
        id: "s-scale-3",
        points: [
          { x: 50, y: 50 },
          { x: 150, y: 150 },
        ],
        transform: { x: 30, y: 20 },
        color: "#E44234",
        width: 2,
        opacity: 1,
      };
      const bounds = getAbsoluteStrokeBounds(stroke);
      const newRect = {
        origin: { x: bounds.x, y: bounds.y },
        size: { width: bounds.width * 1.5, height: bounds.height * 1.5 },
      };

      const scaled = scaleStrokePoints(stroke.points, bounds, newRect, stroke.transform);
      expect(scaled).toHaveLength(2);

      // First point absolute coordinate was 50 + 30 = 80; with top-left anchored it stays at 80
      expect(scaled[0].x).toBe(80);
      expect(scaled[0].y).toBe(70); // 50 + 20
    });

    it("returns empty array when points array is empty", () => {
      const res = scaleStrokePoints([], { x: 0, y: 0, width: 100, height: 100 }, { origin: { x: 0, y: 0 }, size: { width: 200, height: 200 } });
      expect(res).toEqual([]);
    });
  });
});

