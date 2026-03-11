import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Next.js build artefacts
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
 feat/audit-remove-all-simulations
    // Skill templates — third-party / tooling code, not part of the Next.js app.
    // These files intentionally use patterns (any, require, Math.random in JSX)
    // that are acceptable in non-React utility scripts.
    "skills/**",
    // Infrastructure and tooling directories
    "config/**",
    "scripts/**",
    // Test files use their own relaxed ruleset
    "tests/**",
  ]),
  {
    rules: {
      // Allow _-prefixed variables to be unused (intentional forward-compat stubs)
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },

    // Skills directory contains standalone example scripts, not part of Next.js app
    "skills/**",
    // Config and scripts directories are not part of the main app
    "config/**",
    "scripts/**",
    "tests/**",
  ]),
  // Allow unused variables that start with underscore (common convention for reserved/future use)
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
 perf/speed-insights-improvements
      ],
    },
  },
]);

export default eslintConfig;
