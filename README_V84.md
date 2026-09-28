# Selimna’s Holocron — V84

## Maintenance release
- Les feuilles CSS chargées auparavant en cascade sont fusionnées dans `styles/app.css`.
- `index.html` ne charge plus qu'une seule feuille de style.
- L'ordre de cascade historique a été conservé lors de la fusion pour limiter les régressions visuelles.
- Le doublon `id="analysisSetFilter"` a été supprimé.
- La version de l'interface, le cache de `app.js` et la description du manifeste indiquent V84.

## Versions fonctionnelles distinctes
- Application : V84
- Analyse des mods : moteur historique V176
- Les références internes historiques au parsing et aux workers sont conservées lorsqu'elles décrivent une version de composant, et non la release de l'application.

## JavaScript
`app.js` reste le point d'entrée historique. Son découpage en modules ES doit faire l'objet d'une étape séparée, avec tests de non-régression, car il contient des fonctions globales et des dépendances croisées. Cette release ne prétend pas avoir effectué ce découpage.
