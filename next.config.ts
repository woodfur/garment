import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
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
