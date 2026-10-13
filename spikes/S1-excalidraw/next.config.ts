import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Ensure transpilePackages handles excalidraw if needed
  transpilePackages: ["@excalidraw/excalidraw"],
};

export default nextConfig;
