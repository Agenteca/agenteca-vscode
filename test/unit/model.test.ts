import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setTranslator } from '../../src/l10n';
import type { ChangeData, InfoData } from '@agenteca/cli/client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  catalogNodes,
  fileConflicts,
  hasChanges,
  installedNodes,
  packageMarkdown,
  planSummary,
  planText,
  updateNodes,
} from '../../src/model';

const scanOk = { blocked: false, summary: { critical: 0, warning: 0, info: 0 }, findings: [] };
const plan = (over: Partial<ChangeData> = {}): ChangeData => ({
  applied: false,
  dryRun: true,
  planHash: 'a'.repeat(64),
  scope: 'project',
  targets: ['claude'],
  packages: [
    {
      identity: 'github.com/acme/demo',
      name: 'demo',
      version: '1.0.0',
      source: 'git',
      direct: true,
      change: 'added',
      targets: ['claude'],
      contents: {
        skills: ['s'],
        agents: [],
        commands: [],
        instructions: [],
        hooks: ['h'],
        mcpServers: ['m'],
      },
    },
  ],
  removedPackages: [],
  files: [
    { path: '.claude/skills/s/SKILL.md', action: 'create', primitive: 'skill', targets: ['claude'] },
    {
      path: '.claude/agents/a.md',
      action: 'conflict',
      reason: 'modified',
      primitive: 'agent',
      targets: ['claude'],
    },
    { path: '.claude/x.md', action: 'unchanged', primitive: 'agent', targets: ['claude'] },
  ],
  removals: [
    { path: '.claude/old.md', action: 'remove' },
    { path: '.claude/gone.md', action: 'missing' },
  ],
  configFiles: [
    { path: '.mcp.json', kind: 'mcp', action: 'create', changes: ['+ mcpServers.m'], conflicts: [] },
  ],
  executables: [
    { kind: 'hook', target: 'claude', name: 'h', detail: 'Stop', command: 'echo fin' },
    { kind: 'mcp', target: 'claude', name: 'm', detail: 'stdio', command: 'npx -y srv' },
  ],
  scan: scanOk,
  conflicts: [
    { path: '.claude/agents/a.md', reason: 'modified', message: 'modifié' },
    { path: '.mcp.json', reason: 'merge', message: 'clé existante' },
  ],
  ...over,
});

/** Les attentes de ce fichier sont en français : le modèle est traduit par le catalogue livré avec l'extension. */
const fr = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../l10n/bundle.l10n.fr.json', import.meta.url)), 'utf8'),
) as Record<string, string>;
beforeAll(() =>
  setTranslator((message, args) =>
    (fr[message] ?? message).replace(/\{(\d+)\}/g, (_, i: string) => String(args[Number(i)])),
  ),
);
afterAll(() => setTranslator(undefined));

describe('modèle des vues', () => {
  it('ne montre que les paquets directs, avec version et outils', () => {
    const nodes = installedNodes([
      {
        identity: 'github.com/acme/demo',
        name: 'demo',
        version: '1.0.0',
        resolvedTag: 'v1.0.0',
        source: 'git',
        direct: true,
        targets: ['claude', 'cursor'],
        files: ['a', 'b'],
        mergedFiles: ['.mcp.json'],
      },
      {
        identity: 'github.com/acme/dep',
        name: 'dep',
        source: 'git',
        direct: false,
        targets: [],
        files: [],
        mergedFiles: [],
      },
      {
        identity: 'local:./pkg',
        name: 'pkg',
        source: 'local',
        direct: true,
        targets: ['codex'],
        files: [],
        mergedFiles: [],
      },
    ]);
    expect(nodes.map((n) => [n.label, n.ref, n.description])).toEqual([
      ['demo', 'github.com/acme/demo', 'v1.0.0 · claude, cursor'],
      ['pkg', './pkg', 'codex'],
    ]);
    expect(nodes[0]!.tooltip).toContain('3 fichier(s) géré(s)');
  });

  it('liste seulement les paquets réellement à mettre à jour', () => {
    const nodes = updateNodes([
      {
        identity: 'i1',
        name: 'a',
        current: 'v1.0.0',
        wanted: 'v1.1.0',
        latest: 'v2.0.0',
        kind: 'semver',
        outdated: true,
      },
      {
        identity: 'i2',
        name: 'b',
        current: 'v1.0.0',
        wanted: 'v1.0.0',
        latest: 'v2.0.0',
        kind: 'semver',
        outdated: false,
      },
    ]);
    expect(nodes.map((n) => [n.label, n.description])).toEqual([['a', 'v1.0.0 → v1.1.0']]);
  });

  it('désigne un paquet du catalogue par nom@registre', () => {
    const [n] = catalogNodes([
      {
        name: 'demo',
        registry: 'officiel',
        source: 'acme/demo#v1',
        description: 'Une démo',
        version: 'v1',
        tools: ['claude'],
      },
    ]);
    expect(n).toMatchObject({ ref: 'demo@officiel', label: 'demo', description: 'v1 · claude' });
    expect(n!.tooltip).toContain('Une démo');
  });
});

describe('plan montré avant application', () => {
  it('liste fichiers, configuration, exécutables et scan', () => {
    const text = planText(plan());
    expect(text).toContain('+ demo 1.0.0  (github.com/acme/demo)');
    expect(text).toContain('+ .claude/skills/s/SKILL.md');
    expect(text).toContain('! .claude/agents/a.md   ← modifié à la main ou non géré');
    expect(text).not.toContain('.claude/x.md');
    expect(text).toContain('- .claude/old.md');
    expect(text).not.toContain('gone.md');
    expect(text).toContain('.mcp.json: + mcpServers.m');
    expect(text).toContain('hook h [claude, Stop]: echo fin');
    expect(text).toContain('serveur MCP m [claude, stdio]: npx -y srv');
    expect(text).toContain('SCAN DE SÉCURITÉ : 0 critique(s)');
  });

  it('résume en une ligne et repère les conflits de fichiers', () => {
    expect(planSummary(plan())).toBe(
      '3 fichier(s) écrit(s) ou modifié(s) · 1 retiré(s) · 1 hook(s) · 1 serveur(s) MCP · scan : rien à signaler',
    );
    expect(fileConflicts(plan())).toEqual(['.claude/agents/a.md']);
    expect(hasChanges(plan())).toBe(true);
    const idle = plan({
      packages: [],
      files: [],
      removals: [],
      configFiles: [],
      executables: [],
      conflicts: [],
    });
    expect(hasChanges(idle)).toBe(false);
    const blocked = plan({
      scan: {
        blocked: true,
        summary: { critical: 1, warning: 2, info: 0 },
        findings: [
          {
            ruleId: 'AHUB-U001',
            severity: 'critical',
            path: 'a.md',
            line: 3,
            column: 1,
            message: 'invisible',
          },
        ],
      },
    });
    expect(planSummary(blocked)).toContain('scan : 1 critique(s), 2 avertissement(s)');
    expect(planText(blocked)).toContain('[critical] AHUB-U001 a.md:3 — invisible');
  });
});

describe('fiche d’un paquet', () => {
  const info: InfoData = {
    dep: 'acme/demo#v1.0.0',
    identity: 'github.com/acme/demo',
    name: 'demo',
    version: '1.0.0',
    description: 'Une démo',
    license: 'MIT',
    layout: 'apm_package',
    contents: {
      skills: ['s'],
      agents: ['a'],
      commands: [],
      instructions: [],
      hooks: ['h'],
      mcpServers: ['m'],
    },
    mcpServers: [{ name: 'm', command: 'npx', args: ['-y', 'srv'] }],
    dependencies: [],
    files: [
      { path: 'SKILL.md', size: 30, text: 'Avant\n```\ncode\n```\n````\nfin' },
      { path: 'logo.png', size: 2048 },
    ],
    scan: scanOk,
  };

  it('présente le contenu et les éléments exécutables', () => {
    const md = packageMarkdown(info);
    expect(md).toContain('# demo 1.0.0');
    expect(md).toContain('- Hooks (commandes lancées automatiquement) : h');
    expect(md).toContain('- Serveur MCP **m** : `npx -y srv`');
    expect(md).toContain('Rien à signaler.');
    expect(md).toContain('_2048 octets, non affiché._');
  });

  it('enferme le texte d’un fichier dans une clôture qu’il ne peut pas fermer', () => {
    const md = packageMarkdown(info);
    // Le fichier contient une suite de 4 accents graves : la clôture en compte 5.
    expect(md).toContain('`````\nAvant\n```\ncode\n```\n````\nfin\n`````');
  });

  it('met en avant un problème critique', () => {
    const md = packageMarkdown({
      ...info,
      scan: {
        blocked: true,
        summary: { critical: 1, warning: 0, info: 0 },
        findings: [
          {
            ruleId: 'AHUB-U001',
            severity: 'critical',
            path: 'SKILL.md',
            line: 2,
            column: 1,
            message: 'Texte invisible',
          },
        ],
      },
    });
    expect(md).toContain('**Problème critique : ahub refuse d’installer ce paquet sans accord explicite.**');
    expect(md).toContain('- **critical** `AHUB-U001` — SKILL.md, ligne 2 : Texte invisible');
  });
});
