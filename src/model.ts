import type {
  ChangeData,
  InfoData,
  InstalledPackageData,
  OutdatedPackageData,
  SearchResultData,
} from '@agenteca/cli/client';
import { t } from './l10n';

/** Logique pure, sans dépendance à l'API de VS Code : testable telle quelle. */

export type NodeKind = 'installed' | 'update' | 'catalog';

export interface PackageNode {
  kind: NodeKind;
  /** Référence passée à ahub (identité, nom@registre…). */
  ref: string;
  label: string;
  description: string;
  tooltip: string;
}

export function installedNodes(packages: InstalledPackageData[]): PackageNode[] {
  return packages
    .filter((p) => p.direct)
    .map((p) => {
      const version = p.resolvedTag ?? p.version ?? (p.commit ? p.commit.slice(0, 7) : '');
      return {
        kind: 'installed' as const,
        ref: p.source === 'local' ? p.identity.replace(/^local:/, '') : p.identity,
        label: p.name,
        description: [version, p.targets.join(', ')].filter(Boolean).join(' · '),
        tooltip: t('{0}\n{1} managed file(s)', [p.identity, p.files.length + p.mergedFiles.length]),
      };
    });
}

export function updateNodes(packages: OutdatedPackageData[]): PackageNode[] {
  return packages
    .filter((p) => p.outdated)
    .map((p) => ({
      kind: 'update' as const,
      ref: p.identity,
      label: p.name,
      description: `${p.current} → ${p.wanted}`,
      tooltip: t('{0}\nInstalled: {1}\nUpdate available: {2}\nLatest version: {3}', [
        p.identity,
        p.current,
        p.wanted,
        p.latest,
      ]),
    }));
}

export function catalogNodes(results: SearchResultData[]): PackageNode[] {
  return results.map((r) => ({
    kind: 'catalog' as const,
    ref: `${r.name}@${r.registry}`,
    label: r.name,
    description: [r.version, r.tools?.join(', ')].filter(Boolean).join(' · '),
    tooltip: [
      r.description ?? t('No description.'),
      t('Registry: {0}', [r.registry]),
      t('Source: {0}', [r.source]),
    ].join('\n'),
  }));
}

const SIGN: Record<string, string> = { create: '+', update: '~', conflict: '!', remove: '-' };

/** Plan en texte brut, montré avant toute écriture. */
export function planText(plan: ChangeData): string {
  const lines: string[] = [
    t('Scope: {0} — tools: {1}', [plan.scope === 'user' ? t('user') : t('project'), plan.targets.join(', ')]),
  ];
  const changed = plan.packages.filter((p) => p.change !== 'unchanged');
  if (changed.length > 0 || plan.removedPackages.length > 0) {
    lines.push('', 'PAQUETS');
    for (const p of changed)
      lines.push(
        `  ${p.change === 'added' ? '+' : '~'} ${p.name} ${p.resolvedTag ?? p.version ?? ''}  (${p.identity})`,
      );
    for (const id of plan.removedPackages) lines.push(`  - ${id}`);
  }
  const files = plan.files.filter((f) => f.action !== 'unchanged');
  if (files.length > 0) {
    lines.push('', t('FILES WRITTEN ({0})', [files.length]));
    for (const f of files)
      lines.push(
        `  ${SIGN[f.action]} ${f.path}${f.action === 'conflict' ? '   ← modifié à la main ou non géré' : ''}`,
      );
  }
  const removals = plan.removals.filter((r) => r.action !== 'missing');
  if (removals.length > 0) {
    lines.push('', t('FILES REMOVED ({0})', [removals.length]));
    for (const r of removals)
      lines.push(
        `  ${r.action === 'conflict' ? '!' : '-'} ${r.path}${r.action === 'conflict' ? '   ← modifié à la main' : ''}`,
      );
  }
  const configs = plan.configFiles.filter((c) => c.action !== 'unchanged');
  if (configs.length > 0) {
    lines.push('', t('CONFIGURATION FILES MODIFIED (only these entries change)'));
    for (const c of configs) lines.push(`  ${c.path}: ${c.changes.join(', ')}`);
  }
  if (plan.executables.length > 0) {
    lines.push('', t('EXECUTABLE ITEMS — commands will be run on this machine'));
    for (const e of plan.executables)
      lines.push(
        `  ${e.kind === 'hook' ? 'hook' : t('MCP server')} ${e.name} [${e.target}, ${e.detail}]: ${e.command}`,
      );
  }
  const s = plan.scan.summary;
  lines.push(
    '',
    t('SECURITY SCAN: {0} critical, {1} warning(s), {2} informational', [s.critical, s.warning, s.info]),
  );
  for (const f of plan.scan.findings)
    lines.push(`  [${f.severity}] ${f.ruleId} ${f.path}:${f.line} — ${f.message}`);
  return lines.join('\n');
}

/** Résumé court pour la boîte de confirmation. */
export function planSummary(plan: ChangeData): string {
  const written =
    plan.files.filter((f) => f.action !== 'unchanged').length +
    plan.configFiles.filter((c) => c.action !== 'unchanged').length;
  const removed = plan.removals.filter((r) => r.action !== 'missing').length;
  const parts = [t('{0} file(s) written or modified', [written]), t('{0} removed', [removed])];
  const hooks = plan.executables.filter((e) => e.kind === 'hook').length;
  const servers = plan.executables.filter((e) => e.kind === 'mcp').length;
  if (hooks > 0) parts.push(`${hooks} hook(s)`);
  if (servers > 0) parts.push(t('{0} MCP server(s)', [servers]));
  const s = plan.scan.summary;
  parts.push(
    s.critical + s.warning === 0
      ? t('scan: nothing to report')
      : t('scan: {0} critical, {1} warning(s)', [s.critical, s.warning]),
  );
  return parts.join(' · ');
}

export function hasChanges(plan: ChangeData): boolean {
  return (
    plan.removedPackages.length > 0 ||
    plan.packages.some((p) => p.change !== 'unchanged') ||
    plan.files.some((f) => f.action !== 'unchanged') ||
    plan.removals.some((r) => r.action !== 'missing') ||
    plan.configFiles.some((c) => c.action !== 'unchanged')
  );
}

export function fileConflicts(plan: ChangeData): string[] {
  return plan.conflicts.filter((c) => c.reason !== 'merge').map((c) => c.path);
}

function fence(text: string): string {
  // Une clôture plus longue que toute suite d'accents graves du contenu : le texte ne peut pas en sortir.
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((m) => m.length));
  const marks = '`'.repeat(longest + 1);
  return `${marks}\n${text.replace(/\n$/, '')}\n${marks}`;
}

/** Fiche d'un paquet en Markdown : ce qu'il contient, avant de l'installer. */
export function packageMarkdown(info: InfoData): string {
  const c = info.contents;
  const lines: string[] = [`# ${info.name}${info.version ? ` ${info.version}` : ''}`, ''];
  if (info.description) lines.push(info.description, '');
  lines.push(t('- Source: `{0}`', [info.dep]));
  if (info.license) lines.push(t('- License: {0}', [info.license]));
  if (info.commit) lines.push(t('- Revision: `{0}`', [info.commit]));
  const s = info.scan.summary;
  lines.push('', t('## Security check'), '');
  if (info.scan.findings.length === 0) lines.push(t('Nothing to report.'));
  else {
    lines.push(
      info.scan.blocked
        ? t('**Critical problem: ahub refuses to install this package without explicit agreement.**')
        : t('{0} point(s) to check.', [s.warning + s.info]),
      '',
    );
    for (const f of info.scan.findings)
      lines.push(
        t('- **{0}** `{1}` — {2}, line {3}: {4}', [f.severity, f.ruleId, f.path, f.line, f.message]),
      );
  }
  lines.push('', t('## What this package installs'), '');
  const section = (title: string, items: string[]): void => {
    if (items.length > 0) lines.push(t('- {0}: {1}', [title, items.join(', ')]));
  };
  section(t('Skills'), c.skills);
  section(t('Agents'), c.agents);
  section(t('Commands'), c.commands);
  section(t('Instructions'), c.instructions);
  section(t('Hooks (commands run automatically)'), c.hooks);
  for (const m of info.mcpServers)
    lines.push(
      t('- MCP server **{0}**: `{1}`', [
        m.name,
        m.command ? [m.command, ...(m.args ?? [])].join(' ') : (m.url ?? ''),
      ]),
    );
  section(t('Dependencies'), info.dependencies);
  lines.push('', t('## Files ({0})', [info.files.length]), '');
  for (const f of info.files) {
    lines.push(`### ${f.path}`, '');
    lines.push(f.text !== undefined ? fence(f.text) : t('_{0} bytes, not shown._', [f.size]), '');
  }
  return lines.join('\n');
}
