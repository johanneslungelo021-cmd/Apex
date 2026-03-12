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
    // Third-party skill templates — not part of the Next.js app bundle
    "skills/**",
    // Config and scripts directories are not part of the main app
    "config/**",
    "scripts/**",
    // Test files use their own relaxed ruleset
    "tests/**",
  ]),
  {
    rules: {
      // Allow _-prefixed identifiers as intentional unused stubs
      // covers catch(_e), _unused params, etc.
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
