// Accounts & persistence. Two interchangeable backends:
//  - LocalBackend: accounts + progress in this browser (works on GitHub Pages, no server).
//  - RemoteBackend: talks to the RoboFight Python server (accounts across devices, global ranking, classes).
// Game rules are the same Python code in both cases (worker vs. server).

const SESSION_KEY = "robofight.session.v1";
const USERS_KEY = "robofight.local.users.v1";
const PROFILE_KEY = (u) => "robofight.local.profile." + u.toLowerCase();
const LEGACY_KEY = "robofight.progress.v1";
const USERNAME_RE = /^[A-Za-z0-9_\-äöüÄÖÜß]{3,20}$/;

const store = {
  get(k) {
    try {
      const v = localStorage.getItem(k);
      return v ? JSON.parse(v) : null;
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      return true;
    } catch {
      return false;
    }
  },
  del(k) {
    try {
      localStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  },
};

export const today = () => new Date().toISOString().slice(0, 10);
const nowIso = () => new Date().toISOString().slice(0, 16).replace("T", " ");

export function loadSession() {
  return store.get(SESSION_KEY);
}

export function friendly(err) {
  return err?.friendly || err?.server ? err.message : "Etwas ist schiefgelaufen: " + (err?.message || err);
}

function fail(msg) {
  throw Object.assign(new Error(msg), { friendly: true });
}

const slimResult = (r) => ({
  ok: r.ok, stars: r.stars, lines: r.lines, ticks: r.ticks, error: r.error,
  variants: (r.variants || []).map((v) => ({ status: v.status })),
});

export function eloUpdate(ra, rb, scoreA, k = 32) {
  const ea = 1 / (1 + 10 ** ((rb - ra) / 400));
  const d = Math.round(k * (scoreA - ea));
  return [ra + d, rb - d];
}

const LEAGUES = [[0, "Bronze"], [1100, "Silber"], [1250, "Gold"], [1400, "Platin"], [1550, "Diamant"], [1700, "Meister-Coder"]];
export function league(elo) {
  let n = LEAGUES[0][1];
  for (const [t, name] of LEAGUES) if (elo >= t) n = name;
  return n;
}

async function pbkdf2(password, saltB64) {
  const enc = new TextEncoder();
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  if (!crypto?.subtle) return btoa(password + saltB64); // very old browsers / insecure context
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

// ======================================================================= local
export class LocalBackend {
  constructor(engine, data) {
    this.mode = "local";
    this.engine = engine;
    this.data = data;
    this.profile = null;
    this.extra = { role: "student", class: null };
  }

  users() {
    return store.get(USERS_KEY) || {};
  }

  async restore(session) {
    const p = store.get(PROFILE_KEY(session.username));
    if (!p) return null;
    return this._load(p);
  }

  async _load(profile) {
    const out = await this.engine.economy("info", profile, { today: today() });
    this.profile = out.profile;
    this.info = out.result.info;
    this._save();
    return this._payload();
  }

  _payload() {
    return { profile: this.profile, info: this.info, role: this.profile.role || "student", class: null };
  }

  _save() {
    if (!store.set(PROFILE_KEY(this.profile.username), this.profile)) {
      console.warn("Speichern im Browser nicht möglich (privater Modus?)");
    }
  }

  async _apply(op, args = {}) {
    const out = await this.engine.economy(op, this.profile, { today: today(), ...args });
    this.profile = out.profile;
    this.info = out.result.info;
    this._save();
    return out.result;
  }

  async register({ username, password, display_name }) {
    username = (username || "").trim();
    if (!USERNAME_RE.test(username)) fail("Benutzername: 3–20 Zeichen, nur Buchstaben, Zahlen, _ und -.");
    if ((password || "").length < 4) fail("Das Passwort braucht mindestens 4 Zeichen.");
    const users = this.users();
    if (Object.keys(users).some((u) => u.toLowerCase() === username.toLowerCase())) fail("Diesen Namen gibt es auf diesem Gerät schon.");
    const salt = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16))));
    users[username] = { salt, hash: await pbkdf2(password, salt), created: nowIso() };
    const out = await this.engine.economy("new_profile", null, { username, display_name: display_name || username });
    const profile = out.profile;
    // migrate progress from the Phase-0 prototype (only once)
    const legacy = store.get(LEGACY_KEY);
    if (legacy?.missions && !store.get("robofight.legacy.migrated")) {
      for (const [id, m] of Object.entries(legacy.missions)) {
        if (m.solved) profile.missions[id] = { solved: true, stars: m.stars || 1, best_lines: m.bestLines ?? 999, best_ticks: m.bestTicks ?? 999 };
        if (m.code) profile.codes[id] = m.code;
      }
      profile.bolts += Object.values(profile.missions).reduce((s, m) => s + 50 + 25 * m.stars, 0);
      store.set("robofight.legacy.migrated", true);
    }
    store.set(USERS_KEY, users);
    store.set(PROFILE_KEY(username), profile);
    store.set(SESSION_KEY, { mode: "local", username });
    return this._load(profile);
  }

  async login({ username, password }) {
    const users = this.users();
    const key = Object.keys(users).find((u) => u.toLowerCase() === (username || "").trim().toLowerCase());
    if (!key || (await pbkdf2(password || "", users[key].salt)) !== users[key].hash) fail("Name oder Passwort stimmt nicht.");
    store.set(SESSION_KEY, { mode: "local", username: key });
    return this._load(store.get(PROFILE_KEY(key)));
  }

  async logout() {
    store.del(SESSION_KEY);
    this.profile = null;
  }

  async deleteAccount(password) {
    const users = this.users();
    const u = this.profile.username;
    if ((await pbkdf2(password || "", users[u].salt)) !== users[u].hash) fail("Passwort stimmt nicht.");
    delete users[u];
    store.set(USERS_KEY, users);
    store.del(PROFILE_KEY(u));
    await this.logout();
  }

  async me() {
    return this._payload();
  }

  // ---- campaign
  async submitMission(mission, code, localResult) {
    const change = await this._apply("apply_mission", { mission_id: mission.id, result: slimResult(localResult), code });
    return { result: localResult, change, ...this._payload() };
  }

  saveCode(mid, code) {
    this.profile.codes[String(mid)] = code;
    this._save();
  }

  // ---- shop & garage
  async buy(item) {
    const change = await this._apply("buy", { item });
    return { change, ...this._payload() };
  }

  async setLoadout(loadout) {
    await this._apply("set_loadout", { loadout });
    return this._payload();
  }

  async settings({ sound, display_name }) {
    if (sound !== undefined) this.profile.settings.sound = sound;
    if (display_name) this.profile.display_name = display_name.trim().slice(0, 30);
    this._save();
    return this._payload();
  }

  // ---- arena
  saveArenaCode(code) {
    this.profile.arena.code = code;
    this._save();
  }

  async publish(code) {
    this.saveArenaCode(code);
    await this._apply("publish_bot", { now: nowIso() });
    return this._payload();
  }

  _spec(p, published = false) {
    const src = published ? p.arena.published : { code: p.arena.code, loadout: p.loadout };
    return { name: p.display_name, code: src.code, loadout: src.loadout };
  }

  async training(opponentId, arenaId, code) {
    this.saveArenaCode(code);
    const ai = this.engine.aiBots.find((b) => b.id === opponentId);
    const seed = Math.floor(Math.random() * 1e6);
    const bots = [this._spec(this.profile), { name: ai.name, code: ai.code, loadout: ai.loadout }];
    const result = await this.engine.match({ bots, arena: arenaId, seed });
    const outcome = result.winner === null ? "draw" : result.winner === 0 ? "win" : "loss";
    const summary = { kind: "training", opponent: ai.name, me: this.profile.display_name, outcome, ticks: result.ticks,
      arena: arenaId, reason: result.reason, at: nowIso(), replay: { bots, arena: arenaId, seed } };
    const change = await this._apply("apply_match", { kind: "training", opponent: { id: ai.id, name: ai.name }, outcome, summary });
    return { result, change, ...this._payload() };
  }

  _pool() {
    const pool = [];
    for (const u of Object.keys(this.users())) {
      if (u === this.profile.username) continue;
      const p = store.get(PROFILE_KEY(u));
      if (p?.arena?.published) pool.push({ id: u, name: p.display_name, elo: p.arena.elo, ...this._spec(p, true), local: true });
    }
    for (const ai of this.engine.aiBots) {
      pool.push({ id: "ai:" + ai.id, name: ai.name + " (KI)", elo: ai.elo, code: ai.code, loadout: ai.loadout });
    }
    return pool;
  }

  async ranked(arenaId) {
    if (!this.profile.arena.published) fail("Reiche zuerst deinen Roboter für die Rangliste ein.");
    if (this.info.ranked_left <= 0) fail("Für heute sind alle Ranglisten-Kämpfe aufgebraucht. Morgen geht's weiter!");
    const myElo = this.profile.arena.elo;
    const pool = this._pool().sort((a, b) => Math.abs(a.elo - myElo) - Math.abs(b.elo - myElo));
    const humans = pool.filter((p) => p.local);
    const choices = (humans.length ? humans : pool).slice(0, 4);
    const opp = choices[Math.floor(Math.random() * choices.length)];
    arenaId = arenaId || ["werkhalle", "saeulen", "kreuzung"][Math.floor(Math.random() * 3)];
    const seed = Math.floor(Math.random() * 1e6);
    const bots = [this._spec(this.profile, true), { name: opp.name, code: opp.code, loadout: opp.loadout }];
    const result = await this.engine.match({ bots, arena: arenaId, seed });
    const outcome = result.winner === null ? "draw" : result.winner === 0 ? "win" : "loss";
    const summary = { kind: "ranked", opponent: opp.name, me: this.profile.display_name, outcome, ticks: result.ticks,
      arena: arenaId, reason: result.reason, at: nowIso(), replay: { bots, arena: arenaId, seed } };
    const eloBefore = myElo;
    const change = await this._apply("apply_match", { kind: "ranked", opponent: { id: opp.id, name: opp.name, elo: opp.elo }, outcome, summary });
    if (opp.local) {
      const op = store.get(PROFILE_KEY(opp.id));
      const score = { win: 1, draw: 0.5, loss: 0 }[outcome];
      op.arena.elo = eloUpdate(eloBefore, op.arena.elo, score)[1];
      op.arena[{ win: "losses", draw: "draws", loss: "wins" }[outcome]] += 1;
      op.arena.history.unshift({ ...summary, me: op.display_name, opponent: this.profile.display_name,
        outcome: { win: "loss", loss: "win", draw: "draw" }[outcome], defended: true });
      op.arena.history = op.arena.history.slice(0, 30);
      store.set(PROFILE_KEY(opp.id), op);
    }
    return { result, change, opponent: opp, ...this._payload() };
  }

  async leaderboard() {
    const rows = [];
    for (const u of Object.keys(this.users())) {
      const p = store.get(PROFILE_KEY(u));
      if (!p?.arena?.published) continue;
      rows.push({ username: u, display_name: p.display_name, elo: p.arena.elo, league: league(p.arena.elo),
        wins: p.arena.wins, losses: p.arena.losses, draws: p.arena.draws, loadout: p.loadout });
    }
    for (const ai of this.engine.aiBots) {
      rows.push({ username: "ai:" + ai.id, display_name: ai.name + " (KI)", elo: ai.elo, league: league(ai.elo), ai: true,
        wins: 0, losses: 0, draws: 0, loadout: ai.loadout });
    }
    rows.sort((a, b) => b.elo - a.elo);
    return { players: rows };
  }

  async replay(summary) {
    if (!summary.replay) fail("Für diesen Kampf gibt es keine Wiederholung.");
    return this.engine.match({ bots: summary.replay.bots, arena: summary.replay.arena, seed: summary.replay.seed });
  }

  // ---- classes (server only)
  async joinClass() {
    fail("Klassen gibt es nur mit dem Online-Server.");
  }
}

// ======================================================================= remote
export class RemoteBackend {
  constructor(server, engine, data) {
    this.mode = "remote";
    this.server = server.replace(/\/$/, "");
    this.engine = engine;
    this.data = data;
    this.token = null;
  }

  static async probe(server) {
    try {
      const r = await fetch(server.replace(/\/$/, "") + "/api/health", { cache: "no-store" });
      const j = await r.json();
      return j.server === "robofight";
    } catch {
      return false;
    }
  }

  async _req(method, path, body) {
    let r;
    try {
      r = await fetch(this.server + path, {
        method,
        headers: { "Content-Type": "application/json", ...(this.token ? { Authorization: "Bearer " + this.token } : {}) },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch {
      fail("Der Server ist nicht erreichbar. Bist du online?");
    }
    let j = null;
    try {
      j = await r.json();
    } catch {
      /* empty */
    }
    if (!r.ok) {
      const msg = typeof j?.detail === "string" ? j.detail : "Serverfehler (" + r.status + ")";
      throw Object.assign(new Error(msg), { friendly: true, status: r.status });
    }
    return j;
  }

  _take(j) {
    if (j?.profile) {
      this.profile = j.profile;
      this.info = j.info;
      this.extra = { role: j.role, class: j.class };
    }
    return j;
  }

  _payload() {
    return { profile: this.profile, info: this.info, role: this.extra?.role, class: this.extra?.class };
  }

  async restore(session) {
    this.token = session.token;
    try {
      return this._take(await this._req("GET", "/api/me"));
    } catch (e) {
      if (e.status === 401) return null;
      throw e;
    }
  }

  async register(body) {
    const j = this._take(await this._req("POST", "/api/auth/register", body));
    this.token = j.token;
    store.set(SESSION_KEY, { mode: "remote", server: this.server, token: j.token, username: j.profile.username });
    return j;
  }

  async login(body) {
    const j = this._take(await this._req("POST", "/api/auth/login", body));
    this.token = j.token;
    store.set(SESSION_KEY, { mode: "remote", server: this.server, token: j.token, username: j.profile.username });
    return j;
  }

  async logout() {
    try {
      await this._req("POST", "/api/auth/logout");
    } catch {
      /* ignore */
    }
    store.del(SESSION_KEY);
    this.token = null;
  }

  async me() {
    return this._take(await this._req("GET", "/api/me"));
  }

  async submitMission(mission, code, localResult) {
    const j = this._take(await this._req("POST", `/api/missions/${mission.id}/submit`, { code }));
    return { ...j, result: localResult || j.result };
  }

  saveCode(mid, code) {
    this.profile.codes[String(mid)] = code;
    clearTimeout(this._codeTimer);
    this._codeTimer = setTimeout(() => this._req("PUT", `/api/missions/${mid}/code`, { code }).catch(() => {}), 1500);
  }

  async buy(item) {
    return this._take(await this._req("POST", "/api/shop/buy", { item }));
  }

  async setLoadout(loadout) {
    return this._take(await this._req("PUT", "/api/loadout", { loadout }));
  }

  async settings(body) {
    return this._take(await this._req("PUT", "/api/settings", body));
  }

  saveArenaCode(code) {
    this.profile.arena.code = code;
    clearTimeout(this._arenaTimer);
    this._arenaTimer = setTimeout(() => this._req("PUT", "/api/arena/code", { code }).catch(() => {}), 1500);
  }

  async publish(code) {
    return this._take(await this._req("POST", "/api/arena/publish", { code }));
  }

  async training(opponentId, arenaId, code) {
    return this._take(await this._req("POST", "/api/arena/training", { opponent: opponentId, arena: arenaId, code }));
  }

  async ranked(arenaId) {
    return this._take(await this._req("POST", "/api/arena/ranked", { arena: arenaId || null }));
  }

  async leaderboard(classCode) {
    return this._req("GET", "/api/arena/leaderboard" + (classCode ? "?class_code=" + encodeURIComponent(classCode) : ""));
  }

  async replay(summary) {
    if (!summary.match_id) fail("Für diesen Kampf gibt es keine Wiederholung.");
    return (await this._req("GET", "/api/arena/matches/" + summary.match_id)).result;
  }

  async joinClass(code) {
    return this._take(await this._req("POST", "/api/classes/join", { code }));
  }

  // teacher
  createClass(name) {
    return this._req("POST", "/api/classes", { name });
  }
  classes() {
    return this._req("GET", "/api/classes");
  }
  classDetail(id) {
    return this._req("GET", "/api/classes/" + id);
  }
  studentCode(cid, username, mid) {
    return this._req("GET", `/api/classes/${cid}/students/${encodeURIComponent(username)}/code/${mid}`);
  }
  classSettings(cid, limit) {
    return this._req("PUT", `/api/classes/${cid}/settings`, { daily_ranked_limit: limit });
  }
}
