import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // The browser tests build into a folder of their own (ASK_BUILD_DIR=.next-e2e, set in playwright.config.ts), so
  // their build never replaces the one `npm run check:server` starts, or touches your dev server's .next/dev.
  distDir: process.env.ASK_BUILD_DIR || ".next",
  // The service worker that shows reminders (public/sw.js): always the latest, served as JavaScript, and allowed
  // nothing but Ask's own scripts. As in Next's PWA guide.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
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
