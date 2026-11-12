import { $, esc, icon, toast, md } from "../ui.js";
import { friendly } from "../api.js";
import { setSoundEnabled, sfx } from "../sound.js";

export function render(app, ctx) {
  const p = ctx.state.profile;
  const remote = ctx.api.mode === "remote";
  app.innerHTML = `
    <section class="screen profile-screen">
      <h1>${icon("user")} ${esc(p.display_name)}</h1>
      <p class="muted">Benutzername: <b>${esc(p.username)}</b> · ${remote ? `Online-Konto auf <b>${esc(ctx.api.server)}</b>` : "Konto auf diesem Gerät"}
        ${ctx.state.role === "teacher" ? " · Lehrkraft" : ""}</p>
      <div class="profile-grid">
        <div class="panel">
          <h3>Einstellungen</h3>
          <label>Anzeigename<input id="dn" maxlength="30" value="${esc(p.display_name)}"></label>
          <label class="switch"><input type="checkbox" id="snd" ${p.settings.sound !== false ? "checked" : ""}> ${icon("sound")} Soundeffekte</label>
          <button class="btn primary" id="save-settings">${icon("check")} Speichern</button>
        </div>
        <div class="panel">
          <h3>${icon("school")} Klasse</h3>
          ${remote ? (ctx.state.cls ? `<p>Du bist in der Klasse <b>${esc(ctx.state.cls.name)}</b>.</p>` : "<p>Du bist in keiner Klasse.</p>") +
            `<label>Klassen-Code<input id="cc" maxlength="8" autocapitalize="characters" placeholder="z.B. K7X2QP"></label>
             <button class="btn" id="join">${icon("school")} Beitreten</button>
             <p class="muted small">Tägliche Ranglisten-Kämpfe: ${p.settings.daily_ranked_limit} (legt deine Lehrkraft fest)</p>`
          : `<p class="muted">Klassen, Lehrer-Übersicht und eine gemeinsame Rangliste gibt es mit dem <b>Online-Server</b> (siehe README).</p>`}
        </div>
        ${remote ? "" : `
        <div class="panel">
          <h3>${icon("download")} Sichern & Umziehen</h3>
          <p class="muted small">Lade deinen Fortschritt als Datei herunter – z.B. um ihn auf ein anderes Gerät mitzunehmen.</p>
          <button class="btn" id="export">${icon("download")} Fortschritt herunterladen</button>
          <label class="btn ghost file-btn">${icon("upload")} Fortschritt laden<input type="file" id="import" accept="application/json" hidden></label>
        </div>`}
        <div class="panel">
          <h3>Konto</h3>
          <button class="btn" id="logout">${icon("logout")} Abmelden</button>
          ${remote ? "" : `<details class="danger"><summary>Konto löschen</summary>
            <label>Passwort zur Bestätigung<input id="del-pw" type="password"></label>
            <button class="btn danger-btn" id="delete">Konto endgültig löschen</button></details>`}
          <p class="muted small"><a href="#/hilfe">${icon("book")} Hilfe & Befehlsübersicht</a></p>
        </div>
      </div>
    </section>`;

  $("#save-settings").onclick = async () => {
    try {
      ctx.update(await ctx.api.settings({ sound: $("#snd").checked, display_name: $("#dn").value }));
      setSoundEnabled($("#snd").checked);
      sfx("click");
      toast("Gespeichert!", "good");
    } catch (e) {
      toast(friendly(e), "bad");
    }
  };
  $("#logout").onclick = () => ctx.logout();
  if (remote) {
    $("#join").onclick = async () => {
      try {
        ctx.update(await ctx.api.joinClass($("#cc").value));
        toast(`Willkommen in der Klasse **${ctx.state.cls?.name}**!`, "good");
        render(app, ctx);
      } catch (e) {
        toast(friendly(e), "bad");
      }
    };
  } else {
    $("#export").onclick = () => {
      const blob = new Blob([JSON.stringify(ctx.state.profile, null, 1)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `robofight-${p.username}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    };
    $("#import").onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try {
        const data = JSON.parse(await f.text());
        if (!data.missions || !data.arena) throw new Error("Das ist keine RoboFight-Datei.");
        if (!confirm(`Fortschritt von „${data.display_name || data.username}“ in dieses Konto laden? Dein aktueller Stand wird ersetzt.`)) return;
        data.username = p.username;
        ctx.api.profile = data;
        ctx.update(await ctx.api._load(data));
        toast("Fortschritt geladen!", "good");
        render(app, ctx);
      } catch (err) {
        toast(friendly(err), "bad");
      }
    };
    $("#delete").onclick = async () => {
      if (!confirm("Wirklich löschen? Das kann man nicht rückgängig machen.")) return;
      try {
        await ctx.api.deleteAccount($("#del-pw").value);
        await ctx.logout();
      } catch (e) {
        toast(md(friendly(e)), "bad");
      }
    };
  }
}
