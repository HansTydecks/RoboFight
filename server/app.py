"""RoboFight REST API (FastAPI).

Same game rules as the browser: the server imports the engine from web/py/robofight
and re-runs every submitted program itself, so stars, bolts and Elo cannot be faked.
"""

import datetime
import hashlib
import hmac
import json
import os
import pathlib
import re
import secrets
import sys
import time

from fastapi import Depends, FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = pathlib.Path(__file__).resolve().parents[1]
WEB = ROOT / "web"
sys.path.insert(0, str(WEB / "py"))

from robofight import data, economy  # noqa: E402

from .db import DB  # noqa: E402
from .isolate import run_isolated  # noqa: E402

VERSION = "1.0.0"
TOKEN_DAYS = 30
PBKDF2_ROUNDS = int(os.environ.get("ROBOFIGHT_PBKDF2_ROUNDS", "200000"))
USERNAME_RE = re.compile(r"^[A-Za-z0-9_\-äöüÄÖÜß]{3,20}$")


# ------------------------------------------------------------------ models
class RegisterIn(BaseModel):
    username: str
    password: str
    display_name: str | None = None
    role: str = "student"
    teacher_key: str | None = None
    class_code: str | None = None


class LoginIn(BaseModel):
    username: str
    password: str


class CodeIn(BaseModel):
    code: str


class ItemIn(BaseModel):
    item: str


class LoadoutIn(BaseModel):
    loadout: dict


class OpponentIn(BaseModel):
    opponent: str
    arena: str | None = None
    code: str | None = None


class RankedIn(BaseModel):
    arena: str | None = None


class ClassIn(BaseModel):
    name: str


class JoinIn(BaseModel):
    code: str


class ClassSettingsIn(BaseModel):
    daily_ranked_limit: int


class SettingsIn(BaseModel):
    sound: bool | None = None
    display_name: str | None = None


# ------------------------------------------------------------------ helpers
def hash_pw(password, salt):
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, PBKDF2_ROUNDS)


def today():
    return datetime.date.today().isoformat()


def info(profile):
    return {"level": economy.level_info(profile), "league": economy.league(profile["arena"]["elo"]),
            "stars": economy.total_stars(profile), "shop": economy.shop(profile),
            "arena_unlocked": economy.arena_unlocked(profile),
            "ranked_left": economy.ranked_left(profile, today())}


def bad(msg, code=400):
    raise HTTPException(status_code=code, detail=msg)


def create_app(db_path=None):
    data.load_from_dir(str(WEB))
    db = DB(db_path or os.environ.get("ROBOFIGHT_DB", str(ROOT / "robofight.db")))
    app = FastAPI(title="RoboFight", version=VERSION)
    app.state.db = db
    origins = os.environ.get("ROBOFIGHT_CORS", "*").split(",")
    app.add_middleware(CORSMiddleware, allow_origins=origins, allow_methods=["*"], allow_headers=["*"])

    # ---------------------------------------------------------- auth
    def current_user(authorization: str = Header(default="")):
        token = authorization.removeprefix("Bearer ").strip()
        if not token:
            bad("Bitte anmelden.", 401)
        th = hashlib.sha256(token.encode()).hexdigest()
        s = db.one("SELECT * FROM sessions WHERE token_hash = ?", (th,))
        if not s or s["expires_at"] < time.time():
            bad("Sitzung abgelaufen – bitte neu anmelden.", 401)
        user = db.user(s["user_id"])
        if not user:
            bad("Konto nicht gefunden.", 401)
        return user

    def teacher(user=Depends(current_user)):
        if user["role"] != "teacher":
            bad("Nur für Lehrkräfte.", 403)
        return user

    def new_session(uid):
        token = secrets.token_urlsafe(32)
        db.x("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?,?,?)",
             (hashlib.sha256(token.encode()).hexdigest(), uid, time.time() + TOKEN_DAYS * 86400))
        return token

    def load(user):
        return economy.normalize(db.profile(user))

    def me_payload(user, profile):
        cls = db.one("SELECT id, name, code FROM classes WHERE id = ?", (user["class_id"],)) if user["class_id"] else None
        return {"profile": profile, "info": info(profile), "role": user["role"],
                "class": dict(cls) if cls else None}

    @app.get("/api/health")
    def health():
        return {"ok": True, "server": "robofight", "version": VERSION}

    @app.post("/api/auth/register")
    def register(body: RegisterIn):
        name = body.username.strip()
        if not USERNAME_RE.match(name):
            bad("Benutzername: 3–20 Zeichen, nur Buchstaben, Zahlen, _ und -.")
        if len(body.password) < 4:
            bad("Das Passwort braucht mindestens 4 Zeichen.")
        if body.role not in ("student", "teacher"):
            bad("Ungültige Rolle.")
        if body.role == "teacher":
            key = os.environ.get("ROBOFIGHT_TEACHER_KEY")
            if key and not hmac.compare_digest(key, body.teacher_key or ""):
                bad("Falscher Lehrer-Schlüssel.", 403)
        if db.user_by_name(name):
            bad("Diesen Namen gibt es schon.", 409)
        salt = secrets.token_bytes(16)
        profile = economy.new_profile(name, (body.display_name or name).strip()[:30], body.role)
        uid = db.create_user(name, body.role, salt, hash_pw(body.password, salt), profile)
        if body.class_code:
            cls = db.one("SELECT * FROM classes WHERE code = ?", (body.class_code.strip().upper(),))
            if cls:
                db.x("UPDATE users SET class_id = ? WHERE id = ?", (cls["id"], uid))
        user = db.user(uid)
        return {"token": new_session(uid), **me_payload(user, profile)}

    @app.post("/api/auth/login")
    def login(body: LoginIn):
        user = db.user_by_name(body.username.strip())
        if not user or not hmac.compare_digest(hash_pw(body.password, user["pw_salt"]), user["pw_hash"]):
            bad("Name oder Passwort stimmt nicht.", 401)
        return {"token": new_session(user["id"]), **me_payload(user, load(user))}

    @app.post("/api/auth/logout")
    def logout(authorization: str = Header(default="")):
        token = authorization.removeprefix("Bearer ").strip()
        db.x("DELETE FROM sessions WHERE token_hash = ?", (hashlib.sha256(token.encode()).hexdigest(),))
        return {"ok": True}

    @app.get("/api/me")
    def me(user=Depends(current_user)):
        return me_payload(user, load(user))

    @app.put("/api/settings")
    def settings(body: SettingsIn, user=Depends(current_user)):
        p = load(user)
        if body.sound is not None:
            p["settings"]["sound"] = body.sound
        if body.display_name:
            p["display_name"] = body.display_name.strip()[:30]
        db.save_profile(user["id"], p)
        return me_payload(user, p)

    # ---------------------------------------------------------- campaign
    @app.post("/api/missions/{mid}/submit")
    def submit(mid: int, body: CodeIn, user=Depends(current_user)):
        try:
            mission = data.mission(mid)
        except KeyError:
            bad("Unbekannte Mission.", 404)
        p = load(user)
        if not economy.mission_unlocked(p, mid):
            bad("Diese Mission ist noch gesperrt.", 403)
        try:
            result = run_isolated("mission", {"mission": mission, "code": body.code})
        except TimeoutError as exc:
            bad(str(exc), 408)
        change = economy.apply_mission(p, mission, result, body.code)
        db.save_profile(user["id"], p)
        return {"result": result, "change": change, **me_payload(user, p)}

    @app.put("/api/missions/{mid}/code")
    def save_code(mid: int, body: CodeIn, user=Depends(current_user)):
        p = load(user)
        economy.save_code(p, mid, body.code)
        db.save_profile(user["id"], p)
        return {"ok": True}

    # ---------------------------------------------------------- shop & garage
    @app.post("/api/shop/buy")
    def buy(body: ItemIn, user=Depends(current_user)):
        p = load(user)
        try:
            change = economy.buy(p, body.item)
        except economy.EconomyError as exc:
            bad(str(exc))
        db.save_profile(user["id"], p)
        return {"change": change, **me_payload(user, p)}

    @app.put("/api/loadout")
    def loadout(body: LoadoutIn, user=Depends(current_user)):
        p = load(user)
        try:
            economy.set_loadout(p, body.loadout)
        except economy.EconomyError as exc:
            bad(str(exc))
        db.save_profile(user["id"], p)
        return me_payload(user, p)

    # ---------------------------------------------------------- arena
    @app.put("/api/arena/code")
    def arena_code(body: CodeIn, user=Depends(current_user)):
        p = load(user)
        economy.save_arena_code(p, body.code)
        db.save_profile(user["id"], p)
        return {"ok": True}

    @app.post("/api/arena/publish")
    def publish(body: CodeIn, user=Depends(current_user)):
        p = load(user)
        economy.save_arena_code(p, body.code)
        try:
            economy.publish_bot(p, datetime.datetime.now().isoformat(timespec="seconds"))
        except economy.EconomyError as exc:
            bad(str(exc), 403)
        db.save_profile(user["id"], p)
        return me_payload(user, p)

    def run_match(specs, arena_id):
        seed = secrets.randbelow(10 ** 6)
        try:
            return run_isolated("match", {"bots": specs, "arena": arena_id, "seed": seed}, timeout=60)
        except TimeoutError as exc:
            bad(str(exc), 408)

    def store_match(kind, uid, opp_user, opp_ai, summary, result):
        return db.x("INSERT INTO matches (created_at, kind, user_id, opponent_user, opponent_ai, summary, replay) "
                    "VALUES (?,?,?,?,?,?,?)", (time.time(), kind, uid, opp_user, opp_ai, json.dumps(summary),
                                               json.dumps(result)))

    def summary_for(kind, me_name, opp_name, result, arena_id):
        return {"kind": kind, "opponent": opp_name, "me": me_name, "outcome": economy.outcome_for(result),
                "ticks": result["ticks"], "arena": arena_id, "reason": result["reason"],
                "at": datetime.datetime.now().isoformat(timespec="minutes")}

    @app.post("/api/arena/training")
    def training(body: OpponentIn, user=Depends(current_user)):
        p = load(user)
        if not economy.arena_unlocked(p):
            bad("Die Arena ist erst nach Mission 16 offen.", 403)
        try:
            opp = data.ai_bot(body.opponent)
        except KeyError:
            bad("Unbekannter Gegner.", 404)
        arena_id = body.arena or "werkhalle"
        if body.code is not None:
            economy.save_arena_code(p, body.code)
        result = run_match([{"name": p["display_name"], "code": p["arena"]["code"], "loadout": p["loadout"]},
                            {"name": opp["name"], "code": opp["code"], "loadout": opp["loadout"]}], arena_id)
        outcome = economy.outcome_for(result)
        summ = summary_for("training", p["display_name"], opp["name"], result, arena_id)
        mid = store_match("training", user["id"], None, opp["id"], summ, result)
        summ["match_id"] = mid
        change = economy.apply_match(p, "training", {"id": opp["id"], "name": opp["name"]}, outcome, today(), summ)
        db.save_profile(user["id"], p)
        return {"result": result, "change": change, "match_id": mid, **me_payload(user, p)}

    @app.post("/api/arena/ranked")
    def ranked(body: RankedIn, user=Depends(current_user)):
        p = load(user)
        if not economy.arena_unlocked(p):
            bad("Die Arena ist erst nach Mission 16 offen.", 403)
        if not p["arena"]["published"]:
            bad("Reiche zuerst deinen Roboter für die Rangliste ein.")
        if economy.ranked_left(p, today()) <= 0:
            bad("Für heute sind alle Ranglisten-Kämpfe aufgebraucht. Morgen geht's weiter!", 429)
        my_elo = p["arena"]["elo"]
        # opponent: published bots of other players with the closest Elo (random among the 5 closest)
        candidates = []
        for row in db.q("SELECT * FROM users WHERE id != ?", (user["id"],)):
            op = economy.normalize(db.profile(row))
            if op["arena"]["published"]:
                candidates.append((abs(op["arena"]["elo"] - my_elo), row, op))
        candidates.sort(key=lambda c: c[0])
        opp_row = opp_prof = None
        if candidates:
            _, opp_row, opp_prof = secrets.choice(candidates[:5])
            opp = {"id": opp_row["username"], "name": opp_prof["display_name"], "elo": opp_prof["arena"]["elo"],
                   "code": opp_prof["arena"]["published"]["code"], "loadout": opp_prof["arena"]["published"]["loadout"]}
        else:
            ai = min(data.ai_bots(), key=lambda b: abs(b["elo"] - my_elo))
            opp = {"id": "ai:" + ai["id"], "name": ai["name"] + " (KI)", "elo": ai["elo"], "code": ai["code"],
                   "loadout": ai["loadout"]}
        arena_id = body.arena or secrets.choice(["werkhalle", "saeulen", "kreuzung"])
        pub = p["arena"]["published"]
        result = run_match([{"name": p["display_name"], "code": pub["code"], "loadout": pub["loadout"]},
                            {"name": opp["name"], "code": opp["code"], "loadout": opp["loadout"]}], arena_id)
        outcome = economy.outcome_for(result)
        summ = summary_for("ranked", p["display_name"], opp["name"], result, arena_id)
        mid = store_match("ranked", user["id"], opp_row["id"] if opp_row else None,
                          None if opp_row else opp["id"], summ, result)
        summ["match_id"] = mid
        change = economy.apply_match(p, "ranked", opp, outcome, today(), summ)
        if opp_prof is not None:  # the defender's Elo changes too (no daily limit for defending)
            oa = opp_prof["arena"]
            _, oa["elo"] = economy.elo_update(change["elo_before"], oa["elo"], {"win": 1, "draw": 0.5, "loss": 0}[outcome])
            oa[{"win": "losses", "draw": "draws", "loss": "wins"}[outcome]] += 1
            oa["history"].insert(0, {**summ, "me": opp_prof["display_name"], "opponent": p["display_name"],
                                     "outcome": {"win": "loss", "loss": "win", "draw": "draw"}[outcome],
                                     "defended": True})
            del oa["history"][economy.HISTORY_LIMIT:]
            economy.check_badges(opp_prof)
            db.save_profile(opp_row["id"], opp_prof)
        db.save_profile(user["id"], p)
        return {"result": result, "change": change, "match_id": mid, "opponent": {k: opp[k] for k in ("id", "name", "elo")},
                **me_payload(user, p)}

    @app.get("/api/arena/leaderboard")
    def leaderboard(class_code: str | None = None):
        rows = db.q("SELECT u.*, c.code AS ccode FROM users u LEFT JOIN classes c ON c.id = u.class_id")
        out = []
        for row in rows:
            if class_code and (row["ccode"] or "") != class_code.upper():
                continue
            pr = economy.normalize(db.profile(row))
            if not pr["arena"]["published"]:
                continue
            out.append(economy.public_summary(pr))
        out.sort(key=lambda s: s["elo"], reverse=True)
        return {"players": out[:100]}

    @app.get("/api/arena/matches/{match_id}")
    def match(match_id: int, user=Depends(current_user)):
        row = db.one("SELECT * FROM matches WHERE id = ?", (match_id,))
        if not row:
            bad("Kampf nicht gefunden.", 404)
        return {"summary": json.loads(row["summary"]), "result": json.loads(row["replay"])}

    # ---------------------------------------------------------- classes
    @app.post("/api/classes")
    def create_class(body: ClassIn, user=Depends(teacher)):
        code = None
        while code is None or db.one("SELECT 1 FROM classes WHERE code = ?", (code,)):
            code = "".join(secrets.choice("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for _ in range(6))
        cid = db.x("INSERT INTO classes (name, code, teacher_id, created_at) VALUES (?,?,?,?)",
                   (body.name.strip()[:40] or "Meine Klasse", code, user["id"], time.time()))
        return {"id": cid, "name": body.name, "code": code}

    @app.get("/api/classes")
    def my_classes(user=Depends(teacher)):
        rows = db.q("SELECT c.*, (SELECT COUNT(*) FROM users u WHERE u.class_id = c.id) AS students "
                    "FROM classes c WHERE teacher_id = ? ORDER BY created_at", (user["id"],))
        return {"classes": [dict(r) for r in rows]}

    def own_class(cid, user):
        cls = db.one("SELECT * FROM classes WHERE id = ? AND teacher_id = ?", (cid, user["id"]))
        if not cls:
            bad("Klasse nicht gefunden.", 404)
        return cls

    @app.get("/api/classes/{cid}")
    def class_detail(cid: int, user=Depends(teacher)):
        cls = own_class(cid, user)
        students = []
        for row in db.q("SELECT * FROM users WHERE class_id = ? ORDER BY username", (cid,)):
            pr = economy.normalize(db.profile(row))
            s = economy.public_summary(pr)
            s["missions"] = {k: v.get("stars", 0) for k, v in pr["missions"].items() if v.get("solved")}
            s["runs"] = pr["stats"]["runs"]
            s["errors"] = pr["stats"]["errors"]
            s["last_seen"] = row["last_seen"]
            students.append(s)
        return {"class": dict(cls), "students": students,
                "missions": [{"id": m["id"], "title": m["title"], "concept": m["concept"]} for m in data.missions()]}

    @app.get("/api/classes/{cid}/students/{username}/code/{mid}")
    def student_code(cid: int, username: str, mid: int, user=Depends(teacher)):
        own_class(cid, user)
        row = db.one("SELECT * FROM users WHERE username = ? AND class_id = ?", (username, cid))
        if not row:
            bad("Schüler nicht gefunden.", 404)
        pr = economy.normalize(db.profile(row))
        return {"code": pr["codes"].get(str(mid), ""), "mission": pr["missions"].get(str(mid))}

    @app.put("/api/classes/{cid}/settings")
    def class_settings(cid: int, body: ClassSettingsIn, user=Depends(teacher)):
        own_class(cid, user)
        limit = max(0, min(100, body.daily_ranked_limit))
        for row in db.q("SELECT * FROM users WHERE class_id = ?", (cid,)):
            pr = economy.normalize(db.profile(row))
            pr["settings"]["daily_ranked_limit"] = limit
            db.save_profile(row["id"], pr)
        return {"ok": True, "daily_ranked_limit": limit}

    @app.post("/api/classes/join")
    def join(body: JoinIn, user=Depends(current_user)):
        cls = db.one("SELECT * FROM classes WHERE code = ?", (body.code.strip().upper(),))
        if not cls:
            bad("Diesen Klassen-Code gibt es nicht.", 404)
        db.x("UPDATE users SET class_id = ? WHERE id = ?", (cls["id"], user["id"]))
        return me_payload(db.user(user["id"]), load(user))

    # ---------------------------------------------------------- static game
    if WEB.exists() and not os.environ.get("ROBOFIGHT_NO_STATIC"):
        app.mount("/", StaticFiles(directory=str(WEB), html=True), name="web")
    return app
