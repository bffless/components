import { defineConfig } from 'tsup';

export default defineConfig({
  // Per-file output (no bundling) so consumers' bundlers can drop unused
  // hooks/primitives at tree-shake time. Each src/*.ts(x) becomes its own
  // dist/*.js + dist/*.mjs, mirroring what tsc emitted before — but with
  // a real ESM build alongside the CJS one.
  entry: ['src/**/*.ts', 'src/**/*.tsx'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'es2020',
  bundle: false,
  splitting: false,
  treeshake: true,
  external: ['react', 'react-dom', 'react/jsx-runtime', 'qrcode.react'],
  outExtension: ({ format }) => ({
    js: format === 'cjs' ? '.js' : '.mjs',
  }),
});
