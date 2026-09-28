# Selimna’s Holocron — V85

Correctif de chargement des styles après la consolidation CSS de V84.

- La feuille consolidée est désormais placée à la racine du projet (`app.css`) et chargée depuis `index.html`, afin de conserver les chemins relatifs des ressources `assets/` et d’éviter une dépendance à un sous-dossier `styles/`.
- Le JavaScript et les fonctionnalités métier sont conservés depuis V84 ; le découpage du JavaScript reste à réaliser.

Pour déployer, remplacer les fichiers du projet par le contenu de cette archive en conservant la structure des dossiers, notamment `assets/`.
