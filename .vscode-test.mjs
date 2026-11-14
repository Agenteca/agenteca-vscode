import { defineConfig } from '@vscode/test-cli';

// L'espace de travail est créé par test/integration/prepare.mjs.
export default defineConfig({
  files: 'out/integration/**/*.test.js',
  workspaceFolder: '.vscode-test/workspace',
  launchArgs: ['--disable-extensions'],
  mocha: { timeout: 120_000 },
});
