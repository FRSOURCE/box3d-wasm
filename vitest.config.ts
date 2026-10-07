import { defineConfig } from 'vitest/config';

// The same runtime suite runs against both flavours; the flavour comes from
// BOX3D_FLAVOUR (see test/helpers/load.ts). Type tests live in *.test-d.ts.
const flavour = (name: 'standard' | 'deluxe') => ({
  test: {
    name,
    include: ['test/**/*.test.ts'],
    env: { BOX3D_FLAVOUR: name },
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});

export default defineConfig({
  test: {
    projects: [flavour('standard'), flavour('deluxe')],
    typecheck: {
      enabled: true,
      include: ['test/**/*.test-d.ts'],
      tsconfig: './tsconfig.json',
    },
  },
});
