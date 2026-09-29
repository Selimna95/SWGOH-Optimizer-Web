# Selimna’s Holocron V93.4 — Relais Cloudflare

## Pourquoi la V93.3 affiche `Relais Cloudflare inaccessible`

Le navigateur ne peut pas charger SWGOH.GG directement à cause du CORS. Le projet utilise donc `cloudflare-worker/worker.js`. L’URL précédemment intégrée (`swgoh-optimizer-relay.lorg75017.workers.dev`) n’est plus joignable : aucune modification du parseur de mods côté navigateur ne peut réparer un relais qui ne répond pas.

## Déployer le relais

1. Créer/connecter un compte Cloudflare.
2. Installer Wrangler : `npm install -g wrangler`
3. Depuis ce dossier, exécuter : `wrangler login` puis `wrangler deploy`
4. Cloudflare donnera une URL du type `https://swgoh-optimizer-relay.<votre-compte>.workers.dev`.
5. Ouvrir l’Holocron et saisir cette URL dans **RELAIS CLOUDFLARE** puis cliquer **TESTER**.
6. Quand le test affiche **RELAIS OPÉRATIONNEL ✓**, entrer le code allié et activer l’Holocron.

Le Worker fourni est déjà configuré pour relayer le profil, les personnages, les mods et les fiches d’unités/mods.
