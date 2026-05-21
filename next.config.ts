import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  experimental: {
    staleTimes: {
      dynamic: 30,   // cache dynamic page RSC payloads 30s client-side
      static: 180,   // cache static pages 3 minutes
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/**",
      },
    ],
  },
  // Turbopack config (Next.js 16+ default)
  // root: explicitly set to prevent Turbopack from misdetecting the workspace
  // root as the parent directory when multiple package-lock.json files exist.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
