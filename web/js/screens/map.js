import { esc, icon, stars } from "../ui.js";
import { drawRobot } from "./login.js";

const CHAPTERS = {
  1: { title: "Kapitel 1: Die Werkstatt", text: "Befehle, Schleifen und Bedingungen – bring deinen Roboter zum Laufen." },
  2: { title: "Kapitel 2: Die Fabrik", text: "Variablen, eigene Funktionen, Listen und Dictionaries. Am Ende wartet die Arena!" },
};

export function render(app, ctx) {
  const ms = ctx.data.missions;
  const card = (m, i) => {
    const st = ctx.missionState(m.id);
    const unlocked = ctx.isUnlocked(m.id);
    const isNext = unlocked && !st.solved;
    const cls = !unlocked ? "locked" : st.solved ? "solved" : "next";
    const inner = `
      <div class="mc-num">${unlocked ? m.id : icon("lock")}</div>
      <div class="mc-body">
        <div class="mc-concept">${esc(m.concept)}${m.type === "arena" ? " · 3D" : ""}</div>
        <div class="mc-title">${esc(m.title)}</div>
        <div class="mc-stars">${stars(st.stars)}</div>
      </div>
      ${isNext ? `<div class="mc-go">${icon("play")}</div>` : ""}`;
    return unlocked
      ? `<a class="mission-card ${cls}" href="#/mission/${m.id}" style="--i:${i}">${inner}</a>`
      : `<div class="mission-card ${cls}" style="--i:${i}" aria-disabled="true">${inner}</div>`;
  };
  const chapters = [...new Set(ms.map((m) => m.chapter || 1))];
  const arenaOpen = ctx.state.info?.arena_unlocked;
  const p = ctx.state.profile;
  const next = ms.find((m) => ctx.isUnlocked(m.id) && !ctx.missionState(m.id).solved);

  app.innerHTML = `
    <section class="screen map-screen">
      <div class="hero">
        <div class="hero-text">
          <h1>Hallo ${esc(p.display_name)}!</h1>
          <p>${next ? `Als Nächstes: <b>Mission ${next.id} – ${esc(next.title)}</b>. Jede Mission bringt dir ein neues Konzept bei und schaltet neue Teile für deinen Roboter frei.`
            : "Du hast alle Missionen geschafft! Hol dir überall 3 Sterne oder zeig dein Können in der Arena."}</p>
          ${next ? `<a class="btn primary" href="#/mission/${next.id}">${icon("play")} Weiterspielen</a>` : ""}
        </div>
        <canvas class="hero-robot" aria-hidden="true"></canvas>
      </div>
      ${chapters.map((c) => {
        const list = ms.filter((m) => (m.chapter || 1) === c);
        const done = list.filter((m) => ctx.missionState(m.id).solved).length;
        return `
        <div class="chapter">
          <div class="chapter-head">
            <h2>${esc(CHAPTERS[c]?.title || "Kapitel " + c)}</h2>
            <span class="chapter-progress">${done}/${list.length}</span>
          </div>
          <p class="muted">${esc(CHAPTERS[c]?.text || "")}</p>
          <div class="mission-grid">${list.map((m) => card(m, ms.indexOf(m))).join("")}</div>
        </div>`;
      }).join("")}
      <div class="chapter">
        <div class="chapter-head"><h2>Die Arena</h2></div>
        <a class="mission-card arena-card ${arenaOpen ? "next" : "locked"}" href="${arenaOpen ? "#/arena" : "#/"}">
          <div class="mc-num">${icon(arenaOpen ? "arena" : "lock")}</div>
          <div class="mc-body">
            <div class="mc-concept">${arenaOpen ? "Offen!" : "Nach Mission 16"}</div>
            <div class="mc-title">3D-Arena: Bot gegen Bot</div>
            <div class="mc-sub">Training gegen 5 KI-Gegner, Rangliste mit Ligen von Bronze bis Meister-Coder.</div>
          </div>
        </a>
      </div>
    </section>`;
  drawRobot(app.querySelector(".hero-robot"), 120);
}
