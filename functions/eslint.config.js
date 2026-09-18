/**
 * Flat ESLint config for Cloud Functions (ESLint 8.57 compatible).
 *
 * Lives inside functions/ so ESLint always resolves THIS config when run
 * from the functions directory (predeploy does `cd "$RESOURCE_DIR"`), and
 * never picks up the root eslint.config.js, which targets the frontend's
 * newer ESLint v10 and crashes ESLint 8 (e.g. `no-unassigned-vars`).
 */

const tsPlugin = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");

module.exports = [
  {
    ignores: ["lib/**", "node_modules/**", "*.config.js"],
  },
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2023,
        sourceType: "module",
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      quotes: ["error", "double"],
      indent: ["error", 2],
    },
  },
];
