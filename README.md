# Selimna's Holocron V93.0 — MODS PIPELINE

Correctif ciblé du pipeline de récupération des mods.

- lecture explicite de `rosterUnit[].equippedStatMod[]` / `mods[]`
- prise en charge des réponses API enveloppées sous `result`
- extraction des mods compacts sans statistiques développées
- parsing HTML SWGOH.GG élargi aux cartes avec `data-id`
- conservation des mods API même sans stats complètes
- diagnostic dans le journal de synchronisation
