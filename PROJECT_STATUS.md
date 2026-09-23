# SWGOH Optimizer Web — V32 Galactic Command

## Base fonctionnelle
Cette version conserve la base V31.3 : analyse V176, optimizer, réaffectation de mods, protection des personnages Moyens, et recherche de remplaçants avec conservation du **slot + set** du mod sélectionné.

## V32 — refonte visuelle
- Interface futuriste sci-fi inspirée d'un HUD de commandement galactique.
- Palette noire / bleu profond / cyan holographique.
- Navigation latérale façon console tactique.
- Cartes et tableaux avec bordures lumineuses, profondeur et micro-détails HUD.
- Fond spatial renforcé par effets CSS, grille tactique et étoiles discrètes.
- Aucun service graphique externe requis.
- Responsive desktop / tablette / mobile.
- Respect de `prefers-reduced-motion`.

## Réaffectation
La recherche de remplaçants conserve obligatoirement :
1. le même slot ;
2. le même set ;
3. la secondaire choisie par l'utilisateur.

Les mods équipés sur les personnages Incomplets / Très faibles / Faibles sont recherchés. Les Moyens restent protégés jusqu'à validation explicite.
