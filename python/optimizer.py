"""
SWGOH Optimizer — version Kyber
Drop-in module exposing optimize_kyber().

Important:
- Handles the imported slot "7" as Square.
- Uses the Kyber reference supplied by the project.
- Uses bounded beam search so 1,986 mods do not cause an enormous
  itertools.product() search.
"""

import json
import re
import os
try:
    from importer import diagnostic_log
except Exception:
    def diagnostic_log(message):
        pass

SLOTS = ("Square", "Arrow", "Diamond", "Triangle", "Circle", "Cross")

SLOT_ALIASES = {
    # SWGOH.GG / Comlink slot ids: 2=Square, 3=Arrow, 4=Diamond,
    # 5=Triangle, 6=Circle, 7=Cross. 1 is kept as a legacy Square alias.
    "1": "Square",
    "2": "Square",
    "3": "Arrow",
    "4": "Diamond",
    "5": "Triangle",
    "6": "Circle",
    "7": "Cross",
    "square": "Square",
    "arrow": "Arrow",
    "diamond": "Diamond",
    "triangle": "Triangle",
    "circle": "Circle",
    "cross": "Cross",
}


def to_float(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def normalize_slot(slot):
    """Return the canonical six SWGOH slot names.

    Comlink/player exports seen in the wild use numeric ids (0..6 or 1..7),
    strings, and occasionally labels such as ``slot_7``.  Be deliberately
    permissive here because the optimizer must never reject a valid imported
    mod merely because the exporter chose another representation.
    """
    if slot is None:
        return None
    if isinstance(slot, bool):
        return None
    value = str(slot).strip()
    direct = SLOT_ALIASES.get(value)
    if direct:
        return direct
    direct = SLOT_ALIASES.get(value.casefold())
    if direct:
        return direct
    # Handle numeric-looking values such as 7.0 and labels such as slot_7.
    m = re.search(r"(?:slot[_ -]?)?([0-7])(?:\.0+)?$", value.casefold())
    if m:
        return SLOT_ALIASES.get(m.group(1))
    return value


def mod_slot_value(mod):
    """Read a mod slot from all supported importer/exporter field names."""
    if not isinstance(mod, dict):
        return None
    for key in ("slot", "slot_id", "slotId", "mod_slot", "modSlot"):
        if key in mod and mod.get(key) is not None:
            return mod.get(key)
    return None


def mod_id(mod):
    return mod.get("game_id") or mod.get("id")


SET_NAMES = {
    "1":"Health", "2":"Offense", "3":"Defense", "4":"Speed",
    "5":"Critical Chance", "6":"Critical Damage", "7":"Potency",
    "8":"Tenacity", "9":"Critical Avoidance", "10":"Offense", "11":"Defense",
}

def normalize_set(value):
    if isinstance(value, dict):
        value = value.get("name") or value.get("id") or value.get("setId") or value.get("modSetId")
    text = str(value or "").strip()
    return SET_NAMES.get(text, text) if text else None

def mod_set(mod):
    if not isinstance(mod, dict):
        return None
    for key in ("set_name", "set", "setId", "modSetId", "mod_set_id"):
        value = mod.get(key)
        if value is not None and str(value).strip():
            return normalize_set(value)
    for parent_key in ("statMod", "stat_mod", "definition", "modDefinition", "mod_definition"):
        parent = mod.get(parent_key)
        if isinstance(parent, dict):
            for key in ("setId", "modSetId", "set_id", "set"):
                value = parent.get(key)
                if value is not None and str(value).strip():
                    return normalize_set(value)
    definition = mod.get("definitionId") or mod.get("definition_id") or mod.get("defId")
    if isinstance(definition, dict):
        value = definition.get("setId") or definition.get("modSetId") or definition.get("set") or definition.get("id")
        if value is not None:
            return normalize_set(value)
        definition = definition.get("id") or definition.get("definitionId")
    text = str(definition or "").strip()
    # Real Comlink statMod definitionIds are often compact 3-digit codes:
    # 161 = Health / rarity 6 / Square, 162 = Health / rarity 6 / Arrow,
    # 166 = Health / rarity 6 / Cross.
    if re.fullmatch(r"[1-8][1-7][0-6]", text):
        return normalize_set(text[0])
    if re.fullmatch(r"[1-8][1-7][1-6]", text):
        return normalize_set(text[0])
    parts = [p for p in re.split(r"[^A-Za-z0-9]+", text) if p]
    if len(parts) >= 3:
        try:
            sid, rarity, slot = int(parts[0]), int(parts[1]), int(parts[2])
            if 1 <= sid <= 8 and 1 <= rarity <= 7 and 1 <= slot <= 6:
                return normalize_set(sid)
            if 1 <= sid <= 8 and 1 <= rarity <= 7 and slot == 0:
                return normalize_set(sid)
        except ValueError:
            pass
    nums = re.findall(r"\d+", text)
    for i in range(max(0, len(nums)-2)):
        try:
            sid, rarity, slot = int(nums[i]), int(nums[i+1]), int(nums[i+2])
        except ValueError:
            continue
        if 1 <= sid <= 8 and 1 <= rarity <= 7 and 1 <= slot <= 6:
            return normalize_set(sid)
        if 1 <= sid <= 8 and 1 <= rarity <= 7 and slot == 0:
            return normalize_set(sid)
    return None


def mod_stats(mod):
    raw = mod.get("stats", {})
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except Exception:
            raw = {}

    if isinstance(raw, dict) and raw:
        return {str(k): to_float(v) for k, v in raw.items()}

    stats = {}
    p = mod.get("primary_stat")
    if p:
        stats[str(p)] = to_float(mod.get("primary_value"))

    for i in range(1, 5):
        name = mod.get(f"secondary_{i}_stat")
        if name:
            stats[str(name)] = stats.get(str(name), 0.0) + to_float(
                mod.get(f"secondary_{i}_value")
            )
    return stats


def primary_name(mod):
    return str(mod.get("primary_stat") or "").strip()


def final_stats(build, base_stats=None):
    """Calculate stats from a six-mod build, including standard set bonuses."""
    result = dict(base_stats or {})

    for mod in build:
        for name, value in mod_stats(mod).items():
            result[name] = to_float(result.get(name)) + value

    counts = {}
    for mod in build:
        name = mod_set(mod)
        if name:
            counts[name] = counts.get(name, 0) + 1

    # SWGOH mod-set bonuses. A six-mod set may contain multiple bonuses.
    bonuses = {
        "Health": (2, 0.10),
        "Protection": (2, 0.10),
        "Offense": (4, 0.15),
        "Speed": (4, 0.15),
        "Critical Damage": (4, 0.08),
        "Critical Chance": (2, 0.08),
        "Defense": (2, 0.25),
        "Potency": (2, 0.15),
        "Tenacity": (2, 0.20),
        "Critical Avoidance": (2, 0.20),
    }
    stat_for_set = {
        "Health": "Health",
        "Protection": "Protection",
        "Offense": "Offense",
        "Speed": "Speed",
        "Critical Damage": "Critical Damage",
        "Critical Chance": "Critical Chance",
        "Defense": "Defense",
        "Potency": "Potency",
        "Tenacity": "Tenacity",
        "Critical Avoidance": "Critical Avoidance",
    }
    for set_name, (required, bonus) in bonuses.items():
        n = counts.get(set_name, 0)
        if n >= required:
            stat = stat_for_set[set_name]
            result[stat] = to_float(result.get(stat)) * (1.0 + bonus * (n // required))

    return result


def _get_kyber_set_distribution(kyber):
    """Return set usage weights from either dict or Kyber's list format."""
    sets = kyber.get("sets", {}) if isinstance(kyber, dict) else {}
    if isinstance(sets, dict):
        return {str(k): to_float(v) for k, v in sets.items()}
    result = {}
    if isinstance(sets, list):
        for item in sets:
            if isinstance(item, dict) and item.get("name"):
                # `weight` is the observed share; `count` describes the
                # recommended number of mods and is handled separately.
                result[str(item["name"])] = to_float(item.get("weight"))
    return result


def _get_slot_distribution(kyber, slot):
    slots = kyber.get("slots", {}) or {}
    data = slots.get(slot, {}) if isinstance(slots, dict) else {}
    if isinstance(data, dict):
        p = data.get("primaries", data.get("primary", data))
        if isinstance(p, dict):
            return {str(k): to_float(v) for k, v in p.items()}
    return {}


def _reference_average(kyber, stat):
    averages = kyber.get("averages", {}) or {}
    return to_float(averages.get(stat))


def _mod_score(mod, kyber, weights):
    score = 0.0
    slot = normalize_slot(mod.get("slot"))
    primary = primary_name(mod)
    stats = mod_stats(mod)

    # Kyber set distribution has priority.
    set_dist = _get_kyber_set_distribution(kyber)
    set_share = set_dist.get(str(mod_set(mod)), 0.0)
    score += set_share * 5000.0

    # Kyber primary distribution has very strong priority.
    distribution = _get_slot_distribution(kyber, slot)
    if distribution:
        dominant = max(distribution.values(), default=0.0)
        own = distribution.get(primary, 0.0)
        if own == 0.0:
            # Comlink/importer may annotate percentage primaries as "Health %"
            # while the Kyber reference stores them as "Health".
            def _cmp(name):
                return re.sub(r"\s*%\s*$", "", str(name).strip()).casefold()
            target = _cmp(primary)
            own = sum(v for k, v in distribution.items() if _cmp(k) == target)
        score += own * 12000.0
        if own == 0.0 and dominant:
            score -= dominant * 12000.0

    # Secondary stats.
    for stat, value in stats.items():
        if stat == primary:
            continue
        score += value * to_float(weights.get(stat), 0.0)

    # Speed secondary is always useful, but remains below Kyber primary.
    score += stats.get("Speed", 0.0) * 8.0
    return score


def build_score(build, kyber, weights, base_stats):
    score = 0.0
    stats = final_stats(build, base_stats)

    set_dist = _get_kyber_set_distribution(kyber)
    counts = {}
    for mod in build:
        counts[mod_set(mod)] = counts.get(mod_set(mod), 0) + 1

    # Strongly reward dominant Kyber set compositions.
    for name, share in set_dist.items():
        if share <= 0:
            continue
        count = counts.get(name, 0)
        score += share * 3000.0 * count
        if share >= 0.80:
            score -= (6 - count) * share * 5000.0

    # Strongly reward Kyber primaries.
    for slot in ("Arrow", "Triangle", "Circle", "Cross"):
        mod = next((m for m in build if normalize_slot(m.get("slot")) == slot), None)
        if not mod:
            continue
        dist = _get_slot_distribution(kyber, slot)
        if not dist:
            continue
        dominant = max(dist.values(), default=0.0)
        primary = primary_name(mod)
        own = dist.get(primary, 0.0)
        if own == 0.0:
            target = re.sub(r"\s*%\s*$", "", str(primary).strip()).casefold()
            own = sum(v for k, v in dist.items()
                      if re.sub(r"\s*%\s*$", "", str(k).strip()).casefold() == target)
        score += own * 9000.0
        if own == 0.0:
            score -= dominant * 10000.0

    # Match Kyber reference stats without making them hard constraints.
    for stat in ("Speed", "Health", "Protection"):
        ref = _reference_average(kyber, stat)
        if ref <= 0:
            continue
        ratio = to_float(stats.get(stat)) / ref
        score += min(ratio, 1.20) * 1800.0

    return score


def optimize_kyber(
    mods,
    base_stats=None,
    kyber=None,
    weights=None,
    targets=None,
    number_of_builds=10,
    limit_per_slot=80,
    beam_width=1200,
    progress_callback=None,
    **kwargs,
):
    """
    Main public entry point expected by test_optimizer.py.

    Returns:
        list[dict] with build, score and stats.
    """
    if not mods:
        raise RuntimeError("Aucun mod disponible.")
    if kyber is None:
        # Standalone/legacy callers can provide only `character`; load the
        # bundled Kyber reference automatically.
        character = kwargs.get("character")
        if character:
            try:
                from kyber_data import load_kyber_profiles, get_kyber_profile
                profiles_path = os.path.join(os.path.dirname(__file__), "kyber_profiles.json")
                profiles = load_kyber_profiles(profiles_path)
                kyber = get_kyber_profile(character, profiles)
            except Exception:
                kyber = None
        if kyber is None:
            raise RuntimeError("Référence Kyber absente.")

    base_stats = base_stats or {}
    weights = weights or {
        "Speed": 1.0,
        "Health": 0.01,
        "Protection": 0.01,
        "Offense": 0.5,
        "Defense": 0.1,
        "Potency": 0.1,
        "Tenacity": 0.1,
    }

    grouped = {slot: [] for slot in SLOTS}
    for mod in mods:
        if not isinstance(mod, dict):
            continue
        item = dict(mod)
        slot = normalize_slot(mod_slot_value(item))
        if slot in grouped:
            item["slot"] = slot
            resolved_set = mod_set(item)
            # Never erase a set that was already normalized by the importer.
            resolved_set = resolved_set or normalize_set(item.get("set_name") or item.get("set"))
            item["set_name"] = resolved_set
            if resolved_set is not None:
                item["set"] = resolved_set
            if str(item.get("character", "")).upper() == "DARTHBANE":
                diagnostic_log("OPTIMIZER MOD: " + repr({k:item.get(k) for k in ("id","slot","set","set_name","definitionId","primary_stat")}))
            grouped[slot].append(item)

    missing = [slot for slot in SLOTS if not grouped[slot]]
    if missing:
        # Diagnostic volontairement explicite : si l'EXE embarque une source
        # différente de celle attendue, l'utilisateur voit immédiatement les
        # valeurs reçues par le moteur au lieu d'un simple "aucun candidat".
        raw_examples = []
        raw_seen = set()
        for mod in mods:
            raw = mod_slot_value(mod)
            marker = repr(raw)
            if marker not in raw_seen:
                raw_seen.add(marker)
                raw_examples.append(marker)
            if len(raw_examples) >= 12:
                break
        raise RuntimeError(
            "Aucun candidat valide pour le(s) slot(s) : "
            + ", ".join(missing)
            + "\nValeurs de slot reçues : "
            + ", ".join(raw_examples)
        )

    candidates = {}
    for slot_index, slot in enumerate(SLOTS, 1):
        ranked = sorted(
            grouped[slot],
            key=lambda m: _mod_score(m, kyber, weights),
            reverse=True,
        )
        candidates[slot] = ranked[:max(1, int(limit_per_slot))]

    # Bounded beam search instead of 50^6 / 80^6 brute force.
    beam = [()]
    for slot_index, slot in enumerate(SLOTS, 1):
        expanded = []
        for partial in beam:
            used = {mod_id(m) for m in partial}
            for mod in candidates[slot]:
                if mod_id(mod) in used:
                    continue
                build = partial + (mod,)
                score = build_score(build, kyber, weights, base_stats)
                expanded.append((score, build))

        expanded.sort(key=lambda x: x[0], reverse=True)
        beam = [build for _, build in expanded[:beam_width]]
        if progress_callback:
            try:
                progress_callback(slot_index, slot, len(beam))
            except Exception:
                pass

    results = []
    for build in beam:
        results.append(
            {
                "build": list(build),
                "score": build_score(build, kyber, weights, base_stats),
                "stats": final_stats(build, base_stats),
            }
        )

    results.sort(key=lambda item: item["score"], reverse=True)
    return results[: int(number_of_builds)]


def find_top_builds(
    mods,
    weights=None,
    number_of_builds=10,
    targets=None,
    base_stats=None,
    limit_per_slot=80,
    kyber=None,
    **kwargs,
):
    return optimize_kyber(
        mods=mods,
        base_stats=base_stats,
        kyber=kyber,
        weights=weights,
        targets=targets,
        number_of_builds=number_of_builds,
        limit_per_slot=limit_per_slot,
        **kwargs,
    )


def optimize(
    mods,
    base_stats=None,
    targets=None,
    weights=None,
    number_of_builds=10,
    limit_per_slot=80,
    kyber=None,
    **kwargs,
):
    return optimize_kyber(
        mods=mods,
        base_stats=base_stats,
        kyber=kyber,
        weights=weights,
        targets=targets,
        number_of_builds=number_of_builds,
        limit_per_slot=limit_per_slot,
        **kwargs,
    )


# ---------------------------------------------------------------------------
# Backwards-compatible API used by the original command-line test scripts.
# ---------------------------------------------------------------------------
def _tuple_mod_to_dict(mod):
    if isinstance(mod, dict):
        return mod
    if isinstance(mod, (tuple, list)):
        fields = [
            "game_id", "set_name", "slot", "rarity", "level",
            "primary_stat", "primary_value",
            "secondary_1_stat", "secondary_1_value",
            "secondary_2_stat", "secondary_2_value",
            "secondary_3_stat", "secondary_3_value",
            "secondary_4_stat", "secondary_4_value",
        ]
        out = {k: (mod[i] if i < len(mod) else None) for i, k in enumerate(fields)}
        return out
    return {}

def calculate_final_stats(build, base_stats=None):
    return final_stats([_tuple_mod_to_dict(m) for m in build], base_stats)

def find_best_build(
    mods, weights=None, minimum_score=0, max_candidates_per_slot=50,
    targets=None, minimums=None, base_stats=None, kyber=None, **kwargs
):
    """Legacy single-build wrapper returning the best build as a list."""
    normalized = [_tuple_mod_to_dict(m) for m in (mods or [])]
    kyber = kyber or {"sets": {}, "slots": {}, "averages": {}}
    results = optimize_kyber(
        normalized, base_stats=base_stats, kyber=kyber, weights=weights,
        targets=targets, number_of_builds=1,
        limit_per_slot=max_candidates_per_slot, **kwargs
    )
    if not results:
        return None
    best = results[0]["build"]
    # Old scripts expect sqlite-style tuples; current application uses dicts.
    if mods and isinstance(next(iter(mods)), (tuple, list)):
        return [
            tuple(_tuple_mod_to_dict(m).get(k) for k in [
                "game_id", "set_name", "slot", "rarity", "level",
                "primary_stat", "primary_value",
                "secondary_1_stat", "secondary_1_value",
                "secondary_2_stat", "secondary_2_value",
                "secondary_3_stat", "secondary_3_value",
                "secondary_4_stat", "secondary_4_value"
            ]) for m in best
        ]
    return best
