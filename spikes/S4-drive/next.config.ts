import type { NextConfig } from "next";

const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://apis.google.com https://accounts.google.com 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "connect-src 'self' https://fmlpkcbpoziwkjuxuyaf.supabase.co https://www.googleapis.com https://accounts.google.com",
  "img-src 'self' data: blob: https://*.googleusercontent.com https://ssl.gstatic.com",
  "font-src 'self'",
  "frame-src 'self' https://docs.google.com https://accounts.google.com",
  "object-src 'none'",
  "base-uri 'self'",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Content-Security-Policy", value: csp },
        ],
      },
    ];
  },
};

export default nextConfig;
