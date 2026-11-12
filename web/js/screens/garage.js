import { $, $$, esc, icon, toast, md } from "../ui.js";
import { load3D } from "../replay-view.js";
import { friendly } from "../api.js";
import { sfx } from "../sound.js";
import { drawRobot } from "./login.js";

export function partIcon(p) {
  const map = { laser: "laser", rocket: "rocket", mines: "mine", railgun: "railgun", turbo: "turbo", armor: "shield",
    battery: "battery", shield: "shield", repair: "wrench", radar: "radar", standard: "engine", scout: "turbo",
    tank: "box", hover: "hover" };
  return map[p.id] || (p.category === "paints" ? "star" : p.category === "hats" ? "crown" : "box");
}

export function loadoutStats(ctx, lo) {
  const ch = ctx.part(lo.chassis) || ctx.part("standard");
  let hp = ch.hp, energy = ch.energy, regen = ch.regen, scan = 5, weight = 0;
  for (const id of [...(lo.weapons || []), ...(lo.modules || [])]) {
    const p = ctx.part(id);
    if (!p) continue;
    weight += p.weight || 0;
    if (id === "battery") { energy += p.energy; regen += p.regen; }
    if (id === "radar") scan = 99;
  }
  return { hp, energy, regen, scan, weight, capacity: ch.capacity, armor: (lo.modules || []).includes("armor") };
}

export async function render(app, ctx) {
  const p = ctx.state.profile;
  const parts = ctx.data.parts;
  const inv = new Set(p.inventory);
  let draft = JSON.parse(JSON.stringify(p.loadout));
  let turntable = null;

  app.innerHTML = `
    <section class="screen garage-screen">
      <div class="garage-grid">
        <div class="panel garage-preview">
          <h1>Deine Werkstatt</h1>
          <div class="turntable-host"></div>
          <div class="stat-bars"></div>
        </div>
        <div class="panel loadout-editor">
          <div class="le-head">
            <h2>Ausrüstung</h2>
            <a class="btn small ghost" href="#/shop">${icon("cart")} Mehr Teile im Shop</a>
          </div>
          <div class="weight-row"></div>
          <div class="le-sections"></div>
          <div class="form-error" hidden></div>
          <div class="le-actions">
            <button class="btn ghost" id="lo-reset">${icon("undo")} Zurücksetzen</button>
            <button class="btn primary" id="lo-save">${icon("check")} Ausrüstung speichern</button>
          </div>
        </div>
      </div>
      <h2>Abzeichen</h2>
      <div class="badge-grid">${ctx.data.badges.map((b) => `
        <div class="badge ${p.badges.includes(b.id) ? "owned" : ""}" title="${esc(b.desc)}">
          <div class="badge-icon">${icon(b.icon)}</div>
          <div class="badge-name">${esc(b.name)}</div>
          <div class="badge-desc">${esc(b.desc)}</div>
        </div>`).join("")}</div>
      <h2>Statistik</h2>
      <div class="stat-row">
        <div class="stat"><b>${ctx.state.info.stars}</b><span>Sterne</span></div>
        <div class="stat"><b>${ctx.state.info.level.xp}</b><span>XP</span></div>
        <div class="stat"><b>${p.stats.runs}</b><span>Programme gestartet</span></div>
        <div class="stat"><b>${p.stats.errors}</b><span>Fehler gefunden</span></div>
        <div class="stat"><b>${p.arena.wins}</b><span>Arena-Siege</span></div>
        <div class="stat"><b>${p.inventory.length}</b><span>Teile</span></div>
      </div>
    </section>`;

  // 3D preview (falls back to the 2D drawing without WebGL)
  try {
    const three = await load3D();
    if (!three.webglAvailable()) throw new Error("no webgl");
    turntable = new three.Turntable($(".turntable-host"), draft, { height: 280 });
  } catch {
    const c = document.createElement("canvas");
    $(".turntable-host").appendChild(c);
    drawRobot(c, 220);
  }

  function slotSection(title, cat, key, max) {
    const items = parts[cat];
    return `
      <div class="le-section">
        <h3>${title} <small class="muted">${max > 1 ? `(bis zu ${max})` : ""}</small></h3>
        <div class="part-chips">
          ${items.map((it) => {
            const owned = inv.has(it.id);
            const sel = max === 1 ? draft[key] === it.id : (draft[key] || []).includes(it.id);
            const swatch = cat === "paints" ? `<span class="swatch" style="--c:${it.color}"></span>` : icon(partIcon({ ...it, category: cat }));
            return `<button class="part-chip ${sel ? "sel" : ""} ${owned ? "" : "locked"}" data-cat="${cat}" data-key="${key}" data-id="${it.id}" data-max="${max}"
              title="${owned ? esc(it.desc || it.name) : "Noch nicht gekauft – im Shop erhältlich"}" ${owned ? "" : "disabled"}>
              ${owned ? swatch : icon("cart")}<span>${esc(it.name)}</span>${it.weight ? `<small>${it.weight} kg</small>` : ""}
            </button>`;
          }).join("")}
        </div>
      </div>`;
  }

  function renderEditor() {
    $(".le-sections").innerHTML =
      slotSection("Chassis", "chassis", "chassis", 1) +
      slotSection("Waffen", "weapons", "weapons", parts.slots.weapons) +
      slotSection("Module", "modules", "modules", parts.slots.modules) +
      slotSection("Lackierung", "paints", "paint", 1) +
      slotSection("Aufsatz", "hats", "hat", 1);
    $$(".part-chip").forEach((b) => (b.onclick = () => {
      const { key, id } = b.dataset;
      const max = +b.dataset.max;
      sfx("click");
      if (max === 1) draft[key] = id;
      else {
        const list = draft[key] || [];
        if (list.includes(id)) draft[key] = list.filter((x) => x !== id);
        else if (list.length < max) draft[key] = [...list, id];
        else draft[key] = [...list.slice(1), id];
      }
      update();
    }));
    update();
  }

  function update() {
    $$(".part-chip").forEach((b) => {
      const { key, id } = b.dataset;
      b.classList.toggle("sel", +b.dataset.max === 1 ? draft[key] === id : (draft[key] || []).includes(id));
    });
    const s = loadoutStats(ctx, draft);
    const over = s.weight > s.capacity;
    $(".weight-row").innerHTML = `
      <span>Gewicht</span>
      <span class="meter ${over ? "over" : ""}"><i style="width:${Math.min(100, (s.weight / s.capacity) * 100)}%"></i></span>
      <b class="${over ? "bad" : ""}">${s.weight} / ${s.capacity} kg</b>`;
    const bar = (label, val, max, unit = "") => `
      <div class="sbar"><span>${label}</span><span class="meter"><i style="width:${Math.min(100, (val / max) * 100)}%"></i></span><b>${val}${unit}</b></div>`;
    $(".stat-bars").innerHTML =
      bar("Lebenspunkte", s.hp, 14) + bar("Energie", s.energy, 18) + bar("Aufladung/Zug", s.regen, 3) +
      `<div class="sbar"><span>Radar</span><span class="meter"><i style="width:${s.scan > 10 ? 100 : 40}%"></i></span><b>${s.scan > 10 ? "ganze Arena" : s.scan + " Felder"}</b></div>` +
      (s.armor ? `<div class="sbar"><span>Panzerung</span><span class="tag">-1 Schaden ab 2</span></div>` : "");
    turntable?.setLoadout(draft);
    const dirty = JSON.stringify(draft) !== JSON.stringify(ctx.state.profile.loadout);
    $("#lo-save").disabled = !dirty;
  }

  $("#lo-reset").onclick = () => {
    draft = JSON.parse(JSON.stringify(ctx.state.profile.loadout));
    renderEditor();
  };
  $("#lo-save").onclick = async () => {
    const err = $(".form-error");
    err.hidden = true;
    try {
      ctx.update(await ctx.api.setLoadout(draft));
      sfx("unlock");
      toast("Ausrüstung gespeichert – dein Roboter ist bereit!", "good");
      update();
    } catch (e) {
      err.innerHTML = md(friendly(e));
      err.hidden = false;
      sfx("error");
    }
  };
  renderEditor();
  return () => turntable?.dispose();
}
