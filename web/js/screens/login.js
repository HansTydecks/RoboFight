import { $, $$, esc, icon, toast, md } from "../ui.js";
import { RemoteBackend, friendly } from "../api.js";
import { draw } from "../sprites.js";

export function render(app, ctx) {
  let mode = "local";
  let tab = "login";
  const localUsers = Object.keys(ctx.newLocalBackend().users());
  if (!localUsers.length) tab = "register";
  let server = ctx.config.server || "";

  app.innerHTML = `
    <section class="screen login-screen">
      <div class="login-hero">
        <canvas class="hero-robot big" aria-hidden="true"></canvas>
        <h1>Robo<b>Fight</b></h1>
        <p class="lead">Programmiere deinen eigenen Roboter mit <b>echtem Python</b>.</p>
        <ul class="feature-list">
          <li>${icon("map")} 16 Missionen: von <code>robot.move()</code> bis zu Funktionen, Listen und Dictionaries</li>
          <li>${icon("wrench")} Schalte Waffen, Module und Lackierungen frei – mit Wissen, nicht mit Geld</li>
          <li>${icon("arena")} Lass deinen Roboter in der 3D-Arena gegen andere antreten</li>
        </ul>
      </div>
      <div class="login-card panel">
        <div class="seg mode-seg" role="tablist">
          <button data-mode="local" class="active">${icon("user")} Auf diesem Gerät</button>
          <button data-mode="remote">${icon("school")} Online / Schule</button>
        </div>
        <div class="server-row" hidden>
          <label>Server-Adresse
            <input id="server-url" type="url" placeholder="https://robofight.meine-schule.de" value="${esc(server)}">
          </label>
          <small class="muted" id="server-status"></small>
        </div>
        <div class="seg tab-seg">
          <button data-tab="login">Anmelden</button>
          <button data-tab="register">Neues Konto</button>
        </div>
        <div class="local-users"></div>
        <form id="auth-form" autocomplete="on">
          <label>Benutzername<input name="username" required minlength="3" maxlength="20" autocomplete="username" autocapitalize="off" spellcheck="false"></label>
          <label class="reg-only">Anzeigename <small class="muted">(optional – so sehen dich andere)</small><input name="display_name" maxlength="30"></label>
          <label>Passwort<input name="password" type="password" required minlength="4" autocomplete="current-password"></label>
          <label class="reg-only">Passwort wiederholen<input name="password2" type="password" minlength="4" autocomplete="new-password"></label>
          <div class="reg-only remote-only role-row">
            <span>Ich bin</span>
            <label class="radio"><input type="radio" name="role" value="student" checked> Schüler*in</label>
            <label class="radio"><input type="radio" name="role" value="teacher"> Lehrkraft</label>
          </div>
          <label class="reg-only remote-only teacher-only" hidden>Lehrer-Schlüssel <small class="muted">(vom Server-Admin)</small><input name="teacher_key" type="password"></label>
          <label class="reg-only remote-only">Klassen-Code <small class="muted">(optional)</small><input name="class_code" maxlength="8" autocapitalize="characters"></label>
          <div class="form-error" hidden></div>
          <button class="btn primary big" type="submit" id="auth-submit"></button>
        </form>
        <p class="fineprint local-only">Konten auf diesem Gerät bleiben in diesem Browser gespeichert. Für mehrere Geräte nutzt ihr den Online-Server.</p>
      </div>
    </section>`;

  drawRobot($(".hero-robot"));

  const form = $("#auth-form");
  const sync = () => {
    $$(".mode-seg button").forEach((b) => b.classList.toggle("active", b.dataset.mode === mode));
    $$(".tab-seg button").forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
    $(".server-row").hidden = mode !== "remote";
    $$(".reg-only").forEach((el) => (el.hidden = tab !== "register" || (el.classList.contains("remote-only") && mode !== "remote")));
    $$(".local-only").forEach((el) => (el.hidden = mode !== "local"));
    const teacher = form.role?.value === "teacher";
    $$(".teacher-only").forEach((el) => (el.hidden = tab !== "register" || mode !== "remote" || !teacher));
    form.password.autocomplete = tab === "register" ? "new-password" : "current-password";
    form.password2.required = tab === "register";
    $("#auth-submit").textContent = tab === "register" ? "Konto erstellen" : "Los geht's!";
    const lu = $(".local-users");
    lu.hidden = !(mode === "local" && tab === "login" && localUsers.length);
    lu.innerHTML = localUsers.map((u) => `<button type="button" class="user-chip" data-u="${esc(u)}">${icon("user")} ${esc(u)}</button>`).join("");
    $$(".user-chip").forEach((b) => (b.onclick = () => { form.username.value = b.dataset.u; form.password.focus(); }));
    $(".form-error").hidden = true;
  };
  $$(".mode-seg button").forEach((b) => (b.onclick = () => { mode = b.dataset.mode; sync(); if (mode === "remote") probe(); }));
  $$(".tab-seg button").forEach((b) => (b.onclick = () => { tab = b.dataset.tab; sync(); }));
  $$('input[name="role"]').forEach((r) => (r.onchange = sync));

  async function probe() {
    const url = $("#server-url").value.trim();
    const st = $("#server-status");
    if (!url) {
      st.textContent = "Trage die Adresse eures RoboFight-Servers ein.";
      return false;
    }
    st.textContent = "Prüfe Server …";
    const ok = await RemoteBackend.probe(url);
    st.innerHTML = ok ? `${icon("check")} Server gefunden` : `${icon("cross")} Kein RoboFight-Server unter dieser Adresse`;
    st.className = ok ? "ok" : "bad";
    return ok;
  }
  $("#server-url").onchange = probe;

  // auto-detect: game served by the RoboFight server itself
  RemoteBackend.probe(location.origin + location.pathname.replace(/\/[^/]*$/, "")).then((ok) => {
    if (ok && !server) {
      server = location.origin;
      $("#server-url").value = server;
      mode = "remote";
      sync();
      probe();
    }
  });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const err = $(".form-error");
    err.hidden = true;
    const f = Object.fromEntries(new FormData(form));
    if (tab === "register" && f.password !== f.password2) {
      err.textContent = "Die Passwörter sind nicht gleich.";
      err.hidden = false;
      return;
    }
    const btn = $("#auth-submit");
    btn.disabled = true;
    const label = btn.textContent;
    try {
      let api;
      if (mode === "local") {
        if (!ctx.engine.isReady) btn.textContent = "Python lädt …";
        await ctx.engine.ready;
        api = ctx.newLocalBackend();
      } else {
        const url = $("#server-url").value.trim();
        if (!(await probe())) throw Object.assign(new Error("Server nicht erreichbar."), { friendly: true });
        api = ctx.newRemoteBackend(url);
      }
      btn.textContent = "Einen Moment …";
      const payload = tab === "register"
        ? await api.register({ username: f.username, password: f.password, display_name: f.display_name || null,
          role: f.role || "student", teacher_key: f.teacher_key || null, class_code: f.class_code || null })
        : await api.login({ username: f.username, password: f.password });
      if (tab === "register") toast(`Willkommen, **${payload.profile.display_name}**! Dein Roboter wartet.`, "good");
      await ctx.login(api, payload);
    } catch (ex) {
      err.innerHTML = md(friendly(ex));
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = label;
    }
  };
  sync();
  form.username.focus();
}

function drawRobot(canvas, size = 150) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = canvas.height = size * dpr;
  canvas.style.width = canvas.style.height = size + "px";
  const g = canvas.getContext("2d");
  const loop = () => {
    if (!canvas.isConnected) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, size, size);
    const t = performance.now() / 1000;
    draw(g, "robot", size * 0.1, size * 0.1 + Math.sin(t * 2) * 4, size * 0.8, { angle: -Math.PI / 2 + Math.sin(t) * 0.25, t });
    requestAnimationFrame(loop);
  };
  loop();
}
export { drawRobot };
