import type { TranslationDictionary } from "./en";

export type Language = "en" | "ar";
export type Direction = "ltr" | "rtl";
export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

type NestedKeyOf<ObjectType extends object> = {
  [Key in keyof ObjectType & (string | number)]: ObjectType[Key] extends object
    ? `${Key}.${NestedKeyOf<ObjectType[Key]>}`
    : `${Key}`;
}[keyof ObjectType & (string | number)];

export type I18nKey = NestedKeyOf<TranslationDictionary>;
