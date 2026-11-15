/**
 * Texts of the extension are written in English and translated by VS Code itself: the bundles in
 * `l10n/bundle.l10n.<language>.json` map each English text to its translation, and VS Code picks
 * the one matching its display language. This module only exists so that `model.ts` and
 * `service.ts` stay free of the `vscode` API (and testable without it).
 */
export type Translate = (message: string, args: (string | number | boolean)[]) => string;

function english(message: string, args: readonly unknown[]): string {
  return message.replace(/\{(\d+)\}/g, (placeholder, index: string) => {
    const i = Number(index);
    return i < args.length ? String(args[i]) : placeholder;
  });
}

let translate: Translate = english;

/** Called once at activation with `vscode.l10n.t`. Without it (unit tests), texts stay in English. */
export function setTranslator(fn: Translate | undefined): void {
  translate = fn ?? english;
}

/** Translate `message` (a literal: it is the key in the bundles), replacing `{0}`, `{1}`… with `args`. */
export function t(message: string, args: readonly (string | number | boolean)[] = []): string {
  return translate(message, [...args]);
}

/** VS Code display language ("fr", "zh-cn", "pt-br"…) → value for AHUB_LANG, so that ahub answers in the same language. */
export function ahubLanguage(displayLanguage: string): string {
  return displayLanguage.toLowerCase().split('-')[0] ?? 'en';
}
