# SWGOH Optimizer Web V12

Version navigateur du projet SWGOH Optimizer V176.

## Architecture

- GitHub Pages pour l'interface
- Pyodide pour exécuter Python côté navigateur
- Cloudflare Worker pour relayer les requêtes publiques SWGOH.GG et contourner le CORS
- JSON comme solution de secours

## Données actuelles de test

Ally Code : `853-277-661`

- 336 personnages
- 70 vaisseaux
- 406 unités au total
- 1992 mods

## Déploiement

Le contenu de ce ZIP est prévu pour être copié à la racine de la branche `main` du dépôt GitHub Pages.

Le Worker Cloudflare est déjà opérationnel et ne doit pas être modifié pour cette étape.
