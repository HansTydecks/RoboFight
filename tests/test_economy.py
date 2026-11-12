import json

import pytest

from robofight import data, economy as e
from robofight.runner import run_mission

from test_missions import SOLUTIONS


def solve(p, mid):
    m = data.mission(mid)
    return e.apply_mission(p, m, run_mission(m, SOLUTIONS[mid]))


def test_first_solve_rewards():
    p = e.new_profile("kim")
    ch = solve(p, 1)
    assert ch["first_solve"] and ch["bolts"] == 50 + 75
    assert p["missions"]["1"]["stars"] == 3
    assert "first" in ch["new_badges"]
    ch2 = solve(p, 1)
    assert ch2["bolts"] == 0


def test_locked_mission_cannot_be_booked():
    p = e.new_profile("kim")
    with pytest.raises(e.EconomyError):
        solve(p, 3)


def test_buy_requires_unlock_and_bolts():
    p = e.new_profile("kim")
    with pytest.raises(e.EconomyError, match="Mission 2"):
        e.buy(p, "turbo")
    solve(p, 1)
    solve(p, 2)
    p["bolts"] = 10
    with pytest.raises(e.EconomyError, match="fehlen"):
        e.buy(p, "turbo")
    p["bolts"] = 500
    ch = e.buy(p, "turbo")
    assert "turbo" in p["inventory"] and p["bolts"] == 400 and "shopper" in ch["new_badges"]
    with pytest.raises(e.EconomyError, match="schon"):
        e.buy(p, "turbo")


def test_loadout_weight_and_ownership():
    p = e.new_profile("kim")
    p["inventory"] += ["rocket", "shield", "turbo"]
    with pytest.raises(e.EconomyError, match="schwer"):
        e.set_loadout(p, {"chassis": "standard", "weapons": ["laser", "rocket"], "modules": ["shield"],
                          "paint": "cyan", "hat": "none"})
    e.set_loadout(p, {"chassis": "standard", "weapons": ["laser"], "modules": ["shield", "turbo"],
                      "paint": "cyan", "hat": "none"})
    with pytest.raises(e.EconomyError, match="besitzt"):
        e.set_loadout(p, {"chassis": "tank", "weapons": ["laser"], "modules": [], "paint": "cyan", "hat": "none"})


def test_elo_and_ranked_limit():
    p = e.new_profile("kim")
    p["settings"]["daily_ranked_limit"] = 2
    ch = e.apply_match(p, "ranked", {"id": "x", "elo": 1000}, "win", today="2026-01-01")
    assert ch["elo_after"] == 1016 and p["bolts"] == 40
    e.apply_match(p, "ranked", {"id": "x", "elo": 1000}, "loss", today="2026-01-01")
    with pytest.raises(e.EconomyError):
        e.apply_match(p, "ranked", {"id": "x", "elo": 1000}, "loss", today="2026-01-01")
    assert e.ranked_left(p, "2026-01-02") == 2


def test_training_reward_only_once():
    p = e.new_profile("kim")
    c1 = e.apply_match(p, "training", {"id": "kreisel"}, "win")
    c2 = e.apply_match(p, "training", {"id": "kreisel"}, "win")
    assert c1["bolts"] == 60 and c2["bolts"] == 0 and "first_win" in c1["new_badges"]


def test_leagues():
    assert e.league(999) == "Bronze" and e.league(1260) == "Gold" and e.league(1800) == "Meister-Coder"


def test_call_json_roundtrip_and_errors():
    p = e.new_profile("kim")
    out = json.loads(e.call_json("buy", json.dumps(p), json.dumps({"item": "rocket"})))
    assert "error" in out
    out = json.loads(e.call_json("info", json.dumps(p), "{}"))
    assert out["result"]["info"]["level"]["level"] == 1


def test_normalize_old_profile():
    p = e.normalize({"username": "alt", "missions": {"1": {"solved": True, "stars": 2}}})
    assert p["arena"]["elo"] == 1000 and p["missions"]["1"]["stars"] == 2
