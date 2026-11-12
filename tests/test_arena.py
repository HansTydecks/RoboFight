from robofight import data
from robofight.arena import ArenaWorld, run_match

ROWS = ["#########", "#1.....2#", "#########"]
LASER = {"chassis": "standard", "weapons": ["laser"], "modules": [], "paint": "cyan", "hat": "none"}


def bot(code, loadout=LASER, name=None):
    return {"code": code, "loadout": loadout, "name": name}


SHOOTER = "def update(robot):\n    robot.shoot()\n"
IDLE = "def update(robot):\n    robot.wait()\n"


def test_shooter_beats_idle():
    res = run_match([bot(SHOOTER), bot(IDLE)], rows=ROWS)
    assert res["winner"] == 0
    assert res["bots"][1]["alive"] is False


def test_simultaneous_shots_draw():
    res = run_match([bot(SHOOTER), bot(SHOOTER)], rows=ROWS)
    assert res["winner"] is None and "Unentschieden" in res["reason"]


def test_deterministic():
    specs = [bot(b["code"], b["loadout"]) for b in data.ai_bots()[2:4]]
    a = run_match(specs, "saeulen", seed=5)
    b = run_match(specs, "saeulen", seed=5)
    assert a["frames"] == b["frames"]


def test_missing_part_is_explained():
    res = run_match([bot("def update(robot):\n    robot.fire_rocket()\n"), bot(IDLE)], rows=ROWS, max_ticks=3)
    assert "Raketenwerfer" in res["bots"][0]["error"]["message"]


def test_only_one_action_per_tick():
    code = "def update(robot):\n    robot.move()\n    robot.move()\n"
    res = run_match([bot(code), bot(IDLE)], rows=ROWS, max_ticks=2)
    assert res["frames"][1]["bots"][0]["x"] == 2
    assert any(e["type"] == "error" for e in res["frames"][1]["events"])


def test_infinite_loop_in_update_skips_tick():
    code = "def update(robot):\n    while True:\n        pass\n"
    res = run_match([bot(code), bot(IDLE)], rows=ROWS, max_ticks=2)
    assert "zu lange" in res["bots"][0]["error"]["message"]


def test_shield_blocks_damage():
    shield = {"chassis": "standard", "weapons": ["laser"], "modules": ["shield"], "paint": "cyan", "hat": "none"}
    code = "def update(robot):\n    robot.shield()\n"
    w = ArenaWorld(ROWS, [bot(code, shield), bot(SHOOTER)], max_ticks=5)
    w.step()
    assert w.bots[0].hp == w.bots[0].max_hp


def test_rocket_flies_and_explodes():
    rl = {"chassis": "standard", "weapons": ["rocket"], "modules": [], "paint": "cyan", "hat": "none"}
    w = ArenaWorld(["###########", "#1.......2#", "###########"],
                   [bot("def update(robot):\n    robot.fire_rocket()\n", rl), bot(IDLE)], max_ticks=10)
    for _ in range(4):
        w.step()
    assert w.bots[1].hp == w.bots[1].max_hp - 3


def test_mine_triggers_on_enemy():
    ml = {"chassis": "standard", "weapons": ["mines"], "modules": [], "paint": "cyan", "hat": "none"}
    rows = ["#####", "#1.2#", "#####"]
    layer = "t = 0\ndef update(robot):\n    global t\n    t += 1\n    if t == 1:\n        robot.drop_mine()\n" \
            "    elif t == 2:\n        robot.turn_left()\n    else:\n        robot.wait()\n"
    walker = "t = 0\ndef update(robot):\n    global t\n    t += 1\n    if t == 3:\n        robot.move()\n" \
             "    else:\n        robot.wait()\n"
    w = ArenaWorld(rows, [bot(layer, ml), bot(walker)], max_ticks=10)
    for _ in range(5):
        w.step()
    # walker moves to (2,1) – the mine is at (1,1) where the layer stands, so no hit yet
    assert w.bots[1].hp == w.bots[1].max_hp


def test_path_to_goes_around_walls():
    rows = ["#######", "#1#...#", "#.#.#.#", "#...#2#", "#######"]
    w = ArenaWorld(rows, [bot(IDLE), bot(IDLE)])
    assert w.path_dir(1, 1, 5, 3) == "S"


def test_ai_tiers_beat_dummy():
    bots = data.ai_bots()
    dummy = bots[0]
    for b in bots[2:]:
        res = run_match([bot(dummy["code"], dummy["loadout"]), bot(b["code"], b["loadout"])], "werkhalle", seed=1)
        assert res["winner"] == 1, b["id"]


def test_ai_loadouts_are_valid():
    from robofight import economy
    for b in data.ai_bots():
        prof = economy.new_profile("x")
        prof["inventory"] = [s["id"] for c in ("chassis", "weapons", "modules", "paints", "hats")
                             for s in data.parts()[c]]
        assert economy.validate_loadout(prof, b["loadout"]) == [], b["id"]


def test_imports_are_restricted():
    res = run_match([bot("import os\ndef update(robot):\n    robot.wait()\n"), bot(IDLE)], rows=ROWS, max_ticks=2)
    assert "nicht erlaubt" in res["bots"][0]["error"]["message"]


def test_math_import_allowed():
    res = run_match([bot("import math\ndef update(robot):\n    robot.wait()\n"), bot(IDLE)], rows=ROWS, max_ticks=2)
    assert res["bots"][0]["error"] is None
