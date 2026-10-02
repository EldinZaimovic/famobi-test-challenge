import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default defineConfig([
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/tests/.compiled/**",
      ".emulator-data/**",
    ],
  },
  {
    files: ["**/*.{js,mjs,jsx,ts}"],
    extends: [js.configs.recommended],
    rules: {
      "no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: [
      "backend/**/*.js",
      "**/test/**/*.js",
      "**/tests/**/*.mjs",
      "**/*config.{js,ts}",
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: [
      "dashboard/src/**/*.{js,jsx}",
      "dashboard/test/**/*.jsx",
      "neon-snake-main/src/**/*.ts",
    ],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ["neon-snake-main/tests/**/*.mjs"],
    languageOptions: { globals: { window: "writable", document: "writable" } },
  },
  {
    files: ["**/*.ts"],
    extends: [tseslint.configs.recommended],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["dashboard/**/*.jsx"],
    languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { "react-hooks": reactHooks },
    rules: {
      // Vite's classic JSX transform uses the React import.
      "no-unused-vars": [
        "error",
        { varsIgnorePattern: "^React$", argsIgnorePattern: "^_" },
      ],
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
]);
