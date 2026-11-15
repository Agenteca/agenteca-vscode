import * as assert from 'node:assert';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';

/** Tests in a real VS Code. Modal dialogs cannot be automated: the full installation path is tested through the service. */
suite('extension Agenteca', () => {
  const workspace = vscode.workspace.workspaceFolders![0]!.uri.fsPath;
  let api: { service: any };

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension('agenteca.agenteca');
    assert.ok(ext, 'extension not found');
    api = await ext.activate();
  });

  test('declares its commands and its views', async () => {
    const commands = await vscode.commands.getCommands(true);
    for (const c of ['refresh', 'search', 'install', 'showPackage', 'update', 'updateAll', 'remove']) {
      assert.ok(commands.includes(`agenteca.${c}`), `command agenteca.${c} missing`);
    }
    const manifest = vscode.extensions.getExtension('agenteca.agenteca')!.packageJSON;
    assert.deepStrictEqual(
      manifest.contributes.views.agenteca.map((v: { id: string }) => v.id),
      ['agenteca.installed', 'agenteca.updates', 'agenteca.catalog'],
    );
  });

  test('reads its settings and talks to the ahub CLI', async () => {
    assert.strictEqual(await api.service.version(), '0.1.0');
    assert.deepStrictEqual(await api.service.installed(), []);
  });

  test('shows the content of a package in a read-only document', async () => {
    await vscode.commands.executeCommand('agenteca.showPackage', {
      kind: 'catalog',
      ref: './local-pkg',
      label: 'local-pkg',
      description: '',
      tooltip: '',
    });
    const doc = vscode.window.activeTextEditor?.document;
    assert.ok(doc, 'no document open');
    assert.strictEqual(doc.uri.scheme, 'agenteca');
    assert.ok(doc.getText().includes('# local-pkg 1.0.0'));
    assert.ok(doc.getText().includes('Bonjour depuis le test.'));
    assert.strictEqual(doc.isUntitled, false);
  });

  test("installs then removes a package through the extension's service", async () => {
    const plan = await api.service.plan('add', ['./local-pkg']);
    assert.deepStrictEqual(plan.targets, ['claude'], 'the agenteca.tools setting must be applied');
    const skill = path.join(workspace, '.claude', 'skills', 'hello', 'SKILL.md');
    assert.strictEqual(existsSync(skill), false, 'a plan must write nothing');
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
