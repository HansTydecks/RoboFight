import { $, $$, esc, icon, toast, md, bolts } from "../ui.js";
import { load3D } from "../replay-view.js";
import { friendly } from "../api.js";
import { sfx } from "../sound.js";
import { partIcon } from "./garage.js";

const CATS = [
  ["chassis", "Chassis"], ["weapons", "Waffen"], ["modules", "Module"], ["paints", "Lackierungen"], ["hats", "Aufsätze"],
];

function statLine(it, cat) {
  if (cat === "chassis") return `❤ ${it.hp} · ⚡ ${it.energy} (+${it.regen}/Zug) · 🎒 ${it.capacity} kg`;
  if (cat === "weapons") return `💥 ${it.damage} Schaden · ⚡ ${it.cost} · ${it.cooldown ? "⏱ " + it.cooldown + " Züge" : "kein Abklingen"} · ${it.weight} kg`;
  if (cat === "modules") return `${it.cost ? "⚡ " + it.cost + " · " : ""}${it.cooldown ? "⏱ " + it.cooldown + " Züge · " : ""}${it.weight} kg${it.api ? "" : " · passiv"}`;
  return "";
}

export async function render(app, ctx) {
  let cat = "chassis";
  let preview = null;
  let tryOn = null;

  app.innerHTML = `
    <section class="screen shop-screen">
      <div class="shop-head">
        <div>
          <h1>Ersatzteil-Shop</h1>
          <p class="muted">Schrauben verdienst du mit Missionen und in der Arena. Viele Teile werden erst durch neue Programmier-Konzepte freigeschaltet.</p>
        </div>
        <div class="wallet">${bolts(ctx.state.profile.bolts)}</div>
      </div>
      <div class="shop-grid">
        <div>
          <div class="seg shop-tabs">${CATS.map(([id, n]) => `<button data-cat="${id}">${n}</button>`).join("")}</div>
          <div class="shop-items"></div>
        </div>
        <div class="panel shop-preview">
          <h3>Anprobieren</h3>
          <div class="preview-host"></div>
          <p class="muted small" id="preview-text">Tippe ein Teil an, um es an deinem Roboter zu sehen.</p>
        </div>
      </div>
    </section>`;

  try {
    const three = await load3D();
    if (three.webglAvailable()) preview = new three.Turntable($(".preview-host"), ctx.state.profile.loadout, { height: 240 });
  } catch {
    /* no 3D */
  }

  function tryLoadout(it, c) {
    const lo = JSON.parse(JSON.stringify(ctx.state.profile.loadout));
    if (c === "chassis") lo.chassis = it.id;
    if (c === "paints") lo.paint = it.id;
    if (c === "hats") lo.hat = it.id;
    if (c === "weapons" && !lo.weapons.includes(it.id)) lo.weapons = [it.id, ...lo.weapons].slice(0, 2);
    if (c === "modules" && !lo.modules.includes(it.id)) lo.modules = [it.id, ...lo.modules].slice(0, 2);
    return lo;
  }

  function renderItems() {
    $$(".shop-tabs button").forEach((b) => b.classList.toggle("active", b.dataset.cat === cat));
    const status = Object.fromEntries((ctx.state.info.shop || []).map((s) => [s.id, s]));
    $(".shop-items").innerHTML = ctx.data.parts[cat].map((it) => {
      const st = status[it.id] || {};
      const owned = st.owned;
      const locked = st.locked;
      const visual = cat === "paints" ? `<span class="swatch big" style="--c:${it.color}"></span>` : icon(partIcon({ ...it, category: cat }));
      return `
        <div class="shop-card ${owned ? "owned" : ""} ${locked ? "locked" : ""} ${tryOn === it.id ? "trying" : ""}" data-id="${it.id}">
          <div class="shop-icon">${locked ? icon("lock") : visual}</div>
          <div class="shop-body">
            <div class="shop-name">${esc(it.name)}</div>
            ${it.desc ? `<div class="shop-desc">${esc(it.desc)}</div>` : ""}
            <div class="shop-stats">${statLine(it, cat)}</div>
            ${locked ? `<div class="shop-lock">${icon("lock")} ${esc(locked)}</div>` : ""}
          </div>
          <div class="shop-buy">
            ${owned ? `<span class="tag good">${icon("check")} Besitzt du</span>`
              : `<button class="btn small ${st.affordable && !locked ? "primary" : ""}" data-buy="${it.id}" ${locked ? "disabled" : ""}>${bolts(it.price)}</button>`}
          </div>
        </div>`;
    }).join("");
    $$(".shop-card").forEach((card) => (card.onclick = (e) => {
      if (e.target.closest("[data-buy]")) return;
      const it = ctx.data.parts[cat].find((x) => x.id === card.dataset.id);
      tryOn = it.id;
      preview?.setLoadout(tryLoadout(it, cat));
      $("#preview-text").innerHTML = `<b>${esc(it.name)}</b> – ${esc(it.desc || "")}`;
      $$(".shop-card").forEach((c) => c.classList.toggle("trying", c === card));
    }));
    $$("[data-buy]").forEach((b) => (b.onclick = async () => {
      const id = b.dataset.buy;
      const it = ctx.data.parts[cat].find((x) => x.id === id);
      if (!confirm(`${it.name} für ${it.price} Schrauben kaufen?`)) return;
      b.disabled = true;
      try {
        const r = await ctx.api.buy(id);
        ctx.update(r);
        sfx("unlock");
        toast(`**${it.name}** gekauft! Baue es in der [Werkstatt](#/werkstatt) ein.`, "good", 4500);
        for (const bid of r.change?.new_badges || []) {
          const bd = ctx.data.badges.find((x) => x.id === bid);
          if (bd) toast(`Neues Abzeichen: **${bd.name}**`, "good");
        }
        $(".wallet").innerHTML = bolts(ctx.state.profile.bolts);
        renderItems();
      } catch (e) {
        toast(friendly(e), "bad");
        sfx("error");
        b.disabled = false;
      }
    }));
  }

  $$(".shop-tabs button").forEach((b) => (b.onclick = () => { cat = b.dataset.cat; renderItems(); }));
  renderItems();
  return () => preview?.dispose();
}

export { md };
