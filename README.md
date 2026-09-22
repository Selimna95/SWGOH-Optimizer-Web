# SWGOH Optimizer Web V3

Version statique destinée à GitHub Pages.

## V3
- Ally Code -> page publique SWGOH.GG
- récupération du roster via `/characters/`
- récupération des mods via `/mods/?page=N`
- plusieurs relais CORS publics de secours
- aucun identifiant SWGOH demandé
- moteur Python via Pyodide
- import JSON conservé comme secours
- structure `python/optimizer.py` et `python/kyber_profiles.json`

### Limite importante
SWGOH.GG n'est pas une API officielle publique pour cette application. La V3 lit uniquement les pages publiques et dépend donc de leur structure HTML et de la disponibilité des relais CORS. Une API publique/serveur dédié serait plus robuste, mais nécessiterait une infrastructure distincte.
