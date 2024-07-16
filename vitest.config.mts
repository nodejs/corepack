import {defineConfig} from 'vitest/config';

// eslint-disable-next-line arca/no-default-export
export default defineConfig({
  test: {
    setupFiles: [`./tests/setupTests.ts`],
    testTimeout: 120000,
    retry: 2,
  },
  esbuild: {
    target: `node${process.versions.node}`,
  },
});
