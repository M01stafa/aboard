import bidiFactory from "bidi-js";
// @ts-expect-error - arabic-reshaper does not ship default TS types
import ArabicReshaper from "arabic-reshaper";
import { Dir } from "./direction";

// Initialize bidi algorithm instance once
const bidi = bidiFactory();

/**
 * Converts logical text line (Arabic / English / Mixed) to visual glyphs for PDF engines.
 * 1. Reshapes Arabic letters into connected presentation forms (ـبـ , etc.).
 * 2. Mirrors matching punctuation/brackets and reorders directional runs visually
 *    so standard LTR PDF canvas/font engines draw correctly.
 */
export function toVisual(line: string, baseDir: Dir): string {
  if (!line) return line;

  // 1) Shape Arabic letters into connected presentation forms
  const shaped: string =
    typeof ArabicReshaper?.convertArabic === "function"
      ? ArabicReshaper.convertArabic(line)
      : line;

  // 2) Direction embedding levels
  const embedding = bidi.getEmbeddingLevels(shaped, baseDir);

  // 3) Visual reordering + mirroring
  return bidi.getReorderedString(shaped, embedding);
}
