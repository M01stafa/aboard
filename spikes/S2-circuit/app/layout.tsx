export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <title>Spike S2 — CircuitJS1</title>
      </head>
      <body style={{ margin: 0, padding: 0, fontFamily: "sans-serif" }}>
        {children}
      </body>
    </html>
  );
}
