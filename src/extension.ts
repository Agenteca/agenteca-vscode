import type { Tool } from '@agenteca/cli/client';
import * as vscode from 'vscode';
import {
  catalogNodes,
  fileConflicts,
  hasChanges,
  installedNodes,
  packageMarkdown,
  type PackageNode,
  planSummary,
  planText,
  updateNodes,
} from './model';
import { AhubService, type ChangeKind, UserError } from './service';

const TOOLS: Array<{ id: Tool; label: string }> = [
  { id: 'claude', label: 'Claude Code' },
  { id: 'codex', label: 'Codex' },
  { id: 'copilot', label: 'GitHub Copilot' },
  { id: 'cursor', label: 'Cursor' },
];

class PackageTree implements vscode.TreeDataProvider<PackageNode> {
  private readonly changed = new vscode.EventEmitter<void>();
  readonly onDidChangeTreeData = this.changed.event;
  private nodes: PackageNode[] = [];

  constructor(private readonly load: () => Promise<PackageNode[]>) {}

  refresh(): void {
    this.changed.fire();
  }

  getTreeItem(node: PackageNode): vscode.TreeItem {
    const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
    item.description = node.description;
    item.tooltip = node.tooltip;
    item.contextValue = `agenteca.${node.kind}`;
    item.iconPath = new vscode.ThemeIcon(node.kind === 'update' ? 'arrow-circle-up' : 'package');
    item.command = { command: 'agenteca.showPackage', title: 'Voir le contenu', arguments: [node] };
    return item;
  }

  async getChildren(node?: PackageNode): Promise<PackageNode[]> {
    if (node) return [];
    try {
      this.nodes = await this.load();
    } catch (e) {
      // Une vue vide avec son message d'accueil vaut mieux qu'une erreur à chaque rafraîchissement.
      this.nodes = [];
      if (e instanceof UserError && e.code !== 'NOT_FOUND' && e.code !== 'NO_WORKSPACE')
        void vscode.window.showWarningMessage(`Agenteca : ${e.message}`);
    }
    return this.nodes;
  }
}

/** Documents virtuels en lecture seule : plan avant application, fiche d'un paquet. */
class VirtualDocs implements vscode.TextDocumentContentProvider {
  static readonly scheme = 'agenteca';
  private readonly contents = new Map<string, string>();
  private readonly changed = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.changed.event;

  set(name: string, content: string): vscode.Uri {
    const uri = vscode.Uri.from({ scheme: VirtualDocs.scheme, path: `/${name}` });
    this.contents.set(uri.toString(), content);
    this.changed.fire(uri);
    return uri;
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? '';
  }
}

export interface ExtensionApi {
  /** Pour les tests d'intégration. */
  service: AhubService;
}

export function activate(context: vscode.ExtensionContext): ExtensionApi {
  const service = new AhubService(() => {
    const config = vscode.workspace.getConfiguration('agenteca');
    return {
      ahubPath: config.get<string>('ahubPath', 'ahub'),
      tools: config.get<Tool[]>('tools', []),
      cwd: vscode.workspace.workspaceFolders?.[0]?.uri.fsPath,
    };
  });
  const docs = new VirtualDocs();
  const installed = new PackageTree(async () => installedNodes(await service.installed()));
  const updates = new PackageTree(async () => updateNodes(await service.outdated()));
  const catalog = new PackageTree(async () => catalogNodes((await service.search('')).results));
  const refresh = (): void => {
    installed.refresh();
    updates.refresh();
    catalog.refresh();
  };

  const guard = async (action: () => Promise<void>): Promise<void> => {
    try {
      await action();
    } catch (e) {
      void vscode.window.showErrorMessage(`Agenteca : ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  /** Plan → lecture par l'utilisateur → accord → application du plan exact. */
  const change = async (kind: ChangeKind, packages: string[], title: string): Promise<void> => {
    let tools: Tool[] | undefined;
    let overwrite: string[] = [];
    const compute = () =>
      vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: `Agenteca : ${title} — calcul du plan…` },
        () => service.plan(kind, packages, tools, overwrite),
      );

    let plan;
    try {
      plan = await compute();
    } catch (e) {
      if (!(e instanceof UserError) || e.code !== 'NO_TARGET') throw e;
      const picked = await vscode.window.showQuickPick(
        TOOLS.map((t) => ({ label: t.label, id: t.id })),
        {
          canPickMany: true,
          title: 'Pour quels outils installer ?',
          placeHolder: 'Aucun outil détecté dans ce projet',
        },
      );
      if (!picked || picked.length === 0) return;
      tools = picked.map((p) => p.id);
      plan = await compute();
    }

    if (!hasChanges(plan)) {
      void vscode.window.showInformationMessage('Agenteca : tout est à jour, rien à faire.');
      return;
    }
    const uri = docs.set('Plan Agenteca.txt', planText(plan));
    await vscode.window.showTextDocument(uri, { preview: true, preserveFocus: true });

    if (plan.scan.blocked) {
      void vscode.window.showErrorMessage(
        `Agenteca : le scan de sécurité a relevé ${plan.scan.summary.critical} problème(s) critique(s). L’installation est refusée. Le détail est dans le plan affiché.`,
        { modal: true },
      );
      return;
    }
    const conflicts = fileConflicts(plan);
    if (conflicts.length > 0) {
      const answer = await vscode.window.showWarningMessage(
        `${conflicts.length} fichier(s) modifié(s) à la main seraient écrasés ou supprimés.`,
        { modal: true, detail: conflicts.join('\n') },
        'Écraser ces fichiers',
      );
      if (answer !== 'Écraser ces fichiers') return;
      overwrite = conflicts;
      // Le plan change avec cet accord : il est recalculé, et c'est ce nouveau plan qui sera appliqué.
      plan = await compute();
      docs.set('Plan Agenteca.txt', planText(plan));
    }
    const ok = await vscode.window.showWarningMessage(
      `${title} ?`,
      { modal: true, detail: `${planSummary(plan)}\n\nLe plan complet est ouvert dans l’éditeur.` },
      'Appliquer',
    );
    if (ok !== 'Appliquer') return;

    const done = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: `Agenteca : ${title}…` },
      () => service.apply(kind, packages, plan.planHash, tools, overwrite),
    );
    refresh();
    void vscode.window.showInformationMessage(
      `Agenteca : ${done.result?.written.length ?? 0} fichier(s) écrit(s), ${done.result?.removed.length ?? 0} retiré(s).`,
    );
  };

  const showPackage = async (ref: string): Promise<void> => {
    const info = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Window, title: 'Agenteca : lecture du paquet…' },
      () => service.info(ref),
    );
    // Affiché comme texte Markdown, pas comme aperçu rendu : le contenu d'un paquet n'est pas de confiance.
    const uri = docs.set(`${info.name}.md`, packageMarkdown(info));
    await vscode.window.showTextDocument(uri, { preview: true });
  };

  context.subscriptions.push(
    vscode.workspace.registerTextDocumentContentProvider(VirtualDocs.scheme, docs),
    vscode.window.registerTreeDataProvider('agenteca.installed', installed),
    vscode.window.registerTreeDataProvider('agenteca.updates', updates),
    vscode.window.registerTreeDataProvider('agenteca.catalog', catalog),
    vscode.commands.registerCommand('agenteca.refresh', refresh),
    vscode.commands.registerCommand('agenteca.showPackage', (node?: PackageNode) =>
      guard(async () => node && showPackage(node.ref)),
    ),
    vscode.commands.registerCommand('agenteca.install', (node?: PackageNode) =>
      guard(async () => {
        const ref =
          node?.ref ??
          (await vscode.window.showInputBox({
            title: 'Installer un paquet',
            prompt: 'propriétaire/dépôt, propriétaire/dépôt@tag, URL git, chemin local, ou nom@registre',
            placeHolder: 'acme/code-review@v1.2.0',
            ignoreFocusOut: true,
          }));
        if (ref?.trim()) await change('add', [ref.trim()], `Installer ${ref.trim()}`);
      }),
    ),
    vscode.commands.registerCommand('agenteca.search', () =>
      guard(async () => {
        const query = await vscode.window.showInputBox({
          title: 'Chercher dans le catalogue',
          prompt: 'Mots à chercher (vide : tout le catalogue)',
        });
        if (query === undefined) return;
        const found = await service.search(query);
        if (found.results.length === 0) {
          void vscode.window.showInformationMessage(
            found.failures.length > 0
              ? `Agenteca : ${found.failures.map((f) => f.message).join(' ; ')}`
              : 'Agenteca : aucun paquet trouvé.',
          );
          return;
        }
        const nodes = catalogNodes(found.results);
        const picked = await vscode.window.showQuickPick(
          nodes.map((n) => ({
            label: n.label,
            description: n.description,
            detail: n.tooltip.split('\n')[0] ?? '',
            node: n,
          })),
          { title: 'Résultats', matchOnDescription: true, matchOnDetail: true },
        );
        if (!picked) return;
        const action = await vscode.window.showQuickPick(['Voir le contenu', 'Installer'], {
          title: picked.label,
        });
        if (action === 'Voir le contenu') await showPackage(picked.node.ref);
        else if (action === 'Installer') await change('add', [picked.node.ref], `Installer ${picked.label}`);
      }),
    ),
    vscode.commands.registerCommand('agenteca.update', (node?: PackageNode) =>
      guard(async () => node && change('update', [node.ref], `Mettre à jour ${node.label}`)),
    ),
    vscode.commands.registerCommand('agenteca.updateAll', () =>
      guard(() => change('update', [], 'Mettre à jour tous les paquets')),
    ),
    vscode.commands.registerCommand('agenteca.remove', (node?: PackageNode) =>
      guard(async () => node && change('remove', [node.ref], `Retirer ${node.label}`)),
    ),
    vscode.workspace.onDidChangeConfiguration((e) => e.affectsConfiguration('agenteca') && refresh()),
  );

  const watcher = vscode.workspace.createFileSystemWatcher('**/apm.lock.yaml');
  context.subscriptions.push(
    watcher,
    watcher.onDidChange(refresh),
    watcher.onDidCreate(refresh),
    watcher.onDidDelete(refresh),
  );
  return { service };
}

export function deactivate(): void {
  // Rien à libérer : tout est dans context.subscriptions.
}
