import { typescript } from '@frsource/eslint-config';
import globals from 'globals';

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...typescript,
  {
    ignores: [
      '**/dist',
      '**/docs/dist',
      '**/build',
      '**/node_modules',
      '**/emsdk-cache',
    ],
  },
  {
    files: ['src/**', 'test/**'],
    languageOptions: {
      globals: {
        ...globals.es2021,
        ...globals.browser,
        ...globals.node,
      },
    },
  },
  {
    files: ['docs/src/**', 'docs/vite.config.ts'],
    languageOptions: { globals: { ...globals.es2021, ...globals.browser } },
  },
  {
    files: ['docs/public/coi-serviceworker.js'],
    languageOptions: {
      globals: { ...globals.es2021, ...globals.serviceworker },
    },
    // plain browser script with no logger; a failed fetch must stay visible
    rules: { 'no-console': 'off' },
  },
];
