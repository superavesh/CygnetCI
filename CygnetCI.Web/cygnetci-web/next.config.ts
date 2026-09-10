import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,

  // Dev server only (has no effect on the static export this app ships) —
  // Next.js 16.3+ blocks cross-origin requests to its own /_next/* dev
  // resources by default, which silently prevents client-side hydration
  // (and therefore all onSubmit/onClick handlers) when the dev server is
  // reached via 127.0.0.1 instead of localhost. This is exactly the origin
  // the Playwright E2E suite (playwright.config.ts) and `next dev` itself use.
  allowedDevOrigins: ['127.0.0.1', 'localhost'],

  // Enable static export for IIS hosting
  output: 'export',

  // Disable image optimization (not supported in static export)
  images: {
    unoptimized: true,
  },

  // Generate trailing slashes for IIS compatibility
  trailingSlash: true,
};

export default nextConfig;
