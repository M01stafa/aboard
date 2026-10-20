import type { Metadata } from "next";
import "@/core/env";
import "@/theme/tokens.css";
import { fontClassNames } from "@/theme/fonts";
import { I18nProvider } from "@/i18n/provider";

export const metadata: Metadata = {
  title: "Aboard",
  description: "Whiteboard, PDF annotator, and circuit simulator for students",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      dir="ltr"
      className={fontClassNames}
      suppressHydrationWarning
    >
      <head>
        <script id="theme-lang-init" suppressHydrationWarning>
          {`
            (function() {
              try {
                var lang = localStorage.getItem('aboard:language');
                if (!lang) {
                  var nav = window.navigator.language || '';
                  lang = nav.toLowerCase().startsWith('ar') ? 'ar' : 'en';
                }
                var dir = lang === 'ar' ? 'rtl' : 'ltr';
                document.documentElement.lang = lang;
                document.documentElement.dir = dir;

                var theme = localStorage.getItem('aboard:theme') || 'system';
                var resolvedTheme = theme;
                if (theme === 'system') {
                  resolvedTheme = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
                }
                if (resolvedTheme === 'dark') {
                  document.documentElement.setAttribute('data-theme', 'dark');
                } else {
                  document.documentElement.removeAttribute('data-theme');
                }
              } catch (e) {}
            })();
          `}
        </script>
        <script id="excalidraw-asset-path" suppressHydrationWarning>
          {`window.EXCALIDRAW_ASSET_PATH = "/";`}
        </script>
      </head>
      <body>
        <I18nProvider>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
