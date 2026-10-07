# Architecture modulaire V186

| Module | Responsabilité |
|---|---|
| `modules/core.js` | identification, import, dashboard, données communes, roster, mods, Kyber |
| `modules/acolyte.js` | Acolyte / Holocron / changements prioritaires |
| `modules/disciple.js` | Disciple / réaffectation mod par mod |
| `modules/seigneur.js` | Seigneur Sith / Forge personnage |
| `modules/sithari.js` | Sith’Ari / Renforcement / Calibrage |
| `modules/runtime.js` | navigation + branchement des événements + démarrage |

Les modules restent des scripts classiques afin de conserver la compatibilité avec les globals existants. Les modifications fonctionnelles doivent être faites dans le module concerné.
