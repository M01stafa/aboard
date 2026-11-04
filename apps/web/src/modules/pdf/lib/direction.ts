export type Dir = "rtl" | "ltr";

const STRONG_RTL = /[\p{Script=Arabic}\p{Script=Hebrew}]/u;
const STRONG_LTR = /\p{Script=Latin}/u;

/**
 * Detects base text direction using Unicode First Strong rule (similar to dir="auto").
 * Ignores neutral characters (whitespace, numbers, punctuation).
 */
export function detectDirection(text: string): Dir {
  if (!text) return "ltr";
  for (const ch of text) {
    if (STRONG_RTL.test(ch)) return "rtl";
    if (STRONG_LTR.test(ch)) return "ltr";
  }
  return "ltr";
}
