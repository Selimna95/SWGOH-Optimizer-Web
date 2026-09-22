# SWGOH Optimizer Web — V1

Cette V1 transforme le moteur Python `optimizer.py` en module exécutable dans le navigateur via Pyodide/WebAssembly.

## Ce qui fonctionne
- Interface HUD responsive PC/tablette/mobile.
- Chargement de Python directement dans le navigateur.
- Import local d'un JSON.
- Détection d'un tableau `mods` standard.
- Utilisation du moteur `optimizer.py` original.
- Profils Kyber embarqués.
- Aucun backend Python.
- Aucun envoi du fichier importé par cette V1.

## Ce qui reste à faire
1. Adapter le convertisseur `player_data.json` Comlink (`rosterUnit/equippedStatMod`) sans SQLite.
2. Remplacer les fonctions SWGOH.GG/requests par des sources accessibles depuis le navigateur ou des données embarquées.
3. Porter les écrans Roster, Mods, GAC, Kyber Gap et audit.
4. Ajouter IndexedDB si l'on veut conserver les données localement entre les sessions.
5. Ajouter un service worker PWA complet pour un usage hors-ligne après premier chargement.

## Test local
Pour un test local, servir le dossier avec un serveur HTTP statique (ex. `python -m http.server 8000`). Ce serveur est uniquement nécessaire pour le test local : en production, un hébergement statique gratuit suffit.

Ouvrir `http://localhost:8000/`.

## Publication gratuite
Le dossier peut être publié sur GitHub Pages ou Cloudflare Pages. Aucun serveur Python n'est nécessaire.
