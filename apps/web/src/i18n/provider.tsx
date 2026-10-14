"use client";

import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  detectBrowserLanguage,
  getDirection,
  getTranslation,
  LANGUAGE_STORAGE_KEY,
  THEME_STORAGE_KEY,
} from "./i18n";
import type { Direction, I18nKey, Language, ResolvedTheme, Theme } from "./types";

interface I18nContextValue {
  language: Language;
  dir: Direction;
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setLanguage: (lang: Language) => void;
  setTheme: (theme: Theme) => void;
  t: (key: I18nKey, params?: Record<string, string>) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function getInitialLanguage(): Language {
  if (typeof window === "undefined") return "en";
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored === "en" || stored === "ar") return stored;
    return detectBrowserLanguage();
  } catch {
    return "en";
  }
}

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "system";
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
    return "system";
  } catch {
    return "system";
  }
}

function getInitialSystemDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(getInitialLanguage);
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);
  const [systemIsDark, setSystemIsDark] = useState<boolean>(getInitialSystemDark);

  const dir: Direction = useMemo(() => getDirection(language), [language]);
  const resolvedTheme: ResolvedTheme = useMemo(() => {
    return theme === "system" ? (systemIsDark ? "dark" : "light") : theme;
  }, [theme, systemIsDark]);

  // Synchronize documentElement attributes when language, dir, or theme change
  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = language;
    document.documentElement.dir = dir;
    if (resolvedTheme === "dark") {
      document.documentElement.setAttribute("data-theme", "dark");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
  }, [language, dir, resolvedTheme]);

  // Listen to system color scheme changes
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;

    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => {
      setSystemIsDark(e.matches);
    };

    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  const setLanguage = (newLang: Language) => {
    setLanguageState(newLang);
    try {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, newLang);
    } catch {
      // Storage unavailable or disabled
    }
  };

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, newTheme);
    } catch {
      // Storage unavailable or disabled
    }
  };

  const t = useMemo(() => {
    return (key: I18nKey, params?: Record<string, string>) => {
      return getTranslation(language, key, params);
    };
  }, [language]);

  const contextValue = useMemo<I18nContextValue>(() => {
    return {
      language,
      dir,
      theme,
      resolvedTheme,
      setLanguage,
      setTheme,
      t,
    };
  }, [language, dir, theme, resolvedTheme, t]);

  return (
    <I18nContext.Provider value={contextValue}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}
