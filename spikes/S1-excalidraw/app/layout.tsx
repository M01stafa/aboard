import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Spike S1 - Excalidraw Next.js",
  description: "Excalidraw spike inside Next.js 16.4 with React 19.3",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <Script id="excalidraw-asset-path" strategy="beforeInteractive">
          {`window.EXCALIDRAW_ASSET_PATH = "/";`}
        </Script>
      </head>
      <body>{children}</body>
    </html>
  );
}
