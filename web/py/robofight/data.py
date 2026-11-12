"""Static game data (parts, arenas, AI bots). Loaded once from the web/ JSON files.

In the browser the worker calls `set_data(...)` with the fetched JSON;
on the server / in tests `load_from_dir(path_to_web)` reads the files directly.
"""

import json
import os

_DATA = {"parts": None, "arenas": None, "ai_bots": None, "missions": None, "badges": None}


def set_data(parts=None, arenas=None, ai_bots=None, missions=None, badges=None):
    if parts is not None:
        _DATA["parts"] = parts
    if arenas is not None:
        _DATA["arenas"] = arenas
    if ai_bots is not None:
        _DATA["ai_bots"] = ai_bots
    if missions is not None:
        _DATA["missions"] = missions
    if badges is not None:
        _DATA["badges"] = badges


def set_data_json(text):
    set_data(**json.loads(text))


def load_from_dir(web_dir):
    def read(name):
        with open(os.path.join(web_dir, name), encoding="utf-8") as f:
            return json.load(f)

    bots = read("ai_bots.json")
    for b in bots:
        with open(os.path.join(web_dir, "bots", b["file"]), encoding="utf-8") as f:
            b["code"] = f.read()
    set_data(parts=read("parts.json"), arenas=read("arenas.json"), ai_bots=bots,
             missions=read("missions.json"), badges=read("badges.json"))


def _need(key):
    if _DATA[key] is None:
        here = os.path.dirname(os.path.abspath(__file__))
        web = os.path.normpath(os.path.join(here, "..", ".."))
        load_from_dir(web)
    return _DATA[key]


def parts():
    return _need("parts")


def arenas():
    return _need("arenas")


def ai_bots():
    return _need("ai_bots")


def missions():
    return _need("missions")


def badges():
    return _need("badges")


def mission(mid):
    for m in missions():
        if m["id"] == int(mid):
            return m
    raise KeyError(mid)


def arena(arena_id):
    for a in arenas():
        if a["id"] == arena_id:
            return a
    raise KeyError(arena_id)


def ai_bot(bot_id):
    for b in ai_bots():
        if b["id"] == bot_id:
            return b
    raise KeyError(bot_id)


def part_index():
    """id -> (category, spec)"""
    p = parts()
    idx = {}
    for cat in ("chassis", "weapons", "modules", "paints", "hats"):
        for spec in p[cat]:
            idx[spec["id"]] = (cat, spec)
    return idx
