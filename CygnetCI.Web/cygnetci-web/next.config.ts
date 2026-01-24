import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,

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
