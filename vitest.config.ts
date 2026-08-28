import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  oxc: {
    jsx: { runtime: 'automatic' },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // `server-only` lança erro fora do bundler do Next por design — só
      // testável com esse stub. Ver src/test/server-only-mock.ts.
      'server-only': path.resolve(__dirname, './src/test/server-only-mock.ts'),
    },
  },
});
