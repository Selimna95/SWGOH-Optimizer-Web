# Selimna's Holocron V93.3 — RELAY STABILITY + MODS

Correctif prioritaire après l'écran « Failed to fetch ».

- restauration des endpoints API Worker simples et éprouvés ;
- conservation des routes unit/mod de la V93 ;
- récupération tolérante si un ancien Worker est mémorisé dans localStorage ;
- tentative directe de secours uniquement pour le profil ;
- message d'erreur explicite si le relais Cloudflare est réellement inaccessible ;
- pipeline mods V93 conservé.

Si le navigateur affiche encore « Relais Cloudflare inaccessible », le problème est alors l'URL/déploiement du Worker, pas le parsing des mods.
