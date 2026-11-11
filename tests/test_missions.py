"""Every mission must be solvable with its reference solution (3 stars),
and typical shortcuts must fail where the mission intends it."""

import json
import pathlib
import sys

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "web" / "py"))

from robofight import run_mission  # noqa: E402

MISSIONS = {m["id"]: m for m in json.loads((ROOT / "web" / "missions.json").read_text())}

SOLUTIONS = {
    1: "robot.move()\nrobot.move()\nrobot.move()\nrobot.move()\n",
    2: ("robot.move()\nrobot.move()\nrobot.turn_right()\nrobot.move()\nrobot.move()\n"
        "robot.turn_left()\nrobot.move()\nrobot.move()\n"),
    3: "robot.move(8)\nrobot.turn_right()\nrobot.move(2)\nrobot.turn_right()\nrobot.move(8)\n",
    4: ("robot.move(6)\nrobot.turn_right()\nrobot.move(2)\nrobot.turn_right()\nrobot.move(6)\n"
        "robot.turn_left()\nrobot.move()\n"),
    5: ("robot.shoot()\nrobot.shoot()\nrobot.move(7)\nrobot.turn_right()\nrobot.move(2)\n"
        "robot.turn_right()\nrobot.shoot()\nrobot.move(7)\n"),
    6: ("for i in range(5):\n    robot.move()\n    robot.turn_right()\n    robot.move()\n"
        "    robot.turn_left()\nrobot.move()\n"),
    7: "while not robot.at_goal():\n    robot.move()\n",
    8: ("while not robot.at_goal():\n    if robot.front_is_clear():\n        robot.move()\n"
        "    else:\n        robot.turn_right()\n"),
    9: ("while not robot.at_goal():\n    if robot.enemy_ahead():\n        robot.shoot()\n"
        "    elif robot.front_is_clear():\n        robot.move()\n    else:\n"
        "        robot.turn_right()\n"),
    10: ("while robot.enemy_count() > 0:\n    if robot.enemy_ahead():\n        robot.shoot()\n"
         "    else:\n        robot.wait()\n"),
}


@pytest.mark.parametrize("mid", sorted(MISSIONS))
def test_reference_solution_gets_three_stars(mid):
    res = run_mission(MISSIONS[mid], SOLUTIONS[mid])
    statuses = [(v["status"], v["reason"]) for v in res["variants"]]
    assert res["ok"], statuses
    assert res["stars"] == 3, (res["lines"], res["ticks"], MISSIONS[mid]["stars"])


@pytest.mark.parametrize("mid", sorted(MISSIONS))
def test_maps_are_rectangular_and_have_one_start(mid):
    for rows in MISSIONS[mid]["maps"]:
        assert len({len(r) for r in rows}) == 1
        starts = sum(r.count(c) for r in rows for c in "^>v<")
        assert starts == 1


def test_hardcoded_corridor_fails_other_variants():
    res = run_mission(MISSIONS[7], "robot.move(4)\n")
    assert [v["status"] for v in res["variants"]] == ["success", "incomplete", "incomplete"]
    assert not res["ok"]


def test_overshooting_goal_does_not_win():
    res = run_mission(MISSIONS[7], "robot.move(10)\n")
    assert res["variants"][1]["status"] == "success"
    assert res["variants"][0]["status"] == "incomplete"


def test_blind_shooting_runs_out_of_energy_against_boss():
    res = run_mission(MISSIONS[10], "while robot.enemy_count() > 0:\n    robot.shoot()\n")
    assert res["variants"][0]["status"] == "destroyed"


def test_walking_into_sentry_gets_robot_destroyed():
    res = run_mission(MISSIONS[9], "while not robot.at_goal():\n    robot.move()\n")
    assert res["variants"][0]["status"] in ("destroyed", "timeout")
    assert not res["ok"]


def test_non_loop_staircase_solves_with_fewer_stars():
    code = ("robot.move()\nrobot.turn_right()\nrobot.move()\nrobot.turn_left()\n" * 5) + "robot.move()\n"
    res = run_mission(MISSIONS[6], code)
    assert res["ok"] and res["stars"] == 2
