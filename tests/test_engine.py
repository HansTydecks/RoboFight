import json
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "web" / "py"))

from robofight import run_mission, run_mission_json  # noqa: E402

MISSIONS = {m["id"]: m for m in json.loads((ROOT / "web" / "missions.json").read_text())}
M1 = MISSIONS[1]


def run(code, mission=M1):
    return run_mission(mission, code)


def test_syntax_error_is_explained_in_german_with_line():
    res = run("for i in range(3)\n    robot.move()\n", MISSIONS[6])
    assert res["error"]["line"] == 1
    assert "Doppelpunkt" in res["error"]["message"]


def test_indentation_error():
    res = run("for i in range(3):\nrobot.move()\n", MISSIONS[6])
    assert "eingerückt" in res["error"]["message"]


def test_forgot_robot_prefix():
    res = run("move()\n")
    v = res["variants"][0]
    assert v["status"] == "error" and "robot.move()" in v["reason"] and v["line"] == 1


def test_locked_command():
    res = run("robot.shoot()\n")
    v = res["variants"][0]
    assert v["status"] == "error" and "gesperrt" in v["reason"]


def test_move_n_locked_before_mission_3():
    res = run("robot.move(4)\n")
    assert "gesperrt" in res["variants"][0]["reason"]


def test_unknown_command_suggestion():
    res = run("robot.mvoe()\n")
    assert "robot.move" in res["variants"][0]["reason"]


def test_infinite_loop_is_stopped():
    res = run("x = 0\nwhile True:\n    x += 1\n")
    v = res["variants"][0]
    assert v["status"] == "error" and "Endlosschleife" in v["reason"]


def test_timeout_when_robot_spins():
    res = run("while True:\n    robot.turn_left()\n", MISSIONS[2])
    assert res["variants"][0]["status"] == "timeout"


def test_bare_except_cannot_swallow_mission_end():
    code = "while True:\n    try:\n        robot.move()\n    except:\n        pass\n"
    res = run(code)
    assert res["variants"][0]["status"] == "success"


def test_frames_track_lines_and_say():
    res = run("robot.say('Los!')\nrobot.move()\nrobot.move(1)\nrobot.move()\nrobot.move()\n")
    frames = res["variants"][0]["frames"]
    assert frames[0]["line"] is None
    assert [f["line"] for f in frames[1:]] == [2, 3, 4, 5]
    assert frames[1]["events"][0] == {"type": "say", "text": "Los!", "line": 1}


def test_print_is_captured():
    res = run("print('hallo', 3)\nfor i in range(4):\n    robot.move()\n")
    ev = res["variants"][0]["frames"][1]["events"][0]
    assert ev["type"] == "print" and ev["text"] == "hallo 3"


def test_bump_into_wall():
    res = run("robot.turn_left()\nrobot.move()\n", MISSIONS[2])
    assert res["variants"][0]["frames"][-1]["events"][0]["type"] == "bump"


def test_lint_missing_parentheses():
    res = run("robot.move\n")
    assert res["warnings"][0]["line"] == 1


def test_json_entry_point_roundtrip():
    out = json.loads(run_mission_json(json.dumps(M1), "for i in range(4):\n    robot.move()\n"))
    assert out["ok"] and out["stars"] == 3
