import { build } from 'esbuild';

// Un seul fichier CommonJS : le client de ahub est embarqué, `vscode` est fourni par l'éditeur.
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
