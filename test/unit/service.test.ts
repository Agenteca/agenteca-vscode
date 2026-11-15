import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { AhubService, UserError } from '../../src/service';

const require = createRequire(import.meta.url);
const BIN = path.join(path.dirname(require.resolve('@agenteca/cli')), 'bin.js');
const created: string[] = [];
afterAll(async () => {
  await Promise.all(created.map((d) => rm(d, { recursive: true, force: true })));
});

async function project(): Promise<{ cwd: string; service: AhubService }> {
  const cwd = await mkdtemp(path.join(os.tmpdir(), 'agenteca-vscode-'));
  created.push(cwd);
  await mkdir(path.join(cwd, 'local-pkg', '.apm', 'skills', 'hello'), { recursive: true });
  await writeFile(
    path.join(cwd, 'local-pkg', 'apm.yml'),
    'name: local-pkg\nversion: 1.0.0\ndescription: Paquet local\n',
  );
  await writeFile(
    path.join(cwd, 'local-pkg', '.apm', 'skills', 'hello', 'SKILL.md'),
    '---\nname: hello\ndescription: Dit bonjour.\n---\nBonjour.\n',
  );
  const env = {
    PATH: process.env.PATH,
    AHUB_HOME: path.join(cwd, '.home'),
    AHUB_CACHE_DIR: path.join(cwd, '.cache'),
  };
  return {
    cwd,
    service: new AhubService(() => ({ ahubPath: process.execPath, binArgs: [BIN], tools: [], cwd, env })),
  };
}

describe('service (vraie CLI ahub)', () => {
  it('plans then applies, and reads the state again', async () => {
    const { cwd, service } = await project();
    expect(await service.version()).toBe('0.1.0');
    expect(await service.installed()).toEqual([]);

    const plan = await service.plan('add', ['./local-pkg'], ['claude']);
    expect(plan.files.map((f) => f.path)).toEqual(['.claude/skills/hello/SKILL.md']);
    expect(existsSync(path.join(cwd, '.claude'))).toBe(false);

    await expect(service.apply('add', ['./local-pkg'], 'f'.repeat(64), ['claude'])).rejects.toMatchObject({
      code: 'PLAN_CHANGED',
    });
    const done = await service.apply('add', ['./local-pkg'], plan.planHash, ['claude']);
    expect(done.applied).toBe(true);
    expect(existsSync(path.join(cwd, '.claude/skills/hello/SKILL.md'))).toBe(true);
    expect((await service.installed()).map((p) => p.name)).toEqual(['local-pkg']);
    expect(
      (await service.info('./local-pkg')).files.find((f) => f.path.endsWith('SKILL.md'))!.text,
    ).toContain('Bonjour.');
  });

  it('turns errors into messages for the user', async () => {
    const { service } = await project();
    // With no target tool detected or chosen: the extension then offers to choose.
    await expect(service.plan('add', ['./local-pkg'])).rejects.toMatchObject({ code: 'NO_TARGET' });
    await expect(service.plan('remove', ['absent'], ['claude'])).rejects.toBeInstanceOf(UserError);
    const noFolder = new AhubService(() => ({ ahubPath: 'ahub', tools: [], cwd: undefined }));
    await expect(noFolder.installed()).rejects.toMatchObject({ code: 'NO_WORKSPACE' });
    const missing = new AhubService(() => ({ ahubPath: 'ahub-introuvable', tools: [], cwd: os.tmpdir() }));
    await expect(missing.version()).rejects.toMatchObject({
      code: 'AHUB_UNAVAILABLE',
      message: expect.stringContaining('agenteca.ahubPath'),
    });
  });
});
