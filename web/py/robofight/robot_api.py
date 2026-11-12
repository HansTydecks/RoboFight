"""The `robot` object kids program against.

Every command is gated by the mission's unlocked API list
("Konzepte sind Waffen": new abilities come with new concepts).
"""

import difflib
import sys

from .errors import LockedCommand, RobotError, UnknownCommand

CODE_FILENAME = "<robot>"

# Which mission unlocks which command (for the "locked" message).
UNLOCK_HINT = {
    "move": "Mission 1",
    "turn_left": "Mission 2",
    "turn_right": "Mission 2",
    "move_n": "Mission 3",
    "shoot": "Mission 5",
    "at_goal": "Mission 7",
    "front_is_clear": "Mission 8",
    "enemy_ahead": "Mission 9",
    "enemy_count": "Mission 10",
    "wait": "Mission 10",
    "report": "Mission 11",
    "face": "Mission 14",
    "scan_directions": "Mission 14",
    "scan": "Mission 15",
}

API_NAMES = [
    "move", "turn_left", "turn_right", "shoot", "wait", "say",
    "at_goal", "front_is_clear", "enemy_ahead", "enemy_count", "hp", "energy",
    "report", "face", "scan_directions", "scan",
]


def current_line():
    """Line number in the kid's code that is currently executing."""
    f = sys._getframe(1)
    while f is not None:
        if f.f_code.co_filename == CODE_FILENAME:
            return f.f_lineno
        f = f.f_back
    return None


def make_robot(world, allowed):
    allowed = set(allowed) | {"say"}

    def require(name, label=None):
        if name not in allowed:
            label = label or f"robot.{name}()"
            where = UNLOCK_HINT.get(name)
            extra = f" Du bekommst es ab {where}." if where else ""
            raise LockedCommand(f"`{label}` ist noch gesperrt.{extra}")

    def check_running():
        if world.ended is not None:
            raise world.ended

    class Robot:
        __slots__ = ()

        def move(self, steps=1):
            """Fährt `steps` Felder geradeaus (ein Zug pro Feld)."""
            require("move")
            if steps != 1:
                require("move_n", "robot.move(n)")
            if isinstance(steps, bool) or not isinstance(steps, int):
                raise RobotError("`robot.move()` braucht eine ganze Zahl, zum Beispiel `robot.move(3)`.")
            if steps < 1 or steps > 50:
                raise RobotError("`robot.move(n)`: n muss zwischen 1 und 50 liegen.")
            line = current_line()
            for _ in range(steps):
                world.act("move", line)
            world.after_command()

        def turn_left(self):
            """Dreht sich um 90° nach links."""
            require("turn_left")
            world.act("turn", current_line(), left=True)
            world.after_command()

        def turn_right(self):
            """Dreht sich um 90° nach rechts."""
            require("turn_right")
            world.act("turn", current_line(), left=False)
            world.after_command()

        def shoot(self):
            """Feuert den Laser geradeaus."""
            require("shoot")
            world.act("shoot", current_line())
            world.after_command()

        def wait(self):
            """Wartet einen Zug."""
            require("wait")
            world.act("wait", current_line())
            world.after_command()

        def face(self, richtung):
            """Dreht sich direkt in eine Richtung ("N", "O"/"E", "S", "W"). Kostet einen Zug, wenn er sich drehen muss."""
            require("face", "robot.face()")
            d = str(richtung).upper().replace("O", "E")
            if d not in ("N", "E", "S", "W"):
                raise RobotError('`robot.face()` braucht "N", "O", "S" oder "W".')
            if d != world.rdir:
                world.act("face", current_line(), d=d)
                world.after_command()

        def report(self, wert):
            """Meldet einen Messwert an die Zentrale."""
            require("report")
            world.report(wert, current_line())

        def scan_directions(self):
            """Liste der Richtungen, in denen ein Gegner zu sehen ist, z.B. ["N", "W"]."""
            require("scan_directions", "robot.scan_directions()")
            check_running()
            return [e["richtung"] for e in world.scan() if e["typ"] == "feind"]

        def scan(self):
            """Liste von Dictionaries: {"richtung": "N", "distanz": 3, "typ": "feind"}."""
            require("scan")
            check_running()
            return world.scan()

        def say(self, *text):
            """Zeigt eine Sprechblase über dem Roboter (kostet keinen Zug)."""
            check_running()
            msg = " ".join(str(t) for t in text)[:80]
            world.event(type="say", text=msg, line=current_line())

        def at_goal(self):
            """True, wenn der Roboter auf dem Ziel steht."""
            require("at_goal")
            check_running()
            return world.at_goal()

        def front_is_clear(self):
            """True, wenn das Feld vor dem Roboter frei ist."""
            require("front_is_clear")
            check_running()
            return world.front_is_clear()

        def enemy_ahead(self):
            """True, wenn ein Gegner oder eine Zielscheibe in Blickrichtung ist."""
            require("enemy_ahead")
            check_running()
            return world.enemy_ahead()

        def enemy_count(self):
            """Anzahl der Gegner, die noch übrig sind."""
            require("enemy_count")
            check_running()
            return world.enemy_count()

        @property
        def hp(self):
            """Lebenspunkte des Roboters."""
            return world.robot_hp

        @property
        def energy(self):
            """Energie für den Laser (None = unbegrenzt)."""
            return world.energy

        def __getattr__(self, name):
            close = difflib.get_close_matches(name, API_NAMES, n=1)
            hint = f" Meintest du `robot.{close[0]}`?" if close else ""
            raise UnknownCommand(f"Der Roboter kennt keinen Befehl `{name}`.{hint}")

        def __setattr__(self, name, value):
            raise RobotError("Du kannst den Roboter nicht umbauen – nur programmieren. 😉")

        def __repr__(self):
            return "<Roboter>"

    return Robot()
