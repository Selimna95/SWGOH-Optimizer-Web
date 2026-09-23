"""Kyber profile helpers for the browser optimizer.

The web app normally supplies a parsed SWGOH.GG reference profile.  This
module is also used by optimizer.py for standalone/fallback execution.
"""
from __future__ import annotations
import json
import re
from pathlib import Path


def _key(value: object) -> str:
    text = str(value or "").strip().lower()
    text = re.sub(r"[^a-z0-9]+", "", text)
    return text


def load_kyber_profiles(path: str | Path):
    p = Path(path)
    if not p.exists():
        return {}
    with p.open("r", encoding="utf-8") as fh:
        raw = json.load(fh)
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, list):
        out = {}
        for item in raw:
            if not isinstance(item, dict):
                continue
            key = item.get("base_id") or item.get("baseId") or item.get("character") or item.get("name")
            if key:
                out[_key(key)] = item
        return out
    return {}


def get_kyber_profile(character, profiles):
    if not profiles:
        return None
    target = _key(character)
    if isinstance(character, dict):
        values = [character.get("base_id"), character.get("baseId"), character.get("name"), character.get("character")]
    else:
        values = [character]
    targets = {_key(v) for v in values if v}
    if target:
        targets.add(target)
    if isinstance(profiles, dict):
        for key, profile in profiles.items():
            if not isinstance(profile, dict):
                continue
            candidates = [key, profile.get("base_id"), profile.get("baseId"), profile.get("character"), profile.get("name")]
            if any(_key(v) in targets for v in candidates if v):
                return profile
    return None
