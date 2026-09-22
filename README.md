# SWGOH Optimizer Web V19

Version navigateur de SWGOH Optimizer V176.

## Architecture

- GitHub Pages : interface.
- Cloudflare Worker : relais SWGOH.GG.
- Pyodide : moteur Python.
- Web Worker : optimisation sans blocage de l'interface.

## V19 — Analyse Mods

La version Web reprend maintenant la partie importante de l'analyse V176 :

- ventilation des mods par tranches de Speed ;
- détail des mods par personnage ;
- sélection par faction puis personnage ;
- audit 0/6, incomplet et niveaux de Speed ;
- inventaire complet des mods ;
- filtres set / slot / Speed / primaire / propriétaire / niveau ;
- détail individuel d'un mod.

Les tranches de Speed et les seuils de statut suivent les règles présentes dans V176.

## Installation

Déployer les fichiers du ZIP sur la branche `main` de GitHub Pages. V19 conserve le Worker d'optimisation de V17 et le relais Cloudflare V15/V17.
