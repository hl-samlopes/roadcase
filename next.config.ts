import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // End-to-end tests run their own dev server; a separate build folder keeps
  // it from colliding with `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  experimental: {
    serverActions: {
      // Room for a 20 MB document plus multipart overhead (see src/lib/files.ts).
      bodySizeLimit: "21mb",
    },
  },
};

export default nextConfig;
