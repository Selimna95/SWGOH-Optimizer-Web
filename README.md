# SWGOH Optimizer Web — V33 Galactic Command

## Base fonctionnelle
Cette version conserve la base V31.3 : analyse V176, optimizer, réaffectation de mods, protection des personnages Moyens, et recherche de remplaçants avec conservation du **slot + set** du mod sélectionné.

## V33 — refonte visuelle unifiée
- CSS entièrement nettoyé et consolidé : suppression des couches visuelles V19→V32 devenues redondantes.
- Une seule palette et un seul système de tokens pour les panneaux, bordures, textes et effets.
- Univers futuriste Star Wars / commandement galactique : HUD holographique, grille tactique, étoiles, bandeaux galactiques et balayages laser.
- Hiérarchie typographique futuriste avec une pile de polices locale, sans dépendance graphique obligatoire.
- Badges de faction visuels dans l'analyse et les rapports personnages.
- Effets lumineux sur navigation, boutons, panneaux, tableaux et modales.
- Responsive desktop / tablette / mobile.
- Respect de `prefers-reduced-motion`.

## Réaffectation
La recherche de remplaçants conserve obligatoirement :
1. le même slot ;
2. le même set ;
3. la secondaire choisie par l'utilisateur.

Les mods équipés sur les personnages Incomplets / Très faibles / Faibles sont recherchés. Les Moyens restent protégés jusqu'à validation explicite.

Aucun scoring et aucun transfert automatique.
