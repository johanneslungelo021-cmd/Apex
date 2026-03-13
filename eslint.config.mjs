import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([
    // Next.js build artefacts
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Third-party skill templates — not part of the Next.js app bundle.
    // They intentionally use patterns (any, require, Math.random in JSX)
    // that are inappropriate in production React code but acceptable in
    // standalone CLI/tooling scripts.
    "skills/**",
    // Config and scripts directories are not part of the main app
    "config/**",
    "scripts/**",
    // Test files use their own relaxed ruleset
    "tests/**",
    // Download directory
    "download/**",
  ]),
  {
    rules: {
      // Allow _-prefixed identifiers as intentional "unused but kept for
      // forward-compatibility" stubs — covers catch(_e), _unused params, etc.
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
]);

export default eslintConfig;
