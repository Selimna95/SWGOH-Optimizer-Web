# SWGOH Optimizer Web

Version navigateur du SWGOH Optimizer V176 HUD Global.

## Architecture

- GitHub Pages : interface web statique
- Pyodide/WebAssembly : exécution de Python dans le navigateur
- Cloudflare Worker : relais CORS vers les pages/API publiques SWGOH.GG
- JSON : solution de secours pour l'import manuel

## Données du roster

L'API publique utilisée renvoie des **unités**, pas uniquement des personnages. Le projet distingue désormais :

- `combat_type = 1` : personnages
- `combat_type = 2` : vaisseaux

Le compteur PERSONNAGES exclut donc les vaisseaux. Les vaisseaux sont conservés séparément dans `currentData.ships` pour une future gestion des fleets.

Test validé avec le profil `Selimna` : 406 unités possédées au total et 1992 mods récupérables. Le nombre exact de personnages et de vaisseaux est calculé automatiquement par le navigateur à partir de `combat_type`.

## Déploiement

Le contenu de cette archive est prévu pour être copié à la racine du dépôt GitHub Pages.

Ne pas modifier le Worker Cloudflare si le relais fonctionne.
