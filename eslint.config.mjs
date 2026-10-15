import { defineConfig } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig({
  files: ["script/**/*.ts", "test/**/*.ts"],
  extends: [tseslint.configs.base],
  languageOptions: {
    parserOptions: {
      projectService: true,
    },
  },
  rules: {
    "no-var": "error",
    "prefer-const": "error",
    "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    eqeqeq: "error",
    "no-eval": "error",
    "@typescript-eslint/consistent-type-assertions": "error",
    "@typescript-eslint/no-floating-promises": "error",
  },
});
