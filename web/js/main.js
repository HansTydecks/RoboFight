import { Arena } from "./renderer.js";
import { Player } from "./player.js";
import { Engine } from "./engine-client.js";
import { Editor } from "./editor.js";
import { Progress, BADGES } from "./progress.js";
import { COMMANDS, CONCEPTS, CONCEPT_ORDER, GOAL_TEXT } from "./catalog.js";
import { icon } from "./icons.js";
import { draw } from "./sprites.js";

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Tiny markdown: ```blocks```, `code`, newlines. */
function md(text) {
  return esc(text)
    .replace(/```\n?([\s\S]*?)```/g, (_, c) => `<pre class="snippet">${c.replace(/\n$/, "")}</pre>`)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\n(?![^<]*<\/pre>)/g, "<br>");
}

const app = $("#app");
let missions = [];
let progress;
let engine;
let view = null; // current mission view state

// ---------------------------------------------------------------- boot
async function boot() {
  missions = await (await fetch("missions.json", { cache: "no-cache" })).json();
  progress = new Progress(missions);
  engine = new Engine({ onStatus: setEngineStatus });
  window.addEventListener("hashchange", route);
  window.addEventListener("resize", () => view?.arena.resize());
  route();
}

function setEngineStatus(status, message) {
  const el = $("#engine-status");
  el.dataset.status = status;
  el.title =
    status === "ready" ? "Python ist bereit" : status === "loading" ? "Python wird geladen …" : "Fehler: " + message;
  $(".label", el).textContent = status === "ready" ? "Python bereit" : status === "loading" ? "Python lädt …" : "Python-Fehler";
}

function updateTopbar() {
  const lvl = progress.level;
  $("#stat-stars").textContent = progress.totalStars;
  $("#stat-level").textContent = lvl.level;
  $("#stat-title").textContent = lvl.title;
  $("#stat-xpbar").style.width = Math.round(lvl.progress * 100) + "%";
  $("#stat-xp").textContent = progress.xp + " XP";
}

function route() {
  if (view) {
    view.player.destroy();
    view = null;
  }
  closeModal();
  const hash = location.hash || "#/";
  const m = hash.match(/^#\/mission\/(\d+)/);
  document.querySelectorAll(".nav a").forEach((a) => a.classList.toggle("active", a.getAttribute("href") === hash));
  if (m && missions.find((x) => x.id === +m[1]) && progress.isUnlocked(+m[1])) renderMission(+m[1]);
  else if (hash.startsWith("#/werkstatt")) renderGarage();
  else renderMap();
  updateTopbar();
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------- mission map
function stars(n, total = 3, cls = "") {
  let s = "";
  for (let i = 0; i < total; i++) s += `<span class="star ${i < n ? "on" : ""} ${cls}">${icon("star")}</span>`;
  return s;
}

function renderMap() {
  const cards = missions
    .map((m, i) => {
      const st = progress.m(m.id);
      const unlocked = progress.isUnlocked(m.id);
      const isNext = unlocked && !st.solved;
      const cls = !unlocked ? "locked" : st.solved ? "solved" : "next";
      const inner = `
        <div class="mc-num">${unlocked ? m.id : icon("lock")}</div>
        <div class="mc-body">
          <div class="mc-concept">${esc(m.concept)}</div>
          <div class="mc-title">${esc(m.title)}</div>
          <div class="mc-stars">${stars(st.stars)}</div>
        </div>
        ${isNext ? `<div class="mc-go">${icon("play")}</div>` : ""}`;
      return unlocked
        ? `<a class="mission-card ${cls}" href="#/mission/${m.id}" style="--i:${i}">${inner}</a>`
        : `<div class="mission-card ${cls}" style="--i:${i}" aria-disabled="true">${inner}</div>`;
    })
    .join("");

  app.innerHTML = `
    <section class="screen map-screen">
      <div class="hero">
        <div class="hero-text">
          <h1>Kampagne 1: Die Werkstatt</h1>
          <p>Programmiere deinen Roboter mit Python. Jede Mission bringt dir ein neues Konzept bei –
          und schaltet ein neues Modul für deinen Roboter frei.</p>
        </div>
        <canvas class="hero-robot" width="120" height="120" aria-hidden="true"></canvas>
      </div>
      <div class="mission-grid">${cards}
        <div class="mission-card locked teaser">
          <div class="mc-num">${icon("arena")}</div>
          <div class="mc-body">
            <div class="mc-concept">Bald</div>
            <div class="mc-title">Die Arena (PvP)</div>
            <div class="mc-sub">Lass deinen Roboter gegen andere antreten.</div>
          </div>
        </div>
      </div>
    </section>`;
  drawHeroRobot($(".hero-robot"));
}

function drawHeroRobot(canvas, size = 120) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  canvas.style.width = canvas.style.height = size + "px";
  const ctx = canvas.getContext("2d");
  const loop = () => {
    if (!canvas.isConnected) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const t = performance.now() / 1000;
    draw(ctx, "robot", size * 0.1, size * 0.1 + Math.sin(t * 2) * 3, size * 0.8, { angle: -Math.PI / 2 + Math.sin(t) * 0.25, t });
    requestAnimationFrame(loop);
  };
  loop();
}

// ---------------------------------------------------------------- garage
function renderGarage() {
  const solved = (id) => progress.m(id).solved;
  const modules = [
    { icon: "engine", name: "Antrieb", text: "robot.move() – dein erster Befehl.", owned: true },
    ...missions.map((m) => ({ ...m.reward, owned: solved(m.id), from: m.id })),
  ];
  const mods = modules
    .map(
      (r) => `
      <div class="module ${r.owned ? "owned" : ""}">
        <div class="module-icon">${icon(r.owned ? r.icon : "lock")}</div>
        <div><div class="module-name">${r.owned ? esc(r.name) : "???"}</div>
        <div class="module-text">${r.owned ? esc(r.text) : `Schalte es mit Mission ${r.from} frei.`}</div></div>
      </div>`
    )
    .join("");
  const badges = BADGES.map(
    (b) => `
      <div class="badge ${progress.state.badges.includes(b.id) ? "owned" : ""}" title="${esc(b.desc)}">
        <div class="badge-icon">${icon(b.icon)}</div>
        <div class="badge-name">${esc(b.name)}</div>
        <div class="badge-desc">${esc(b.desc)}</div>
      </div>`
  ).join("");
  const st = progress.state.stats;
  app.innerHTML = `
    <section class="screen garage-screen">
      <div class="garage-top panel">
        <canvas class="garage-robot" aria-hidden="true"></canvas>
        <div>
          <h1>Deine Werkstatt</h1>
          <p class="muted">Level ${progress.level.level} · ${esc(progress.level.title)}</p>
          <div class="stat-row">
            <div class="stat"><b>${progress.totalStars}</b><span>Sterne</span></div>
            <div class="stat"><b>${progress.xp}</b><span>XP</span></div>
            <div class="stat"><b>${st.runs}</b><span>Programme gestartet</span></div>
            <div class="stat"><b>${st.errors}</b><span>Fehler gefunden</span></div>
          </div>
        </div>
      </div>
      <h2>Module</h2>
      <div class="module-grid">${mods}</div>
      <h2>Abzeichen</h2>
      <div class="badge-grid">${badges}</div>
      <div class="danger-zone">
        <button class="btn ghost small" id="reset-progress">${icon("restart")} Fortschritt zurücksetzen</button>
      </div>
    </section>`;
  drawHeroRobot($(".garage-robot"), 140);
  $("#reset-progress").onclick = () => {
    if (confirm("Wirklich den ganzen Fortschritt löschen? Das kann man nicht rückgängig machen.")) {
      progress.reset();
      route();
    }
  };
}

// ---------------------------------------------------------------- mission screen
/** Client-side map preview (same parsing rules as world.py). */
function previewVariant(mission, variant) {
  const rows = mission.maps[variant];
  const walls = [], crystals = [], entities = [];
  let goal = null, robot = null;
  const kinds = { T: "target", E: "sentry", B: "boss" };
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === "#") walls.push([x, y]);
      else if (ch === "G") goal = [x, y];
      else if (ch === "C") crystals.push([x, y]);
      else if ("^>v<".includes(ch)) robot = { x, y, dir: { "^": "N", ">": "E", v: "S", "<": "W" }[ch] };
      else if (kinds[ch]) {
        const hp = kinds[ch] === "boss" ? mission.boss_hp || 3 : 1;
        entities.push({ id: entities.length, kind: kinds[ch], x, y, hp, max_hp: hp, cooldown: 0 });
      }
    })
  );
  const r = mission.robot || {};
  return {
    map: { width: rows[0].length, height: rows.length, walls, goal, crystals_total: crystals.length },
    frames: [{
      tick: 0, line: null, events: [], crystals, entities,
      robot: { ...robot, hp: r.hp ?? 3, max_hp: r.hp ?? 3, energy: r.energy ?? null, max_energy: r.energy ?? null },
    }],
  };
}

function variantLabel(mission, i) {
  return mission.id === 7 ? `Gang ${i + 1}` : `Karte ${i + 1}`;
}

function renderMission(id) {
  const mission = missions.find((m) => m.id === id);
  const idx = missions.indexOf(mission);
  const st = progress.m(id);
  const introduced = new Set(mission.introduces);
  const concepts = CONCEPT_ORDER.filter((c) =>
    missions.slice(0, idx + 1).some((m) => m.introduces.includes(c))
  );
  const cmdNames = [...mission.api, ...(mission.api.includes("enemy_count") ? ["energy"] : []), "say"];

  const chip = (key, def, isNew) => `
    <button class="cmd ${def.sensor ? "sensor" : ""}" data-snippet="${esc(def.snippet)}" title="${esc(def.desc)}">
      <code>${esc(def.sig)}</code>${isNew ? '<span class="new">NEU</span>' : ""}
      <span class="cmd-desc">${esc(def.desc)}</span>
    </button>`;

  const crit = mission.stars;
  app.innerHTML = `
    <section class="screen mission-screen">
      <div class="m-info panel">
        <div class="m-head">
          <a class="btn ghost small" href="#/">${icon("back")} Karte</a>
          <span class="tag">Mission ${mission.id} · ${esc(mission.concept)}</span>
          <span class="m-best">${stars(st.stars)}</span>
        </div>
        <h1>${esc(mission.title)}</h1>
        <p class="story">${md(mission.story)}</p>
        <p class="task"><b>Auftrag:</b> ${md(mission.task)}</p>
        <ul class="criteria">
          <li>${icon("star")} ${mission.goals.map((g) => GOAL_TEXT[g]).join(" + ")}${mission.maps.length > 1 ? ` – in allen ${mission.maps.length} Varianten` : ""}</li>
          <li>${icon("star")} Höchstens <b>${crit.lines}</b> Zeilen Code</li>
          <li>${icon("star")} Höchstens <b>${crit.ticks}</b> Züge</li>
        </ul>
        <div class="hints">
          <div class="hint-list"></div>
          <button class="btn ghost small" id="hint-btn">${icon("bulb")} Tipp anzeigen</button>
        </div>
      </div>

      <div class="m-arena panel">
        <div class="variant-tabs" ${mission.maps.length > 1 ? "" : "hidden"}>
          ${mission.maps.map((_, i) => `<button class="vtab" data-v="${i}">${variantLabel(mission, i)}<span class="vstat"></span></button>`).join("")}
        </div>
        <div class="canvas-wrap"><canvas id="arena"></canvas></div>
        <div class="hud">
          <span class="hud-item" id="hud-hp"></span>
          <span class="hud-item" id="hud-energy"></span>
          <span class="hud-item" id="hud-crystals"></span>
          <span class="hud-item hud-tick" id="hud-tick"></span>
        </div>
        <div class="controls">
          <button class="btn icon-btn" id="c-back" title="Schritt zurück">${icon("stepb")}</button>
          <button class="btn icon-btn" id="c-play" title="Abspielen / Pause">${icon("play")}</button>
          <button class="btn icon-btn" id="c-fwd" title="Schritt vor">${icon("stepf")}</button>
          <button class="btn icon-btn" id="c-restart" title="Von vorn">${icon("restart")}</button>
          <button class="btn small speed" id="c-speed" title="Geschwindigkeit">1×</button>
          <input type="range" id="c-scrub" min="0" max="0" value="0" aria-label="Zeitleiste">
        </div>
        <div class="banner" id="banner" hidden></div>
        <div class="console" id="console" aria-live="polite"></div>
      </div>

      <div class="m-code panel">
        <div class="code-toolbar">
          <button class="btn primary big" id="run-btn">${icon("play")} <span>Start</span></button>
          <button class="btn ghost small" id="reset-code" title="Startcode wiederherstellen">${icon("undo")} Startcode</button>
          <span class="lines-count" id="lines-count"></span>
        </div>
        <div class="keybar" role="toolbar" aria-label="Tasten">
          <button data-k="indent">⇥ Einrücken</button><button data-k="dedent">⇤</button>
          <button data-k="robot.">robot.</button><button data-k="()">( )</button><button data-k=":">:</button>
          <button data-k=" = "> = </button><button data-k=" == ">==</button><button data-k=" < "><</button>
          <button data-k=" > ">></button><button data-k='"'>"</button><button data-k="undo">${icon("undo")}</button>
        </div>
        <div class="editor-host"></div>
        <details class="palette" open>
          <summary>${icon("code")} Befehle &amp; Bausteine <small>(antippen zum Einfügen)</small></summary>
          <div class="cmd-list">
            ${cmdNames.filter((k) => COMMANDS[k]).map((k) => chip(k, COMMANDS[k], introduced.has(k))).join("")}
            ${concepts.map((c) => chip(c, CONCEPTS[c], introduced.has(c))).join("")}
          </div>
        </details>
      </div>
    </section>`;

  const arena = new Arena($("#arena"));
  const editor = new Editor($(".editor-host"), {
    value: progress.code(id) ?? mission.starter_code,
    onChange: (code) => {
      clearTimeout(view.saveTimer);
      view.saveTimer = setTimeout(() => progress.saveCode(id, code), 300);
      updateLineCount();
    },
  });
  const player = new Player(arena, {
    onFrame: (i, o) => onFrame(i, o),
    onEnd: () => finishReplay(),
  });
  view = { mission, arena, editor, player, variant: 0, run: null, hints: 0, frames: [], map: null };
  editor.onRun = runCode;

  // hints
  $("#hint-btn").onclick = () => {
    const list = $(".hint-list");
    if (view.hints < mission.hints.length) {
      list.insertAdjacentHTML("beforeend", `<div class="hint">${icon("bulb")}<div>${md(mission.hints[view.hints])}</div></div>`);
      view.hints++;
    }
    $("#hint-btn").hidden = view.hints >= mission.hints.length;
  };

  // palette & keybar
  app.querySelectorAll(".cmd").forEach((b) => (b.onclick = () => editor.insert(b.dataset.snippet)));
  app.querySelectorAll(".keybar button").forEach((b) => {
    b.onmousedown = (e) => e.preventDefault(); // keep editor focus
    b.onclick = () => {
      const k = b.dataset.k;
      if (k === "indent") editor.indent(1);
      else if (k === "dedent") editor.indent(-1);
      else if (k === "undo") editor.undo();
      else if (k === "()") editor.insert("()");
      else editor.insert(k);
    };
  });

  // controls
  $("#c-play").onclick = () => {
    player.toggle();
    updatePlayButton();
  };
  $("#c-fwd").onclick = () => {
    player.stepForward();
    updatePlayButton();
  };
  $("#c-back").onclick = () => {
    player.stepBack();
    updatePlayButton();
  };
  $("#c-restart").onclick = () => {
    player.seek(0);
    player.play();
    updatePlayButton();
  };
  const speeds = [1, 2, 4, 0.5];
  $("#c-speed").onclick = (e) => {
    const next = speeds[(speeds.indexOf(player.speed) + 1) % speeds.length];
    player.setSpeed(next);
    e.currentTarget.textContent = (next === 0.5 ? "½" : next) + "×";
  };
  $("#c-scrub").oninput = (e) => {
    player.pause();
    player.seek(+e.target.value);
    updatePlayButton();
  };
  app.querySelectorAll(".vtab").forEach((b) => (b.onclick = () => showVariant(+b.dataset.v)));
  $("#run-btn").onclick = runCode;
  $("#reset-code").onclick = () => {
    if (confirm("Deinen Code durch den Startcode ersetzen?")) editor.value = mission.starter_code;
  };

  showVariant(0);
  updateLineCount();
  setTimeout(() => {
    arena.resize();
    editor.refresh();
  }, 0);
  if (!engine.isReady) log("info", "Python wird geladen … das dauert beim ersten Mal ein paar Sekunden.");
}

function updateLineCount() {
  const n = view.editor.value.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).length;
  const need = view.mission.stars.lines;
  const el = $("#lines-count");
  el.textContent = `${n} Zeile${n === 1 ? "" : "n"} (★ bei ≤ ${need})`;
  el.classList.toggle("ok", n <= need);
}

function updatePlayButton() {
  $("#c-play").innerHTML = icon(view.player.playing ? "pause" : "play");
}

function showVariant(i) {
  view.variant = i;
  app.querySelectorAll(".vtab").forEach((b) => b.classList.toggle("active", +b.dataset.v === i));
  const v = view.run?.variants[i];
  const data = v || previewVariant(view.mission, i);
  view.frames = data.frames;
  view.map = data.map;
  view.player.load(data.map, data.frames);
  $("#c-scrub").max = Math.max(0, data.frames.length - 1);
  view.finished = false;
  hideBanner();
  if (v) view.player.play();
  updatePlayButton();
}

// ---------------------------------------------------------------- running
async function runCode() {
  const { mission, editor } = view;
  const btn = $("#run-btn");
  if (btn.disabled) return;
  btn.disabled = true;
  btn.classList.add("busy");
  $("span", btn).textContent = engine.isReady ? "Läuft …" : "Python lädt …";
  hideBanner();
  clearConsole();
  editor.clearMarks();
  progress.saveCode(mission.id, editor.value);
  const currentView = view;
  let result;
  try {
    result = await engine.run(mission, editor.value);
  } catch (err) {
    if (currentView !== view) return;
    btn.disabled = false;
    btn.classList.remove("busy");
    $("span", btn).textContent = "Start";
    if (err.timeout) {
      showBanner("bad", "Dein Programm hat viel zu lange gebraucht. Hast du eine Endlosschleife gebaut?");
    } else {
      showBanner("bad", "Interner Fehler: " + esc(err.message));
    }
    return;
  }
  if (currentView !== view) return;
  btn.disabled = false;
  btn.classList.remove("busy");
  $("span", btn).textContent = "Start";
  progress.recordRun(result);
  view.run = result;

  for (const w of result.warnings || []) log("warn", w.message, w.line);

  if (result.error) {
    editor.setErrorLine(result.error.line);
    log("error", result.error.message, result.error.line);
    showBanner("bad", `<b>Zeile ${result.error.line}:</b> ${md(result.error.message)}`);
    shake($("#run-btn"));
    return;
  }

  app.querySelectorAll(".vtab").forEach((b, i) => {
    const ok = result.variants[i].status === "success";
    b.classList.toggle("ok", ok);
    b.classList.toggle("fail", !ok);
    $(".vstat", b).innerHTML = icon(ok ? "check" : "cross");
  });
  // Play the first failing variant (that's where the kid needs to look), else the first.
  const failIdx = result.variants.findIndex((v) => v.status !== "success");
  showVariant(failIdx >= 0 ? failIdx : 0);
  view.successShown = false;
}

function onFrame(i, { seek }) {
  if (!view) return;
  const f = view.frames[i];
  $("#c-scrub").value = i;
  view.editor.setActiveLine(view.player.currentLine());
  updateHud(f);
  if (!view.run) return;
  if (seek) {
    clearConsole(true);
    for (let k = 1; k <= i; k++) logFrameEvents(view.frames[k]);
  } else {
    logFrameEvents(f);
  }
}

function updateHud(f) {
  const r = f.robot;
  const hearts = Array.from({ length: r.max_hp }, (_, k) => `<span class="heart ${k < r.hp ? "on" : ""}">${icon("heart")}</span>`).join("");
  $("#hud-hp").innerHTML = hearts;
  $("#hud-energy").innerHTML = r.max_energy != null ? `${icon("battery")} ${r.energy}/${r.max_energy}` : "";
  const total = view.map.crystals_total;
  $("#hud-crystals").innerHTML = total ? `<span class="gem"></span> ${total - f.crystals.length}/${total}` : "";
  $("#hud-tick").textContent = `Zug ${f.tick}`;
}

function logFrameEvents(f) {
  for (const e of f.events || []) {
    if (e.type === "say") log("say", e.text, e.line, true);
    else if (e.type === "print") log("print", e.text, e.line, true);
    else if (e.type === "bump") log("warn", "Autsch – gegen ein Hindernis gefahren.", f.line, true);
    else if (e.type === "damage") log("error", `Treffer! Noch ${f.robot.hp} Lebenspunkte.`, f.line, true);
    else if (e.type === "noenergy") log("warn", "Keine Energie mehr für den Laser!", f.line, true);
    else if (e.type === "explode" && e.id !== "robot") log("good", "Gegner zerstört!", f.line, true);
  }
}

function finishReplay() {
  updatePlayButton();
  view.editor.setActiveLine(null);
  const v = view.run?.variants[view.variant];
  if (!v || view.finished) return;
  view.finished = true;
  if (v.status === "success") {
    const others = view.run.variants.filter((x) => x.status !== "success").length;
    if (view.run.ok && !view.successShown) {
      view.successShown = true;
      showSuccess(view.run);
    } else if (others) {
      showBanner("warn", `Diese Variante klappt! Aber ${others} andere noch nicht – schau sie dir oben an.`);
    }
  } else {
    if (v.line) view.editor.setErrorLine(v.line);
    const where = v.line ? `<b>Zeile ${v.line}:</b> ` : "";
    const variantInfo = view.mission.maps.length > 1 ? ` <small>(${variantLabel(view.mission, view.variant)})</small>` : "";
    showBanner("bad", where + md(v.reason) + variantInfo);
    log("error", v.reason, v.line, true);
    shake($(".canvas-wrap"));
  }
}

// ---------------------------------------------------------------- feedback UI
function log(kind, text, line, replay = false) {
  const c = $("#console");
  if (!c) return;
  const lastEl = c.lastElementChild;
  if (lastEl && lastEl.dataset.key === kind + "|" + text) {
    const n = (+lastEl.dataset.n || 1) + 1;
    lastEl.dataset.n = n;
    $(".count", lastEl).textContent = "×" + n;
    return;
  }
  const div = document.createElement("div");
  div.dataset.key = kind + "|" + text;
  div.className = "log " + kind + (replay ? " replay" : "");
  const prefix = { say: "💬", print: "›", warn: "⚠", error: "✖", good: "✔", info: "ℹ" }[kind] || "";
  div.innerHTML = `<span class="lp">${prefix}</span><span class="lt">${md(text)}</span><span class="count"></span>${line ? `<button class="ll" data-line="${line}">Z. ${line}</button>` : ""}`;
  const ll = $(".ll", div);
  if (ll) ll.onclick = () => view.editor.cm?.setCursor({ line: line - 1, ch: 0 }) ?? view.editor.focus();
  c.appendChild(div);
  c.scrollTop = c.scrollHeight;
}

function clearConsole(replayOnly = false) {
  const c = $("#console");
  if (!c) return;
  if (!replayOnly) c.innerHTML = "";
  else c.querySelectorAll(".log.replay").forEach((n) => n.remove());
}

function showBanner(kind, html) {
  const b = $("#banner");
  b.className = "banner " + kind;
  b.innerHTML = html;
  b.hidden = false;
}

function hideBanner() {
  const b = $("#banner");
  if (b) b.hidden = true;
}

function shake(el) {
  el.classList.remove("shake");
  void el.offsetWidth;
  el.classList.add("shake");
}

function showSuccess(result) {
  const { mission } = view;
  const change = progress.recordResult(mission, result);
  updateTopbar();
  const next = missions[missions.indexOf(mission) + 1];
  const c = result.star_criteria;
  const row = (ok, text) => `<li class="${ok ? "ok" : ""}">${icon(ok ? "check" : "cross")} ${text}</li>`;
  const reward = change.firstSolve
    ? `<div class="reward">
         <div class="reward-icon">${icon(mission.reward.icon)}</div>
         <div><div class="reward-label">Neu freigeschaltet</div>
         <div class="reward-name">${esc(mission.reward.name)}</div>
         <div class="reward-text">${esc(mission.reward.text)}</div></div>
       </div>`
    : "";
  const badges = change.newBadges
    .map((b) => `<div class="reward small"><div class="reward-icon">${icon(b.icon)}</div><div><div class="reward-label">Abzeichen</div><div class="reward-name">${esc(b.name)}</div></div></div>`)
    .join("");
  openModal(`
    <div class="success">
      <div class="confetti" aria-hidden="true">${confetti()}</div>
      <h2>Mission geschafft!</h2>
      <div class="big-stars">${stars(result.stars, 3, "pop")}</div>
      <ul class="result-criteria">
        ${row(true, mission.maps.length > 1 ? "Alle Varianten gelöst" : "Mission gelöst")}
        ${row(c.lines.ok, `${c.lines.got} Zeilen (Ziel: ≤ ${c.lines.need})`)}
        ${row(c.ticks.ok, `${c.ticks.got} Züge (Ziel: ≤ ${c.ticks.need})`)}
      </ul>
      ${change.xpGained ? `<div class="xp-gain">+${change.xpGained} XP</div>` : ""}
      ${change.levelUp ? `<div class="levelup">Level ${change.levelUp.level}: ${esc(change.levelUp.title)}!</div>` : ""}
      ${reward}${badges}
      <div class="modal-actions">
        ${result.stars < 3 ? `<button class="btn ghost" id="m-again">${icon("restart")} Mehr Sterne holen</button>` : `<button class="btn ghost" id="m-again">Nochmal ansehen</button>`}
        ${next ? `<a class="btn primary" href="#/mission/${next.id}">Weiter: Mission ${next.id} ${icon("play")}</a>` : `<a class="btn primary" href="#/werkstatt">Zur Werkstatt ${icon("wrench")}</a>`}
      </div>
    </div>`);
  $("#m-again").onclick = closeModal;
}

function confetti() {
  // deterministic pseudo-random scatter
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  return Array.from({ length: 36 }, (_, i) =>
    `<i style="--i:${i};--x:${Math.round(rnd() * 100)};--dx:${Math.round(rnd() * 120 - 60)}px;` +
    `--r:${Math.round(rnd() * 720 - 360)}deg;--d:${(1.2 + rnd()).toFixed(2)}s;--delay:${Math.round(rnd() * 400)}ms"></i>`
  ).join("");
}

function openModal(html) {
  const m = $("#modal");
  $(".modal-card", m).innerHTML = html;
  m.hidden = false;
}

function closeModal() {
  const m = $("#modal");
  if (m) m.hidden = true;
}

$("#modal").addEventListener("click", (e) => {
  if (e.target.id === "modal") closeModal();
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeModal();
});

boot();
