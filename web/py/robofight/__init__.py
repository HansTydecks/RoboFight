"""RoboFight engine – deterministic grid simulation for kid-written Python robots.

Runs unchanged in the browser (Pyodide) and on a server (CPython).
"""

from .runner import run_mission, run_mission_json  # noqa: F401

__all__ = ["run_mission", "run_mission_json"]
