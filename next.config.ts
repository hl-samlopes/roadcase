import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // End-to-end tests run their own dev server; a separate build folder keeps
  // it from colliding with `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
