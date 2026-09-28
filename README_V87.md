# Selimna’s Holocron — V87 — Correctif chargement du profil

## Correctif
- Retour au point d’entrée JavaScript complet `app.js`, conservé dans V86 comme référence historique.
- `index.html` ne charge plus les sept fichiers expérimentaux de `js/` : cela évite les régressions liées à leur ordre d’exécution et rétablit l’initialisation historique du bouton de chargement du profil.
- Conservation du CSS consolidé et du correctif V85.

## Vérifications
- Syntaxe JavaScript contrôlée avec `node --check app.js`.
- Le chargement distant dépend toujours de la disponibilité de SWGOH.GG et du Worker Cloudflare configuré ; un test réseau réel nécessite le navigateur de l’utilisateur.

Le découpage modulaire est reporté jusqu’à ce que chaque module puisse être testé sans interrompre le parcours de chargement.
