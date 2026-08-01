import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root to this app. A stray lockfile higher up
  // (~/package-lock.json) would otherwise be inferred as the Turbopack root,
  // which also matters for a correct Vercel build.
  turbopack: { root: import.meta.dirname },
  devIndicators: false,

  // PGlite is a WebAssembly build of Postgres. Bundling it would mean bundling
  // a .wasm and a .data file the bundler has no reason to understand, so leave
  // it as a plain node_modules require at runtime.
  serverExternalPackages: ["@electric-sql/pglite"],

  // The schema and the seed are read from disk at boot. Nothing imports them,
  // so Next's dependency tracing cannot see them, and without this the deployed
  // function starts up and cannot find its own database.
  outputFileTracingIncludes: {
    "/**": ["./lib/db/*.sql"],
  },
};

export default nextConfig;
