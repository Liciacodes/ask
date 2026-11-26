import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // The browser tests build into a folder of their own (ASK_BUILD_DIR=.next-e2e, set in playwright.config.ts), so
  // their build never replaces the one `npm run check:server` starts, or touches your dev server's .next/dev.
  distDir: process.env.ASK_BUILD_DIR || ".next",
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        // Only our own CSS: Tailwind breaks next/font's generated CSS.
        condition: { not: "foreign" },
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
