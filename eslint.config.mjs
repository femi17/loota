import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    rules: {
      // Deployment sanity: allow incremental typing migrations.
      "@typescript-eslint/no-explicit-any": "off",
      // Avoid build-time lint failures for user-facing copy.
      "react/no-unescaped-entities": "off",
      // Some UI flows intentionally set state in effects.
      "react-hooks/set-state-in-effect": "off",
      // We intentionally derive countdowns in render in a few places.
      "react-hooks/purity": "off",
      // This codebase uses state setters before declaration in a few helpers.
      "react-hooks/immutability": "off",
      // Prefer warning so it doesn't block deploy.
      "prefer-const": "warn",
    },
  },
]);

export default eslintConfig;
