import json
import os

def load_kyber_profiles(path):
    with open(path, encoding="utf-8") as f: return json.load(f)

def get_kyber_profile(character, profiles):
    key=str(character or "").lower().replace(" ","")
    for k,p in profiles.items():
        if key and key in str(p.get("character","")).lower().replace(" ",""): return p
        if key and key in str(k).lower().replace(" ",""): return p
    return None
