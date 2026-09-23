import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/pyodide.mjs";

let pyodideReadyPromise = (async () => {
  const pyodide = await loadPyodide();
  const optimizerResponse = await fetch(new URL("./python/optimizer.py?v=45", import.meta.url), { cache: "no-store" });
  if (!optimizerResponse.ok) throw new Error(`Impossible de charger optimizer.py (HTTP ${optimizerResponse.status})`);
  const optimizerSource = await optimizerResponse.text();
  pyodide.FS.writeFile("/home/pyodide/optimizer.py", optimizerSource);

  const kyberResponse = await fetch(new URL("./python/kyber_data.py?v=45", import.meta.url), { cache: "no-store" });
  if (kyberResponse.ok) {
    pyodide.FS.writeFile("/home/pyodide/kyber_data.py", await kyberResponse.text());
  }

  // The optimizer reference data is loaded by the Worker itself.
  // This removes the fragile dependency on a browser-side script tag.
  const profilesResponse = await fetch(new URL("./python/optimizer_profiles.json?v=45", import.meta.url), { cache: "no-store" });
  if (!profilesResponse.ok) throw new Error(`Impossible de charger optimizer_profiles.json (HTTP ${profilesResponse.status})`);
  const profilesText = await profilesResponse.text();
  pyodide.FS.writeFile("/home/pyodide/optimizer_profiles.json", profilesText);

  pyodide.runPython(`
import sys, json
sys.path.append('/home/pyodide')
import optimizer
with open('/home/pyodide/optimizer_profiles.json', encoding='utf-8') as _f:
    _optimizer_profiles = json.load(_f)
`);
  return pyodide;
})();

self.onmessage = async (event) => {
  const data = event.data || {};
  const id = data.id;
  try {
    self.postMessage({ id, type: "status", message: "Chargement du moteur Optimizer…" });
    const pyodide = await pyodideReadyPromise;

    pyodide.globals.set("mods_json", JSON.stringify(data.mods || []));
    pyodide.globals.set("profile_json", JSON.stringify(data.profile || {}));
    pyodide.globals.set("base_stats_json", JSON.stringify(data.base_stats || {}));
    pyodide.globals.set("n_builds", Number(data.n_builds || 5));
    pyodide.globals.set("limit_slot", Number(data.limit_slot || 80));
    pyodide.globals.set("character_name", String(data.character_name || ""));
    pyodide.globals.set("character_base_id", String(data.character_base_id || ""));

    self.postMessage({ id, type: "status", message: "Recherche des candidats par slot…" });

    const raw = await pyodide.runPythonAsync(`
import json
mods = json.loads(mods_json)
profile = json.loads(profile_json)
base_stats = json.loads(base_stats_json)

# Resolve base stats inside the Worker when the browser did not provide them.
if not base_stats:
    wanted_base = character_base_id.upper().strip()
    wanted_name = character_name.casefold().strip()
    selected = None
    if wanted_base:
        selected = _optimizer_profiles.get(wanted_base)
    if selected is None:
        for _p in _optimizer_profiles.values():
            if str(_p.get('base_id','')).upper() == wanted_base or str(_p.get('name','')).casefold() == wanted_name:
                selected = _p
                break
    if selected:
        base_stats = selected.get('base_stats') or {}

if not base_stats:
    raise RuntimeError('Statistiques de base du personnage introuvables dans optimizer_profiles.json.')

# An empty local Kyber reference is valid: optimizer.py then uses its generic
# stat weights while still optimizing the real six equipped mod slots.
if not isinstance(profile, dict):
    profile = {}

r = optimizer.find_top_builds(
    mods,
    base_stats=base_stats,
    number_of_builds=n_builds,
    limit_per_slot=limit_slot,
    kyber=profile,
    character=character_name,
)
json.dumps(r)
`);

    const result = typeof raw === "string" ? raw : String(raw);
    self.postMessage({ id, type: "done", result });
  } catch (error) {
    self.postMessage({
      id,
      type: "error",
      error: error?.stack || error?.message || String(error),
    });
  }
};
