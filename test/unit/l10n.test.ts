import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ahubLanguage, t } from '../../src/l10n';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const LANGUAGES = ['fr', 'es', 'zh-cn', 'hi'];
const json = (file: string): Record<string, string> =>
  JSON.parse(readFileSync(path.join(root, file), 'utf8')) as Record<string, string>;

/** Every text passed as a literal to t() in the sources. */
function sourceMessages(): Set<string> {
  const found = new Set<string>();
  const call = /\bt\(\s*('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*")/g;
  for (const name of readdirSync(path.join(root, 'src'))) {
    if (name === 'l10n.ts') continue;
    for (const m of readFileSync(path.join(root, 'src', name), 'utf8').matchAll(call))
      found.add(m[1]!.slice(1, -1).replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c)));
  }
  return found;
}

const placeholders = (s: string): string[] =>
  [...new Set([...s.matchAll(/\{\d+\}/g)].map((m) => m[0]))].sort();

describe('translations of the extension', () => {
  const messages = sourceMessages();

  it('finds the texts of the sources', () => {
    expect(messages.size).toBeGreaterThan(50);
    expect(t('Update {0}', ['demo'])).toBe('Update demo');
  });

  it.each(LANGUAGES)('bundle %s translates every text of the code, and nothing else', (language) => {
    const bundle = json(`l10n/bundle.l10n.${language}.json`);
    const keys = Object.keys(bundle);
    expect(
      [...messages].filter((m) => !(m in bundle)),
      'texts with no translation',
    ).toEqual([]);
    expect(
      keys.filter((k) => !messages.has(k)),
      'translations of texts that no longer exist',
    ).toEqual([]);
    expect(keys).toEqual([...keys].sort());
    for (const [source, translation] of Object.entries(bundle)) {
      expect(translation.trim(), source).not.toBe('');
      expect(placeholders(translation), source).toEqual(placeholders(source));
    }
  });

  it.each(LANGUAGES)('package.nls.%s.json translates every text of the manifest', (language) => {
    const reference = json('package.nls.json');
    const translated = json(`package.nls.${language}.json`);
    expect(Object.keys(translated)).toEqual(Object.keys(reference));
    for (const [key, text] of Object.entries(translated)) {
      expect(text.trim(), key).not.toBe('');
      // Command links and code spans must survive translation.
      const fixed = (s: string): string[] =>
        [...s.matchAll(/\(command:[a-zA-Z.]+\)|`[^`]+`/g)].map((m) => m[0]).sort();
      expect(fixed(text), key).toEqual(fixed(reference[key]!));
    }
  });

  it('the manifest only refers to texts that exist', () => {
    const manifest = readFileSync(path.join(root, 'package.json'), 'utf8');
    const used = [...manifest.matchAll(/"%([a-zA-Z.]+)%"/g)].map((m) => m[1]!);
    expect(used.length).toBeGreaterThan(10);
    expect([...new Set(used)].sort()).toEqual(Object.keys(json('package.nls.json')).sort());
    expect(JSON.parse(manifest).l10n).toBe('./l10n');
  });

  it('tells ahub which language the editor uses', () => {
    expect(ahubLanguage('fr')).toBe('fr');
    expect(ahubLanguage('zh-cn')).toBe('zh');
    expect(ahubLanguage('pt-BR')).toBe('pt');
  });
});
