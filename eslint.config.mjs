import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // The shader + GSAP entrances legitimately read media-query state and
      // start rAF loops in effects; keep this non-a11y rule a warning.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Vendored from the Go toolchain, not ours to style. It is a plain script
    // that assigns globalThis.Go, and linting it only produces noise about a
    // file we must not edit anyway.
    "lib/wasm/**",
  ]),
]);

export default eslintConfig;
