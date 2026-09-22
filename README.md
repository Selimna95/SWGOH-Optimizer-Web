# SWGOH Optimizer Web V4

Version web statique de l'Optimizer : HTML/CSS/JS + Python via Pyodide.

## Nouveauté V4
Le navigateur ne peut pas toujours lire directement SWGOH.GG à cause du CORS. V4 accepte donc un **Cloudflare Worker** comme relais HTTP gratuit et sans PC serveur.

- `cloudflare-worker/worker.js` : code du Worker
- `app.js` : essaie le Worker s'il est configuré, puis la lecture directe
- `python/` : moteur Python et profils Kyber
- import JSON : solution de secours si la source publique refuse les requêtes

## Déploiement GitHub Pages
Copier le contenu de ce dossier à la racine du dépôt GitHub Pages.

## Déploiement Cloudflare Worker
1. Cloudflare Dashboard > Workers & Pages > Create application > Worker.
2. Donner un nom au Worker.
3. Remplacer le code par `cloudflare-worker/worker.js`.
4. Deploy.
5. Copier l'URL `https://...workers.dev`.
6. Dans l'application > AIDE, coller l'URL et cliquer sur ENREGISTRER LE RELAIS.

Le Worker est volontairement limité aux pages publiques de `swgoh.gg` et n'accepte qu'un Ally Code numérique de 9 chiffres.

## Limitation importante
SWGOH.GG peut modifier ses pages, son anti-bot ou ses règles d'accès. Le Worker ne garantit donc pas que la récupération automatique restera disponible en permanence. Aucun identifiant de compte EA n'est demandé par cette version.
