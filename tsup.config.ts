import { defineConfig } from 'tsup';

export default defineConfig({
  // Per-file output (no bundling) so consumers' bundlers can drop unused
  // hooks/primitives at tree-shake time. Each src/*.ts(x) becomes its own
  // dist/*.js + dist/*.mjs, mirroring what tsc emitted before — but with
  // a real ESM build alongside the CJS one.
  // Test files (`*.test.ts(x)` / `*.spec.ts(x)`) are excluded — they pull
  // in dev-only test deps (jest-dom augmentation, RTL) and were both
  // bloating dist/ and breaking the DTS pass at build time.
  // Files prefixed with `__` are also excluded — convention for shared test
  // fixtures / helpers (e.g. __test-helpers.ts) that import vitest at the
  // top level. Same reason: would pull dev deps into the shipped bundle.
  entry: [
    'src/**/*.ts',
    'src/**/*.tsx',
    '!src/**/*.test.ts',
    '!src/**/*.test.tsx',
    '!src/**/*.spec.ts',
    '!src/**/*.spec.tsx',
    '!src/**/__*.ts',
    '!src/**/__*.tsx',
  ],
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
