// Arena renderer: draws one (interpolated) moment of a replay onto a canvas.
import { draw, COLORS } from "./sprites.js";

const DIR_ANGLE = { E: 0, S: Math.PI / 2, W: Math.PI, N: -Math.PI / 2 };
const DIR_VEC = { E: [1, 0], S: [0, 1], W: [-1, 0], N: [0, -1] };

const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class Arena {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.map = null;
    this.tile = 32;
    this.time = 0;
  }

  setMap(map) {
    this.map = map;
    this.wallSet = new Set(map.walls.map(([x, y]) => `${x},${y}`));
    this.resize();
  }

  resize() {
    if (!this.map) return;
    const box = this.canvas.parentElement.getBoundingClientRect();
    const maxW = Math.max(200, box.width);
    const maxH = Math.max(200, Math.min(window.innerHeight * 0.55, 560));
    const tile = Math.floor(Math.min(maxW / this.map.width, maxH / this.map.height, 72));
    this.tile = Math.max(16, tile);
    const dpr = window.devicePixelRatio || 1;
    const w = this.tile * this.map.width, h = this.tile * this.map.height;
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /** Render the transition from frame a to frame b at progress p (0..1). */
  render(a, b, p, extra = {}) {
    const { ctx, map } = this;
    if (!map || !a) return;
    const s = this.tile;
    const t = (this.time = performance.now() / 1000);
    b = b || a;
    const ep = ease(p);
    const events = b === a ? [] : b.events || [];
    const has = (type) => events.find((e) => e.type === type);

    ctx.save();
    const dmg = has("damage");
    if (dmg && p < 0.5) {
      const k = (0.5 - p) * 2 * s * 0.08;
      ctx.translate(Math.sin(p * 60) * k, Math.cos(p * 50) * k);
    }

    // floor + walls + goal
    for (let y = 0; y < map.height; y++) {
      for (let x = 0; x < map.width; x++) {
        const px = x * s, py = y * s;
        if (this.wallSet.has(`${x},${y}`)) draw(ctx, "wall", px, py, s, { gx: x, gy: y });
        else draw(ctx, "floor", px, py, s, { gx: x, gy: y });
      }
    }
    if (map.goal) draw(ctx, "goal", map.goal[0] * s, map.goal[1] * s, s, { t });

    // crystals (fade out the ones picked up during this transition)
    const bSet = new Set(b.crystals.map(([x, y]) => `${x},${y}`));
    for (const [x, y] of a.crystals) {
      const picked = !bSet.has(`${x},${y}`);
      draw(ctx, "crystal", x * s, y * s, s, {
        t, gx: x, alpha: picked ? 1 - ep : 1, scale: picked ? 1 + ep * 0.6 : 1,
      });
    }

    // entities
    const hitIds = new Set(events.filter((e) => e.type === "hit").map((e) => e.id));
    a.entities.forEach((ea, i) => {
      const eb = b.entities[i] || ea;
      if (ea.hp <= 0) return;
      const dying = eb.hp <= 0;
      const x = lerp(ea.x, eb.x, ep), y = lerp(ea.y, eb.y, ep);
      const flash = hitIds.has(ea.id) && p > 0.25 && p < 0.6;
      draw(ctx, ea.kind, x * s, y * s, s, {
        t, alpha: dying ? Math.max(0, 1 - p * 1.6) : 1, flash, cooldown: eb.cooldown,
      });
      if (ea.max_hp > 1 && !dying) this._hpBar(x * s, y * s - s * 0.12, s, eb.hp / eb.max_hp);
    });

    // robot
    const ra = a.robot, rb = b.robot;
    let rx = lerp(ra.x, rb.x, ep), ry = lerp(ra.y, rb.y, ep);
    const bump = has("bump");
    if (bump) {
      const k = Math.sin(p * Math.PI) * 0.18;
      rx += (bump.x - ra.x) * k;
      ry += (bump.y - ra.y) * k;
    }
    const angle = lerpAngle(DIR_ANGLE[ra.dir], DIR_ANGLE[rb.dir], ep);
    const dead = (p > 0.5 ? rb.hp : ra.hp) <= 0;
    draw(ctx, "robot", rx * s, ry * s, s, {
      angle, dead, hurt: dmg && p > 0.3 && p < 0.7, t,
    });

    // effects
    for (const ev of events) this._effect(ev, p, s, t);
    if (has("noenergy")) this._floatText("Keine Energie!", rx, ry, p, "#ffb020");
    if (bump && p < 0.9) this._floatText("Autsch!", rx, ry, p, "#ffb020");

    if (extra.bubble) this._bubble(extra.bubble, rx, ry, s);
    ctx.restore();
  }

  _hpBar(x, y, s, frac) {
    const { ctx } = this;
    ctx.fillStyle = "rgba(0,0,0,0.6)";
    ctx.fillRect(x + s * 0.1, y, s * 0.8, s * 0.1);
    ctx.fillStyle = frac > 0.5 ? COLORS.goal : frac > 0.25 ? "#ffb020" : COLORS.enemy;
    ctx.fillRect(x + s * 0.1, y, s * 0.8 * frac, s * 0.1);
  }

  _effect(ev, p, s, t) {
    const { ctx } = this;
    if (ev.type === "laser") {
      if (p > 0.75) return;
      const alpha = p < 0.35 ? 1 : 1 - (p - 0.35) / 0.4;
      const fx = (ev.fx + 0.5) * s, fy = (ev.fy + 0.5) * s;
      let tx = (ev.tx + 0.5) * s, ty = (ev.ty + 0.5) * s;
      if (!ev.hit) {
        // stop at the wall's edge
        const dx = Math.sign(ev.tx - ev.fx), dy = Math.sign(ev.ty - ev.fy);
        tx -= dx * s * 0.5;
        ty -= dy * s * 0.5;
      }
      const grow = Math.min(1, p / 0.2);
      tx = fx + (tx - fx) * grow;
      ty = fy + (ty - fy) * grow;
      const col = ev.by === "robot" ? COLORS.laserRobot : COLORS.laserEnemy;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = col;
      ctx.shadowColor = col;
      ctx.shadowBlur = s * 0.4;
      ctx.lineCap = "round";
      ctx.lineWidth = s * 0.14;
      ctx.beginPath();
      ctx.moveTo(fx, fy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = s * 0.05;
      ctx.stroke();
      ctx.restore();
    } else if (ev.type === "explode") {
      if (p < 0.25) return;
      const q = (p - 0.25) / 0.75;
      const cx = (ev.x + 0.5) * s, cy = (ev.y + 0.5) * s;
      ctx.save();
      ctx.globalAlpha = 1 - q;
      ctx.fillStyle = "#ffcf5a";
      ctx.beginPath();
      ctx.arc(cx, cy, s * (0.2 + q * 0.5), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ff6a3d";
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 + i;
        const d = s * (0.2 + q * 0.9);
        ctx.fillRect(cx + Math.cos(a) * d - s * 0.05, cy + Math.sin(a) * d - s * 0.05, s * 0.1, s * 0.1);
      }
      ctx.restore();
    } else if (ev.type === "pickup") {
      const cx = (ev.x + 0.5) * s, cy = (ev.y + 0.5) * s;
      ctx.save();
      ctx.globalAlpha = 1 - p;
      ctx.strokeStyle = COLORS.crystal;
      ctx.lineWidth = s * 0.05;
      ctx.beginPath();
      ctx.arc(cx, cy, s * (0.2 + p * 0.5), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      this._floatText("+1", ev.x, ev.y, p, COLORS.crystal);
    }
  }

  _floatText(text, gx, gy, p, color) {
    const { ctx } = this, s = this.tile;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - p);
    ctx.fillStyle = color;
    ctx.font = `bold ${Math.round(s * 0.32)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.strokeStyle = "rgba(0,0,0,0.6)";
    ctx.lineWidth = 3;
    const x = (gx + 0.5) * s, y = (gy - 0.05 - p * 0.4) * s;
    ctx.strokeText(text, x, y);
    ctx.fillText(text, x, y);
    ctx.restore();
  }

  _bubble(text, gx, gy, s) {
    const { ctx } = this;
    const fs = Math.max(12, Math.round(s * 0.3));
    ctx.save();
    ctx.font = `600 ${fs}px system-ui, sans-serif`;
    const w = Math.min(ctx.measureText(text).width + fs, this.canvas.clientWidth - 8);
    const h = fs * 1.7;
    let x = (gx + 0.5) * s - w / 2;
    x = Math.max(4, Math.min(x, this.canvas.clientWidth - w - 4));
    let y = gy * s - h - s * 0.05;
    if (y < 2) y = (gy + 1) * s + s * 0.05;
    ctx.fillStyle = "#fff";
    ctx.shadowColor = "rgba(0,0,0,0.4)";
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(x, y, w, h, h / 2) : ctx.rect(x, y, w, h);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#121735";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + w / 2, y + h / 2, w - fs * 0.6);
    ctx.restore();
  }
}

export { DIR_VEC };
