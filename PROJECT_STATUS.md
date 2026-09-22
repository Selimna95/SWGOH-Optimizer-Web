# SWGOH Optimizer Web — V10

## État

- GitHub Pages : frontend statique
- Pyodide : moteur Python dans le navigateur
- Cloudflare Worker : relais vers SWGOH.GG
- Ally Code testé : 853-277-661
- Profil public : Selimna
- Mods récupérés : 1992
- Unités possédées : 406
- Personnages : 336
- Vaisseaux : 70

## V10

La V10 ajoute un véritable explorateur de données :

- tableau des 336 personnages ;
- tableau des 70 vaisseaux ;
- tableau des mods ;
- recherche instantanée ;
- détails niveau / gear / étoiles / puissance ;
- séparation stricte personnages / vaisseaux ;
- sélection de personnage dans l'optimiseur ;
- affichage du statut du profil Kyber ;
- rendu détaillé des six mods de chaque build retourné par Python.

Les vaisseaux ne sont pas envoyés à l'optimiseur de mods personnages.

## Limite actuelle

Le fichier `python/kyber_profiles.json` embarqué dans cette version contient un nombre limité de profils de référence. Le roster complet peut être affiché, mais l'optimisation ne peut être lancée que pour les personnages disposant d'un profil Kyber dans ce fichier. L'étape suivante consiste à enrichir ces profils et/ou à reproduire les profils dynamiques de la version Windows.

## Infrastructure

Worker Cloudflare utilisé :
`https://swgoh-optimizer-relay.lorg75017.workers.dev`

Ne pas modifier le Worker tant que le chargement API fonctionne.
