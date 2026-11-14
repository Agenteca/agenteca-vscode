import type {
  ChangeData,
  InfoData,
  InstalledPackageData,
  OutdatedPackageData,
  SearchResultData,
} from '@agenteca/cli/client';

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
        tooltip: `${p.identity}\n${p.files.length + p.mergedFiles.length} fichier(s) géré(s)`,
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
      tooltip: `${p.identity}\nInstallé : ${p.current}\nMise à jour possible : ${p.wanted}\nDernière version : ${p.latest}`,
    }));
}

export function catalogNodes(results: SearchResultData[]): PackageNode[] {
  return results.map((r) => ({
    kind: 'catalog' as const,
    ref: `${r.name}@${r.registry}`,
    label: r.name,
    description: [r.version, r.tools?.join(', ')].filter(Boolean).join(' · '),
    tooltip: [
      r.description ?? 'Pas de description.',
      `Registre : ${r.registry}`,
      `Source : ${r.source}`,
    ].join('\n'),
  }));
}

const SIGN: Record<string, string> = { create: '+', update: '~', conflict: '!', remove: '-' };

/** Plan en texte brut, montré avant toute écriture. */
export function planText(plan: ChangeData): string {
  const lines: string[] = [
    `Portée : ${plan.scope === 'user' ? 'utilisateur' : 'projet'} — outils : ${plan.targets.join(', ')}`,
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
    lines.push('', `FICHIERS ÉCRITS (${files.length})`);
    for (const f of files)
      lines.push(
        `  ${SIGN[f.action]} ${f.path}${f.action === 'conflict' ? '   ← modifié à la main ou non géré' : ''}`,
      );
  }
  const removals = plan.removals.filter((r) => r.action !== 'missing');
  if (removals.length > 0) {
    lines.push('', `FICHIERS RETIRÉS (${removals.length})`);
    for (const r of removals)
      lines.push(
        `  ${r.action === 'conflict' ? '!' : '-'} ${r.path}${r.action === 'conflict' ? '   ← modifié à la main' : ''}`,
      );
  }
  const configs = plan.configFiles.filter((c) => c.action !== 'unchanged');
  if (configs.length > 0) {
    lines.push('', 'FICHIERS DE CONFIGURATION MODIFIÉS (seules ces entrées changent)');
    for (const c of configs) lines.push(`  ${c.path} : ${c.changes.join(', ')}`);
  }
  if (plan.executables.length > 0) {
    lines.push('', 'ÉLÉMENTS EXÉCUTABLES — des commandes seront lancées sur cette machine');
    for (const e of plan.executables)
      lines.push(
        `  ${e.kind === 'hook' ? 'hook' : 'serveur MCP'} ${e.name} [${e.target}, ${e.detail}] : ${e.command}`,
      );
  }
  const s = plan.scan.summary;
  lines.push(
    '',
    `SCAN DE SÉCURITÉ : ${s.critical} critique(s), ${s.warning} avertissement(s), ${s.info} information(s)`,
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
  const parts = [`${written} fichier(s) écrit(s) ou modifié(s)`, `${removed} retiré(s)`];
  const hooks = plan.executables.filter((e) => e.kind === 'hook').length;
  const servers = plan.executables.filter((e) => e.kind === 'mcp').length;
  if (hooks > 0) parts.push(`${hooks} hook(s)`);
  if (servers > 0) parts.push(`${servers} serveur(s) MCP`);
  const s = plan.scan.summary;
  parts.push(
    s.critical + s.warning === 0
      ? 'scan : rien à signaler'
      : `scan : ${s.critical} critique(s), ${s.warning} avertissement(s)`,
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
  lines.push(`- Source : \`${info.dep}\``);
  if (info.license) lines.push(`- Licence : ${info.license}`);
  if (info.commit) lines.push(`- Révision : \`${info.commit}\``);
  const s = info.scan.summary;
  lines.push('', '## Contrôle de sécurité', '');
  if (info.scan.findings.length === 0) lines.push('Rien à signaler.');
  else {
    lines.push(
      info.scan.blocked
        ? '**Problème critique : ahub refuse d’installer ce paquet sans accord explicite.**'
        : `${s.warning + s.info} point(s) à vérifier.`,
      '',
    );
    for (const f of info.scan.findings)
      lines.push(`- **${f.severity}** \`${f.ruleId}\` — ${f.path}, ligne ${f.line} : ${f.message}`);
  }
  lines.push('', '## Ce que ce paquet installe', '');
  const section = (title: string, items: string[]): void => {
    if (items.length > 0) lines.push(`- ${title} : ${items.join(', ')}`);
  };
  section('Skills', c.skills);
  section('Agents', c.agents);
  section('Commandes', c.commands);
  section('Instructions', c.instructions);
  section('Hooks (commandes lancées automatiquement)', c.hooks);
  for (const m of info.mcpServers)
    lines.push(
      `- Serveur MCP **${m.name}** : \`${m.command ? [m.command, ...(m.args ?? [])].join(' ') : (m.url ?? '')}\``,
    );
  section('Dépendances', info.dependencies);
  lines.push('', `## Fichiers (${info.files.length})`, '');
  for (const f of info.files) {
    lines.push(`### ${f.path}`, '');
    lines.push(f.text !== undefined ? fence(f.text) : `_${f.size} octets, non affiché._`, '');
  }
  return lines.join('\n');
}
