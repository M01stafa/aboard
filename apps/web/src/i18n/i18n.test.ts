import { describe, expect, it } from "vitest";
import { ar } from "./ar";
import { en } from "./en";
import { getDirection, getTranslation } from "./i18n";
import type { I18nKey } from "./types";

function extractKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  let keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object") {
      keys = keys.concat(extractKeys(v as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys.sort();
}

describe("i18n translation system", () => {
  it("has exact key parity between English and Arabic dictionaries", () => {
    const enKeys = extractKeys(en as unknown as Record<string, unknown>);
    const arKeys = extractKeys(ar as unknown as Record<string, unknown>);
    expect(enKeys).toEqual(arKeys);
  });

  it("correctly determines layout direction", () => {
    expect(getDirection("ar")).toBe("rtl");
    expect(getDirection("en")).toBe("ltr");
  });

  it("resolves basic translations in both languages", () => {
    expect(getTranslation("en", "common.appName")).toBe("Aboard");
    expect(getTranslation("ar", "common.appName")).toBe("أبورد");
    expect(getTranslation("en", "settings.title")).toBe("Settings");
    expect(getTranslation("ar", "settings.title")).toBe("الإعدادات");
  });

  it("replaces parameters in translation strings", () => {
    const enText = getTranslation("en", "launcher.welcomeUser" as I18nKey, { email: "user@example.com" });
    expect(enText).toBe("Welcome, user@example.com");

    const arText = getTranslation("ar", "launcher.welcomeUser" as I18nKey, { email: "user@example.com" });
    expect(arText).toBe("مرحباً، user@example.com");
  });

  it("falls back to English when a key is missing in Arabic", () => {
    // If an unknown key is queried
    const result = getTranslation("ar", "nonexistent.key" as unknown as I18nKey);
    expect(result).toBe("nonexistent.key");
  });
});
