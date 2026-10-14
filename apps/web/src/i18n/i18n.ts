import { en } from "./en";
import { ar } from "./ar";
import type { Direction, I18nKey, Language } from "./types";

export const LANGUAGE_STORAGE_KEY = "aboard:language";
export const THEME_STORAGE_KEY = "aboard:theme";

export const translations = { en, ar };

export function getDirection(lang: Language): Direction {
  return lang === "ar" ? "rtl" : "ltr";
}

export function detectBrowserLanguage(): Language {
  if (typeof window === "undefined" || !window.navigator) {
    return "en";
  }
  const browserLang = window.navigator.language || (window.navigator as unknown as { userLanguage?: string }).userLanguage || "";
  return browserLang.toLowerCase().startsWith("ar") ? "ar" : "en";
}

export function getTranslation(
  lang: Language,
  key: I18nKey,
  params?: Record<string, string>
): string {
  const dict = translations[lang] || translations.en;
  const parts = key.split(".");
  let current: unknown = dict;

  for (const part of parts) {
    if (current && typeof current === "object" && part in current) {
      current = (current as Record<string, unknown>)[part];
    } else {
      // Fallback to English if missing
      let fallback: unknown = translations.en;
      for (const fallbackPart of parts) {
        if (fallback && typeof fallback === "object" && fallbackPart in fallback) {
          fallback = (fallback as Record<string, unknown>)[fallbackPart];
        } else {
          return key;
        }
      }
      current = fallback;
      break;
    }
  }

  if (typeof current !== "string") {
    return key;
  }

  let text = current;
  if (params) {
    for (const [paramKey, paramValue] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${paramKey}\\}`, "g"), paramValue);
    }
  }

  return text;
}
