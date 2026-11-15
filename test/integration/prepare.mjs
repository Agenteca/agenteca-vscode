// Prepares a throwaway workspace for the tests in a real VS Code:
// a local package to install, and an `ahub` launcher pointing to the CLI of the npm workspace.
import { chmodSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ws = path.join(root, '.vscode-test', 'workspace');
const bin = path.join(path.dirname(createRequire(import.meta.url).resolve('@agenteca/cli')), 'bin.js');
rmSync(ws, { recursive: true, force: true });
mkdirSync(path.join(ws, 'local-pkg', '.apm', 'skills', 'hello'), { recursive: true });
mkdirSync(path.join(ws, '.vscode'), { recursive: true });
writeFileSync(
  path.join(ws, 'local-pkg', 'apm.yml'),
  'name: local-pkg\nversion: 1.0.0\ndescription: Paquet local de test\n',
);
writeFileSync(
  path.join(ws, 'local-pkg', '.apm', 'skills', 'hello', 'SKILL.md'),
  '---\nname: hello\ndescription: Dit bonjour.\n---\nBonjour depuis le test.\n',
);
const launcher = path.join(ws, '.vscode', 'ahub-test.sh');
const home = path.join(ws, '.home');
writeFileSync(
  launcher,
  `#!/bin/sh\nAHUB_HOME='${home}' AHUB_CACHE_DIR='${home}/cache' exec '${process.execPath}' '${bin}' "$@"\n`,
);
chmodSync(launcher, 0o755);
writeFileSync(
  path.join(ws, '.vscode', 'settings.json'),
  JSON.stringify({ 'agenteca.ahubPath': launcher, 'agenteca.tools': ['claude'] }, null, 2),
);
console.log(`Test workspace ready: ${ws}`);
