"""Arena: several robots, each programmed with `def update(robot):`.

Every tick all robots decide simultaneously on the same world state (fair, deterministic),
then the world resolves turns, movement, weapons and damage in a fixed order.
"""

import ast
import random

from . import data
from .errors import RobotError, UnknownCommand, explain_exception
from .robot_api import current_line
from .sandbox import CODE_FILENAME, StepCounter, error_line, make_builtins
from .world import DIRS, ORDER

SETUP_STEP_LIMIT = 50_000
UPDATE_STEP_LIMIT = 20_000
MAX_ERRORS_LOGGED = 5
DEFAULT_SCAN_RANGE = 5

ACTION_PART = {
    "shoot": "laser", "drop_mine": "mines", "fire_rocket": "rocket", "fire_railgun": "railgun",
    "shield": "shield", "repair": "repair", "dash": "turbo",
}
ARENA_API = [
    "move", "turn_left", "turn_right", "face", "wait", "shoot", "fire_rocket", "drop_mine",
    "fire_railgun", "shield", "repair", "dash", "say", "front_is_clear", "enemy_ahead", "scan",
    "nearest_enemy", "direction_to", "distance_to", "path_to", "arena_width", "arena_height", "has", "ready", "cooldown",
    "x", "y", "dir", "hp", "max_hp", "energy", "max_energy", "tick", "shield_active",
]
SPAWN_CHARS = "1234"


class _StepLimitHit(Exception):
    pass


def compute_stats(loadout):
    idx = data.part_index()
    chassis = idx[loadout.get("chassis", "standard")][1]
    stats = {
        "max_hp": chassis["hp"], "max_energy": chassis["energy"], "regen": chassis["regen"],
        "armor": False, "scan_range": DEFAULT_SCAN_RANGE, "hover": chassis["id"] == "hover",
        "free_dash": chassis["id"] == "scout", "apis": {},
    }
    for pid in list(loadout.get("weapons", [])) + list(loadout.get("modules", [])):
        if pid not in idx:
            continue
        spec = idx[pid][1]
        if spec.get("api"):
            stats["apis"][spec["api"]] = spec
        if pid == "armor":
            stats["armor"] = True
        if pid == "battery":
            stats["max_energy"] += spec.get("energy", 0)
            stats["regen"] += spec.get("regen", 0)
        if pid == "radar":
            stats["scan_range"] = spec.get("range", 99)
    return stats


class Bot:
    def __init__(self, idx, spec, x, y, d):
        self.id = idx
        self.name = spec.get("name") or f"Roboter {idx + 1}"
        self.loadout = spec.get("loadout") or data.parts()["default_loadout"]
        self.stats = compute_stats(self.loadout)
        self.x, self.y, self.dir = x, y, d
        self.max_hp = self.stats["max_hp"]
        self.hp = self.max_hp
        self.max_energy = self.stats["max_energy"]
        self.energy = self.max_energy
        self.cooldowns = {}
        self.shield = 0
        self.alive = True
        self.action = None
        self.action_line = None
        self.update_fn = None
        self.globals = None
        self.error = None
        self.errors_logged = 0
        self.extra_warned = False
        self.score = {"damage_dealt": 0, "damage_taken": 0, "shots": 0, "hits": 0, "errors": 0}

    def to_frame(self):
        return {
            "id": self.id, "x": self.x, "y": self.y, "dir": self.dir, "hp": max(0, self.hp),
            "max_hp": self.max_hp, "energy": self.energy, "max_energy": self.max_energy,
            "shield": self.shield, "alive": self.alive,
        }


class ArenaWorld:
    def __init__(self, rows, bot_specs, seed=1, max_ticks=300):
        self.height = len(rows)
        self.width = max(len(r) for r in rows)
        self.walls = set()
        spawns = {}
        for y, row in enumerate(rows):
            for x, ch in enumerate(row.ljust(self.width, "#")):
                if ch == "#":
                    self.walls.add((x, y))
                elif ch in SPAWN_CHARS:
                    spawns[int(ch) - 1] = (x, y)
        if len(bot_specs) > len(spawns):
            raise ValueError("Zu viele Roboter für diese Arena")
        cx, cy = self.width / 2, self.height / 2
        self.bots = []
        for i, spec in enumerate(bot_specs):
            x, y = spawns[i]
            dx, dy = cx - x, cy - y
            d = ("E" if dx > 0 else "W") if abs(dx) >= abs(dy) else ("S" if dy > 0 else "N")
            self.bots.append(Bot(i, spec, x, y, d))
        self.max_ticks = max_ticks
        self.seed = seed
        self.tick = 0
        self.frames = []
        self.events = []
        self.rockets = []
        self.mines = []
        self.next_obj = 0
        self.winner = None
        self.reason = ""
        self.finished = False
        random.seed(seed)
        for b, spec in zip(self.bots, bot_specs):
            self._setup_bot(b, spec.get("code", ""))
        self._record()

    # ------------------------------------------------------------ geometry
    def is_wall(self, x, y):
        return (x, y) in self.walls or not (0 <= x < self.width and 0 <= y < self.height)

    def bot_at(self, x, y, exclude=None):
        for b in self.bots:
            if b.alive and b is not exclude and b.x == x and b.y == y:
                return b
        return None

    def ray(self, x, y, d, pierce=False):
        """Returns (end_x, end_y, [bots hit]). end is the last tile reached (wall tile if stopped by wall)."""
        dx, dy = DIRS[d]
        hits = []
        cx, cy = x, y
        while True:
            cx, cy = cx + dx, cy + dy
            if self.is_wall(cx, cy):
                return cx, cy, hits, False
            b = self.bot_at(cx, cy)
            if b is not None:
                hits.append(b)
                if not pierce:
                    return cx, cy, hits, True

    def path_dir(self, sx, sy, tx, ty):
        """First step direction of the shortest path (walls only) from (sx,sy) to (tx,ty)."""
        if (sx, sy) == (tx, ty) or self.is_wall(tx, ty):
            return None
        from collections import deque
        prev = {(tx, ty): None}
        q = deque([(tx, ty)])
        while q:  # BFS from the target, so we can read the first step at the start
            cx, cy = q.popleft()
            for d, (dx, dy) in DIRS.items():
                n = (cx + dx, cy + dy)
                if n in prev or self.is_wall(*n):
                    continue
                prev[n] = (cx, cy)
                if n == (sx, sy):
                    nx, ny = cx, cy
                    for dd, (ddx, ddy) in DIRS.items():
                        if (sx + ddx, sy + ddy) == (nx, ny):
                            return dd
                q.append(n)
        return None

    def line_of_sight_dir(self, a, tx, ty):
        if a.x == tx and a.y != ty:
            d = "S" if ty > a.y else "N"
        elif a.y == ty and a.x != tx:
            d = "E" if tx > a.x else "W"
        else:
            return None
        dx, dy = DIRS[d]
        cx, cy = a.x, a.y
        while (cx, cy) != (tx, ty):
            cx, cy = cx + dx, cy + dy
            if self.is_wall(cx, cy):
                return None
        return d

    # ------------------------------------------------------------ code
    def _setup_bot(self, bot, code):
        def kid_print(*args, sep=" ", end="", **_):
            self.events.append({"type": "print", "bot": bot.id,
                                "text": sep.join(str(a) for a in args)[:200], "line": current_line()})

        bot.globals = {"__builtins__": make_builtins(kid_print), "__name__": "__robot__"}
        robot = make_arena_robot(self, bot)
        bot.globals["robot"] = robot
        bot.proxy = robot
        try:
            tree = ast.parse(code, CODE_FILENAME)
            compiled = compile(tree, CODE_FILENAME, "exec")
        except SyntaxError as exc:
            self._bot_error(bot, exc.lineno, explain_exception(exc, ARENA_API), fatal=True)
            return
        try:
            with StepCounter(SETUP_STEP_LIMIT, lambda ln: _StepLimitHit(ln)):
                exec(compiled, bot.globals)
        except _StepLimitHit as exc:
            self._bot_error(bot, exc.args[0], "Der Code außerhalb von update() läuft endlos.", fatal=True)
            return
        except Exception as exc:  # noqa: BLE001 - kid code
            self._bot_error(bot, error_line(exc), explain_exception(exc, ARENA_API, bot.globals), fatal=True)
            return
        fn = bot.globals.get("update")
        if not callable(fn):
            self._bot_error(bot, None, "Es fehlt die Funktion `def update(robot):` – sie wird jeden Zug aufgerufen.",
                            fatal=True)
            return
        bot.update_fn = fn

    def _bot_error(self, bot, line, message, fatal=False):
        bot.score["errors"] += 1
        if bot.error is None:
            bot.error = {"line": line, "message": message, "tick": self.tick}
        if bot.errors_logged < MAX_ERRORS_LOGGED:
            bot.errors_logged += 1
            self.events.append({"type": "error", "bot": bot.id, "line": line, "message": message})
        if fatal:
            bot.update_fn = None

    def _decide(self, bot):
        bot.action = None
        bot.action_line = None
        if bot.update_fn is None:
            return
        try:
            with StepCounter(UPDATE_STEP_LIMIT, lambda ln: _StepLimitHit(ln)):
                bot.update_fn(bot.proxy)
        except _StepLimitHit as exc:
            bot.action = None
            self._bot_error(bot, exc.args[0], "update() rechnet zu lange – Endlosschleife? Dieser Zug fällt aus.")
        except RobotError as exc:
            bot.action = None
            self._bot_error(bot, error_line(exc), str(exc))
        except Exception as exc:  # noqa: BLE001
            bot.action = None
            self._bot_error(bot, error_line(exc), explain_exception(exc, ARENA_API, bot.globals))

    # ------------------------------------------------------------ resolution helpers
    def _spend(self, bot, api):
        spec = bot.stats["apis"].get(api)
        if spec is None:
            return False
        if bot.cooldowns.get(api, 0) > 0:
            self.events.append({"type": "cooldown", "bot": bot.id, "api": api})
            return False
        cost = spec.get("cost", 0)
        if api == "dash" and bot.stats["free_dash"]:
            cost = 0
        if bot.energy < cost:
            self.events.append({"type": "noenergy", "bot": bot.id})
            return False
        bot.energy -= cost
        if spec.get("cooldown"):
            bot.cooldowns[api] = spec["cooldown"] + 1  # +1: decremented at end of this tick
        return True

    def _damage(self, target, amount, source):
        if not target.alive or amount <= 0:
            return
        if target.shield > 0:
            self.events.append({"type": "shield_block", "bot": target.id})
            return
        if target.stats["armor"] and amount >= 2:
            amount -= 1
        target.hp -= amount
        target.score["damage_taken"] += amount
        if source is not None:
            source.score["damage_dealt"] += amount
        self.events.append({"type": "damage", "bot": target.id, "amount": amount,
                            "by": source.id if source else None})

    def _obj_id(self):
        self.next_obj += 1
        return self.next_obj

    # ------------------------------------------------------------ main step
    def step(self):
        self.tick += 1
        alive = [b for b in self.bots if b.alive]
        for b in alive:
            self._decide(b)

        def act(b):
            return b.action[0] if b.action else None

        # 1) turns
        for b in alive:
            a = act(b)
            if a in ("turn_left", "turn_right"):
                i = ORDER.index(b.dir)
                b.dir = ORDER[(i + (-1 if a == "turn_left" else 1)) % 4]
            elif a == "face":
                b.dir = b.action[1]["dir"]

        # 2) self buffs
        for b in alive:
            a = act(b)
            if a == "shield" and self._spend(b, "shield"):
                b.shield = b.stats["apis"]["shield"].get("duration", 2)
                self.events.append({"type": "shield_up", "bot": b.id})
            elif a == "repair" and self._spend(b, "repair"):
                heal = b.stats["apis"]["repair"].get("heal", 2)
                b.hp = min(b.max_hp, b.hp + heal)
                self.events.append({"type": "repair", "bot": b.id, "amount": heal})

        # 3) movement
        self._resolve_movement(alive, act)

        # 4) existing rockets fly
        self._advance_rockets(new=False)

        # 5) weapons
        for b in alive:
            a = act(b)
            if a == "shoot" and self._spend(b, "shoot"):
                spec = b.stats["apis"]["shoot"]
                ex, ey, hits, hit = self.ray(b.x, b.y, b.dir)
                b.score["shots"] += 1
                self.events.append({"type": "laser", "by": b.id, "fx": b.x, "fy": b.y, "tx": ex, "ty": ey, "hit": hit})
                for t in hits:
                    b.score["hits"] += 1
                    self._damage(t, spec["damage"], b)
            elif a == "fire_railgun" and self._spend(b, "fire_railgun"):
                spec = b.stats["apis"]["fire_railgun"]
                ex, ey, hits, _ = self.ray(b.x, b.y, b.dir, pierce=True)
                b.score["shots"] += 1
                self.events.append({"type": "rail", "by": b.id, "fx": b.x, "fy": b.y, "tx": ex, "ty": ey,
                                    "hit": bool(hits)})
                for t in hits:
                    b.score["hits"] += 1
                    self._damage(t, spec["damage"], b)
            elif a == "fire_rocket" and self._spend(b, "fire_rocket"):
                spec = b.stats["apis"]["fire_rocket"]
                b.score["shots"] += 1
                self.rockets.append({"id": self._obj_id(), "x": b.x, "y": b.y, "dir": b.dir, "owner": b.id,
                                     "damage": spec["damage"], "splash": spec.get("splash", 1),
                                     "speed": spec.get("speed", 2), "age": 0, "new": True})
                self.events.append({"type": "rocket_launch", "by": b.id, "x": b.x, "y": b.y})
            elif a == "drop_mine" and self._spend(b, "drop_mine"):
                spec = b.stats["apis"]["drop_mine"]
                mine_list = [m for m in self.mines if m["owner"] == b.id]
                if len(mine_list) >= spec.get("max_active", 3):
                    self.mines.remove(mine_list[0])
                self.mines.append({"id": self._obj_id(), "x": b.x, "y": b.y, "owner": b.id,
                                   "damage": spec["damage"], "armed": self.tick + 1})
                self.events.append({"type": "mine_drop", "by": b.id, "x": b.x, "y": b.y})
        self._advance_rockets(new=True)

        # 6) mines
        for m in list(self.mines):
            if self.tick < m["armed"]:
                continue
            victim = self.bot_at(m["x"], m["y"])
            if victim is not None and victim.id != m["owner"] and not victim.stats["hover"]:
                self.mines.remove(m)
                self.events.append({"type": "mine_explode", "x": m["x"], "y": m["y"]})
                self._damage(victim, m["damage"], self.bots[m["owner"]])

        # 7) deaths, regen, cooldowns
        for b in alive:
            if b.hp <= 0:
                b.alive = False
                self.events.append({"type": "explode", "bot": b.id, "x": b.x, "y": b.y})
            b.energy = min(b.max_energy, b.energy + b.stats["regen"])
            for k in list(b.cooldowns):
                b.cooldowns[k] = max(0, b.cooldowns[k] - 1)
            if b.shield > 0:
                b.shield -= 1
        self._record()
        self._check_end()

    def _resolve_movement(self, alive, act):
        target = {}
        for b in alive:
            a = act(b)
            if a == "move":
                steps = 1
            elif a == "dash" and self._spend(b, "dash"):
                steps = 2
                self.events.append({"type": "dash", "bot": b.id})
            else:
                continue
            dx, dy = DIRS[b.dir]
            tx, ty = b.x, b.y
            for _ in range(steps):
                nx, ny = tx + dx, ty + dy
                if self.is_wall(nx, ny) or any(o.alive and o is not b and (o.x, o.y) == (nx, ny)
                                               and act(o) not in ("move", "dash") for o in alive):
                    break
                tx, ty = nx, ny
            if (tx, ty) == (b.x, b.y):
                self.events.append({"type": "bump", "bot": b.id})
                continue
            target[b.id] = (tx, ty)
        changed = True
        while changed:
            changed = False
            for b in alive:
                if b.id not in target:
                    continue
                t = target[b.id]
                standing = any(o.alive and o.id not in target and (o.x, o.y) == t for o in alive)
                contested = any(oid != b.id and ot == t for oid, ot in target.items())
                swap = any(oid != b.id and ot == (b.x, b.y) and (self.bots[oid].x, self.bots[oid].y) == t
                           for oid, ot in target.items())
                if standing or contested or swap:
                    del target[b.id]
                    self.events.append({"type": "bump", "bot": b.id})
                    changed = True
        for b in alive:
            if b.id in target:
                b.x, b.y = target[b.id]

    def _advance_rockets(self, new):
        for r in list(self.rockets):
            if r.get("new", False) != new:
                continue
            r["new"] = False
            r["age"] += 1
            dx, dy = DIRS[r["dir"]]
            exploded = False
            for _ in range(r["speed"]):
                nx, ny = r["x"] + dx, r["y"] + dy
                if self.is_wall(nx, ny):
                    self._explode_rocket(r, r["x"], r["y"], None)
                    exploded = True
                    break
                victim = self.bot_at(nx, ny)
                if victim is not None and victim.id != r["owner"]:
                    self._explode_rocket(r, nx, ny, victim)
                    exploded = True
                    break
                r["x"], r["y"] = nx, ny
            if not exploded and r["age"] > 20:
                self._explode_rocket(r, r["x"], r["y"], None)

    def _explode_rocket(self, r, x, y, direct):
        if r in self.rockets:
            self.rockets.remove(r)
        owner = self.bots[r["owner"]]
        self.events.append({"type": "rocket_explode", "x": x, "y": y, "by": owner.id})
        if direct is not None:
            owner.score["hits"] += 1
            self._damage(direct, r["damage"], owner)
        for b in self.bots:
            if b.alive and b is not direct and b is not owner and max(abs(b.x - x), abs(b.y - y)) <= 1:
                self._damage(b, r["splash"], owner)

    def _check_end(self):
        alive = [b for b in self.bots if b.alive]
        if len(alive) <= 1 and len(self.bots) > 1:
            self.finished = True
            if alive:
                self.winner = alive[0].id
                self.reason = f"{alive[0].name} ist als Letzter übrig!"
            else:
                self.reason = "Alle Roboter wurden gleichzeitig zerstört – Unentschieden!"
            return
        if len(self.bots) == 1 and not alive:
            self.finished = True
            self.reason = "Zerstört."
            return
        if self.tick >= self.max_ticks:
            self.finished = True
            ranked = sorted(alive, key=lambda b: (b.hp / b.max_hp, b.score["damage_dealt"]), reverse=True)
            if len(ranked) >= 2 and (ranked[0].hp / ranked[0].max_hp, ranked[0].score["damage_dealt"]) == \
                    (ranked[1].hp / ranked[1].max_hp, ranked[1].score["damage_dealt"]):
                self.reason = "Zeit abgelaufen – Unentschieden!"
            elif ranked:
                self.winner = ranked[0].id
                self.reason = f"Zeit abgelaufen – {ranked[0].name} hat mehr Lebenspunkte übrig."

    def _record(self):
        self.frames.append({
            "tick": self.tick,
            "bots": [b.to_frame() for b in self.bots],
            "lines": {str(b.id): b.action_line for b in self.bots},
            "rockets": [{"id": r["id"], "x": r["x"], "y": r["y"], "dir": r["dir"], "owner": r["owner"]}
                        for r in self.rockets],
            "mines": [{"id": m["id"], "x": m["x"], "y": m["y"], "owner": m["owner"],
                       "armed": self.tick >= m["armed"]} for m in self.mines],
            "events": self.events,
        })
        self.events = []

    def run(self):
        while not self.finished:
            self.step()
        return self.result()

    def result(self):
        return {
            "kind": "arena",
            "map": {"width": self.width, "height": self.height, "walls": sorted([list(w) for w in self.walls])},
            "frames": self.frames,
            "winner": self.winner,
            "reason": self.reason,
            "ticks": self.tick,
            "seed": self.seed,
            "bots": [{"id": b.id, "name": b.name, "loadout": b.loadout, "score": b.score, "error": b.error,
                      "hp": max(0, b.hp), "max_hp": b.max_hp, "alive": b.alive} for b in self.bots],
        }


def make_arena_robot(world, bot):
    def queue(name, **kw):
        if world.finished:
            return
        part = ACTION_PART.get(name)
        if part is not None and name not in bot.stats["apis"]:
            pname = data.part_index().get(part, (None, {"name": part}))[1]["name"]
            raise RobotError(f"Dein Roboter hat kein Teil für `robot.{name}()`. "
                             f"Baue in der Werkstatt ein: {pname}.")
        if bot.action is not None:
            if not bot.extra_warned:
                bot.extra_warned = True
                world.events.append({"type": "error", "bot": bot.id, "line": current_line(),
                                     "message": "Pro Zug ist nur EINE Aktion erlaubt. Weitere Aktionen in "
                                                "diesem update() werden ignoriert."})
            return
        bot.action = (name, kw)
        bot.action_line = current_line()

    def scan_list():
        rng = bot.stats["scan_range"]
        out = []
        for o in world.bots:
            if o is bot or not o.alive:
                continue
            dist = abs(o.x - bot.x) + abs(o.y - bot.y)
            if dist > rng:
                continue
            out.append({"name": o.name, "x": o.x, "y": o.y, "distanz": dist,
                        "richtung": world.line_of_sight_dir(bot, o.x, o.y), "hp": max(0, o.hp),
                        "schild": o.shield > 0, "id": o.id})
        out.sort(key=lambda e: (e["distanz"], e["id"]))
        return out

    def resolve_part(name):
        idx = data.part_index()
        if name in idx:
            spec = idx[name][1]
            return spec.get("api"), name
        for api, spec in bot.stats["apis"].items():
            if api == name:
                return api, spec["id"]
        return name, name

    class ArenaRobot:
        __slots__ = ()

        # --- actions (one per tick)
        def move(self):
            """Ein Feld vorwärts."""
            queue("move")

        def turn_left(self):
            queue("turn_left")

        def turn_right(self):
            queue("turn_right")

        def face(self, richtung):
            """Dreht sich direkt in eine Richtung: "N", "O"/"E", "S" oder "W"."""
            d = str(richtung).upper().replace("O", "E")
            if d not in DIRS:
                raise RobotError('`robot.face()` braucht "N", "O", "S" oder "W".')
            queue("face", dir=d)

        def wait(self):
            queue("wait")

        def shoot(self):
            queue("shoot")

        def fire_rocket(self):
            queue("fire_rocket")

        def drop_mine(self):
            queue("drop_mine")

        def fire_railgun(self):
            queue("fire_railgun")

        def shield(self):
            queue("shield")

        def repair(self):
            queue("repair")

        def dash(self):
            queue("dash")

        def say(self, *text):
            world.events.append({"type": "say", "bot": bot.id, "text": " ".join(str(t) for t in text)[:80],
                                 "line": current_line()})

        # --- sensors (free)
        def front_is_clear(self):
            dx, dy = DIRS[bot.dir]
            nx, ny = bot.x + dx, bot.y + dy
            return not world.is_wall(nx, ny) and world.bot_at(nx, ny) is None

        def enemy_ahead(self):
            _, _, hits, _ = world.ray(bot.x, bot.y, bot.dir)
            return bool(hits)

        def scan(self):
            """Liste aller Gegner in Reichweite (nächster zuerst)."""
            return scan_list()

        def nearest_enemy(self):
            s = scan_list()
            return s[0] if s else None

        def direction_to(self, x, y):
            dx, dy = x - bot.x, y - bot.y
            if dx == 0 and dy == 0:
                return bot.dir
            if abs(dx) >= abs(dy):
                return "E" if dx > 0 else "W"
            return "S" if dy > 0 else "N"

        def path_to(self, x, y):
            """Richtung des ersten Schritts auf dem kürzesten Weg um Wände herum (oder None)."""
            return world.path_dir(bot.x, bot.y, int(x), int(y))

        def distance_to(self, x, y):
            return abs(x - bot.x) + abs(y - bot.y)

        def has(self, part):
            p = str(part)
            return p in bot.loadout.get("weapons", []) or p in bot.loadout.get("modules", []) \
                or p == bot.loadout.get("chassis")

        def cooldown(self, name):
            api, _ = resolve_part(str(name))
            return bot.cooldowns.get(api, 0)

        def ready(self, name):
            api, _ = resolve_part(str(name))
            spec = bot.stats["apis"].get(api)
            if spec is None:
                return False
            cost = 0 if (api == "dash" and bot.stats["free_dash"]) else spec.get("cost", 0)
            return bot.cooldowns.get(api, 0) == 0 and bot.energy >= cost

        x = property(lambda self: bot.x)
        y = property(lambda self: bot.y)
        dir = property(lambda self: bot.dir)
        hp = property(lambda self: max(0, bot.hp))
        max_hp = property(lambda self: bot.max_hp)
        energy = property(lambda self: bot.energy)
        max_energy = property(lambda self: bot.max_energy)
        tick = property(lambda self: world.tick)
        shield_active = property(lambda self: bot.shield > 0)
        name = property(lambda self: bot.name)
        arena_width = property(lambda self: world.width)
        arena_height = property(lambda self: world.height)

        def __getattr__(self, name):
            import difflib
            close = difflib.get_close_matches(name, ARENA_API, n=1)
            hint = f" Meintest du `robot.{close[0]}`?" if close else ""
            raise UnknownCommand(f"Der Roboter kennt keinen Befehl `{name}`.{hint}")

        def __setattr__(self, name, value):
            raise RobotError("Du kannst den Roboter nicht umbauen – nur programmieren. 😉 "
                             "Für eigene Werte nimm Variablen außerhalb von update().")

        def __repr__(self):
            return f"<Roboter {bot.name}>"

    return ArenaRobot()


def run_match(bot_specs, arena_id="werkhalle", seed=1, max_ticks=300, rows=None):
    """bot_specs: list of {name, code, loadout}. Returns a JSON-serialisable result."""
    rows = rows or data.arena(arena_id)["rows"]
    world = ArenaWorld(rows, bot_specs, seed=seed, max_ticks=max_ticks)
    res = world.run()
    res["arena"] = arena_id
    return res
