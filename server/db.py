"""Tiny SQLite data layer (stdlib only)."""

import json
import sqlite3
import threading
import time

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    role TEXT NOT NULL DEFAULT 'student',
    pw_salt BLOB NOT NULL,
    pw_hash BLOB NOT NULL,
    profile TEXT NOT NULL,
    class_id INTEGER,
    created_at REAL NOT NULL,
    last_seen REAL
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS classes (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    teacher_id INTEGER NOT NULL,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY,
    created_at REAL NOT NULL,
    kind TEXT NOT NULL,
    user_id INTEGER NOT NULL,
    opponent_user INTEGER,
    opponent_ai TEXT,
    summary TEXT NOT NULL,
    replay TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_matches_user ON matches(user_id);
CREATE INDEX IF NOT EXISTS idx_matches_opp ON matches(opponent_user);
"""


class DB:
    def __init__(self, path):
        self.path = path
        self.lock = threading.RLock()
        self.conn = sqlite3.connect(path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.conn.executescript(SCHEMA)
        self.conn.commit()

    def q(self, sql, args=()):
        with self.lock:
            return self.conn.execute(sql, args).fetchall()

    def one(self, sql, args=()):
        rows = self.q(sql, args)
        return rows[0] if rows else None

    def x(self, sql, args=()):
        with self.lock:
            cur = self.conn.execute(sql, args)
            self.conn.commit()
            return cur.lastrowid

    # -------- users
    def user_by_name(self, username):
        return self.one("SELECT * FROM users WHERE username = ?", (username,))

    def user(self, uid):
        return self.one("SELECT * FROM users WHERE id = ?", (uid,))

    def create_user(self, username, role, salt, pw_hash, profile):
        return self.x("INSERT INTO users (username, role, pw_salt, pw_hash, profile, created_at) VALUES (?,?,?,?,?,?)",
                      (username, role, salt, pw_hash, json.dumps(profile), time.time()))

    def save_profile(self, uid, profile):
        self.x("UPDATE users SET profile = ?, last_seen = ? WHERE id = ?", (json.dumps(profile), time.time(), uid))

    @staticmethod
    def profile(row):
        return json.loads(row["profile"])
