import { defineConfig } from 'vite';
import * as path from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: './src/extension.ts',
      formats: ['cjs'],
      fileName: () => 'extension.js',
    },
    rollupOptions: {
      external: [
        'vscode',
        'path',
        'fs',
        'os',
        'crypto',
        'perf_hooks',
        'inspector'
      ],
      output: {
        format: 'cjs',
      },
    },
    outDir: 'dist',
    sourcemap: true,
    minify: false,
    emptyOutDir: true,
    target: 'node14',
  },
  resolve: {
    alias: {
      path: path.resolve(__dirname, 'node_modules/path-browserify'),
    },
  },
  optimizeDeps: {
    exclude: ['vscode'],
  },
});
