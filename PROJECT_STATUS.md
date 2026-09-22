# SWGOH Optimizer Web — V9

## État actuel

- GitHub Pages : frontend statique
- Pyodide : moteur Python dans le navigateur
- Cloudflare Worker : relais vers SWGOH.GG
- Ally Code testé : 853-277-661
- Profil public : Selimna
- Mods récupérés : 1992
- Unités possédées API : 406 au total, incluant personnages et vaisseaux
- Les unités sont désormais séparées par `combat_type` :
  - `1` = personnages
  - `2` = vaisseaux
- Le compteur PERSONNAGES n'inclut plus les vaisseaux.
- Un compteur VAISSEAUX séparé est affiché.
- L'optimiseur reçoit uniquement les personnages.

## Important

Le nombre « 406 unités » annoncé par le profil SWGOH.GG ne doit pas être présenté comme « 406 personnages ». Le projet conserve les vaisseaux séparément afin de pouvoir exploiter leurs données plus tard.

## Infrastructure

Worker Cloudflare utilisé :
`https://swgoh-optimizer-relay.lorg75017.workers.dev`

Ne pas modifier le Worker tant que le chargement API fonctionne.
