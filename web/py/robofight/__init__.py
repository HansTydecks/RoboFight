"""RoboFight engine – deterministic grid simulation for kid-written Python robots.

Runs unchanged in the browser (Pyodide) and on a server (CPython).
"""

import json

from .runner import run_mission, run_mission_json  # noqa: F401
from .arena import run_match  # noqa: F401
from . import data, economy  # noqa: F401


def run_match_json(args_json):
    """Browser entry: {"bots": [...], "arena": id, "seed": n, "max_ticks": n}."""
    a = json.loads(args_json)
    return json.dumps(run_match(a["bots"], a.get("arena", "werkhalle"), a.get("seed", 1), a.get("max_ticks", 300)))


__all__ = ["run_mission", "run_mission_json", "run_match", "run_match_json", "data", "economy"]
