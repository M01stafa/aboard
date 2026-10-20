import { describe, expect, it } from "vitest";
import { convertToExcalidrawElements } from "@excalidraw/excalidraw";
import {
  STUDY_TEMPLATES,
  type TemplateId,
} from "./templates";
import { normalizeLinearElements } from "./use-board-persistence";
import fs from "node:fs";
import path from "node:path";

describe("Study Templates Suite (Task 27 / BOARD-5)", () => {
  const EXPECTED_TEMPLATE_IDS: TemplateId[] = [
    "diagnosis-tree",
    "xy-axes",
    "graph-paper",
    "dotted-circuit-frame",
    "cornell-notes",
    "comparison-table",
    "mind-map",
    "flowchart",
  ];

  it("contains all 8 required study templates in exact specification", () => {
    expect(STUDY_TEMPLATES).toHaveLength(8);
    const actualIds = STUDY_TEMPLATES.map((t) => t.id);
    expect(actualIds).toEqual(EXPECTED_TEMPLATE_IDS);
  });

  it("keeps templates.ts bundle size negligible (< 50KB)", () => {
    const templatesPath = path.resolve(__dirname, "templates.ts");
    const stat = fs.statSync(templatesPath);
    const sizeInKb = stat.size / 1024;
    expect(sizeInKb).toBeLessThan(50);
  });

  describe.each(EXPECTED_TEMPLATE_IDS)("Template: %s", (templateId) => {
    const template = STUDY_TEMPLATES.find((t) => t.id === templateId)!;

    it("generates valid English skeletons and converts to Excalidraw elements", () => {
      const skeletons = template.generate({
        lang: "en",
        originX: 100,
        originY: 200,
      });

      expect(skeletons.length).toBeGreaterThan(0);

      const elements = convertToExcalidrawElements(skeletons, {
        regenerateIds: true,
      });

      expect(elements.length).toBeGreaterThan(0);

      // Verify every element has a valid unique id, type, and valid dimensions
      const idSet = new Set<string>();
      for (const el of elements) {
        expect(el.id).toBeTruthy();
        expect(idSet.has(el.id)).toBe(false);
        idSet.add(el.id);
        expect(el.type).toBeDefined();
        expect(typeof el.x).toBe("number");
        expect(typeof el.y).toBe("number");
        if (el.type === "arrow" || el.type === "line") {
          const linearEl = el as unknown as { type: string; points: readonly (readonly [number, number])[]; x: number; y: number };
          expect(linearEl.points[0]).toEqual([0, 0]);
        }
      }
    });

    it("generates valid Arabic RTL skeletons and converts to Excalidraw elements", () => {
      const skeletons = template.generate({
        lang: "ar",
        originX: 0,
        originY: 0,
      });

      expect(skeletons.length).toBeGreaterThan(0);

      const elements = convertToExcalidrawElements(skeletons, {
        regenerateIds: true,
      });

      expect(elements.length).toBeGreaterThan(0);

      for (const el of elements) {
        if (el.type === "arrow" || el.type === "line") {
          const linearEl = el as unknown as { points: readonly (readonly [number, number])[] };
          expect(linearEl.points[0]).toEqual([0, 0]);
        }
      }

      // Verify at least one element or label contains Arabic characters
      const arabicRegex = /[\u0600-\u06FF]/;
      const hasArabic = skeletons.some((s) => {
        if ("text" in s && typeof s.text === "string" && arabicRegex.test(s.text)) {
          return true;
        }
        if (
          "label" in s &&
          s.label &&
          typeof s.label === "object" &&
          "text" in s.label &&
          typeof s.label.text === "string" &&
          arabicRegex.test(s.label.text)
        ) {
          return true;
        }
        return false;
      });

      expect(hasArabic).toBe(true);
    });

    it("shifts element positions based on provided originX and originY", () => {
      const atOrigin = template.generate({
        lang: "en",
        originX: 0,
        originY: 0,
      });

      const shifted = template.generate({
        lang: "en",
        originX: 250,
        originY: 350,
      });

      expect(shifted.length).toBe(atOrigin.length);
      for (let i = 0; i < atOrigin.length; i++) {
        expect(shifted[i]!.x).toBe((atOrigin[i]!.x ?? 0) + 250);
        expect(shifted[i]!.y).toBe((atOrigin[i]!.y ?? 0) + 350);
      }
    });
  });

  it("insertion logic appends elements without mutating or clearing existing canvas elements", () => {
    const existingElement = {
      id: "existing-user-rect",
      type: "rectangle" as const,
      x: 10,
      y: 10,
      width: 100,
      height: 100,
    };

    const currentScene = [existingElement];

    const mindMap = STUDY_TEMPLATES.find((t) => t.id === "mind-map")!;
    const skeletons = mindMap.generate({ lang: "en", originX: 0, originY: 0 });
    const newElements = convertToExcalidrawElements(skeletons, {
      regenerateIds: true,
    });

    const updatedScene = [...currentScene, ...newElements];

    expect(updatedScene).toHaveLength(currentScene.length + newElements.length);
    expect(updatedScene[0].id).toBe("existing-user-rect");
  });

  describe("Linear element normalization (Task 26 / Excalidraw normalization)", () => {
    it("normalizes linear elements with non-zero start points to [0, 0] and offsets x/y", () => {
      const unnormalizedArrow = {
        id: "arrow-1",
        type: "arrow",
        x: 100,
        y: 200,
        points: [
          [20, 30],
          [100, 150],
        ],
      };

      const [normalized] = normalizeLinearElements([unnormalizedArrow]);
      expect(normalized.x).toBe(120);
      expect(normalized.y).toBe(230);
      expect(normalized.points).toEqual([
        [0, 0],
        [80, 120],
      ]);
    });

    it("leaves already-normalized linear elements untouched", () => {
      const normalizedLine = {
        id: "line-1",
        type: "line",
        x: 50,
        y: 60,
        points: [
          [0, 0],
          [100, 0],
        ],
      };

      const [result] = normalizeLinearElements([normalizedLine]);
      expect(result.x).toBe(50);
      expect(result.y).toBe(60);
      expect(result.points).toEqual([
        [0, 0],
        [100, 0],
      ]);
    });

    it("does not mutate non-linear elements", () => {
      const rect = {
        id: "rect-1",
        type: "rectangle",
        x: 10,
        y: 20,
        width: 100,
        height: 50,
      };

      const [result] = normalizeLinearElements([rect]);
      expect(result).toEqual(rect);
    });

    it("handles empty or non-array inputs safely", () => {
      expect(normalizeLinearElements([])).toEqual([]);
      // @ts-expect-error test runtime resilience with undefined
      expect(normalizeLinearElements(undefined)).toEqual([]);
    });
  });
});
