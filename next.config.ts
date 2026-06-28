import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this app. A stray lockfile higher up
  // (~/package-lock.json) would otherwise be inferred as the Turbopack root,
  // which also matters for a correct Vercel build.
  turbopack: { root: import.meta.dirname },
  devIndicators: false,
};

export default nextConfig;
