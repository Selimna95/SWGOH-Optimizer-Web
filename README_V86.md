# Selimna’s Holocron — V86

## Architecture JavaScript

Le point d’entrée JavaScript historique `app.js` (environ 1 500 lignes) a été réparti en scripts classiques ordonnés dans `js/`. Les scripts restent en mode classique afin de préserver les fonctions et variables globales utilisées par l’interface HTML et les événements existants.

Ordre de chargement dans `index.html` :
1. `01-core.js` — état global et utilitaires ;
2. `02-kyber.js` — références Kyber ;
3. `03-profile.js` — chargement et normalisation du profil ;
4. `04-data.js` — données et inventaire ;
5. `05-optimizer-top.js` — moteur Optimizer et TOP 10 ;
6. `06-analysis.js` — analyse et réallocation ;
7. `07-startup.js` — initialisation et événements.

Le découpage conserve l’ordre d’origine pour limiter les risques de régression. `app.js` est conservé comme référence historique mais n’est plus chargé par la page.
