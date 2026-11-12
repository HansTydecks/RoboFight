import { $, $$, esc, icon, toast, openModal } from "../ui.js";
import { friendly } from "../api.js";

export async function render(app, ctx) {
  const api = ctx.api;
  app.innerHTML = `
    <section class="screen teacher-screen">
      <h1>${icon("school")} Meine Klassen</h1>
      <div class="teacher-grid">
        <div class="panel">
          <h3>Neue Klasse</h3>
          <form id="new-class" class="inline-form">
            <input name="name" placeholder="z.B. 7b Informatik" maxlength="40" required>
            <button class="btn primary">${icon("check")} Anlegen</button>
          </form>
          <div class="class-list">Lädt …</div>
        </div>
        <div class="panel class-detail"><p class="muted">Wähle links eine Klasse aus.</p></div>
      </div>
    </section>`;

  async function loadClasses(selectId) {
    try {
      const { classes } = await api.classes();
      $(".class-list").innerHTML = classes.length ? classes.map((c) => `
        <button class="class-item" data-id="${c.id}">
          <b>${esc(c.name)}</b><span class="code-pill">${esc(c.code)}</span><small>${c.students} Schüler*innen</small>
        </button>`).join("") : `<p class="muted">Noch keine Klasse angelegt.</p>`;
      $$(".class-item").forEach((b) => (b.onclick = () => showClass(+b.dataset.id)));
      if (selectId) showClass(selectId);
      else if (classes[0]) showClass(classes[0].id);
    } catch (e) {
      $(".class-list").textContent = friendly(e);
    }
  }

  async function showClass(id) {
    $$(".class-item").forEach((b) => b.classList.toggle("active", +b.dataset.id === id));
    const box = $(".class-detail");
    box.innerHTML = "Lädt …";
    try {
      const d = await api.classDetail(id);
      const ms = d.missions;
      box.innerHTML = `
        <div class="cd-head">
          <div><h2>${esc(d.class.name)}</h2>
          <p>Klassen-Code: <span class="code-pill big">${esc(d.class.code)}</span> – Schüler*innen geben ihn beim Registrieren oder im Profil ein.</p></div>
          <form class="inline-form" id="limit-form">
            <label>Ranglisten-Kämpfe pro Tag <input type="number" name="limit" min="0" max="100" value="20"></label>
            <button class="btn small">Für alle setzen</button>
          </form>
        </div>
        ${d.students.length ? `
        <div class="table-wrap"><table class="progress-table">
          <thead><tr><th>Name</th><th>Lv</th><th>★</th><th>Elo</th><th>Fehler</th>
          ${ms.map((m) => `<th title="${esc(m.title)} – ${esc(m.concept)}">${m.id}</th>`).join("")}</tr></thead>
          <tbody>${d.students.map((s) => `<tr>
            <td><b>${esc(s.display_name)}</b><br><small class="muted">${esc(s.username)}</small></td>
            <td>${s.level}</td><td>${s.stars}</td><td>${s.elo}</td><td>${s.errors}/${s.runs}</td>
            ${ms.map((m) => {
              const st = s.missions[String(m.id)];
              return `<td class="cell ${st ? "s" + st : "open"}" data-user="${esc(s.username)}" data-m="${m.id}" title="Code ansehen">${st ? "★".repeat(st) : "·"}</td>`;
            }).join("")}</tr>`).join("")}</tbody>
        </table></div>
        <p class="muted small">Tipp: Klicke auf eine Zelle, um den Code anzusehen. Viele leere Zellen in einer Spalte zeigen, wo die Klasse feststeckt.</p>`
        : `<p class="muted">Noch niemand in dieser Klasse.</p>`}`;
      $$(".cell", box).forEach((c) => (c.onclick = async () => {
        try {
          const r = await api.studentCode(id, c.dataset.user, c.dataset.m);
          const m = ms.find((x) => x.id === +c.dataset.m);
          openModal(`<h2>${esc(c.dataset.user)} – Mission ${m.id}: ${esc(m.title)}</h2>
            <pre class="snippet code-view">${esc(r.code || "(noch kein Code)")}</pre>
            <div class="modal-actions"><button class="btn" onclick="document.getElementById('modal').hidden=true">Schließen</button></div>`, { wide: true });
        } catch (e) {
          toast(friendly(e), "bad");
        }
      }));
      $("#limit-form").onsubmit = async (e) => {
        e.preventDefault();
        try {
          const r = await api.classSettings(id, +e.target.limit.value);
          toast(`Limit für alle auf ${r.daily_ranked_limit} gesetzt.`, "good");
        } catch (err) {
          toast(friendly(err), "bad");
        }
      };
    } catch (e) {
      box.textContent = friendly(e);
    }
  }

  $("#new-class").onsubmit = async (e) => {
    e.preventDefault();
    try {
      const c = await api.createClass(e.target.name.value);
      e.target.reset();
      toast(`Klasse angelegt. Code: **${c.code}**`, "good", 6000);
      loadClasses(c.id);
    } catch (err) {
      toast(friendly(err), "bad");
    }
  };
  loadClasses();
}
