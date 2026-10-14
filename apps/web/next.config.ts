import type { NextConfig } from "next";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ||
  "https://fmlpkcbpoziwkjuxuyaf.supabase.co";
const supabaseWsUrl = supabaseUrl.replace(/^http/, "ws");

const supabaseSources = Array.from(
  new Set([
    "https://fmlpkcbpoziwkjuxuyaf.supabase.co",
    "wss://fmlpkcbpoziwkjuxuyaf.supabase.co",
    supabaseUrl,
    supabaseWsUrl,
  ])
).join(" ");

// Content Security Policy for main application pages.
// App Router requires 'unsafe-inline' for inline bootstrap scripts (R1 deliberate choice; nonce-based CSP planned for later).
// EmbedPDF requires 'wasm-unsafe-eval' for PDFium WASM engine instantiation (per Spike S3).
const appCsp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://apis.google.com https://accounts.google.com https://challenges.cloudflare.com${process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `connect-src 'self' ${supabaseSources} https://www.googleapis.com https://accounts.google.com https://api.aboard.example blob: data:`,
  "img-src 'self' data: blob: https://*.googleusercontent.com https://ssl.gstatic.com",
  "font-src 'self'",
  "frame-src 'self' https://challenges.cloudflare.com https://docs.google.com https://accounts.google.com",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

const appSecurityHeaders = [
  { key: "Content-Security-Policy", value: appCsp },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

// Content Security Policy for CircuitJS iframe (/circuit/:path*).
// GWT permutation loaders, deferred bindings, and canvas2svg require 'unsafe-eval' and 'unsafe-inline' (per Spike S2).
// Kept in a separate rule to prevent weakening the main application CSP.
const circuitCsp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self' javascript:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join("; ");

const circuitSecurityHeaders = [
  { key: "Content-Security-Policy", value: circuitCsp },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@excalidraw/excalidraw"],
  agentRules: false,
  async headers() {
    return [
      // General app pages (mutually exclusive with /circuit/ via negative lookahead)
      {
        source: "/((?!circuit/).*)",
        headers: appSecurityHeaders,
      },
      // CircuitJS iframe isolation rule
      {
        source: "/circuit/:path*",
        headers: circuitSecurityHeaders,
      },
    ];
  },
};

export default nextConfig;
