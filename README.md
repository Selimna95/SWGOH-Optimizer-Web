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

## V92.4 — Centre de décision Holocron

Le dashboard d'accueil a été refondu autour d'un centre de décision visuel :
- Holocron central avec trois faces d'accès : **Essentiel**, **Comprendre**, **Expert**.
- Flux d'énergie reliant les trois blocs de données à l'Holocron.
- Carte Personnages avec ventilation par étoiles.
- Carte Puissance galactique avec détail personnages / vaisseaux et proportions.
- Carte Mods avec ventilation par tranches de vitesse.
- Les identifiants DOM utilisés par le moteur existant sont conservés pour ne pas casser la synchronisation, l'analyse et l'Optimizer.


## V92.5 — Decision Center visual cleanup
- Holocron image isolated from its black photo background.
- Decision center cards made more readable and airy.
- Roster and mod ventilation enlarged.
- Character database links restored in mod detail and decision recommendations.
- Essential view redesigned as compact visual decision cards instead of long text blocks.
