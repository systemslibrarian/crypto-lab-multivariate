import { defineConfig } from 'vitest/config';

// Unit tests live next to the source in src/**/*.test.ts. The e2e/ directory
// holds Playwright specs (a11y gate) which must NOT be collected by vitest.
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
    environment: 'node',
  },
});
