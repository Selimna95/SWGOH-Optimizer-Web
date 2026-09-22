# SWGOH Optimizer Web — V23

## V23 — Analyse Mods V176 portée dans le projet Web

Cette version conserve la base V17 (SWGOH.GG → Cloudflare Worker → données du roster → Pyodide/Python → optimisation dans un Web Worker) et ajoute une migration Web de la partie **analyse des mods** du projet Windows V176.

### Fonctionnalités portées

- Récapitulatif des mods avec ventilation exacte par Speed secondaire :
  - 1–10
  - 11–15
  - 16–21
  - >21
  - Primaire Speed
  - Sans Speed
- Les tranches de Speed sont cliquables et ouvrent l'inventaire filtré.
- Audit des personnages : 0/6, incomplets, très faibles, faibles, moyens, bons.
- Sélection directe par personnage.
- Sélection par faction puis personnage.
- Détail des 6 mods équipés du personnage sélectionné.
- Inventaire complet des mods avec filtres :
  - set
  - slot
  - tranche de Speed
  - propriétaire
  - primaire
  - niveau minimum
  - recherche libre
  - tri
- Fenêtre de détail d'un mod.
- Les seuils de statut d'audit suivent V176 :
  - 0 mod = SANS MODS
  - < 6 = INCOMPLETS
  - Speed totale < 30 = TRÈS FAIBLES
  - < 50 = FAIBLES
  - < 70 = MOYENS
  - ≥ 70 = BONS
- Le Speed primaire est compté séparément dans le récapitulatif, comme dans V176.
- Les vaisseaux sont exclus de l'analyse mods personnages.
- Les données réelles SWGOH.GG restent la source de l'inventaire.

### Base V176 utilisée

Les règles portées proviennent notamment de :
- `main.py` — récapitulatif / Audit Mods / sélection personnage-faction
- `kyber_gap.py` — normalisation des slots et analyse des mods équipés
- `importer.py` — normalisation des données de mods

### V17 conservé

- Optimisation Kyber live.
- Profil Kyber SWGOH.GG.
- 1 992 mods exploitables sur le compte de test.
- 336 personnages / 70 vaisseaux / 406 unités.
- Calcul Python dans `optimizer-worker.mjs`.
- `optimizer_profiles.json` pour les statistiques du roster.

## Limite volontaire V23

Le mapping de factions Web utilise d'abord les catégories éventuellement présentes dans les données du roster, puis un mapping local de compatibilité V176. Il sera renforcé par le Game Data officiel dans une prochaine étape si nécessaire.
