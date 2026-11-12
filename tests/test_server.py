import os

import pytest

os.environ["ROBOFIGHT_INPROCESS"] = "1"
os.environ["ROBOFIGHT_PBKDF2_ROUNDS"] = "1000"
os.environ["ROBOFIGHT_NO_STATIC"] = "1"

fastapi = pytest.importorskip("fastapi")
from fastapi.testclient import TestClient  # noqa: E402

from server.app import create_app  # noqa: E402
from test_missions import SOLUTIONS  # noqa: E402
from robofight.economy import ARENA_STARTER  # noqa: E402


@pytest.fixture
def client(tmp_path):
    return TestClient(create_app(db_path=str(tmp_path / "t.db")))


def register(client, name, role="student", **kw):
    r = client.post("/api/auth/register", json={"username": name, "password": "geheim", "role": role, **kw})
    assert r.status_code == 200, r.text
    return {"Authorization": "Bearer " + r.json()["token"]}


def solve_all(client, h, upto=16):
    for mid in range(1, upto + 1):
        r = client.post(f"/api/missions/{mid}/submit", json={"code": SOLUTIONS[mid]}, headers=h)
        assert r.status_code == 200 and r.json()["change"]["ok"], (mid, r.text)


def test_register_login_me(client):
    h = register(client, "kim")
    assert client.get("/api/me", headers=h).json()["profile"]["username"] == "kim"
    assert client.post("/api/auth/register", json={"username": "KIM", "password": "geheim"}).status_code == 409
    assert client.post("/api/auth/login", json={"username": "kim", "password": "falsch"}).status_code == 401
    r = client.post("/api/auth/login", json={"username": "kim", "password": "geheim"})
    assert r.status_code == 200
    assert client.get("/api/me").status_code == 401


def test_bad_username(client):
    r = client.post("/api/auth/register", json={"username": "a b", "password": "geheim"})
    assert r.status_code == 400


def test_server_checks_missions(client):
    h = register(client, "kim")
    r = client.post("/api/missions/1/submit", json={"code": "robot.move()\n"}, headers=h)
    assert r.json()["change"]["ok"] is False
    assert client.post("/api/missions/2/submit", json={"code": SOLUTIONS[2]}, headers=h).status_code == 403
    r = client.post("/api/missions/1/submit", json={"code": SOLUTIONS[1]}, headers=h)
    body = r.json()
    assert body["change"]["bolts"] == 125 and body["profile"]["bolts"] == 125
    assert body["profile"]["codes"]["1"] == SOLUTIONS[1]


def test_shop_loadout_and_arena_flow(client):
    h = register(client, "kim")
    solve_all(client, h)
    me = client.get("/api/me", headers=h).json()
    assert me["info"]["arena_unlocked"]
    assert client.post("/api/shop/buy", json={"item": "shield"}, headers=h).status_code == 200
    r = client.put("/api/loadout", json={"loadout": {"chassis": "standard", "weapons": ["laser"], "modules": ["shield"],
                                                     "paint": "cyan", "hat": "antenna"}}, headers=h)
    assert r.status_code == 200
    r = client.post("/api/arena/training", json={"opponent": "blechbuechse", "code": ARENA_STARTER}, headers=h)
    assert r.status_code == 200 and r.json()["change"]["outcome"] == "win"
    assert client.post("/api/arena/ranked", json={}, headers=h).status_code == 400  # not published
    assert client.post("/api/arena/publish", json={"code": ARENA_STARTER}, headers=h).status_code == 200
    r = client.post("/api/arena/ranked", json={"arena": "werkhalle"}, headers=h)
    assert r.status_code == 200
    assert r.json()["opponent"]["id"].startswith("ai:")
    mid = r.json()["match_id"]
    assert client.get(f"/api/arena/matches/{mid}", headers=h).json()["result"]["frames"]

    h2 = register(client, "ben")
    solve_all(client, h2)
    client.post("/api/arena/publish", json={"code": SOLUTIONS[16]}, headers=h2)
    r = client.post("/api/arena/ranked", json={}, headers=h2)
    assert r.json()["opponent"]["id"] == "kim"
    lb = client.get("/api/arena/leaderboard").json()["players"]
    assert {p["username"] for p in lb} == {"kim", "ben"}


def test_classes(client, monkeypatch):
    monkeypatch.setenv("ROBOFIGHT_TEACHER_KEY", "lehrer123")
    assert client.post("/api/auth/register", json={"username": "frau_m", "password": "geheim", "role": "teacher",
                                                   "teacher_key": "x"}).status_code == 403
    t = register(client, "frau_m", role="teacher", teacher_key="lehrer123")
    s = register(client, "kim")
    assert client.post("/api/classes", json={"name": "5b"}, headers=s).status_code == 403
    cls = client.post("/api/classes", json={"name": "5b"}, headers=t).json()
    assert client.post("/api/classes/join", json={"code": cls["code"].lower()}, headers=s).json()["class"]["name"] == "5b"
    client.post("/api/missions/1/submit", json={"code": SOLUTIONS[1]}, headers=s)
    detail = client.get(f"/api/classes/{cls['id']}", headers=t).json()
    assert detail["students"][0]["missions"] == {"1": 3}
    code = client.get(f"/api/classes/{cls['id']}/students/kim/code/1", headers=t).json()["code"]
    assert code == SOLUTIONS[1]
    assert client.put(f"/api/classes/{cls['id']}/settings", json={"daily_ranked_limit": 5}, headers=t).status_code == 200
    assert client.get("/api/me", headers=s).json()["profile"]["settings"]["daily_ranked_limit"] == 5
