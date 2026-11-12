"""Runs kid code against a mission and returns a JSON-serialisable replay."""

import ast
import json
import random
import sys
import traceback

from .errors import (MissionComplete, RobotError, SimulationEnd, StepLimit,
                     explain_exception)
from .robot_api import API_NAMES, CODE_FILENAME, current_line, make_robot
from .sandbox import make_builtins
from .world import World

STEP_LIMIT = 200_000
PROPERTY_NAMES = {"hp", "energy", "x", "y", "dir", "max_hp", "max_energy", "tick", "shield_active",
                  "name", "arena_width", "arena_height"}


def count_lines(code):
    n = 0
    for raw in code.splitlines():
        s = raw.strip()
        if s and not s.startswith("#"):
            n += 1
    return n


def lint(tree):
    """Warnings for code that is valid Python but almost certainly a mistake."""
    warnings = []
    called = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            called.add(id(node.func))
    for node in ast.walk(tree):
        if (isinstance(node, ast.Attribute) and isinstance(node.value, ast.Name)
                and node.value.id == "robot" and node.attr in API_NAMES
                and node.attr not in PROPERTY_NAMES and id(node) not in called):
            warnings.append({
                "line": node.lineno,
                "message": f"`robot.{node.attr}` ohne Klammern macht nichts. "
                           f"Schreibe `robot.{node.attr}()`.",
            })
    return warnings


def _error_line(exc):
    line = None
    for fs in traceback.extract_tb(exc.__traceback__):
        if fs.filename == CODE_FILENAME:
            line = fs.lineno
    return line


def _make_tracer(world):
    count = [0]

    def local(frame, event, arg):
        if event == "line":
            count[0] += 1
            if world.ended is not None:
                raise world.ended
            if count[0] > STEP_LIMIT:
                world.ended = StepLimit(frame.f_lineno)
                raise world.ended
        return local

    def global_trace(frame, event, arg):
        if frame.f_code.co_filename == CODE_FILENAME:
            return local
        return None

    return global_trace


def _make_globals(world, robot):
    def kid_print(*args, sep=" ", end="", **_):
        world.event(type="print", text=sep.join(str(a) for a in args)[:200], line=current_line())

    return {"__builtins__": make_builtins(kid_print), "__name__": "__robot__", "robot": robot}


def run_variant(mission, compiled, variant):
    world = World(mission, variant)
    robot = make_robot(world, mission.get("api", []))
    g = _make_globals(world, robot)
    random.seed(4242 + variant)
    result = {"status": None, "reason": "", "line": None}
    old_limit = sys.getrecursionlimit()
    sys.setrecursionlimit(min(old_limit, 400))
    sys.settrace(_make_tracer(world))
    try:
        exec(compiled, g)
    except SimulationEnd as end:
        world.ended = end
    except RobotError as exc:
        result.update(status="error", reason=str(exc), line=_error_line(exc))
    except Exception as exc:  # kid code crashed
        result.update(status="error", reason=explain_exception(exc, API_NAMES, g.keys()),
                      line=_error_line(exc))
    finally:
        sys.settrace(None)
        sys.setrecursionlimit(old_limit)

    if result["status"] is None:
        end = world.ended
        if end is None:
            if world.goals_met():
                end = MissionComplete()
            else:
                result.update(status="incomplete", reason=_incomplete_reason(world))
        if end is not None:
            result.update(status=end.status, reason=end.reason, line=getattr(end, "line", None))
    world.flush()
    result.update(map=world.static_map(), frames=world.frames, ticks=world.tick)
    return result


def _incomplete_reason(world):
    missing = []
    if "reach_goal" in world.goals and not world.at_goal():
        missing.append("der Roboter steht nicht auf dem Ziel")
    if "collect_all" in world.goals and world.crystals:
        missing.append(f"es fehlen noch {len(world.crystals)} Kristall(e)")
    if "destroy_all" in world.goals and world.enemy_count():
        missing.append(f"es sind noch {world.enemy_count()} Gegner übrig")
    return "Dein Programm ist fertig, aber " + " und ".join(missing) + "."


def run_arena_variant(mission, code, variant):
    from . import data
    from .arena import run_match
    opp = data.ai_bot(mission["opponents"][variant])
    res = run_match(
        [{"name": "Dein Roboter", "code": code, "loadout": mission.get("loadout") or data.parts()["default_loadout"]},
         {"name": opp["name"], "code": opp["code"], "loadout": opp["loadout"]}],
        arena_id=mission["arena"], seed=100 + variant, max_ticks=mission.get("max_ticks", 150))
    me = res["bots"][0]
    if res["winner"] == 0:
        status, reason, line = "success", f"Du hast {opp['name']} besiegt!", None
    elif me["error"] and me["error"]["tick"] == 0:
        status, reason, line = "error", me["error"]["message"], me["error"]["line"]
    elif res["winner"] is None:
        status, reason, line = "failed", res["reason"], None
    else:
        status, reason, line = "destroyed", f"{opp['name']} hat gewonnen. " + res["reason"], None
    res.update(status=status, reason=reason, line=line, opponent=opp["id"])
    return res


def run_mission(mission, code):
    lines = count_lines(code)
    try:
        tree = ast.parse(code, CODE_FILENAME)
        compiled = compile(tree, CODE_FILENAME, "exec")
    except SyntaxError as exc:
        return {
            "ok": False,
            "lines": lines,
            "error": {"line": exc.lineno, "message": explain_exception(exc, API_NAMES)},
            "warnings": [],
            "variants": [],
        }

    if mission.get("type") == "arena":
        variants = [run_arena_variant(mission, code, i) for i in range(len(mission["opponents"]))]
    else:
        variants = [run_variant(mission, compiled, i) for i in range(len(mission["maps"]))]
    ok = all(v["status"] == "success" for v in variants)
    ticks = max(v["ticks"] for v in variants)
    crit = mission.get("stars", {})
    star_criteria = {
        "lines": {"need": crit.get("lines"), "got": lines,
                  "ok": ok and crit.get("lines") is not None and lines <= crit["lines"]},
        "ticks": {"need": crit.get("ticks"), "got": ticks,
                  "ok": ok and crit.get("ticks") is not None and ticks <= crit["ticks"]},
    }
    stars = 0
    if ok:
        stars = 1 + star_criteria["lines"]["ok"] + star_criteria["ticks"]["ok"]
    return {
        "ok": ok,
        "lines": lines,
        "ticks": ticks,
        "stars": stars,
        "star_criteria": star_criteria,
        "error": None,
        "warnings": lint(tree),
        "variants": variants,
    }


def run_mission_json(mission_json, code):
    """Entry point for the browser (Pyodide worker)."""
    return json.dumps(run_mission(json.loads(mission_json), code))
