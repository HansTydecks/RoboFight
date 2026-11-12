// RoboFight app shell: data loading, session, router, top bar.
import { Engine } from "./engine-client.js";
import { LocalBackend, RemoteBackend, loadSession } from "./api.js";
import { $, $$, esc, icon, closeModal, toast } from "./ui.js";
import { setSoundEnabled, sfx } from "./sound.js";
import { setReplayParts } from "./replay-view.js";

import * as loginScreen from "./screens/login.js";
import * as mapScreen from "./screens/map.js";
import * as missionScreen from "./screens/mission.js";
import * as garageScreen from "./screens/garage.js";
import * as shopScreen from "./screens/shop.js";
import * as arenaScreen from "./screens/arena.js";
import * as profileScreen from "./screens/profile.js";
import * as teacherScreen from "./screens/teacher.js";
import * as helpScreen from "./screens/help.js";

const app = $("#app");

export const ctx = {
  data: null,
  engine: null,
  api: null,
  state: { profile: null, info: null, role: "student", cls: null },
  /** Update global player state after any backend call that returns {profile, info}. */
  update(payload) {
    if (!payload?.profile) return;
    const before = ctx.state.profile;
    ctx.state.profile = payload.profile;
    ctx.state.info = payload.info || ctx.state.info;
    if (payload.role) ctx.state.role = payload.role;
    if ("class" in payload) ctx.state.cls = payload.class;
    setSoundEnabled(payload.profile.settings?.sound !== false);
    if (before && payload.profile.bolts > before.bolts) sfx("coin");
    renderTopbar();
  },
  async login(api, payload) {
    ctx.api = api;
    ctx.update(payload);
    if (location.hash.startsWith("#/login") || !location.hash) location.hash = "#/";
    else route();
  },
  async logout() {
    await ctx.api?.logout();
    ctx.api = null;
    ctx.state = { profile: null, info: null, role: "student", cls: null };
    renderTopbar();
    location.hash = "#/login";
  },
  mission(id) {
    return ctx.data.missions.find((m) => m.id === +id);
  },
  missionState(id) {
    return ctx.state.profile?.missions[String(id)] || { stars: 0, solved: false };
  },
  isUnlocked(id) {
    const ms = ctx.data.missions;
    const i = ms.findIndex((m) => m.id === +id);
    return i <= 0 || ctx.missionState(ms[i - 1].id).solved;
  },
  part(id) {
    const p = ctx.data.parts;
    for (const cat of ["chassis", "weapons", "modules", "paints", "hats"]) {
      const f = p[cat].find((x) => x.id === id);
      if (f) return { ...f, category: cat };
    }
    return null;
  },
  newLocalBackend() {
    return new LocalBackend(ctx.engine, ctx.data);
  },
  newRemoteBackend(server) {
    return new RemoteBackend(server, ctx.engine, ctx.data);
  },
};

let cleanup = null;

async function boot() {
  const names = ["missions", "parts", "arenas", "badges", "ai_bots"];
  const loaded = await Promise.all(names.map((n) => fetch(n + ".json", { cache: "no-cache" }).then((r) => r.json())));
  ctx.data = Object.fromEntries(names.map((n, i) => [n === "ai_bots" ? "aiBots" : n, loaded[i]]));
  ctx.config = window.ROBOFIGHT_CONFIG || {};
  setReplayParts(ctx.data.parts);
  ctx.engine = new Engine({ onStatus: setEngineStatus });
  window.addEventListener("hashchange", route);
  $("#modal").addEventListener("click", (e) => e.target.id === "modal" && closeModal());
  document.addEventListener("keydown", (e) => e.key === "Escape" && closeModal());

  // restore session
  const session = loadSession();
  try {
    if (session?.mode === "remote") {
      const api = ctx.newRemoteBackend(session.server);
      const me = await api.restore(session);
      if (me) {
        ctx.api = api;
        ctx.update(me);
      }
    } else if (session?.mode === "local") {
      await ctx.engine.ready;
      const api = ctx.newLocalBackend();
      const me = await api.restore(session);
      if (me) {
        ctx.api = api;
        ctx.update(me);
      }
    }
  } catch (e) {
    console.warn("Sitzung konnte nicht wiederhergestellt werden", e);
    toast("Anmeldung abgelaufen – bitte neu anmelden.", "warn");
  }
  renderTopbar();
  route();
}

function setEngineStatus(status, message) {
  const el = $("#engine-status");
  if (!el) return;
  el.dataset.status = status;
  el.title = status === "ready" ? "Python ist bereit" : status === "loading" ? "Python wird geladen …" : "Fehler: " + message;
  $(".label", el).textContent = status === "ready" ? "Python bereit" : status === "loading" ? "Python lädt …" : "Python-Fehler";
}

export function renderTopbar() {
  const p = ctx.state.profile;
  const info = ctx.state.info;
  const nav = $(".nav");
  const stats = $(".player-stats");
  if (!p) {
    nav.innerHTML = "";
    stats.querySelector(".user-pills").innerHTML = "";
    return;
  }
  const arenaOpen = info?.arena_unlocked;
  nav.innerHTML = `
    <a href="#/">${icon("map")}<span>Missionen</span></a>
    <a href="#/werkstatt">${icon("wrench")}<span>Werkstatt</span></a>
    <a href="#/shop">${icon("cart")}<span>Shop</span></a>
    <a href="#/arena" class="${arenaOpen ? "" : "locked-link"}">${icon(arenaOpen ? "arena" : "lock")}<span>Arena</span></a>
    ${ctx.state.role === "teacher" ? `<a href="#/lehrer">${icon("school")}<span>Klassen</span></a>` : ""}`;
  const lvl = info?.level || { level: 1, title: "", progress: 0, xp: 0 };
  stats.querySelector(".user-pills").innerHTML = `
    <span class="pill bolts-pill" title="Schrauben – damit kaufst du Teile im Shop">${icon("nut")}<b>${p.bolts}</b></span>
    <span class="pill stars-pill" title="Gesammelte Sterne"><span class="star on">${icon("star")}</span><b>${info?.stars ?? 0}</b></span>
    <span class="pill level-pill" title="${esc(lvl.title)} – ${lvl.xp} XP">
      <span class="lvl">Lv <b>${lvl.level}</b></span>
      <span class="lvl-info"><span class="lvl-title">${esc(lvl.title)}</span>
      <span class="xpbar"><span style="width:${Math.round(lvl.progress * 100)}%"></span></span></span>
    </span>
    <a class="pill user-pill" href="#/profil" title="Profil & Einstellungen">${icon("user")}<span>${esc(p.display_name)}</span>${ctx.api?.mode === "remote" ? '<i class="online-dot" title="Online"></i>' : ""}</a>`;
  highlightNav();
}

function highlightNav() {
  const hash = location.hash || "#/";
  $$(".nav a").forEach((a) => {
    const h = a.getAttribute("href");
    a.classList.toggle("active", h === "#/" ? hash === "#/" || hash.startsWith("#/mission") : hash.startsWith(h));
  });
}

export async function route() {
  if (cleanup) {
    try {
      cleanup();
    } catch (e) {
      console.warn(e);
    }
    cleanup = null;
  }
  closeModal();
  const hash = location.hash || "#/";
  if (!ctx.state.profile) {
    if (!hash.startsWith("#/login")) {
      location.hash = "#/login";
      return;
    }
    cleanup = loginScreen.render(app, ctx) || null;
    return;
  }
  let m;
  let screen = mapScreen;
  let params = {};
  if ((m = hash.match(/^#\/mission\/(\d+)/)) && ctx.mission(m[1]) && ctx.isUnlocked(+m[1])) {
    screen = missionScreen;
    params = { id: +m[1] };
  } else if (hash.startsWith("#/werkstatt")) screen = garageScreen;
  else if (hash.startsWith("#/shop")) screen = shopScreen;
  else if (hash.startsWith("#/arena")) {
    screen = arenaScreen;
    params = { tab: hash.split("/")[2] || "bot" };
  } else if (hash.startsWith("#/profil")) screen = profileScreen;
  else if (hash.startsWith("#/lehrer") && ctx.state.role === "teacher") screen = teacherScreen;
  else if (hash.startsWith("#/hilfe")) screen = helpScreen;
  else if (hash.startsWith("#/login")) {
    location.hash = "#/";
    return;
  }
  highlightNav();
  window.scrollTo(0, 0);
  cleanup = (await screen.render(app, ctx, params)) || null;
}

boot();
