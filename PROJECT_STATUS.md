# État du projet — V8

Date de préparation : 22 septembre 2026.

## Vérification fonctionnelle réalisée

Avec l’Ally Code `853-277-661` :

```text
API : 406 personnages candidats, 1992 mods candidats.
Profil SWGOH.GG trouvé : Selimna · Profile.
Roster annoncé : 406 unités.
Lecture du roster…
Unités directes API retenues : 406.
406 personnages récupérés (406 candidats API, filtrés sur les unités possédées).
TERMINÉ : 406 personnages, 1992 mods exploitables.
```

## Ce qui est inclus

- parseur API roster corrigé
- relais Cloudflare
- récupération des mods
- moteur Python Kyber
- interface HUD
- import JSON de secours
- Pyodide 314.0.7

## Ce qui reste à développer

- présentation détaillée des 406 personnages
- présentation détaillée des 1992 mods
- reprise progressive des écrans/filtres avancés de la version Windows
- portage des fonctionnalités GAC et autres modules Windows lorsque leur équivalent navigateur sera défini
