# V45 — Optimizer Ready Fix

Visual files are intentionally unchanged from V44.

Functional correction:
- `optimizerReady` is set immediately at boot.
- Worker initialization starts in the background.
- UI/Kyber reference downloads no longer block the Optimizer.
- Worker resources are versioned V45.
- The dedicated Worker remains responsible for Pyodide + optimizer.py + optimizer_profiles.json.

Root cause addressed:
V44 awaited reference-data downloads before setting `optimizerReady=true`, so a slow or failed
fetch left the Optimizer blocked with "Le moteur Optimizer n'est pas prêt".
