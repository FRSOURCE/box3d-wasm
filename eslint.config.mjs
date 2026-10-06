import { typescript } from '@frsource/eslint-config';
import globals from 'globals';

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...typescript,
  { ignores: ['**/dist', '**/build', '**/node_modules', '**/emsdk-cache'] },
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
];
