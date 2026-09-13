import { defineConfig } from 'tsdown';

/**
 * Same shape as `@luraty/engine`: the package points at `src/index.ts` for local development, and
 * `publishConfig` swaps in `dist/` at publish time. `@luraty/engine` is a dependency, so tsdown leaves
 * it external — a pack must never carry its own copy of the engine.
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  target: 'es2022',
  outDir: 'dist',
  clean: true,
  // No source maps: the bundle is almost entirely one generated data module, and a 5 MB map of it
  // helps nobody debug anything.
  sourcemap: false,
});
