import type { Metadata } from "next";
import Script from "next/script";
import "@/core/env";
import "@/theme/tokens.css";
import { fontClassNames } from "@/theme/fonts";

const DEFAULT_LANG = "en";
const DEFAULT_DIR = "ltr";

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
      lang={DEFAULT_LANG}
      dir={DEFAULT_DIR}
      className={fontClassNames}
      suppressHydrationWarning
    >
      <head>
        <Script id="excalidraw-asset-path" strategy="beforeInteractive">
          {`window.EXCALIDRAW_ASSET_PATH = "/";`}
        </Script>
      </head>
      <body>{children}</body>
    </html>
  );
}
