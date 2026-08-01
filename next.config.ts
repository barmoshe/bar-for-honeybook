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

  // Runtime files read from disk rather than imported.
  outputFileTracingIncludes: {
    // Nothing imports these, so Next's dependency tracing cannot see them, and
    // without this the deployed function boots and cannot find its own database
    // or its own rules engine.
    //
    // engine.wasm lives under public/ and is therefore also served statically,
    // which is harmless: it is read from disk by the server, never fetched.
    "/**": ["./lib/db/*.sql", "./lib/wasm/wasm_exec.cjs", "./public/engine.wasm"],
  },
};

export default nextConfig;
