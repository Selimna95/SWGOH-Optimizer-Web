# SWGOH Optimizer Web V8

Version web statique du **SWGOH Optimizer V176 HUD Global**, adaptée au navigateur :

- GitHub Pages pour l’interface statique
- Pyodide/WebAssembly pour exécuter le moteur Python dans le navigateur
- Cloudflare Worker comme relais vers les pages/API publiques de SWGOH.GG
- import JSON comme solution de secours
- aucun serveur local et aucun logiciel à installer sur le PC de l’utilisateur

## État vérifié

Testé avec le profil public :

- Ally Code de test : `853-277-661`
- Profil : `Selimna`
- Roster annoncé par SWGOH.GG : `406 unités`
- Unités API retenues : `406`
- Personnages récupérés : `406`
- Mods exploitables : `1992`
- Python/Pyodide : `OK`

Le correctif V7 qui limitait le parseur aux vraies entrées de `json.units[]` est inclus dans V8.

## Fichiers

- `index.html` — interface principale
- `styles.css` — thème HUD
- `app.js` — chargement du profil, parsing SWGOH.GG, liaison Pyodide et affichage
- `python/optimizer.py` — moteur d’optimisation Python
- `python/kyber_profiles.json` — profils de référence
- `cloudflare-worker/worker.js` — relais SWGOH.GG
- `manifest.webmanifest` — métadonnées PWA

## GitHub Pages

Le contenu de ce dossier peut être placé à la racine du dépôt GitHub Pages.

URL actuelle du projet :
`https://selimna95.github.io/SWGOH-Optimizer-Web/`

## Cloudflare Worker

Worker actuellement utilisé :
`https://swgoh-optimizer-relay.lorg75017.workers.dev`

Le Worker accepte notamment :

- `profile`
- `characters`
- `mods`
- `api-profile`
- `api-mods`

Le Worker ne reçoit aucun mot de passe EA. Il relaie uniquement des ressources publiques de SWGOH.GG.

## Pyodide

V8 utilise **Pyodide 314.0.7**, version stable correspondant à Python 3.14.2 dans la branche 314.0.x. La documentation Pyodide indique que Pyodide peut être exécuté directement dans un navigateur et que GitHub Pages peut héberger les fichiers statiques nécessaires.

## Utilisation

1. Ouvrir l’application.
2. Saisir l’Ally Code.
3. Cliquer sur `CHARGER MON PROFIL`.
4. Vérifier le journal : `406 personnages` et les mods récupérés.
5. Aller dans `OPTIMIZER`.
6. Choisir le personnage et lancer l’optimisation.

## Important

SWGOH.GG peut modifier son HTML, ses endpoints publics ou ses protections. Le relais et les parseurs peuvent donc nécessiter une adaptation ultérieure.

Les composants Windows spécifiques du projet original (Comlink.exe, PyInstaller, GUI Windows, etc.) ne sont volontairement pas inclus dans cette version web : ils ne peuvent pas être exécutés dans un navigateur WebAssembly.
