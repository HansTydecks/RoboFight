import { $, $$, esc, icon, toast, md, bolts } from "../ui.js";
import { ReplayView, load3D } from "../replay-view.js";
import { keybarHTML, createEditor } from "../code-panel.js";
import { ARENA_COMMANDS } from "../catalog.js";
import { friendly, league } from "../api.js";
import { sfx } from "../sound.js";
import { partIcon } from "./garage.js";

const TABS = [["bot", "Mein Bot", "code"], ["training", "Training", "medal"], ["rangliste", "Rangliste", "trophy"], ["kaempfe", "Kämpfe", "restart"]];
const OUTCOME = { win: ["Sieg!", "good"], loss: ["Niederlage", "bad"], draw: ["Unentschieden", "warn"] };

export async function render(app, ctx, { tab }) {
  const p = () => ctx.state.profile;
  if (!ctx.state.info.arena_unlocked) {
    app.innerHTML = `
      <section class="screen arena-locked panel">
        <div class="big-icon">${icon("lock")}</div>
        <h1>Die Arena ist noch verschlossen</h1>
        <p>Schaffe zuerst <b>Mission 16: Arena-Qualifikation</b>. Dort lernst du, wie ein Arena-Roboter mit <code>def update(robot):</code> denkt.</p>
        <a class="btn primary" href="#/">${icon("map")} Zu den Missionen</a>
      </section>`;
    return;
  }
  if (!TABS.some(([t]) => t === tab)) tab = "bot";
  let editor = null;
  let viewer = null;
  let arenaChoice = "werkhalle";

  app.innerHTML = `
    <section class="screen arena-screen">
      <div class="arena-head">
        <div>
          <h1>${icon("arena")} Arena</h1>
          <p class="muted">Dein Roboter kämpft ganz allein – mit deinem Code. Jeder Zug ruft <code>update(robot)</code> auf.</p>
        </div>
        <div class="league-card">
          <div class="league-badge league-${league(p().arena.elo).replace(/[^a-z]/gi, "").toLowerCase()}">${icon("trophy")}</div>
          <div><div class="league-name">${esc(league(p().arena.elo))}</div><div class="muted small">Elo ${p().arena.elo} · ${p().arena.wins} Siege</div></div>
        </div>
      </div>
      <div class="seg arena-tabs">${TABS.map(([t, n, ic]) => `<a href="#/arena/${t}" class="${t === tab ? "active" : ""}">${icon(ic)} ${n}</a>`).join("")}</div>
      <div class="arena-viewer panel" hidden>
        <div class="viewer-head"><h3 id="viewer-title"></h3><button class="btn small ghost" id="viewer-close">${icon("cross")} Schließen</button></div>
        <div id="viewer-host"></div>
        <div class="hud" id="viewer-hud"></div>
        <div class="banner" id="viewer-banner" hidden></div>
        <div class="console" id="viewer-console"></div>
      </div>
      <div class="arena-body"></div>
    </section>`;
  const body = $(".arena-body");

  // ------------------------------------------------------------------ viewer
  async function showFight(result, title, change) {
    const box = $(".arena-viewer");
    box.hidden = false;
    $("#viewer-title").textContent = title;
    const banner = $("#viewer-banner");
    banner.hidden = true;
    $("#viewer-console").innerHTML = "";
    const three = await load3D().catch(() => null);
    if (!three?.webglAvailable()) {
      $("#viewer-host").innerHTML = `<p class="muted">3D wird auf diesem Gerät nicht unterstützt – hier ist nur das Ergebnis.</p>`;
      finish();
      return;
    }
    if (!viewer) {
      viewer = new ReplayView($("#viewer-host"), { mode: "3d", onFrame: onFrame, onEnd: finish });
    }
    const meta = { bots: result.bots.map((b) => ({ name: b.name, loadout: b.loadout })) };
    await viewer.load(result.map, result.frames, meta);
    box.scrollIntoView({ behavior: "smooth", block: "start" });
    viewer.play();

    function onFrame(i, f) {
      if (!f) return;
      $("#viewer-hud").innerHTML = f.bots.map((b) => `
        <span class="hud-bot c${b.id}">${esc(meta.bots[b.id]?.name || "")}
          <span class="minibar"><i style="width:${(Math.max(0, b.hp) / b.max_hp) * 100}%"></i></span>
          <small>${Math.max(0, b.hp)}/${b.max_hp} ❤ · ${b.energy}⚡${b.shield ? " · 🛡" : ""}</small></span>`).join("") +
        `<span class="hud-tick">Zug ${f.tick}</span>`;
      editor?.setActiveLine(viewer.currentLine(0));
      for (const e of f.events || []) {
        if (e.bot !== 0) continue;
        if (e.type === "error") consoleLine("error", e.message, e.line);
        if (e.type === "say") consoleLine("say", e.text, e.line);
        if (e.type === "print") consoleLine("print", e.text, e.line);
      }
    }
    function finish() {
      editor?.setActiveLine(null);
      const me = result.bots[0];
      const outcome = result.winner === null ? "draw" : result.winner === 0 ? "win" : "loss";
      const [label, kind] = OUTCOME[outcome];
      sfx(outcome === "win" ? "win" : outcome === "loss" ? "lose" : "click");
      let extra = "";
      if (change) {
        if (change.bolts) extra += ` · +${bolts(change.bolts)}`;
        if (change.kind === "ranked") {
          const d = change.elo_after - change.elo_before;
          extra += ` · Elo ${change.elo_after} (${d >= 0 ? "+" : ""}${d})`;
        }
        if (change.first_win) extra += " · Erster Sieg gegen diesen Gegner!";
      }
      banner.className = "banner " + kind;
      banner.innerHTML = `<b>${label}</b> ${esc(result.reason)}${extra}` +
        (me.error ? `<br>${icon("bug")} Dein Code hatte einen Fehler${me.error.line ? " in Zeile " + me.error.line : ""}: ${md(me.error.message)}` : "");
      banner.hidden = false;
      if (me.error?.line) editor?.setErrorLine(me.error.line);
      for (const bid of change?.new_badges || []) {
        const bd = ctx.data.badges.find((x) => x.id === bid);
        if (bd) toast(`Neues Abzeichen: **${bd.name}**`, "good");
      }
    }
  }
  function consoleLine(kind, text, line) {
    const c = $("#viewer-console");
    const last = c.lastElementChild;
    if (last && last.dataset.key === kind + text) {
      last.dataset.n = (+last.dataset.n || 1) + 1;
      $(".count", last).textContent = "×" + last.dataset.n;
      return;
    }
    const d = document.createElement("div");
    d.className = "log " + kind;
    d.dataset.key = kind + text;
    d.innerHTML = `<span class="lp">${{ error: "✖", say: "💬", print: "›" }[kind]}</span><span class="lt">${md(text)}</span><span class="count"></span>${line ? `<span class="ll">Z. ${line}</span>` : ""}`;
    c.appendChild(d);
    c.scrollTop = c.scrollHeight;
  }
  $("#viewer-close").onclick = () => {
    viewer?.player.pause();
    $(".arena-viewer").hidden = true;
  };

  async function fight(btn, fn, title) {
    btn.disabled = true;
    const old = btn.innerHTML;
    btn.innerHTML = `${icon("restart", "spin")} Kampf läuft …`;
    try {
      const r = await fn();
      ctx.update(r);
      await showFight(r.result, title(r), r.change);
      refreshHead();
    } catch (e) {
      toast(e.timeout ? "Der Kampf hat zu lange gedauert." : friendly(e), "bad", 5000);
      sfx("error");
    } finally {
      btn.disabled = false;
      btn.innerHTML = old;
    }
  }

  function refreshHead() {
    const a = p().arena;
    $(".league-card").innerHTML = `
      <div class="league-badge league-${league(a.elo).replace(/[^a-z]/gi, "").toLowerCase()}">${icon("trophy")}</div>
      <div><div class="league-name">${esc(league(a.elo))}</div><div class="muted small">Elo ${a.elo} · ${a.wins} Siege</div></div>`;
  }

  const arenaSelect = () => `
    <label class="arena-select">Arena:
      <select id="arena-pick">${ctx.data.arenas.filter((a) => a.id !== "trainingsplatz").map((a) =>
        `<option value="${a.id}" ${a.id === arenaChoice ? "selected" : ""}>${esc(a.name)}</option>`).join("")}</select>
    </label>`;
  const bindArenaSelect = () => {
    const s = $("#arena-pick");
    if (s) s.onchange = () => (arenaChoice = s.value);
  };
  const loadoutBadges = (lo) => [lo.chassis, ...(lo.weapons || []), ...(lo.modules || [])]
    .map((id) => ctx.part(id)).filter(Boolean)
    .map((pt) => `<span class="mini-part" title="${esc(pt.name)}">${icon(partIcon(pt))}</span>`).join("");

  // ------------------------------------------------------------------ tabs
  if (tab === "bot") {
    const pub = p().arena.published;
    body.innerHTML = `
      <div class="arena-bot-grid">
        <div class="panel">
          <div class="code-toolbar">
            <button class="btn primary" id="quick-test">${icon("play")} Testkampf</button>
            <select id="quick-opp" aria-label="Gegner für Testkampf">${ctx.data.aiBots.map((b) => `<option value="${b.id}">gegen ${esc(b.name)}</option>`).join("")}</select>
            ${arenaSelect()}
            <button class="btn ghost" id="publish">${icon("upload")} Für Rangliste einreichen</button>
          </div>
          <p class="muted small" id="pub-status">${pub ? `Eingereicht am ${esc(pub.at)}. Andere Spieler kämpfen gegen diese Version.` : "Noch nicht eingereicht – reiche deinen Bot ein, um in der Rangliste zu kämpfen."}</p>
          ${keybarHTML()}
          <div class="editor-host"></div>
        </div>
        <div class="panel arena-ref">
          <div class="my-loadout">
            <h3>Dein Roboter</h3>
            <div class="mini-parts">${loadoutBadges(p().loadout)}</div>
            <a class="btn small ghost" href="#/werkstatt">${icon("wrench")} Ausrüstung ändern</a>
          </div>
          <h3>${icon("book")} Befehle in der Arena</h3>
          ${ARENA_COMMANDS.map((g) => `
            <details ${g.group.startsWith("Sensoren") || g.group.startsWith("Bewegen") ? "open" : ""}>
              <summary>${esc(g.group)}</summary>
              <ul class="ref-list">${g.items.map(([sig, d]) => `<li><code>${esc(sig)}</code><span>${esc(d)}</span></li>`).join("")}</ul>
            </details>`).join("")}
          <p class="fineprint">Wichtig: Pro <code>update()</code> nur <b>eine</b> Aktion! Sensoren darfst du so oft benutzen, wie du willst. Variablen außerhalb von <code>update()</code> merken sich Werte zwischen den Zügen (mit <code>global</code>).</p>
        </div>
      </div>`;
    editor = createEditor(body, $(".editor-host", body), {
      value: p().arena.code,
      onChange: (code) => {
        clearTimeout(editor._t);
        editor._t = setTimeout(() => ctx.api.saveArenaCode(code), 500);
      },
    });
    bindArenaSelect();
    $("#quick-test").onclick = (e) => {
      const opp = $("#quick-opp").value;
      const ai = ctx.data.aiBots.find((b) => b.id === opp);
      editor.clearMarks();
      fight(e.currentTarget, () => ctx.api.training(opp, arenaChoice, editor.value), () => `Testkampf gegen ${ai.name}`);
    };
    $("#publish").onclick = async (e) => {
      const pbtn = e.currentTarget;
      pbtn.disabled = true;
      try {
        ctx.update(await ctx.api.publish(editor.value));
        $("#pub-status").textContent = "Eingereicht! Andere Spieler kämpfen jetzt gegen diese Version.";
        toast("Dein Bot ist in der Rangliste!", "good");
        sfx("unlock");
      } catch (err) {
        toast(friendly(err), "bad");
      } finally {
        pbtn.disabled = false;
      }
    };
    setTimeout(() => editor.refresh(), 0);
  } else if (tab === "training") {
    renderTraining();
  } else if (tab === "rangliste") {
    const a = p().arena;
    body.innerHTML = `
      <div class="ranked-grid">
        <div class="panel ranked-box">
          <h3>Ranglisten-Kampf</h3>
          <p>Dein <b>eingereichter</b> Bot kämpft gegen einen Gegner mit ähnlicher Elo-Zahl${ctx.api.mode === "local" ? " (andere Konten auf diesem Gerät oder KI-Geister)" : ""}.</p>
          <div class="stat-row">
            <div class="stat"><b>${a.elo}</b><span>Elo</span></div>
            <div class="stat"><b>${a.wins}/${a.losses}/${a.draws}</b><span>S/N/U</span></div>
            <div class="stat"><b id="ranked-left">${ctx.state.info.ranked_left}</b><span>Kämpfe heute übrig</span></div>
          </div>
          ${a.published ? "" : `<p class="banner warn">Du hast noch keinen Bot eingereicht. Das geht im Tab <a href="#/arena/bot">Mein Bot</a>.</p>`}
          <button class="btn primary big" id="ranked-go" ${a.published && ctx.state.info.ranked_left > 0 ? "" : "disabled"}>${icon("arena")} Kampf suchen</button>
          <p class="fineprint">Ligen: Bronze · Silber (1100) · Gold (1250) · Platin (1400) · Diamant (1550) · Meister-Coder (1700)</p>
        </div>
        <div class="panel">
          <h3>Rangliste ${ctx.api.mode === "local" ? "(dieses Gerät)" : ""}</h3>
          <div class="leaderboard">Lädt …</div>
        </div>
      </div>`;
    $("#ranked-go").onclick = (e) => fight(e.currentTarget, () => ctx.api.ranked(null), (r) => `Ranglisten-Kampf gegen ${r.opponent?.name || "?"}`)
      .then(() => { $("#ranked-left").textContent = ctx.state.info.ranked_left; loadBoard(); });
    async function loadBoard() {
      try {
        const { players } = await ctx.api.leaderboard();
        $(".leaderboard").innerHTML = `
          <table class="lb-table"><thead><tr><th>#</th><th>Name</th><th>Liga</th><th>Elo</th><th>S/N/U</th></tr></thead><tbody>
          ${players.map((pl, i) => `<tr class="${pl.username === p().username ? "me" : ""} ${pl.ai ? "ai" : ""}">
            <td>${i + 1}</td><td>${esc(pl.display_name)}</td><td>${esc(pl.league)}</td><td>${pl.elo}</td>
            <td>${pl.ai ? "–" : `${pl.wins}/${pl.losses}/${pl.draws}`}</td></tr>`).join("")}
          </tbody></table>`;
      } catch (e) {
        $(".leaderboard").textContent = friendly(e);
      }
    }
    loadBoard();
  } else if (tab === "kaempfe") {
    const hist = p().arena.history || [];
    body.innerHTML = `
      <div class="panel">
        <h3>Deine letzten Kämpfe</h3>
        ${hist.length ? `<div class="history">${hist.map((h, i) => {
          const [label, kind] = OUTCOME[h.outcome] || ["?", ""];
          return `<div class="hist-row">
            <span class="tag ${kind}">${label}</span>
            <span class="hist-main"><b>${h.kind === "ranked" ? "Rangliste" : "Training"}${h.defended ? " (verteidigt)" : ""}</b> gegen ${esc(h.opponent)}
              <small class="muted">· ${esc(h.at || "")} · ${esc((ctx.data.arenas.find((a) => a.id === h.arena) || {}).name || h.arena)} · ${h.ticks} Züge</small></span>
            <button class="btn small ghost" data-replay="${i}">${icon("play")} Ansehen</button>
          </div>`;
        }).join("")}</div>` : `<p class="muted">Noch keine Kämpfe. Starte im <a href="#/arena/training">Training</a>!</p>`}
      </div>`;
    $$("[data-replay]").forEach((b) => (b.onclick = async () => {
      const h = hist[+b.dataset.replay];
      b.disabled = true;
      try {
        const result = await ctx.api.replay(h);
        await showFight(result, `Wiederholung: ${h.me} gegen ${h.opponent}`, null);
      } catch (e) {
        toast(friendly(e), "bad");
      } finally {
        b.disabled = false;
      }
    }));
  }

  function renderTraining() {
    const beaten = new Set(p().arena.training_beaten);
    body.innerHTML = `
      <div class="training-head">
        <p>Besiege die Trainings-Roboter nacheinander. Jeder erste Sieg bringt Schrauben. Dein Code kommt aus dem Tab <a href="#/arena/bot">Mein Bot</a>.</p>
        ${arenaSelect()}
      </div>
      <div class="ai-grid">${ctx.data.aiBots.map((b, i) => {
        const prevBeaten = i === 0 || beaten.has(ctx.data.aiBots[i - 1].id);
        return `
        <div class="ai-card ${beaten.has(b.id) ? "beaten" : ""} ${prevBeaten ? "" : "locked"}">
          <div class="ai-tier">Stufe ${b.tier}</div>
          <div class="ai-avatar" style="--c:${(ctx.part(b.loadout.paint) || {}).color || "#888"}">${icon(beaten.has(b.id) ? "check" : prevBeaten ? "arena" : "lock")}</div>
          <h3>${esc(b.name)}</h3>
          <p class="muted small">${esc(b.desc)}</p>
          <div class="mini-parts">${loadoutBadges(b.loadout)}</div>
          <div class="ai-reward">${beaten.has(b.id) ? `${icon("check")} besiegt` : `Belohnung: ${bolts(b.reward)}`}</div>
          <button class="btn ${prevBeaten ? "primary" : ""}" data-ai="${b.id}" ${prevBeaten ? "" : "disabled title='Besiege zuerst die vorherige Stufe'"}>${icon("arena")} Kämpfen</button>
        </div>`;
      }).join("")}</div>`;
    bindArenaSelect();
    $$("[data-ai]").forEach((b) => (b.onclick = () => {
      const ai = ctx.data.aiBots.find((x) => x.id === b.dataset.ai);
      fight(b, () => ctx.api.training(ai.id, arenaChoice, p().arena.code), () => `Training gegen ${ai.name}`)
        .then(() => { if (ctx.state.profile.arena.training_beaten.length !== beaten.size) renderTraining(); });
    }));
  }
  return () => {
    viewer?.destroy();
    if (editor) ctx.api?.saveArenaCode?.(editor.value);
  };
}
