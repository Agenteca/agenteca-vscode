# Agenteca for VS Code

Browse a catalog of AI agents, read what a package contains, install it and keep it up to date — for Claude Code, Codex, GitHub Copilot and Cursor — without leaving the editor.

The extension also works in Cursor, VSCodium and other VS Code derivatives, through Open VSX.

> Status: 0.1.0, not published (neither on the VS Code Marketplace nor on Open VSX).

## Requirements

The extension is a thin shell over the `ahub` command: it contains no installation logic. Install the CLI:

```bash
npm install -g @agenteca/cli
```

If `ahub` is not in the `PATH`, set its path in the `agenteca.ahubPath` setting.

## What it does

An **Agenteca** icon in the activity bar opens three views:

| View | Content | Actions |
|---|---|---|
| **Installed** | Packages of the project | Show content, remove, install a package |
| **Updates** | Packages with a newer version that respects the manifest | Update, update all |
| **Catalog** | Packages of the configured registries | Show content, install, search |

The same commands are in the Command Palette, under "Agenteca".

## Nothing is written without your agreement

Installing, updating or removing always goes like this:

1. The extension asks `ahub` for the **plan** and opens it in the editor: files written or removed, configuration files modified, hooks and MCP servers with their exact command, result of the security scan.
2. A dialog asks you to **apply** it.
3. `ahub` applies that exact plan; if the repository changed in between, it refuses and the new plan has to be read.

- A package whose scan finds a **critical problem** cannot be installed from the extension.
- A **file edited by hand** is only overwritten or deleted after a separate agreement, which lists those files.
- The content of a package is shown as read-only **plain text**, never as a rendered preview: it is not trusted.
- The extension is disabled in untrusted workspaces.

## Languages

The extension follows the display language of VS Code: English, French, Spanish, Chinese (Simplified) and Hindi. It passes the same language to `ahub` (`AHUB_LANG`), so that the plans and messages of the CLI match.

Texts of the code are translated in `l10n/bundle.l10n.<language>.json`, those of the manifest (views, commands, settings) in `package.nls.<language>.json`. `test/unit/l10n.test.ts` fails when a text has no translation.

## Settings

| Setting | Default | Purpose |
|---|---|---|
| `agenteca.ahubPath` | `ahub` | Path of the `ahub` command |
| `agenteca.tools` | `[]` | Target tools (`claude`, `codex`, `copilot`, `cursor`). Empty: those of the manifest, otherwise those detected; failing that, the extension asks you. |

Registries are configured in a terminal: `ahub registry add <url>`.

## Checked, not checked

- Checked by the tests: the display logic, the dialogue with the real CLI, the completeness of the translations and, in a real VS Code, activation, the commands, reading a package and an install-then-remove cycle.
- Not checked: the path through the dialogs (cannot be automated), the look of the views, the translated interface in a VS Code set to another language, and use in Cursor or VSCodium.

## Development

```bash
npm install
```

```bash
npm test
```

Tests in a real VS Code (downloaded on first run; on Linux without a screen, or in a Wayland session, prefix with `xvfb-run -a` and unset `WAYLAND_DISPLAY`):

```bash
npm run test:integration
```

`.vsix` package:

```bash
npm run package
```

Publication, once decided: `vsce publish` for the Marketplace, `npx ovsx publish` for Open VSX.

## License

Apache-2.0.
