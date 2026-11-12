import { $, $$, esc, md, icon, stars, bolts, toast, openModal, closeModal, confetti, shake } from "../ui.js";
import { COMMANDS, CONCEPTS, CONCEPT_ORDER, GOAL_TEXT } from "../catalog.js";
import { ReplayView } from "../replay-view.js";
import { keybarHTML, createEditor, countLines } from "../code-panel.js";
import { friendly } from "../api.js";
import { sfx } from "../sound.js";

const VIEW_KEY = "robofight.view3d";
const get3D = () => {
  try {
    return localStorage.getItem(VIEW_KEY) === "1";
  } catch {
    return false;
  }
};

/** Client-side map preview (same parsing rules as world.py / arena.py). */
function previewVariant(ctx, mission, variant) {
  const rows = mission.maps[variant];
  const walls = [], crystals = [], entities = [];
  let goal = null, robot = null;
  const kinds = { T: "target", E: "sentry", B: "boss", F: "friend" };
  const spawns = {};
  rows.forEach((row, y) =>
    [...row].forEach((ch, x) => {
      if (ch === "#") walls.push([x, y]);
      else if (ch === "G") goal = [x, y];
      else if (ch === "C") crystals.push([x, y]);
      else if ("^>v<".includes(ch)) robot = { x, y, dir: { "^": "N", ">": "E", v: "S", "<": "W" }[ch] };
      else if ("1234".includes(ch)) spawns[ch] = [x, y];
      else if (kinds[ch]) {
        const hp = kinds[ch] === "boss" ? mission.boss_hp || 3 : 1;
        entities.push({ id: entities.length, kind: kinds[ch], x, y, hp, max_hp: hp, cooldown: 0 });
      }
    })
  );
  const map = { width: rows[0].length, height: rows.length, walls, goal, crystals_total: crystals.length };
  if (mission.type === "arena") {
    const w = map.width / 2, h = map.height / 2;
    const bots = Object.keys(spawns).sort().map((k, i) => {
      const [x, y] = spawns[k];
      const dx = w - x, dy = h - y;
      const dir = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? "E" : "W") : (dy > 0 ? "S" : "N");
      return { id: i, x, y, dir, hp: 8, max_hp: 8, energy: 10, max_energy: 10, shield: 0, alive: true };
    });
    return { map, frames: [{ tick: 0, bots, lines: {}, rockets: [], mines: [], events: [] }] };
  }
  const r = mission.robot || {};
  return {
    map,
    frames: [{ tick: 0, line: null, events: [], crystals, entities,
      robot: { ...robot, hp: r.hp ?? 3, max_hp: r.hp ?? 3, energy: r.energy ?? null, max_energy: r.energy ?? null } }],
  };
}

function variantLabel(mission, i) {
  if (mission.type === "arena") return "Gegner: " + (mission.opponents[i] === "kreisel" ? "Kreisel" : mission.opponents[i] === "blechbuechse" ? "Blechbüchse" : mission.opponents[i]);
  return mission.id === 7 || mission.id === 11 ? `Gang ${i + 1}` : mission.id >= 14 ? `Raum ${i + 1}` : `Karte ${i + 1}`;
}

export async function render(app, ctx, { id }) {
  const mission = ctx.mission(id);
  const isArena = mission.type === "arena";
  const idx = ctx.data.missions.indexOf(mission);
  const st = ctx.missionState(id);
  const introduced = new Set(mission.introduces);
  const concepts = CONCEPT_ORDER.filter((c) => ctx.data.missions.slice(0, idx + 1).some((m) => m.introduces.includes(c)));
  const cmdNames = [...mission.api, ...(mission.api.includes("enemy_count") ? ["energy"] : []), "say"];
  const variantCount = isArena ? mission.opponents.length : mission.maps.length;
  const crit = mission.stars;
  const chip = (def, isNew) => `
    <button class="cmd ${def.sensor ? "sensor" : ""}" data-snippet="${esc(def.snippet)}" title="${esc(def.desc)}">
      <code>${esc(def.sig)}</code>${isNew ? '<span class="new">NEU</span>' : ""}
      <span class="cmd-desc">${esc(def.desc)}</span>
    </button>`;
  let use3D = isArena || get3D();

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
          <li>${icon("star")} ${mission.goals.map((g) => GOAL_TEXT[g]).join(" + ")}${variantCount > 1 ? ` – in allen ${variantCount} Varianten` : ""}</li>
          <li>${icon("star")} Höchstens <b>${crit.lines}</b> Zeilen Code</li>
          <li>${icon("star")} Höchstens <b>${crit.ticks}</b> Züge</li>
        </ul>
        <div class="reward-preview">${icon(mission.reward.icon)} Belohnung: <b>${esc(mission.reward.name)}</b> ${st.solved ? "✓" : ""}</div>
        <div class="hints">
          <div class="hint-list"></div>
          <button class="btn ghost small" id="hint-btn">${icon("bulb")} Tipp anzeigen</button>
        </div>
      </div>

      <div class="m-arena panel">
        <div class="arena-top">
          <div class="variant-tabs" ${variantCount > 1 ? "" : "hidden"}>
            ${Array.from({ length: variantCount }, (_, i) => `<button class="vtab" data-v="${i}">${esc(variantLabel(mission, i))}<span class="vstat"></span></button>`).join("")}
          </div>
          <button class="btn small ghost view-toggle" id="view-toggle" ${isArena ? "hidden" : ""} title="Zwischen 2D und 3D umschalten"></button>
        </div>
        <div id="replay-host"></div>
        <div class="hud">
          <span class="hud-item" id="hud-hp"></span>
          <span class="hud-item" id="hud-energy"></span>
          <span class="hud-item" id="hud-crystals"></span>
          <span class="hud-item hud-tick" id="hud-tick"></span>
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
        ${keybarHTML()}
        <div class="editor-host"></div>
        <details class="palette" open>
          <summary>${icon("code")} Befehle &amp; Bausteine <small>(antippen zum Einfügen)</small></summary>
          <div class="cmd-list">
            ${cmdNames.filter((k) => COMMANDS[k]).map((k) => chip(COMMANDS[k], introduced.has(k))).join("")}
            ${concepts.map((c) => chip(CONCEPTS[c], introduced.has(c))).join("")}
          </div>
        </details>
      </div>
    </section>`;

  const view = { mission, variant: 0, run: null, hints: 0, finished: false, successShown: false, change: null };
  const root = app.querySelector(".mission-screen");
  const editor = createEditor(root, $(".editor-host"), {
    value: ctx.state.profile.codes?.[String(id)] ?? mission.starter_code,
    onChange: (code) => {
      clearTimeout(view.saveTimer);
      view.saveTimer = setTimeout(() => ctx.api.saveCode(id, code), 400);
      updateLineCount();
    },
  });
  editor.onRun = runCode;
  const rv = new ReplayView($("#replay-host"), {
    mode: use3D ? "3d" : "2d",
    onFrame: (i, f, o) => onFrame(i, f, o),
    onEnd: () => finishReplay(),
  });

  function meta() {
    if (!isArena) return { bots: [], playerLoadout: ctx.state.profile.loadout };
    const opp = ctx.data.aiBots.find((b) => b.id === mission.opponents[view.variant]);
    return { bots: [{ name: "Dein Roboter", loadout: mission.loadout }, { name: opp?.name || "Gegner", loadout: opp?.loadout }] };
  }

  const viewBtn = $("#view-toggle");
  const syncViewBtn = () => (viewBtn.innerHTML = use3D ? `${icon("square")} 2D-Ansicht` : `${icon("cube")} 3D-Ansicht`);
  syncViewBtn();
  viewBtn.onclick = async () => {
    use3D = !use3D;
    try {
      localStorage.setItem(VIEW_KEY, use3D ? "1" : "0");
    } catch {
      /* ignore */
    }
    syncViewBtn();
    await rv.setMode(use3D ? "3d" : "2d");
    rv.renderer.setMeta?.(meta());
  };

  // hints
  $("#hint-btn").onclick = () => {
    if (view.hints < mission.hints.length) {
      $(".hint-list").insertAdjacentHTML("beforeend", `<div class="hint">${icon("bulb")}<div>${md(mission.hints[view.hints])}</div></div>`);
      view.hints++;
    }
    $("#hint-btn").hidden = view.hints >= mission.hints.length;
  };
  $$(".vtab").forEach((b) => (b.onclick = () => showVariant(+b.dataset.v)));
  $("#run-btn").onclick = runCode;
  $("#reset-code").onclick = () => {
    if (confirm("Deinen Code durch den Startcode ersetzen?")) editor.value = mission.starter_code;
  };

  function updateLineCount() {
    const n = countLines(editor.value);
    const el = $("#lines-count");
    if (!el) return;
    el.textContent = `${n} Zeile${n === 1 ? "" : "n"} (★ bei ≤ ${crit.lines})`;
    el.classList.toggle("ok", n <= crit.lines);
  }

  async function showVariant(i) {
    view.variant = i;
    $$(".vtab").forEach((b) => b.classList.toggle("active", +b.dataset.v === i));
    const v = view.run?.variants[i];
    const data = v || previewVariant(ctx, mission, i);
    view.frames = data.frames;
    view.map = data.map;
    view.finished = false;
    hideBanner();
    await rv.load(data.map, data.frames, meta());
    if (v) rv.play();
  }

  async function runCode() {
    const btn = $("#run-btn");
    if (btn.disabled) return;
    btn.disabled = true;
    btn.classList.add("busy");
    $("span", btn).textContent = ctx.engine.isReady ? "Läuft …" : "Python lädt …";
    hideBanner();
    clearConsole();
    editor.clearMarks();
    const code = editor.value;
    ctx.api.saveCode(id, code);
    const screen = view;
    let result;
    try {
      result = await ctx.engine.run(mission, code);
    } catch (err) {
      if (screen !== view || !btn.isConnected) return;
      resetBtn();
      showBanner("bad", err.timeout ? "Dein Programm hat viel zu lange gebraucht. Hast du eine Endlosschleife gebaut?"
        : "Interner Fehler: " + esc(err.message));
      return;
    }
    if (!btn.isConnected) return;
    resetBtn();
    view.run = result;
    view.successShown = false;
    // book the result (local economy or server) in the background
    view.booking = ctx.api.submitMission(mission, code, result).then((r) => {
      ctx.update(r);
      return r.change;
    }).catch((e) => {
      toast(friendly(e), "warn");
      return null;
    });
    for (const w of result.warnings || []) log("warn", w.message, w.line);
    if (result.error) {
      editor.setErrorLine(result.error.line);
      log("error", result.error.message, result.error.line);
      showBanner("bad", `<b>Zeile ${result.error.line}:</b> ${md(result.error.message)}`);
      sfx("error");
      shake(btn);
      return;
    }
    $$(".vtab").forEach((b, i) => {
      const ok = result.variants[i].status === "success";
      b.classList.toggle("ok", ok);
      b.classList.toggle("fail", !ok);
      $(".vstat", b).innerHTML = icon(ok ? "check" : "cross");
    });
    const failIdx = result.variants.findIndex((v) => v.status !== "success");
    await showVariant(failIdx >= 0 ? failIdx : 0);
  }

  function resetBtn() {
    const btn = $("#run-btn");
    btn.disabled = false;
    btn.classList.remove("busy");
    $("span", btn).textContent = "Start";
  }

  function onFrame(i, f, { seek }) {
    if (!f) return;
    editor.setActiveLine(rv.currentLine(0));
    updateHud(f);
    if (!view.run) return;
    if (seek) {
      clearConsole(true);
      for (let k = 1; k <= i; k++) logFrameEvents(view.frames[k]);
    } else logFrameEvents(f);
  }

  function updateHud(f) {
    const hearts = (hp, max, cls = "") =>
      Array.from({ length: max }, (_, k) => `<span class="heart ${k < hp ? "on" : ""} ${cls}">${icon("heart")}</span>`).join("");
    if (f.bots) {
      const m = meta();
      $("#hud-hp").innerHTML = f.bots.map((b) => `<span class="hud-bot">${esc(m.bots[b.id]?.name || "")} <span class="minibar"><i style="width:${(Math.max(0, b.hp) / b.max_hp) * 100}%"></i></span></span>`).join("");
      $("#hud-energy").innerHTML = `${icon("battery")} ${f.bots[0].energy}/${f.bots[0].max_energy}`;
      $("#hud-crystals").innerHTML = "";
    } else {
      const r = f.robot;
      $("#hud-hp").innerHTML = hearts(r.hp, r.max_hp);
      $("#hud-energy").innerHTML = r.max_energy != null ? `${icon("battery")} ${r.energy}/${r.max_energy}` : "";
      const total = view.map.crystals_total;
      $("#hud-crystals").innerHTML = total ? `<span class="gem"></span> ${total - f.crystals.length}/${total}` : "";
    }
    $("#hud-tick").textContent = `Zug ${f.tick}`;
  }

  function logFrameEvents(f) {
    for (const e of f.events || []) {
      if (e.bot !== undefined && e.bot !== 0 && e.type !== "explode") continue;
      if (e.type === "say") log("say", e.text, e.line, true);
      else if (e.type === "print") log("print", e.text, e.line, true);
      else if (e.type === "bump") log("warn", "Autsch – gegen ein Hindernis gefahren.", f.line, true);
      else if (e.type === "damage") log("error", f.robot ? `Treffer! Noch ${f.robot.hp} Lebenspunkte.` : "Treffer!", f.line, true);
      else if (e.type === "noenergy") log("warn", "Keine Energie mehr!", f.line, true);
      else if (e.type === "error") log("error", e.message, e.line, true);
      else if (e.type === "shield_block") log("good", "Schild hat einen Treffer geblockt!", null, true);
      else if (e.type === "explode" && e.id !== "robot") log("good", e.bot === 0 ? "Dein Roboter wurde zerstört!" : "Gegner zerstört!", f.line, true);
    }
  }

  async function finishReplay() {
    editor.setActiveLine(null);
    const v = view.run?.variants[view.variant];
    if (!v || view.finished) return;
    view.finished = true;
    if (v.status === "success") {
      const others = view.run.variants.filter((x) => x.status !== "success").length;
      if (view.run.ok && !view.successShown) {
        view.successShown = true;
        const change = await view.booking;
        showSuccess(view.run, change);
      } else if (others) {
        showBanner("warn", `Diese Variante klappt! Aber ${others} andere noch nicht – schau sie dir oben an.`);
      }
    } else {
      if (v.line) editor.setErrorLine(v.line);
      const where = v.line ? `<b>Zeile ${v.line}:</b> ` : "";
      const vi = variantCount > 1 ? ` <small>(${esc(variantLabel(mission, view.variant))})</small>` : "";
      showBanner("bad", where + md(v.reason) + vi);
      log("error", v.reason, v.line, true);
      sfx("lose");
      shake($(".canvas-wrap"));
    }
  }

  function log(kind, text, line, replay = false) {
    const c = $("#console");
    if (!c) return;
    const last = c.lastElementChild;
    if (last && last.dataset.key === kind + "|" + text) {
      last.dataset.n = (+last.dataset.n || 1) + 1;
      $(".count", last).textContent = "×" + last.dataset.n;
      return;
    }
    const div = document.createElement("div");
    div.dataset.key = kind + "|" + text;
    div.className = "log " + kind + (replay ? " replay" : "");
    const prefix = { say: "💬", print: "›", warn: "⚠", error: "✖", good: "✔", info: "ℹ" }[kind] || "";
    div.innerHTML = `<span class="lp">${prefix}</span><span class="lt">${md(text)}</span><span class="count"></span>${line ? `<button class="ll">Z. ${line}</button>` : ""}`;
    const ll = $(".ll", div);
    if (ll) ll.onclick = () => (editor.cm ? editor.cm.setCursor({ line: line - 1, ch: 0 }) : null, editor.focus());
    c.appendChild(div);
    c.scrollTop = c.scrollHeight;
  }

  function clearConsole(replayOnly = false) {
    const c = $("#console");
    if (!c) return;
    if (!replayOnly) c.innerHTML = "";
    else $$(".log.replay", c).forEach((n) => n.remove());
  }

  function showBanner(kind, html) {
    const b = $("#banner");
    if (!b) return;
    b.className = "banner " + kind;
    b.innerHTML = html;
    b.hidden = false;
  }

  function hideBanner() {
    const b = $("#banner");
    if (b) b.hidden = true;
  }

  function showSuccess(result, change) {
    sfx("win");
    const next = ctx.data.missions[idx + 1];
    const c = result.star_criteria;
    const row = (ok, text) => `<li class="${ok ? "ok" : ""}">${icon(ok ? "check" : "cross")} ${text}</li>`;
    const reward = change?.first_solve
      ? `<div class="reward">
           <div class="reward-icon">${icon(mission.reward.icon)}</div>
           <div><div class="reward-label">Neu freigeschaltet</div>
           <div class="reward-name">${esc(mission.reward.name)}</div>
           <div class="reward-text">${esc(mission.reward.text)}</div></div>
         </div>`
      : "";
    const badgeInfo = (bid) => ctx.data.badges.find((b) => b.id === bid) || { name: bid, icon: "medal" };
    const badges = (change?.new_badges || []).map((bid) => {
      const b = badgeInfo(bid);
      return `<div class="reward small"><div class="reward-icon">${icon(b.icon)}</div><div><div class="reward-label">Abzeichen</div><div class="reward-name">${esc(b.name)}</div></div></div>`;
    }).join("");
    if (change?.first_solve) setTimeout(() => sfx("unlock"), 700);
    openModal(`
      <div class="success">
        ${confetti()}
        <h2>${isArena ? "Qualifikation bestanden!" : "Mission geschafft!"}</h2>
        <div class="big-stars">${stars(result.stars, 3, "pop")}</div>
        <ul class="result-criteria">
          ${row(true, variantCount > 1 ? "Alle Varianten gelöst" : "Mission gelöst")}
          ${row(c.lines.ok, `${c.lines.got} Zeilen (Ziel: ≤ ${c.lines.need})`)}
          ${row(c.ticks.ok, `${c.ticks.got} Züge (Ziel: ≤ ${c.ticks.need})`)}
        </ul>
        <div class="gains">
          ${change?.xp_gained ? `<span class="xp-gain">+${change.xp_gained} XP</span>` : ""}
          ${change?.bolts ? `<span class="bolt-gain">+${bolts(change.bolts)}</span>` : ""}
        </div>
        ${change?.level_up ? `<div class="levelup">Level ${change.level_up.level}: ${esc(change.level_up.title)}!</div>` : ""}
        ${reward}${badges}
        <div class="modal-actions">
          <button class="btn ghost" id="m-again">${result.stars < 3 ? icon("restart") + " Mehr Sterne holen" : "Nochmal ansehen"}</button>
          ${isArena ? `<a class="btn primary" href="#/arena">Zur Arena ${icon("arena")}</a>`
            : next ? `<a class="btn primary" href="#/mission/${next.id}">Weiter: Mission ${next.id} ${icon("play")}</a>`
            : `<a class="btn primary" href="#/werkstatt">Zur Werkstatt ${icon("wrench")}</a>`}
        </div>
        ${change?.bolts ? `<p class="fineprint">Schrauben kannst du im <a href="#/shop">Shop</a> gegen neue Teile tauschen.</p>` : ""}
      </div>`);
    $("#m-again").onclick = closeModal;
  }

  await showVariant(0);
  updateLineCount();
  setTimeout(() => editor.refresh(), 0);
  if (!ctx.engine.isReady) log("info", "Python wird geladen … das dauert beim ersten Mal ein paar Sekunden.");
  return () => {
    clearTimeout(view.saveTimer);
    ctx.api?.saveCode?.(id, editor.value);
    rv.destroy();
    view.dead = true;
  };
}
