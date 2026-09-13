import { defineConfig } from 'tsdown';

/**
 * Compiled `dist/` is what the manifest points at — never `src/`. `@luraty/engine@0.5.0` pointed its
 * `main`/`exports` at TypeScript source and relied on `publishConfig` to swap in `dist`, which npm
 * ignores; bundlers hid it and plain Node broke. `check:publish` imports the built package in plain
 * Node for exactly that reason.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  target: 'es2022',
  outDir: 'dist',
  clean: true,
  // No source maps: the bundle is almost entirely one generated data string.
  sourcemap: false,
});
