import { esc, icon } from "../ui.js";
import { COMMANDS, CONCEPTS, CONCEPT_ORDER, ARENA_COMMANDS } from "../catalog.js";

export function render(app, ctx) {
  const solved = (id) => ctx.missionState(id).solved;
  const known = new Set();
  for (const m of ctx.data.missions) {
    if (ctx.isUnlocked(m.id)) m.api.forEach((a) => known.add(a));
  }
  app.innerHTML = `
    <section class="screen help-screen">
      <h1>${icon("book")} Hilfe & Befehle</h1>
      <div class="help-grid">
        <div class="panel">
          <h3>Kampagne: Befehle, die du schon kennst</h3>
          <ul class="ref-list">${Object.entries(COMMANDS).filter(([k]) => known.has(k) || k === "say").map(([, c]) =>
            `<li><code>${esc(c.sig)}</code><span>${esc(c.desc)}</span></li>`).join("")}</ul>
          <h3>Python-Bausteine</h3>
          <ul class="ref-list">${CONCEPT_ORDER.filter((c) => ctx.data.missions.some((m) => ctx.isUnlocked(m.id) && m.introduces.includes(c))).map((c) =>
            `<li><code>${esc(CONCEPTS[c].sig)}</code><span>${esc(CONCEPTS[c].desc)}</span></li>`).join("")}</ul>
        </div>
        <div class="panel">
          <h3>Arena ${solved(16) ? "" : `<small class="muted">(nach Mission 16)</small>`}</h3>
          ${ARENA_COMMANDS.map((g) => `<h4>${esc(g.group)}</h4><ul class="ref-list">${g.items.map(([s, d]) =>
            `<li><code>${esc(s)}</code><span>${esc(d)}</span></li>`).join("")}</ul>`).join("")}
        </div>
        <div class="panel">
          <h3>So funktioniert RoboFight</h3>
          <ul class="howto">
            <li><b>Sterne:</b> 1 Stern fürs Lösen, 1 für wenige Zeilen Code, 1 für wenige Züge.</li>
            <li><b>Schrauben</b> ${icon("nut")} bekommst du für neue Sterne und Arena-Kämpfe. Im Shop tauschst du sie gegen Teile.</li>
            <li><b>Teile</b> haben ein Gewicht. Jedes Chassis trägt nur eine bestimmte Menge.</li>
            <li><b>Varianten:</b> Viele Missionen haben mehrere Karten. Dein Code muss auf allen funktionieren – so lernst du, allgemein zu denken.</li>
            <li><b>Arena:</b> Pro Zug ruft der Roboter <code>update(robot)</code> auf und macht genau eine Aktion. Alle Roboter handeln gleichzeitig.</li>
            <li><b>Elo:</b> Gewinnst du gegen Stärkere, steigst du schneller auf.</li>
            <li><b>Fehler</b> sind normal! Jeder Fehler zählt fürs Abzeichen „Bug-Jäger“.</li>
          </ul>
        </div>
      </div>
    </section>`;
}
