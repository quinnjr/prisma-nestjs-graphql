import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      exclude: ['src/**/*.spec.ts', 'src/test/**'],
      include: ['src/**/*.ts'],
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
    // Specs run `prisma generate` and share its cache directory
    fileParallelism: false,
    hookTimeout: 300_000,
    include: ['src/**/*.spec.ts'],
    testTimeout: 120_000,
  },
});
