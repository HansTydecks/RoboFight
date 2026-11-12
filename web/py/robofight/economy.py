"""Game economy & progression rules – the single source of truth.

Used by the browser (through the Pyodide worker, for local accounts) and by the server.
All functions work on a plain JSON-compatible profile dict.
"""

import copy
import json

from . import data

LEVEL_TITLES = [
    "Schrauber-Azubi", "Bit-Bastler", "Code-Kadett", "Schleifen-Profi", "Sensor-Spezialist",
    "Bot-Ingenieur", "Funktions-Fan", "Listen-Lord", "Arena-Kämpfer", "Bot-Architekt",
    "Robo-Meister", "Code-Legende",
]
XP_PER_LEVEL = 300
START_ELO = 1000
ELO_K = 32
LEAGUES = [(0, "Bronze"), (1100, "Silber"), (1250, "Gold"), (1400, "Platin"), (1550, "Diamant"),
           (1700, "Meister-Coder")]
ARENA_UNLOCK_MISSION = 16
DAILY_RANKED_DEFAULT = 20
HISTORY_LIMIT = 30

BOLTS_FIRST_SOLVE = 50
BOLTS_PER_STAR = 25
BOLTS_RANKED = {"win": 40, "draw": 20, "loss": 10}
XP_RANKED = {"win": 20, "draw": 10, "loss": 5}


class EconomyError(Exception):
    pass


ARENA_STARTER = '''# Dein Arena-Roboter. update(robot) wird in JEDEM Zug aufgerufen.
# Pro Aufruf darf er genau EINE Aktion machen (fahren, drehen, schießen ...).

nummer = 0   # welcher Wegpunkt ist gerade dran?


def fahre_zu(robot, x, y):
    global nummer
    richtung = robot.path_to(x, y)
    if richtung is None:          # schon da oder unerreichbar -> nächster Wegpunkt
        nummer = nummer + 1
        robot.turn_right()
    elif richtung != robot.dir:
        robot.face(richtung)
    else:
        robot.move()


def update(robot):
    w, h = robot.arena_width, robot.arena_height
    wegpunkte = [(w // 4, h // 4), (3 * w // 4, h // 4), (3 * w // 4, 3 * h // 4), (w // 4, 3 * h // 4)]
    ziel = robot.nearest_enemy()

    if robot.enemy_ahead():
        robot.shoot()
    elif ziel is not None and ziel["richtung"] is not None:
        robot.face(ziel["richtung"])
    elif ziel is not None:
        fahre_zu(robot, ziel["x"], ziel["y"])
    else:
        x, y = wegpunkte[nummer % len(wegpunkte)]
        fahre_zu(robot, x, y)
'''


# ------------------------------------------------------------------ profile
def new_profile(username, display_name=None, role="student"):
    p = data.parts()
    return {
        "version": 2,
        "username": username,
        "display_name": display_name or username,
        "role": role,
        "missions": {},
        "codes": {},
        "stats": {"runs": 0, "errors": 0},
        "badges": [],
        "bolts": 0,
        "arena_xp": 0,
        "inventory": list(p["default_inventory"]),
        "loadout": copy.deepcopy(p["default_loadout"]),
        "arena": {
            "code": ARENA_STARTER, "published": None, "elo": START_ELO, "wins": 0, "losses": 0,
            "draws": 0, "training_beaten": [], "ranked_day": "", "ranked_count": 0, "history": [],
        },
        "settings": {"daily_ranked_limit": DAILY_RANKED_DEFAULT, "sound": True},
        "class_code": None,
    }


def normalize(profile):
    """Fill fields missing in older profiles."""
    base = new_profile(profile.get("username", "gast"), profile.get("display_name"), profile.get("role", "student"))
    for k, v in base.items():
        if k not in profile:
            profile[k] = v
        elif isinstance(v, dict) and isinstance(profile[k], dict):
            for kk, vv in v.items():
                profile[k].setdefault(kk, vv)
    return profile


def m_state(profile, mid):
    return profile["missions"].get(str(mid), {"stars": 0, "solved": False})


def solved_ids(profile):
    return {int(k) for k, v in profile["missions"].items() if v.get("solved")}


def mission_unlocked(profile, mid):
    ms = data.missions()
    ids = [m["id"] for m in ms]
    i = ids.index(int(mid))
    return i == 0 or ids[i - 1] in solved_ids(profile)


def arena_unlocked(profile):
    return ARENA_UNLOCK_MISSION in solved_ids(profile)


def xp(profile):
    total = sum(50 + 50 * v.get("stars", 0) for v in profile["missions"].values() if v.get("solved"))
    return total + profile.get("arena_xp", 0)


def level_info(profile):
    x = xp(profile)
    lvl = min(len(LEVEL_TITLES), 1 + x // XP_PER_LEVEL)
    base = (lvl - 1) * XP_PER_LEVEL
    return {"xp": x, "level": lvl, "title": LEVEL_TITLES[lvl - 1],
            "progress": 1.0 if lvl == len(LEVEL_TITLES) else (x - base) / XP_PER_LEVEL}


def league(elo):
    name = LEAGUES[0][1]
    for threshold, n in LEAGUES:
        if elo >= threshold:
            name = n
    return name


def total_stars(profile):
    return sum(v.get("stars", 0) for v in profile["missions"].values())


# ------------------------------------------------------------------ badges
def _badge(profile, bid, new):
    if bid not in profile["badges"]:
        profile["badges"].append(bid)
        new.append(bid)


def check_badges(profile):
    new = []
    s = solved_ids(profile)
    M = lambda i: m_state(profile, i)  # noqa: E731
    if 1 in s:
        _badge(profile, "first", new)
    if M(6).get("stars") == 3:
        _badge(profile, "loop", new)
    if 10 in s:
        _badge(profile, "boss", new)
    if all(m["id"] in s for m in data.missions() if m.get("chapter") == 2):
        _badge(profile, "chapter2", new)
    if profile["stats"]["errors"] >= 10:
        _badge(profile, "bug", new)
    if profile["stats"]["runs"] >= 50:
        _badge(profile, "runs", new)
    if all(M(m["id"]).get("stars") == 3 for m in data.missions()):
        _badge(profile, "perfect", new)
    if len(profile["inventory"]) >= 10:
        _badge(profile, "collector", new)
    a = profile["arena"]
    if a["wins"] >= 1 or a["training_beaten"]:
        _badge(profile, "first_win", new)
    if len(a["training_beaten"]) >= len(data.ai_bots()):
        _badge(profile, "training", new)
    if a["elo"] >= 1250:
        _badge(profile, "gold_league", new)
    return new


# ------------------------------------------------------------------ campaign
def record_run(profile, result):
    profile["stats"]["runs"] += 1
    if result.get("error") or any(v.get("status") == "error" for v in result.get("variants", [])):
        profile["stats"]["errors"] += 1
    return {"new_badges": check_badges(profile)}


def save_code(profile, mid, code):
    profile["codes"][str(mid)] = code[:20000]


def apply_mission(profile, mission, result, code=None):
    """Book a successful mission result. `result` must come from run_mission."""
    if code is not None:
        save_code(profile, mission["id"], code)
    rec = record_run(profile, result)
    if not result.get("ok"):
        return {"ok": False, "new_badges": rec["new_badges"]}
    if not mission_unlocked(profile, mission["id"]):
        raise EconomyError("Diese Mission ist noch gesperrt.")
    before = m_state(profile, mission["id"])
    lvl_before = level_info(profile)["level"]
    xp_before = xp(profile)
    stars = max(before.get("stars", 0), result["stars"])
    new_stars = stars - before.get("stars", 0)
    bolts = (BOLTS_FIRST_SOLVE if not before.get("solved") else 0) + BOLTS_PER_STAR * new_stars
    profile["missions"][str(mission["id"])] = {
        "solved": True, "stars": stars,
        "best_lines": min(before.get("best_lines", 10 ** 6), result["lines"]),
        "best_ticks": min(before.get("best_ticks", 10 ** 6), result["ticks"]),
    }
    profile["bolts"] += bolts
    new_badges = rec["new_badges"]
    if result["lines"] < mission.get("stars", {}).get("lines", 0):
        _badge(profile, "mini", new_badges)
    new_badges += check_badges(profile)
    lvl = level_info(profile)
    return {
        "ok": True, "first_solve": not before.get("solved"), "new_stars": new_stars, "bolts": bolts,
        "xp_gained": xp(profile) - xp_before, "level_up": lvl if lvl["level"] > lvl_before else None,
        "new_badges": new_badges,
    }


# ------------------------------------------------------------------ shop & loadout
def item(item_id):
    idx = data.part_index()
    if item_id not in idx:
        raise EconomyError(f"Unbekanntes Teil: {item_id}")
    return idx[item_id]


def item_status(profile, item_id):
    cat, spec = item(item_id)
    owned = item_id in profile["inventory"]
    unlock = spec.get("unlock", 0)
    locked_reason = None
    if unlock and unlock not in solved_ids(profile):
        locked_reason = f"Schalte es mit Mission {unlock} frei."
    if spec.get("badge") and spec["badge"] not in profile["badges"]:
        b = next((x for x in data.badges() if x["id"] == spec["badge"]), {"name": spec["badge"]})
        locked_reason = f"Nur mit dem Abzeichen „{b['name']}“."
    return {"id": item_id, "category": cat, "owned": owned, "locked": locked_reason,
            "price": spec.get("price", 0), "affordable": profile["bolts"] >= spec.get("price", 0)}


def shop(profile):
    p = data.parts()
    return [item_status(profile, spec["id"]) for cat in ("chassis", "weapons", "modules", "paints", "hats")
            for spec in p[cat]]


def buy(profile, item_id):
    st = item_status(profile, item_id)
    if st["owned"]:
        raise EconomyError("Das hast du schon.")
    if st["locked"]:
        raise EconomyError(st["locked"])
    if not st["affordable"]:
        raise EconomyError(f"Dir fehlen noch {st['price'] - profile['bolts']} Schrauben.")
    profile["bolts"] -= st["price"]
    profile["inventory"].append(item_id)
    new = []
    _badge(profile, "shopper", new)
    new += check_badges(profile)
    return {"bought": item_id, "price": st["price"], "new_badges": new}


def loadout_weight(loadout):
    idx = data.part_index()
    return sum(idx[pid][1].get("weight", 0) for pid in list(loadout.get("weapons", [])) + list(loadout.get("modules", []))
               if pid in idx)


def validate_loadout(profile, loadout):
    p = data.parts()
    idx = data.part_index()
    errors = []
    inv = set(profile["inventory"])
    ch = loadout.get("chassis")
    if ch not in idx or idx[ch][0] != "chassis":
        errors.append("Wähle ein Chassis.")
        return errors
    for key, cat, limit in (("weapons", "weapons", p["slots"]["weapons"]), ("modules", "modules", p["slots"]["modules"])):
        items = loadout.get(key, [])
        if len(items) > limit:
            errors.append(f"Höchstens {limit} {'Waffen' if key == 'weapons' else 'Module'}.")
        if len(set(items)) != len(items):
            errors.append("Jedes Teil nur einmal einbauen.")
        for pid in items:
            if pid not in idx or idx[pid][0] != cat:
                errors.append(f"{pid} passt nicht in diesen Platz.")
    for key, cat in (("paint", "paints"), ("hat", "hats")):
        pid = loadout.get(key)
        if pid not in idx or idx[pid][0] != cat:
            errors.append("Ungültige Optik.")
    for pid in [ch, loadout.get("paint"), loadout.get("hat")] + list(loadout.get("weapons", [])) + list(loadout.get("modules", [])):
        if pid in idx and pid not in inv:
            errors.append(f"„{idx[pid][1]['name']}“ besitzt du noch nicht.")
    if not loadout.get("weapons"):
        errors.append("Ohne Waffe kann dein Roboter nicht kämpfen.")
    cap = idx[ch][1]["capacity"]
    w = loadout_weight(loadout)
    if w > cap:
        errors.append(f"Zu schwer: {w} von {cap} Gewichtspunkten.")
    return errors


def set_loadout(profile, loadout):
    clean = {"chassis": loadout.get("chassis"), "weapons": list(loadout.get("weapons", [])),
             "modules": list(loadout.get("modules", [])), "paint": loadout.get("paint"), "hat": loadout.get("hat")}
    errors = validate_loadout(profile, clean)
    if errors:
        raise EconomyError(" ".join(errors))
    profile["loadout"] = clean
    return {"loadout": clean}


# ------------------------------------------------------------------ arena
def elo_update(ra, rb, score_a, k=ELO_K):
    ea = 1 / (1 + 10 ** ((rb - ra) / 400))
    da = round(k * (score_a - ea))
    return ra + da, rb - da


def save_arena_code(profile, code):
    profile["arena"]["code"] = code[:20000]
    return {}


def publish_bot(profile, now=""):
    if not arena_unlocked(profile):
        raise EconomyError("Die Arena ist erst nach Mission 16 offen.")
    profile["arena"]["published"] = {"code": profile["arena"]["code"], "loadout": copy.deepcopy(profile["loadout"]),
                                     "at": now}
    return {"published": True}


def ranked_left(profile, today):
    a = profile["arena"]
    limit = profile["settings"].get("daily_ranked_limit", DAILY_RANKED_DEFAULT)
    used = a["ranked_count"] if a["ranked_day"] == today else 0
    return max(0, limit - used)


def outcome_for(result, my_id=0):
    if result["winner"] is None:
        return "draw"
    return "win" if result["winner"] == my_id else "loss"


def apply_match(profile, kind, opponent, outcome, today="", summary=None):
    """kind: 'training' | 'ranked'. opponent: {id, name, elo}. Returns a change dict."""
    a = profile["arena"]
    change = {"kind": kind, "outcome": outcome, "bolts": 0, "xp": 0, "elo_before": a["elo"], "elo_after": a["elo"]}
    if kind == "training":
        if outcome == "win" and opponent["id"] not in a["training_beaten"]:
            a["training_beaten"].append(opponent["id"])
            bot = next((b for b in data.ai_bots() if b["id"] == opponent["id"]), None)
            change["bolts"] = bot.get("reward", 50) if bot else 50
            change["first_win"] = True
    elif kind == "ranked":
        if ranked_left(profile, today) <= 0:
            raise EconomyError("Für heute sind alle Ranglisten-Kämpfe aufgebraucht. Morgen geht's weiter!")
        if a["ranked_day"] != today:
            a["ranked_day"], a["ranked_count"] = today, 0
        a["ranked_count"] += 1
        score = {"win": 1, "draw": 0.5, "loss": 0}[outcome]
        a["elo"], _ = elo_update(a["elo"], opponent.get("elo", START_ELO), score)
        a[{"win": "wins", "draw": "draws", "loss": "losses"}[outcome]] += 1
        change["bolts"] = BOLTS_RANKED[outcome]
        change["xp"] = XP_RANKED[outcome]
        change["elo_after"] = a["elo"]
    profile["bolts"] += change["bolts"]
    profile["arena_xp"] += change["xp"]
    if summary:
        a["history"].insert(0, summary)
        del a["history"][HISTORY_LIMIT:]
    change["new_badges"] = check_badges(profile)
    change["league"] = league(a["elo"])
    return change


# ------------------------------------------------------------------ public summary
def public_summary(profile):
    a = profile["arena"]
    lvl = level_info(profile)
    return {
        "username": profile["username"], "display_name": profile["display_name"],
        "level": lvl["level"], "title": lvl["title"], "stars": total_stars(profile),
        "solved": len(solved_ids(profile)), "elo": a["elo"], "league": league(a["elo"]),
        "wins": a["wins"], "losses": a["losses"], "draws": a["draws"], "loadout": profile["loadout"],
    }


# ------------------------------------------------------------------ worker entry
def call_json(op, profile_json, args_json):
    """Generic entry point for the browser worker: returns {"profile", "result"} or {"error"}."""
    profile = normalize(json.loads(profile_json)) if profile_json else None
    args = json.loads(args_json) if args_json else {}
    try:
        if op == "new_profile":
            res = new_profile(args["username"], args.get("display_name"), args.get("role", "student"))
            return json.dumps({"profile": res, "result": {}})
        fn = {
            "apply_mission": lambda: apply_mission(profile, data.mission(args["mission_id"]), args["result"], args.get("code")),
            "record_run": lambda: record_run(profile, args["result"]),
            "save_code": lambda: save_code(profile, args["mission_id"], args["code"]) or {},
            "buy": lambda: buy(profile, args["item"]),
            "set_loadout": lambda: set_loadout(profile, args["loadout"]),
            "save_arena_code": lambda: save_arena_code(profile, args["code"]),
            "publish_bot": lambda: publish_bot(profile, args.get("now", "")),
            "apply_match": lambda: apply_match(profile, args["kind"], args["opponent"], args["outcome"],
                                               args.get("today", ""), args.get("summary")),
            "info": lambda: {},
        }[op]
        result = fn()
    except EconomyError as exc:
        return json.dumps({"error": str(exc)})
    result = result or {}
    result["info"] = {"level": level_info(profile), "league": league(profile["arena"]["elo"]),
                      "stars": total_stars(profile), "shop": shop(profile),
                      "arena_unlocked": arena_unlocked(profile),
                      "ranked_left": ranked_left(profile, args.get("today", ""))}
    return json.dumps({"profile": profile, "result": result})
