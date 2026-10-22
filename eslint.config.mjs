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
    "dist/**",
    "coverage/**",
    "work/**",
    ".agents/**",
    ".claude/**",
    ".wrangler/**",
    ".vinext/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    // Standalone runtimes linted/executed outside the Next app: the demo gateway
    // (CommonJS, runs on EC2) and the k6 flood scripts (k6 globals/imports).
    "aws/gateway/**",
    "aws/load/**",
  ]),
]);

export default eslintConfig;
