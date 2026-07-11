import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // This is an executable ffmpeg smoke script, not a Vitest suite.
    exclude: ['tests/metadata.test.ts'],
  },
});
