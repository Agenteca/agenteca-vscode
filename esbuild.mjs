import { build } from 'esbuild';

// A single CommonJS file: the ahub client is bundled, `vscode` is provided by the editor.
await build({
  entryPoints: ['src/extension.ts'],
  outfile: 'dist/extension.js',
  bundle: true,
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  external: ['vscode'],
  sourcemap: true,
  minify: process.argv.includes('--production'),
  logLevel: 'info',
});
