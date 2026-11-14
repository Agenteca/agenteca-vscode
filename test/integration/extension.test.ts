import * as assert from 'node:assert';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

/** Tests dans un vrai VS Code. Les boîtes de dialogue modales ne sont pas automatisables : le parcours d'installation complet est testé par le service. */
suite('extension Agenteca', () => {
  const workspace = vscode.workspace.workspaceFolders![0]!.uri.fsPath;
  let api: { service: any };

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('agenteca.agenteca');
    assert.ok(ext, 'extension introuvable');
    api = await ext.activate();
  });

  test('déclare ses commandes et ses vues', async () => {
    const commands = await vscode.commands.getCommands(true);
    for (const c of ['refresh', 'search', 'install', 'showPackage', 'update', 'updateAll', 'remove']) {
      assert.ok(commands.includes(`agenteca.${c}`), `commande agenteca.${c} absente`);
    }
    const manifest = vscode.extensions.getExtension('agenteca.agenteca')!.packageJSON;
    assert.deepStrictEqual(
      manifest.contributes.views.agenteca.map((v: { id: string }) => v.id),
      ['agenteca.installed', 'agenteca.updates', 'agenteca.catalog'],
    );
  });

  test('lit ses réglages et parle à la CLI ahub', async () => {
    assert.strictEqual(await api.service.version(), '0.1.0');
    assert.deepStrictEqual(await api.service.installed(), []);
  });

  test('montre le contenu d’un paquet dans un document en lecture seule', async () => {
    await vscode.commands.executeCommand('agenteca.showPackage', {
      kind: 'catalog',
      ref: './local-pkg',
      label: 'local-pkg',
      description: '',
      tooltip: '',
    });
    const doc = vscode.window.activeTextEditor?.document;
    assert.ok(doc, 'aucun document ouvert');
    assert.strictEqual(doc.uri.scheme, 'agenteca');
    assert.ok(doc.getText().includes('# local-pkg 1.0.0'));
    assert.ok(doc.getText().includes('Bonjour depuis le test.'));
    assert.strictEqual(doc.isUntitled, false);
  });

  test('installe puis retire un paquet par le service de l’extension', async () => {
    const plan = await api.service.plan('add', ['./local-pkg']);
    assert.deepStrictEqual(plan.targets, ['claude'], 'le réglage agenteca.tools doit être appliqué');
    const skill = path.join(workspace, '.claude', 'skills', 'hello', 'SKILL.md');
    assert.strictEqual(existsSync(skill), false, 'un plan ne doit rien écrire');
    await api.service.apply('add', ['./local-pkg'], plan.planHash);
    assert.strictEqual(existsSync(skill), true);
    await vscode.commands.executeCommand('agenteca.refresh');
    assert.deepStrictEqual(
      (await api.service.installed()).map((p: { name: string }) => p.name),
      ['local-pkg'],
    );
    const removal = await api.service.plan('remove', ['./local-pkg']);
    await api.service.apply('remove', ['./local-pkg'], removal.planHash);
    assert.strictEqual(existsSync(skill), false);
  });
});
