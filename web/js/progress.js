// Player progress, stored locally in the browser (Phase 0 has no login yet).
// The shape is designed to be sent to a server 1:1 later.
const KEY = "robofight.progress.v1";

const LEVELS = [
  "Schrauber-Azubi", "Bit-Bastler", "Code-Kadett", "Schleifen-Profi", "Sensor-Spezialist",
  "Bot-Ingenieur", "Logik-Lord", "Robo-Meister", "Code-Champion",
];
const XP_PER_LEVEL = 250;

export const BADGES = [
  { id: "first", name: "Erste Fahrt", desc: "Mission 1 geschafft", icon: "flag" },
  { id: "loop", name: "Schleifen-Starter", desc: "Die Treppe mit 3 Sternen", icon: "loop" },
  { id: "bug", name: "Bug-Jäger", desc: "10 Fehler gefunden und trotzdem weitergemacht", icon: "bug" },
  { id: "mini", name: "Minimalist", desc: "Weniger Zeilen als für 3 Sterne nötig", icon: "mini" },
  { id: "runs", name: "Dranbleiber", desc: "50 Programme gestartet", icon: "bolt" },
  { id: "boss", name: "Wächter-Bezwinger", desc: "Den Boss besiegt", icon: "trophy" },
  { id: "perfect", name: "Perfektionist", desc: "Alle Missionen mit 3 Sternen", icon: "star" },
];

function empty() {
  return { version: 1, missions: {}, stats: { runs: 0, errors: 0 }, badges: [] };
}

export class Progress {
  constructor(missions) {
    this.missions = missions;
    this.state = empty();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.state = { ...empty(), ...JSON.parse(raw) };
    } catch {
      /* private mode etc. – play without saving */
    }
  }

  save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.state));
    } catch {
      /* ignore */
    }
  }

  reset() {
    this.state = empty();
    this.save();
  }

  m(id) {
    return this.state.missions[id] || { stars: 0, solved: false };
  }

  isUnlocked(id) {
    const idx = this.missions.findIndex((m) => m.id === id);
    return idx <= 0 || this.m(this.missions[idx - 1].id).solved;
  }

  code(id) {
    return this.state.missions[id]?.code;
  }

  saveCode(id, code) {
    this.state.missions[id] = { ...this.m(id), code };
    this.save();
  }

  get xp() {
    return Object.values(this.state.missions)
      .filter((m) => m.solved)
      .reduce((sum, m) => sum + 50 + m.stars * 50, 0);
  }

  get level() {
    const lvl = Math.min(LEVELS.length, 1 + Math.floor(this.xp / XP_PER_LEVEL));
    const base = (lvl - 1) * XP_PER_LEVEL;
    return {
      level: lvl,
      title: LEVELS[lvl - 1],
      progress: lvl === LEVELS.length ? 1 : (this.xp - base) / XP_PER_LEVEL,
    };
  }

  get totalStars() {
    return Object.values(this.state.missions).reduce((s, m) => s + (m.stars || 0), 0);
  }

  /** Unlocked modules = rewards of solved missions. */
  modules() {
    return this.missions.filter((m) => this.m(m.id).solved).map((m) => m.reward);
  }

  /** Allowed API for a mission is defined by the mission itself. */
  recordRun(result) {
    this.state.stats.runs++;
    const failed = result.error || result.variants.some((v) => v.status === "error");
    if (failed) this.state.stats.errors++;
    this.save();
  }

  /** Returns what changed (for the reward screen). */
  recordResult(mission, result) {
    const before = this.m(mission.id);
    const xpBefore = this.xp;
    const levelBefore = this.level.level;
    const badgesBefore = new Set(this.state.badges);
    const now = {
      ...before,
      solved: true,
      stars: Math.max(before.stars || 0, result.stars),
      bestLines: Math.min(before.bestLines ?? Infinity, result.lines),
      bestTicks: Math.min(before.bestTicks ?? Infinity, result.ticks),
    };
    this.state.missions[mission.id] = now;
    if (result.lines < (mission.stars?.lines ?? 0)) this._badge("mini");
    this._checkBadges();
    this.save();
    return {
      firstSolve: !before.solved,
      newStars: now.stars - (before.stars || 0),
      xpGained: this.xp - xpBefore,
      levelUp: this.level.level > levelBefore ? this.level : null,
      newBadges: BADGES.filter((b) => this.state.badges.includes(b.id) && !badgesBefore.has(b.id)),
    };
  }

  _badge(id) {
    if (!this.state.badges.includes(id)) this.state.badges.push(id);
  }

  _checkBadges() {
    const M = (id) => this.m(id);
    if (M(1).solved) this._badge("first");
    if (M(6).stars === 3) this._badge("loop");
    if (M(10).solved) this._badge("boss");
    if (this.state.stats.errors >= 10) this._badge("bug");
    if (this.state.stats.runs >= 50) this._badge("runs");
    if (this.missions.every((m) => M(m.id).stars === 3)) this._badge("perfect");
  }
}
