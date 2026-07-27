import { defineConfig } from 'tsup';

/**
 * The build had no config, so `npm run build` failed with "No input files" and
 * dist drifted badly out of sync with src: the published ESM bundle predated the
 * response-normalization added to the analytics client, while a hand-run `tsc`
 * left ESM-syntax files at the CommonJS entry point.
 *
 * Outputs must line up with package.json:
 *   main    -> dist/index.js   (cjs)
 *   module  -> dist/index.mjs  (esm)
 *   types   -> dist/index.d.ts
 */
export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  // Removes the stale hand-built artifacts still sitting in dist.
  clean: true,
  target: 'es2022',
  treeshake: true,
});
