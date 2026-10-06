import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // End-to-end tests run their own dev server; a separate build folder keeps
  // it from colliding with `npm run dev`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Guest portal pages are private to one group: never cached, indexed or
  // leaked to other sites through the Referer header.
  async headers() {
    return [
      {
        source: "/portal/:token*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "private, no-store" },
        ],
      },
    ];
  },
  experimental: {
    serverActions: {
      // Room for a 20 MB document plus multipart overhead (see src/lib/files.ts).
      bodySizeLimit: "21mb",
    },
  },
};

export default nextConfig;
