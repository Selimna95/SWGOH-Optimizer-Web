# Selimna’s Holocron — V92.3

Version propre de l’application web avec portail Holocron à l’entrée.

## Parcours d’entrée

1. La photo réelle de l’Holocron est affichée au centre sur fond noir.
2. Le Code Allié est positionné à la base de l’Holocron.
3. À la validation, les lignes d’énergie s’activent et l’Holocron s’intensifie.
4. L’animation d’ouverture dure environ 2 secondes avant la transition.
5. Le dashboard apparaît après la synchronisation du roster.

## Structure

- `index.html` — interface
- `app.css` — styles, dont le portail Holocron unique
- `app.js` — logique de l’application et synchronisation
- `optimizer-worker.mjs` — worker Optimizer
- `python/` — moteur et données nécessaires à l’Optimizer
- `assets/backgrounds/` — uniquement les visuels encore utilisés par le dashboard
- `assets/icons/` — icônes de factions
- `cloudflare-worker/` — worker de relais facultatif
