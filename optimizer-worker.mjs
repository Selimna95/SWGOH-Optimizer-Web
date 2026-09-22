import { loadPyodide } from "https://cdn.jsdelivr.net/pyodide/v314.0.7/full/pyodide.mjs";

let pyodideReadyPromise = (async () => {
  const pyodide = await loadPyodide();
  const response = await fetch("./python/optimizer.py", { cache: "no-store" });
  if (!response.ok) throw new Error(`Impossible de charger optimizer.py (HTTP ${response.status})`);
  const optimizerSource = await response.text();
  pyodide.FS.writeFile("/home/pyodide/optimizer.py", optimizerSource);
  pyodide.runPython(`import sys; sys.path.append('/home/pyodide'); import optimizer`);
  return pyodide;
})();

self.onmessage = async (event) => {
  const data = event.data || {};
  const id = data.id;
  try {
    self.postMessage({ id, type: "status", message: "Moteur Python secondaire prêt. Calcul hors interface…" });
    const pyodide = await pyodideReadyPromise;
    pyodide.globals.set("mods_json", JSON.stringify(data.mods || []));
    pyodide.globals.set("profile_json", JSON.stringify(data.profile || {}));
    pyodide.globals.set("base_stats_json", JSON.stringify(data.base_stats || {}));
    pyodide.globals.set("n_builds", Number(data.n_builds || 10));
    pyodide.globals.set("limit_slot", Number(data.limit_slot || 80));
    pyodide.globals.set("character_name", String(data.character_name || ""));

    self.postMessage({ id, type: "status", message: "Recherche des meilleurs candidats par slot…" });

    const raw = await pyodide.runPythonAsync(`
import json
import optimizer
mods = json.loads(mods_json)
profile = json.loads(profile_json)
base_stats = json.loads(base_stats_json)
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
