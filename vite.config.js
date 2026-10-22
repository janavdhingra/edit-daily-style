import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.{js,jsx}', 'netlify/**/*.test.mjs'],
    // Calendar + weather maths depend on the local timezone; pin it so the
    // suite gives the same answers on any machine or CI runner.
    env: { TZ: 'America/Vancouver' },
    coverage: {
      include: ['src/engine/**', 'src/lib/**', 'src/data/**', 'netlify/functions/**'],
      exclude: ['**/*.test.*', 'src/test/**'],
    },
  },
});
