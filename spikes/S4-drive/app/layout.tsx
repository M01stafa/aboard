import type { ReactNode } from "react";

export const metadata = {
  title: "Aboard — Spike S4: Drive & Auth",
  description: "Spike S4: Google Sign-in, Drive Token Exchange, Uploads & Picker",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "sans-serif" }}>{children}</body>
    </html>
  );
}
