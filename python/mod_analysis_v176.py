"""Port pur des règles d'analyse des mods de V176.
Ce module sert de référence Python pour les futures évolutions Web.
"""
import re, json

SLOTS=("Square","Arrow","Diamond","Triangle","Circle","Cross")

def compact(value):
    return re.sub(r"[^a-z0-9]","",str(value or "").casefold())

def normalize_slot(slot):
    s=str(slot or "").strip()
    return {"0":"Square","1":"Square","2":"Square","3":"Arrow","4":"Diamond","5":"Triangle","6":"Circle","7":"Cross"}.get(s,s)

RAW_STAT_NAMES={1:"health",5:"speed",17:"potency",18:"tenacity",28:"protection",41:"offense",42:"defense",45:"critical chance",48:"offense",49:"defense",53:"critical chance",55:"health",56:"protection",57:"speed"}

def stat_name(value):
    if isinstance(value,dict):
        value=value.get("name",value.get("statName",value.get("stat",value.get("unitStatId",value.get("statId")))))
    try:
        return RAW_STAT_NAMES.get(int(str(value).strip()),str(value or "").strip().casefold())
    except Exception:
        return str(value or "").strip().casefold()

def numeric_value(raw):
    if isinstance(raw,dict):
        raw=raw.get("display_value",raw.get("displayValue",raw.get("value",raw.get("unscaledDecimalValue",raw.get("statValue")))))
    if raw is None:return None
    try:v=float(str(raw).replace(",","." ).replace(" ",""))
    except Exception:return None
    if abs(v)>=1000000:v/=100000000.0
    return v

def secondary_details(mod):
    out=[]
    secondaries=mod.get("secondary_stats",mod.get("secondaryStats",[]))
    if isinstance(secondaries,str):
        try: secondaries=json.loads(secondaries)
        except Exception: secondaries=[]
    if isinstance(secondaries,list):
        for sec in secondaries[:4]:
            if not isinstance(sec,dict):continue
            probe=sec.get("stat",sec)
            name=stat_name(probe)
            raw=sec.get("display_value",sec.get("displayValue",sec.get("value")))
            if raw is None and isinstance(probe,dict):raw=probe.get("display_value",probe.get("displayValue",probe.get("value",probe.get("unscaledDecimalValue",probe.get("statValue")))))
            if name:out.append((name,numeric_value(raw)))
    if len(out)<4:
        out=[]
        for i in range(1,5):
            name=mod.get(f"secondary_{i}_stat"); value=mod.get(f"secondary_{i}_value")
            if name is not None:out.append((stat_name(name),numeric_value(value)))
    return out[:4]

def speed_metrics(mod):
    primary=mod.get("primary_stat",mod.get("primaryStat"))
    probe=primary.get("stat",primary) if isinstance(primary,dict) else primary
    primary_speed=stat_name(probe) in {"speed","speed %"}
    secondary=None
    for name,value in secondary_details(mod):
        if name in {"speed","speed %"}:
            secondary=value;break
    return secondary,primary_speed

def primary_speed_value(mod):
    if not speed_metrics(mod)[1]:return 0.0
    primary=mod.get("primary_stat",mod.get("primaryStat"))
    raw=primary.get("display_value",primary.get("displayValue",primary.get("value"))) if isinstance(primary,dict) else mod.get("primary_value",mod.get("primaryValue"))
    return float(numeric_value(raw) or 0)

def total_speed(mod):
    secondary,_=speed_metrics(mod)
    return float(secondary or 0)+primary_speed_value(mod)

def speed_category(value):
    value=float(value or 0)
    if value<=0:return "no_speed"
    if value<=10:return "1_10"
    if value<=15:return "11_15"
    if value<=21:return "16_21"
    return "22plus"

def audit_status(mods):
    mods=list(mods or [])[:6]
    count=len(mods); total=sum(total_speed(m) for m in mods)
    if count==0:return "SANS MODS",total
    if count<6:return "INCOMPLETS",total
    if total<30:return "TRÈS FAIBLES",total
    if total<50:return "FAIBLES",total
    if total<70:return "MOYENS",total
    return "BONS",total

def speed_breakdown(mods):
    result={"1_10":0,"11_15":0,"16_21":0,"22plus":0,"no_speed":0,"primary_speed":0,"total":0}
    for mod in mods or []:
        result["total"]+=1
        secondary,primary=speed_metrics(mod)
        if primary:result["primary_speed"]+=1
        else:result[speed_category(secondary)]+=1
    return result
