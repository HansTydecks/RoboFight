// Sprite layer.
// Every game object is drawn via draw(ctx, name, x, y, size, opts).
// Right now all sprites are procedural 2D drawings. To switch to custom art later,
// call registerSprite("robot", "img/robot.png") – if an image is registered and
// loaded it is used instead of the procedural drawing (rotated by opts.angle).

const images = {};

export function registerSprite(name, url) {
  const img = new Image();
  img.src = url;
  images[name] = img;
  return img;
}

export function draw(ctx, name, x, y, s, o = {}) {
  const img = images[name];
  if (img && img.complete && img.naturalWidth) {
    ctx.save();
    ctx.globalAlpha *= o.alpha ?? 1;
    ctx.translate(x + s / 2, y + s / 2);
    if (o.angle) ctx.rotate(o.angle);
    ctx.drawImage(img, -s / 2, -s / 2, s, s);
    ctx.restore();
    return;
  }
  const fn = PROCEDURAL[name] || PROCEDURAL.missing;
  ctx.save();
  ctx.globalAlpha *= o.alpha ?? 1;
  fn(ctx, x, y, s, o);
  ctx.restore();
}

export const COLORS = {
  floorA: "#19224d",
  floorB: "#1c2654",
  floorDot: "#27336b",
  wallTop: "#43539a",
  wallSide: "#2a3570",
  wallEdge: "#5b6cc0",
  goal: "#3ee08f",
  robot: "#36d6ff",
  robotDark: "#147a99",
  enemy: "#ff5470",
  boss: "#a77bff",
  crystal: "#7ff3ff",
  laserRobot: "#5ff",
  laserEnemy: "#ff4d6d",
};

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const PROCEDURAL = {
  missing(ctx, x, y, s) {
    ctx.fillStyle = "#f0f";
    ctx.fillRect(x, y, s, s);
  },

  floor(ctx, x, y, s, o) {
    ctx.fillStyle = (o.gx + o.gy) % 2 ? COLORS.floorA : COLORS.floorB;
    ctx.fillRect(x, y, s, s);
    ctx.fillStyle = COLORS.floorDot;
    const d = Math.max(1, s * 0.04);
    ctx.fillRect(x + s * 0.1, y + s * 0.1, d, d);
    ctx.fillRect(x + s * 0.9 - d, y + s * 0.9 - d, d, d);
  },

  wall(ctx, x, y, s) {
    const side = s * 0.16;
    ctx.fillStyle = COLORS.wallSide;
    ctx.fillRect(x, y, s, s);
    ctx.fillStyle = COLORS.wallTop;
    roundRect(ctx, x + 1, y + 1, s - 2, s - side - 1, s * 0.08);
    ctx.fill();
    ctx.strokeStyle = COLORS.wallEdge;
    ctx.lineWidth = Math.max(1, s * 0.03);
    ctx.beginPath();
    ctx.moveTo(x + s * 0.15, y + s * 0.12);
    ctx.lineTo(x + s * 0.85, y + s * 0.12);
    ctx.stroke();
    // rivets
    ctx.fillStyle = COLORS.wallSide;
    const r = s * 0.045;
    for (const [px, py] of [[0.2, 0.35], [0.8, 0.35], [0.2, 0.62], [0.8, 0.62]]) {
      ctx.beginPath();
      ctx.arc(x + s * px, y + s * py, r, 0, Math.PI * 2);
      ctx.fill();
    }
  },

  goal(ctx, x, y, s, o) {
    const t = o.t || 0;
    const cx = x + s / 2, cy = y + s / 2;
    const pulse = 0.5 + 0.5 * Math.sin(t * 3);
    ctx.fillStyle = "rgba(62,224,143,0.18)";
    roundRect(ctx, x + s * 0.08, y + s * 0.08, s * 0.84, s * 0.84, s * 0.18);
    ctx.fill();
    ctx.strokeStyle = COLORS.goal;
    ctx.lineWidth = s * 0.06;
    ctx.globalAlpha *= 0.5 + 0.5 * pulse;
    ctx.beginPath();
    ctx.arc(cx, cy, s * (0.28 + 0.06 * pulse), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1 * (o.alpha ?? 1);
    ctx.fillStyle = COLORS.goal;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.12, 0, Math.PI * 2);
    ctx.fill();
  },

  crystal(ctx, x, y, s, o) {
    const t = o.t || 0;
    const bob = Math.sin(t * 3 + (o.gx || 0)) * s * 0.05;
    const cx = x + s / 2, cy = y + s / 2 + bob;
    const sc = o.scale ?? 1;
    const w = s * 0.22 * sc, h = s * 0.32 * sc;
    ctx.shadowColor = COLORS.crystal;
    ctx.shadowBlur = s * 0.3;
    const g = ctx.createLinearGradient(cx - w, cy - h, cx + w, cy + h);
    g.addColorStop(0, "#e6fdff");
    g.addColorStop(0.5, COLORS.crystal);
    g.addColorStop(1, "#7b6cff");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(cx, cy - h);
    ctx.lineTo(cx + w, cy - h * 0.2);
    ctx.lineTo(cx, cy + h);
    ctx.lineTo(cx - w, cy - h * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = Math.max(1, s * 0.02);
    ctx.beginPath();
    ctx.moveTo(cx - w, cy - h * 0.2);
    ctx.lineTo(cx + w, cy - h * 0.2);
    ctx.stroke();
  },

  target(ctx, x, y, s, o) {
    const cx = x + s / 2, cy = y + s / 2;
    ctx.fillStyle = "#555e8f";
    ctx.fillRect(cx - s * 0.04, cy + s * 0.15, s * 0.08, s * 0.3);
    const rings = ["#ff5470", "#fff", "#ff5470", "#fff"];
    rings.forEach((c, i) => {
      ctx.fillStyle = o.flash ? "#fff" : c;
      ctx.beginPath();
      ctx.arc(cx, cy, s * (0.34 - i * 0.08), 0, Math.PI * 2);
      ctx.fill();
    });
  },

  sentry(ctx, x, y, s, o) {
    const t = o.t || 0;
    const cx = x + s / 2, cy = y + s / 2;
    ctx.fillStyle = "#2b2f4a";
    roundRect(ctx, x + s * 0.18, y + s * 0.5, s * 0.64, s * 0.34, s * 0.08);
    ctx.fill();
    ctx.fillStyle = o.flash ? "#fff" : "#4a3050";
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = COLORS.enemy;
    ctx.lineWidth = s * 0.05;
    ctx.stroke();
    const eye = 0.6 + 0.4 * Math.sin(t * 6);
    ctx.fillStyle = `rgba(255,84,112,${eye})`;
    ctx.shadowColor = COLORS.enemy;
    ctx.shadowBlur = s * 0.25;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.1, 0, Math.PI * 2);
    ctx.fill();
  },

  boss(ctx, x, y, s, o) {
    const t = o.t || 0;
    const cx = x + s / 2, cy = y + s / 2;
    const r = s * 0.46;
    ctx.fillStyle = o.flash ? "#fff" : "#3a2466";
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = Math.PI / 6 + (i * Math.PI) / 3 + t * 0.4;
      ctx.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = COLORS.boss;
    ctx.lineWidth = s * 0.06;
    ctx.stroke();
    // charge ring: full when ready to fire
    const ready = o.cooldown === 0;
    const frac = ready ? 1 : 1 - o.cooldown / 5;
    ctx.strokeStyle = ready ? COLORS.enemy : "rgba(255,84,112,0.5)";
    ctx.lineWidth = s * 0.05;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.62, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = ready ? COLORS.enemy : "#ff9db0";
    ctx.shadowColor = COLORS.enemy;
    ctx.shadowBlur = ready ? s * 0.4 : s * 0.1;
    ctx.beginPath();
    ctx.arc(cx, cy, s * 0.13, 0, Math.PI * 2);
    ctx.fill();
  },

  friend(ctx, x, y, s, o) {
    ctx.translate(x + s * 0.1, y + s * 0.1);
    PROCEDURAL.robot(ctx, 0, 0, s * 0.8, { ...o, angle: Math.PI / 2, color: "#4ee06a", colorDark: "#1d7a31" });
  },

  robot(ctx, x, y, s, o) {
    const cx = x + s / 2, cy = y + s / 2;
    const dead = o.dead;
    ctx.translate(cx, cy);
    ctx.rotate(o.angle || 0);
    if (dead) ctx.rotate(0.35);
    const body = dead ? "#555b77" : (o.color || COLORS.robot);
    const dark = dead ? "#2c2f40" : (o.colorDark || COLORS.robotDark);
    // treads
    ctx.fillStyle = "#151a35";
    roundRect(ctx, -s * 0.36, -s * 0.42, s * 0.72, s * 0.17, s * 0.06);
    ctx.fill();
    roundRect(ctx, -s * 0.36, s * 0.25, s * 0.72, s * 0.17, s * 0.06);
    ctx.fill();
    ctx.fillStyle = "#30386a";
    for (let i = -3; i <= 3; i++) {
      ctx.fillRect(i * s * 0.1 - s * 0.015, -s * 0.4, s * 0.03, s * 0.13);
      ctx.fillRect(i * s * 0.1 - s * 0.015, s * 0.27, s * 0.03, s * 0.13);
    }
    // body
    ctx.fillStyle = o.hurt ? "#ff8095" : body;
    roundRect(ctx, -s * 0.3, -s * 0.28, s * 0.6, s * 0.56, s * 0.14);
    ctx.fill();
    ctx.strokeStyle = dark;
    ctx.lineWidth = s * 0.04;
    ctx.stroke();
    // visor (front = +x)
    ctx.fillStyle = "#0d1230";
    roundRect(ctx, s * 0.06, -s * 0.17, s * 0.2, s * 0.34, s * 0.07);
    ctx.fill();
    if (!dead) {
      ctx.fillStyle = "#b8ffff";
      ctx.shadowColor = "#5ff";
      ctx.shadowBlur = s * 0.2;
      ctx.beginPath();
      ctx.arc(s * 0.17, -s * 0.07, s * 0.045, 0, Math.PI * 2);
      ctx.arc(s * 0.17, s * 0.07, s * 0.045, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    // antenna
    ctx.strokeStyle = dark;
    ctx.lineWidth = s * 0.03;
    ctx.beginPath();
    ctx.moveTo(-s * 0.15, 0);
    ctx.lineTo(-s * 0.26, -s * 0.12);
    ctx.stroke();
    ctx.fillStyle = dead ? "#444" : COLORS.goal;
    ctx.beginPath();
    ctx.arc(-s * 0.26, -s * 0.12, s * 0.04, 0, Math.PI * 2);
    ctx.fill();
  },
};
