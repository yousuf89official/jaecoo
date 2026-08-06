import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'ingestion/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
