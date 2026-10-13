import type { ReactNode } from "react";

export const metadata = {
  title: "Aboard — Spike S5: Large .alpha Export and Import",
  description: "Benchmarking large .alpha ZIP streaming, in-memory limits, and random-access import",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
