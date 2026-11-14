# Agenteca pour VS Code

Parcourez un catalogue d'agents IA, lisez ce qu'un paquet contient, installez-le et tenez-le à jour — pour Claude Code, Codex, GitHub Copilot et Cursor — sans quitter l'éditeur.

L'extension fonctionne aussi dans Cursor, VSCodium et les autres dérivés de VS Code, via Open VSX.

> État : 0.1.0, non publiée (ni sur le Marketplace de VS Code, ni sur Open VSX).

## Prérequis

L'extension est une coque fine au-dessus de la commande `ahub` : elle ne contient aucune logique d'installation. Installez la CLI :

```bash
npm install -g @agenteca/cli
```

Si `ahub` n'est pas dans le `PATH`, indiquez son chemin dans le réglage `agenteca.ahubPath`.

## Ce qu'elle fait

Une icône **Agenteca** dans la barre d'activité ouvre trois vues :

| Vue | Contenu | Actions |
|---|---|---|
| **Installés** | Paquets du projet | Voir le contenu, retirer, installer un paquet |
| **Mises à jour** | Paquets dont une version plus récente respecte le manifeste | Mettre à jour, tout mettre à jour |
| **Catalogue** | Paquets des registres configurés | Voir le contenu, installer, chercher |

Les mêmes commandes sont dans la palette, sous « Agenteca ».

## Rien n'est écrit sans votre accord

Installer, mettre à jour ou retirer se fait toujours ainsi :

1. L'extension demande le **plan** à `ahub` et l'ouvre dans l'éditeur : fichiers écrits ou retirés, fichiers de configuration modifiés, hooks et serveurs MCP avec leur commande exacte, résultat du scan de sécurité.
2. Une boîte de dialogue vous demande d'**appliquer**.
3. `ahub` applique ce plan exact ; si le dépôt a changé entre-temps, il refuse et il faut relire le nouveau plan.

- Un paquet dont le scan relève un **problème critique** ne peut pas être installé depuis l'extension.
- Un **fichier modifié à la main** n'est écrasé ou supprimé qu'après un accord distinct, qui liste ces fichiers.
- Le contenu d'un paquet s'affiche comme **texte brut** en lecture seule, jamais comme aperçu rendu : il n'est pas de confiance.
- L'extension est désactivée dans les espaces de travail non approuvés.

## Réglages

| Réglage | Défaut | Rôle |
|---|---|---|
| `agenteca.ahubPath` | `ahub` | Chemin de la commande `ahub` |
| `agenteca.tools` | `[]` | Outils visés (`claude`, `codex`, `copilot`, `cursor`). Vide : ceux du manifeste, sinon ceux détectés ; à défaut, l'extension vous les demande. |

Les registres se configurent dans un terminal : `ahub registry add <url>`.

## Vérifié, non vérifié

- Vérifié par les tests : la logique d'affichage, le dialogue avec la vraie CLI, et, dans un vrai VS Code, l'activation, les commandes, la lecture d'un paquet et un cycle installation puis retrait.
- Non vérifié : le parcours avec les boîtes de dialogue (non automatisables), l'apparence des vues, et le fonctionnement dans Cursor ou VSCodium.

## Développement

```bash
npm install
```

```bash
npm test
```

Tests dans un vrai VS Code (le télécharge au premier lancement ; sous Linux sans écran, préfixez par `xvfb-run -a`) :

```bash
npm run test:integration
```

Paquet `.vsix` :

```bash
npm run package
```

Publication, quand elle sera décidée : `vsce publish` pour le Marketplace, `npx ovsx publish` pour Open VSX.

## Licence

Apache-2.0.
