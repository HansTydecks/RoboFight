"""Deterministic, tick-based grid world.

One robot action (move one step, turn, shoot, wait) == one tick.
After each robot action the NPCs act, then a frame is recorded.
Frames are plain dicts so they can be sent to the browser as JSON
and replayed identically anywhere.
"""

from .errors import MissionComplete, OutOfTime, RobotDestroyed

DIRS = {"N": (0, -1), "E": (1, 0), "S": (0, 1), "W": (-1, 0)}
ORDER = ["N", "E", "S", "W"]
START_CHARS = {"^": "N", ">": "E", "v": "S", "<": "W"}

ENTITY_CHARS = {
    "T": {"kind": "target", "hp": 1},
    "E": {"kind": "sentry", "hp": 1},
    "B": {"kind": "boss", "hp": 3},
}

BOSS_COOLDOWN = 5


class Entity:
    def __init__(self, eid, kind, x, y, hp):
        self.id = eid
        self.kind = kind
        self.x = x
        self.y = y
        self.hp = hp
        self.max_hp = hp
        self.dy = 1  # boss patrol direction
        self.cooldown = 0

    @property
    def alive(self):
        return self.hp > 0

    def to_dict(self):
        return {
            "id": self.id,
            "kind": self.kind,
            "x": self.x,
            "y": self.y,
            "hp": self.hp,
            "max_hp": self.max_hp,
            "cooldown": self.cooldown,
        }


class World:
    def __init__(self, mission, variant=0):
        self.mission = mission
        rows = mission["maps"][variant]
        self.height = len(rows)
        self.width = max(len(r) for r in rows)
        self.walls = set()
        self.goal = None
        self.crystals = set()
        self.entities = []
        robot_cfg = mission.get("robot", {})
        self.robot_hp = robot_cfg.get("hp", 3)
        self.robot_max_hp = self.robot_hp
        self.energy = robot_cfg.get("energy")  # None == unlimited
        self.max_energy = self.energy
        self.goals = mission.get("goals", ["reach_goal"])
        self.max_ticks = mission.get("max_ticks", 200)
        boss_hp = mission.get("boss_hp")

        start = None
        for y, row in enumerate(rows):
            for x, ch in enumerate(row.ljust(self.width, "#")):
                if ch == "#":
                    self.walls.add((x, y))
                elif ch == "G":
                    self.goal = (x, y)
                elif ch == "C":
                    self.crystals.add((x, y))
                elif ch in START_CHARS:
                    start = (x, y, START_CHARS[ch])
                elif ch in ENTITY_CHARS:
                    spec = ENTITY_CHARS[ch]
                    hp = boss_hp if (spec["kind"] == "boss" and boss_hp) else spec["hp"]
                    self.entities.append(Entity(len(self.entities), spec["kind"], x, y, hp))
        if start is None:
            raise ValueError("Map has no robot start (^ > v <)")
        self.rx, self.ry, self.rdir = start
        self.crystals_total = len(self.crystals)

        self.tick = 0
        self.frames = []
        self.pending_events = []
        self.ended = None  # SimulationEnd instance once finished
        self._record(line=None)

    # ------------------------------------------------------------------ queries
    def in_bounds(self, x, y):
        return 0 <= x < self.width and 0 <= y < self.height

    def is_wall(self, x, y):
        return (x, y) in self.walls or not self.in_bounds(x, y)

    def entity_at(self, x, y):
        for e in self.entities:
            if e.alive and e.x == x and e.y == y:
                return e
        return None

    def blocked(self, x, y):
        return self.is_wall(x, y) or self.entity_at(x, y) is not None

    def ahead(self):
        dx, dy = DIRS[self.rdir]
        return self.rx + dx, self.ry + dy

    def front_is_clear(self):
        return not self.blocked(*self.ahead())

    def at_goal(self):
        return self.goal is not None and (self.rx, self.ry) == self.goal

    def enemy_ahead(self):
        return self._ray(self.rx, self.ry, self.rdir)[1] is not None

    def enemy_count(self):
        return sum(1 for e in self.entities if e.alive)

    def _ray(self, x, y, d, stop_at_robot=False):
        """Walk from (x, y) in direction d. Returns (last_pos, entity_hit, robot_hit)."""
        dx, dy = DIRS[d]
        cx, cy = x, y
        while True:
            nx, ny = cx + dx, cy + dy
            if self.is_wall(nx, ny):
                return (nx, ny), None, False
            if stop_at_robot and (nx, ny) == (self.rx, self.ry):
                return (nx, ny), None, True
            e = self.entity_at(nx, ny)
            if e is not None and not stop_at_robot:
                return (nx, ny), e, False
            if e is not None and stop_at_robot:
                return (nx, ny), None, False  # other entity blocks the shot
            cx, cy = nx, ny

    # ------------------------------------------------------------------ actions
    def event(self, **ev):
        self.pending_events.append(ev)

    def act(self, action, line, **kw):
        if self.ended is not None:
            raise self.ended
        getattr(self, "_do_" + action)(**kw)
        self._end_tick(line)

    def _do_move(self):
        nx, ny = self.ahead()
        if self.blocked(nx, ny):
            self.event(type="bump", x=nx, y=ny)
            return
        self.rx, self.ry = nx, ny
        if (nx, ny) in self.crystals:
            self.crystals.discard((nx, ny))
            self.event(type="pickup", x=nx, y=ny)

    def _do_turn(self, left):
        i = ORDER.index(self.rdir)
        self.rdir = ORDER[(i + (-1 if left else 1)) % 4]

    def _do_wait(self):
        pass

    def _do_shoot(self):
        if self.energy is not None:
            if self.energy <= 0:
                self.event(type="noenergy")
                return
            self.energy -= 1
        end, hit, _ = self._ray(self.rx, self.ry, self.rdir)
        self.event(type="laser", by="robot", fx=self.rx, fy=self.ry, tx=end[0], ty=end[1],
                   hit=hit is not None)
        if hit is not None:
            hit.hp -= 1
            self.event(type="hit", x=hit.x, y=hit.y, id=hit.id)
            if not hit.alive:
                self.event(type="explode", x=hit.x, y=hit.y, id=hit.id)

    # ------------------------------------------------------------------ npcs
    def _npc_phase(self):
        for e in self.entities:
            if not e.alive:
                continue
            if e.kind == "sentry":
                if abs(e.x - self.rx) + abs(e.y - self.ry) == 1:
                    self._enemy_fire(e)
            elif e.kind == "boss":
                ny = e.y + e.dy
                if self.blocked(e.x, ny) or (e.x, ny) == (self.rx, self.ry):
                    e.dy = -e.dy
                    ny = e.y + e.dy
                if not self.blocked(e.x, ny) and (e.x, ny) != (self.rx, self.ry):
                    e.y = ny
                if e.cooldown == 0 and self._boss_sees_robot(e):
                    self._enemy_fire(e)
                    e.cooldown = BOSS_COOLDOWN
                elif e.cooldown > 0:
                    e.cooldown -= 1

    def _boss_sees_robot(self, e):
        if e.y == self.ry:
            d = "W" if self.rx < e.x else "E"
        elif e.x == self.rx:
            d = "N" if self.ry < e.y else "S"
        else:
            return False
        _, _, robot_hit = self._ray(e.x, e.y, d, stop_at_robot=True)
        return robot_hit

    def _enemy_fire(self, e):
        self.robot_hp -= 1
        self.event(type="laser", by="enemy", fx=e.x, fy=e.y, tx=self.rx, ty=self.ry, hit=True)
        self.event(type="damage", x=self.rx, y=self.ry)

    # ------------------------------------------------------------------ bookkeeping
    def goals_met(self):
        for g in self.goals:
            if g == "reach_goal" and not self.at_goal():
                return False
            if g == "collect_all" and self.crystals:
                return False
            if g == "destroy_all" and self.enemy_count() > 0:
                return False
        return True

    def _end_tick(self, line):
        self.tick += 1
        self._npc_phase()
        if self.robot_hp <= 0:
            self.event(type="explode", x=self.rx, y=self.ry, id="robot")
        self._record(line)
        if self.robot_hp <= 0:
            self.ended = RobotDestroyed()
            raise self.ended
        if self.tick >= self.max_ticks:
            self.ended = OutOfTime(self.max_ticks)
            raise self.ended

    def after_command(self):
        """Goals are checked after a whole command, so `move(50)` can't win by
        merely driving over the goal."""
        if self.ended is None and self.goals_met():
            self.ended = MissionComplete()
            raise self.ended

    def flush(self, line=None):
        """Record a frame for pending non-tick events (say/print) at the end of a run."""
        if self.pending_events:
            self._record(line)

    def _record(self, line):
        self.frames.append({
            "tick": self.tick,
            "line": line,
            "robot": {"x": self.rx, "y": self.ry, "dir": self.rdir, "hp": self.robot_hp,
                      "max_hp": self.robot_max_hp, "energy": self.energy,
                      "max_energy": self.max_energy},
            "entities": [e.to_dict() for e in self.entities],
            "crystals": sorted([list(c) for c in self.crystals]),
            "events": self.pending_events,
        })
        self.pending_events = []

    def static_map(self):
        return {
            "width": self.width,
            "height": self.height,
            "walls": sorted([list(w) for w in self.walls]),
            "goal": list(self.goal) if self.goal else None,
            "crystals_total": self.crystals_total,
        }
