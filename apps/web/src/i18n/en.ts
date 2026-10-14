export const en = {
  common: {
    appName: "Aboard",
    appDescription: "Whiteboard, PDF annotator, and circuit simulator for students",
    settings: "Settings",
    language: "Language",
    theme: "Theme",
    arabic: "العربية",
    english: "English",
    light: "Light",
    dark: "Dark",
    system: "System",
    toggleTheme: "Toggle Theme",
  },
  home: {
    title: "Aboard",
    subtitle: "Alpha board workspace",
    goToSettings: "Settings",
    goToThemeTest: "Theme Test",
  },
  settings: {
    title: "Settings",
    description: "Manage your language, direction, and appearance preferences.",
    languageTitle: "Language & Direction",
    languageDesc: "Select your preferred language. The layout will adapt to right-to-left or left-to-right.",
    themeTitle: "Theme Appearance",
    themeDesc: "Choose between light and dark themes, or sync with your system preference.",
    storageNotice: "Preferences are saved in your browser's local storage.",
    backToHome: "Back to Home",
  },
  themeTest: {
    pageTitle: "Aboard Theme Tokens Verification",
    toggleButton: "Toggle Theme (Current: {theme})",
    surfacesSection: "Surfaces & Semantic Cards",
    surfaceCardTitle: "Surface Card (--bg-surface)",
    surfaceCardDesc: "This is muted text on standard card surface.",
    subtleCardTitle: "Subtle Card (--bg-subtle)",
    subtleCardDesc: "Subtle container background.",
    buttonsSection: "Buttons",
    primaryButton: "Primary Button",
    goldButton: "Gold CTA Button",
    techButton: "Tech Outline Button",
    bronzeButton: "Bronze Button",
    disabledButton: "Disabled Button",
    badgesSection: "Badges & Status",
    primaryBadge: "Primary Badge",
    goldBadge: "Gold Badge",
    techBadge: "Tech Badge",
    bronzeBadge: "Bronze Badge",
    statusSuccess: "Success",
    statusWarning: "Warning",
    statusDanger: "Danger",
    statusInfo: "Info",
    gradientSection: "Accent Gradient (--gradient-accent)",
  },
} as const;

type DeepStringRecord<T> = {
  [K in keyof T]: T[K] extends object ? DeepStringRecord<T[K]> : string;
};

export type TranslationDictionary = DeepStringRecord<typeof en>;
