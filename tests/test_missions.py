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
    11: ("schritte = 0\nwhile robot.front_is_clear():\n    robot.move()\n    schritte = schritte + 1\n"
         "robot.report(schritte)\n"),
    12: ("def nische():\n    robot.turn_left()\n    robot.shoot()\n    robot.shoot()\n    robot.turn_right()\n\n"
         "robot.move(1)\nnische()\nrobot.move(3)\nnische()\nrobot.move(4)\nnische()\nrobot.move(2)\nnische()\n"
         "robot.move(1)\n"),
    13: ("def treppe(n):\n    for i in range(n):\n        robot.move()\n        robot.turn_right()\n"
         "        robot.move()\n        robot.turn_left()\n\ntreppe(2)\nrobot.move(2)\ntreppe(3)\nrobot.move()\n"),
    14: "for richtung in robot.scan_directions():\n    robot.face(richtung)\n    robot.shoot()\n",
    15: ('for ding in robot.scan():\n    if ding["typ"] == "feind":\n        robot.face(ding["richtung"])\n'
         '        robot.shoot()\n'),
    16: ('def update(robot):\n    if robot.enemy_ahead():\n        if robot.ready("shield") and not robot.shield_active:\n'
         '            robot.shield()\n        else:\n            robot.shoot()\n    else:\n        robot.turn_right()\n'),
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
        if MISSIONS[mid].get("type") == "arena":
            continue
        starts = sum(r.count(c) for r in rows for c in "^>v<")
        assert starts == 1


def test_wrong_measurement_fails():
    res = run_mission(MISSIONS[11], "robot.report(7)\n")
    assert res["variants"][0]["status"] == "failed" and "richtig wäre" in res["variants"][0]["reason"]
    assert res["variants"][2]["status"] == "failed"


def test_shooting_friends_fails():
    code = "for ding in robot.scan():\n    robot.face(ding['richtung'])\n    robot.shoot()\n"
    res = run_mission(MISSIONS[15], code)
    assert not res["ok"] and "Freund" in res["variants"][0]["reason"]


def test_list_solution_not_allowed_in_dict_mission():
    res = run_mission(MISSIONS[15], SOLUTIONS[14])
    assert "gesperrt" in res["variants"][0]["reason"]


def test_arena_starter_draws_against_kreisel():
    res = run_mission(MISSIONS[16], MISSIONS[16]["starter_code"])
    assert [v["status"] for v in res["variants"]] == ["success", "failed"]


def test_arena_mission_missing_update():
    res = run_mission(MISSIONS[16], "robot = 1\n")
    assert res["variants"][0]["status"] == "error" and "update" in res["variants"][0]["reason"]


def test_function_solution_beats_flat_code_in_lines():
    flat = ("robot.move(1)\n" + "robot.turn_left()\nrobot.shoot()\nrobot.shoot()\nrobot.turn_right()\n"
            "robot.move(3)\nrobot.turn_left()\nrobot.shoot()\nrobot.shoot()\nrobot.turn_right()\n"
            "robot.move(4)\nrobot.turn_left()\nrobot.shoot()\nrobot.shoot()\nrobot.turn_right()\n"
            "robot.move(2)\nrobot.turn_left()\nrobot.shoot()\nrobot.shoot()\nrobot.turn_right()\nrobot.move(1)\n")
    res = run_mission(MISSIONS[12], flat)
    assert res["ok"] and res["stars"] == 2


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
