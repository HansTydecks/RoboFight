"""Exceptions and kid-friendly error messages (German)."""

import difflib


class SimulationEnd(BaseException):
    """Ends a simulation run. BaseException so a plain `except Exception` in kid code can't swallow it."""

    status = "ended"
    reason = ""


class MissionComplete(SimulationEnd):
    status = "success"
    reason = "Mission geschafft!"


class MissionFailed(SimulationEnd):
    status = "failed"

    def __init__(self, reason):
        super().__init__()
        self.reason = reason


class RobotDestroyed(SimulationEnd):
    status = "destroyed"
    reason = "Dein Roboter wurde zerstört."


class OutOfTime(SimulationEnd):
    status = "timeout"

    def __init__(self, max_ticks):
        super().__init__()
        self.reason = (
            f"Die Zeit ist abgelaufen ({max_ticks} Züge). "
            "Läuft dein Roboter vielleicht im Kreis?"
        )


class StepLimit(SimulationEnd):
    status = "error"

    def __init__(self, line):
        super().__init__()
        self.line = line
        self.reason = (
            "Dein Programm rechnet und rechnet, ohne dass der Roboter etwas tut. "
            "Ist das eine Endlosschleife? Prüfe die Bedingung deiner Schleife."
        )


class RobotError(Exception):
    """Wrong use of the robot API. Message is already kid-friendly."""


class LockedCommand(RobotError):
    pass


class UnknownCommand(RobotError):
    pass


def _syntax_hint(exc):
    msg = (exc.msg or "").lower()
    if isinstance(exc, IndentationError) or "indent" in msg:
        if "expected an indented block" in msg:
            return ("Nach einem Doppelpunkt `:` muss die nächste Zeile eingerückt sein "
                    "(4 Leerzeichen oder die Tab-Taste).")
        if "unexpected indent" in msg:
            return "Diese Zeile ist eingerückt, obwohl sie es nicht sein sollte."
        if "unindent" in msg:
            return "Die Einrückung dieser Zeile passt zu keiner Zeile darüber. Zähle die Leerzeichen nach."
        return "Mit der Einrückung stimmt etwas nicht."
    if "expected ':'" in msg:
        return "Hier fehlt ein Doppelpunkt `:` am Ende der Zeile."
    if "was never closed" in msg:
        return "Eine Klammer wurde geöffnet, aber nie geschlossen."
    if "unmatched" in msg:
        return "Hier ist eine Klammer zu viel, die nie geöffnet wurde."
    if "forgot a comma" in msg:
        return "Fehlt hier vielleicht ein Komma?"
    if "unterminated string" in msg:
        return "Ein Text in Anführungszeichen wurde nicht beendet. Fehlt ein \" am Ende?"
    if "'=' " in msg or "maybe you meant '=='" in msg:
        return "Zum Vergleichen brauchst du `==`, zum Speichern `=`."
    return "Python versteht diese Zeile nicht. Prüfe Tippfehler, Klammern und Doppelpunkte."


def explain_exception(exc, api_names, known_names=()):
    """Return a German explanation for an exception raised by kid code."""
    if isinstance(exc, RobotError):
        return str(exc)
    if isinstance(exc, SyntaxError):
        return _syntax_hint(exc)
    if isinstance(exc, NameError):
        name = getattr(exc, "name", None)
        if name is None:
            parts = str(exc).split("'")
            name = parts[1] if len(parts) > 1 else "?"
        if name in api_names:
            return (f"`{name}` kennt Python nicht allein. Befehle für den Roboter beginnen mit "
                    f"`robot.`, also: `robot.{name}()`")
        close = difflib.get_close_matches(name, list(known_names) + list(api_names), n=1)
        if close:
            return f"Den Namen `{name}` gibt es nicht. Meintest du `{close[0]}`?"
        return (f"Den Namen `{name}` gibt es nicht. Hast du ihn vorher festgelegt, "
                f"zum Beispiel `{name} = 0`?")
    if isinstance(exc, ZeroDivisionError):
        return "Durch 0 teilen geht nicht – auch nicht für Roboter."
    if isinstance(exc, RecursionError):
        return "Zu viele Funktionsaufrufe ineinander. Ruft sich eine Funktion endlos selbst auf?"
    if isinstance(exc, TypeError):
        return f"Da passt ein Datentyp nicht: {exc}"
    if isinstance(exc, IndexError):
        return f"Diese Listenposition gibt es nicht: {exc}"
    if isinstance(exc, KeyError):
        return f"Diesen Schlüssel gibt es im Dictionary nicht: {exc}"
    if isinstance(exc, ValueError):
        return f"Ungültiger Wert: {exc}"
    return f"{type(exc).__name__}: {exc}"
