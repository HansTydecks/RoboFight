// 3D renderer (three.js) for arena fights and – optionally – campaign missions.
// Same interface as the 2D Arena renderer: setMap(map), render(a, b, p, extra), resize().
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { buildRobot, animateRobot, buildObject } from "./models.js";

const DIR_ANGLE = { E: 0, S: -Math.PI / 2, W: Math.PI, N: Math.PI / 2 };
const DIR_VEC = { E: [1, 0], S: [0, 1], W: [-1, 0], N: [0, -1] };
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
function lerpAngle(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}
const BOT_COLORS = ["#36d6ff", "#ff5470", "#4ee06a", "#ffb020"];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

export function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch {
    return false;
  }
}

/** Campaign frames have a single `robot`; arena frames have `bots`. Normalise to arena shape. */
const normCache = new WeakMap();
function norm(f) {
  if (!f || f.bots) return f;
  let n = normCache.get(f);
  if (!n) {
    n = { ...f, bots: [{ id: 0, ...f.robot, alive: f.robot.hp > 0, shield: 0 }], rockets: [], mines: [] };
    normCache.set(f, n);
  }
  return n;
}

export class Scene3D {
  constructor(container, { labels = true } = {}) {
    this.container = container;
    this.meta = { bots: [] };
    this.labelsEnabled = labels;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.canvas = this.renderer.domElement;
    this.canvas.className = "scene3d-canvas";
    container.appendChild(this.canvas);
    this.overlay = document.createElement("div");
    this.overlay.className = "scene3d-overlay";
    container.appendChild(this.overlay);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#0b1028");
    this.scene.fog = new THREE.Fog("#0b1028", 18, 40);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = 1.35;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 30;

    this.scene.add(new THREE.HemisphereLight("#cfe0ff", "#1a1f3d", 1.1));
    this.sun = new THREE.DirectionalLight("#ffffff", 1.8);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);

    this.world = new THREE.Group();
    this.scene.add(this.world);
    this.dyn = new THREE.Group();
    this.scene.add(this.dyn);
    this.objects = new Map(); // key -> Object3D
    this.labels = new Map();
    this.effects = [];
    this.effectKey = null;
    this.clock = new THREE.Clock();

    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(container);
  }

  setMeta(meta) {
    this.meta = meta || { bots: [] };
    this._clearDynamic();
  }

  setMap(map) {
    this.map = map;
    this._clearDynamic();
    this.world.clear();
    const { width: w, height: h } = map;
    const walls = new Set(map.walls.map(([x, y]) => `${x},${y}`));
    const floorCount = w * h - walls.size;
    const floorGeo = new THREE.BoxGeometry(0.96, 0.1, 0.96);
    const floor = new THREE.InstancedMesh(floorGeo, new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.2 }), floorCount);
    const wallGeo = new THREE.BoxGeometry(1, 0.7, 1);
    const wallMesh = new THREE.InstancedMesh(wallGeo, new THREE.MeshStandardMaterial({ color: "#43539a", roughness: 0.6, metalness: 0.3 }), Math.max(1, walls.size));
    const m = new THREE.Matrix4();
    const cA = new THREE.Color("#1c2654"), cB = new THREE.Color("#222d63");
    let fi = 0, wi = 0;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (walls.has(`${x},${y}`)) {
          m.makeTranslation(x, 0.35, y);
          wallMesh.setMatrixAt(wi++, m);
        } else {
          m.makeTranslation(x, -0.05, y);
          floor.setMatrixAt(fi, m);
          floor.setColorAt(fi++, (x + y) % 2 ? cA : cB);
        }
      }
    }
    floor.receiveShadow = true;
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    this.world.add(floor, wallMesh);
    // wall top trim
    const trim = new THREE.InstancedMesh(new THREE.BoxGeometry(1.0, 0.04, 1.0),
      new THREE.MeshStandardMaterial({ color: "#6a7cd6", emissive: "#2a3570", emissiveIntensity: 0.6 }), Math.max(1, walls.size));
    wi = 0;
    for (const key of walls) {
      const [x, y] = key.split(",").map(Number);
      m.makeTranslation(x, 0.72, y);
      trim.setMatrixAt(wi++, m);
    }
    this.world.add(trim);
    if (map.goal) {
      const [gx, gy] = map.goal;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.05, 10, 32),
        new THREE.MeshStandardMaterial({ color: "#3ee08f", emissive: "#3ee08f", emissiveIntensity: 2 }));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(gx, 0.03, gy);
      ring.userData.pulse = true;
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.02, 32),
        new THREE.MeshStandardMaterial({ color: "#3ee08f", emissive: "#1d7a4c", emissiveIntensity: 0.8, transparent: true, opacity: 0.5 }));
      disc.position.set(gx, 0.01, gy);
      this.world.add(ring, disc);
      this.goalRing = ring;
    } else this.goalRing = null;

    // camera & light framing
    const cx = (w - 1) / 2, cz = (h - 1) / 2, span = Math.max(w, h * 1.4);
    this.controls.target.set(cx, 0, cz);
    this.resize();
    this._frameCamera();
    this.sun.position.set(cx + w * 0.4, 14, cz + h * 0.2);
    this.sun.target.position.set(cx, 0, cz);
    const sc = this.sun.shadow.camera;
    sc.left = -span; sc.right = span; sc.top = span; sc.bottom = -span; sc.near = 1; sc.far = 40;
    sc.updateProjectionMatrix();
    this.controls.update();
  }

  /** Place the camera so the whole map fits the view (works for wide corridors and big arenas). */
  _frameCamera() {
    if (!this.map) return;
    const { width: w, height: h } = this.map;
    const vHalf = (this.camera.fov * Math.PI) / 360;
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect);
    const elev = 1.1; // ~63° camera elevation
    const dW = (w / 2 + 0.6) / Math.tan(hHalf);
    const dH = ((h / 2 + 0.6) * Math.sin(elev) + 0.4) / Math.tan(vHalf);
    const d = Math.max(dW, dH, 4.5) * 1.02;
    const t = this.controls.target;
    this.camera.position.set(t.x, t.y + d * Math.sin(elev), t.z + d * Math.cos(elev));
    this.controls.update();
  }

  resize() {
    const w = this.container.clientWidth || 300;
    const ratio = this.map ? this.map.height / this.map.width : 0.7;
    const h = Math.round(Math.min(Math.max(w * Math.max(0.55, Math.min(ratio * 1.05, 0.85)), 220), window.innerHeight * 0.62));
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = w + "px";
    this.canvas.style.height = h + "px";
    this.overlay.style.height = h + "px";
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.size = { w, h };
    if (this.map && (!this._lastW || Math.abs(this._lastW - w) > 40)) this._frameCamera();
    this._lastW = w;
  }

  _clearDynamic() {
    this.dyn.clear();
    this.objects.clear();
    this.overlay.innerHTML = "";
    this.labels.clear();
    this._clearEffects();
  }

  _clearEffects() {
    for (const e of this.effects) this.dyn.remove(e.obj);
    this.effects = [];
    this.effectKey = null;
  }

  _obj(key, factory) {
    let o = this.objects.get(key);
    if (!o) {
      o = factory();
      this.objects.set(key, o);
      this.dyn.add(o);
    }
    o.userData.seen = this.stamp;
    return o;
  }

  _label(bot, meta) {
    let el = this.labels.get(bot.id);
    if (!el) {
      el = document.createElement("div");
      el.className = "bot-label";
      el.innerHTML = `<span class="bl-name"></span><span class="bl-hp"><i></i></span><span class="bl-say" hidden></span>`;
      el.style.setProperty("--c", BOT_COLORS[bot.id % 4]);
      this.overlay.appendChild(el);
      this.labels.set(bot.id, el);
    }
    el.querySelector(".bl-name").textContent = meta?.name || "";
    return el;
  }

  _project(x, y, z) {
    const v = new THREE.Vector3(x, y, z).project(this.camera);
    return [(v.x * 0.5 + 0.5) * this.size.w, (-v.y * 0.5 + 0.5) * this.size.h, v.z < 1];
  }

  render(a, b, p, extra = {}) {
    if (!this.map || !a) return;
    a = norm(a);
    b = norm(b || a);
    const t = this.clock.getElapsedTime();
    const ep = ease(p);
    this.stamp = (this.stamp || 0) + 1;
    const events = b === a ? [] : b.events || [];
    const evBy = (type, bot) => events.find((e) => e.type === type && (bot === undefined || e.bot === bot));
    const showLabels = this.labelsEnabled && (this.meta.bots?.length || 0) > 1;

    // ---- bots
    for (const ba of a.bots) {
      const bb = b.bots.find((x) => x.id === ba.id) || ba;
      const meta = this.meta.bots?.[ba.id] || {};
      const robot = this._obj("bot" + ba.id, () => {
        const r = buildRobot(meta.loadout || this.meta.playerLoadout || {});
        r.scale.setScalar(1.2);
        return r;
      });
      let x = lerp(ba.x, bb.x, ep), z = lerp(ba.y, bb.y, ep);
      const bump = evBy("bump", ba.id) || (a.robot && events.find((e) => e.type === "bump"));
      if (bump && !(bb.x !== ba.x || bb.y !== ba.y)) {
        const [dx, dz] = DIR_VEC[ba.dir];
        const k = Math.sin(p * Math.PI) * 0.15;
        x += dx * k;
        z += dz * k;
      }
      robot.position.set(x, 0, z);
      robot.rotation.y = lerpAngle(DIR_ANGLE[ba.dir], DIR_ANGLE[bb.dir], ep);
      const dead = !(p > 0.5 ? bb.alive : ba.alive);
      const hurt = (evBy("damage", ba.id) || (a.robot && events.find((e) => e.type === "damage"))) && p > 0.2 && p < 0.7 ? 1.2 : 0;
      animateRobot(robot, t, { moving: bb.x !== ba.x || bb.y !== ba.y, hurt, dead });
      robot.userData.bubble.visible = (p > 0.5 ? bb.shield : ba.shield) > 0 && !dead;
      if (robot.userData.bubble.visible) robot.userData.bubble.material.opacity = 0.18 + Math.sin(t * 6) * 0.06;

      if (showLabels || extra.bubble || this.meta.bots?.length) {
        const el = this._label(ba, meta);
        const [sx, sy, vis] = this._project(x, 1.15, z);
        el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`;
        el.style.display = vis ? "" : "none";
        el.classList.toggle("dead", dead);
        el.querySelector(".bl-name").hidden = !showLabels;
        el.querySelector(".bl-hp").hidden = !showLabels;
        const hpFrac = Math.max(0, (p > 0.5 ? bb.hp : ba.hp) / (ba.max_hp || 1));
        el.querySelector(".bl-hp i").style.width = hpFrac * 100 + "%";
        const say = this._sayFor(ba.id, extra);
        const sEl = el.querySelector(".bl-say");
        sEl.hidden = !say;
        if (say) sEl.textContent = say;
      }
    }

    // ---- campaign entities & crystals
    if (a.entities) {
      a.entities.forEach((ea, i) => {
        const eb = b.entities[i] || ea;
        if (ea.hp <= 0) return;
        const o = this._obj("ent" + ea.id, () => buildObject(ea.kind));
        o.position.set(lerp(ea.x, eb.x, ep), 0, lerp(ea.y, eb.y, ep));
        const dying = eb.hp <= 0;
        o.scale.setScalar(dying ? Math.max(0.01, 1 - p * 1.5) : 1);
        if (o.userData.spinBody) o.userData.spinBody.rotation.y = t * 0.6;
        o.traverse((c) => { if (c.userData.blink) c.visible = Math.sin(t * 6 + ea.id) > -0.3; });
        if (o.userData.billboard && a.bots[0]) {
          const rb = a.bots[0];
          o.rotation.y = Math.atan2(-(rb.y - ea.y), rb.x - ea.x);
        }
      });
    }
    if (a.crystals) {
      const bSet = new Set((b.crystals || []).map(([x, y]) => `${x},${y}`));
      for (const [x, y] of a.crystals) {
        const o = this._obj(`cr${x},${y}`, () => buildObject("crystal"));
        const picked = !bSet.has(`${x},${y}`);
        o.position.set(x, picked ? ep * 0.6 : Math.sin(t * 2 + x) * 0.06, y);
        o.userData.crystal.rotation.y = t * 1.5;
        o.scale.setScalar(picked ? Math.max(0.01, 1 - ep) : 1);
      }
    }

    // ---- rockets & mines (arena)
    for (const ra of a.rockets || []) {
      const rb = (b.rockets || []).find((r) => r.id === ra.id);
      const o = this._obj("rk" + ra.id, () => buildObject("rocket"));
      const tx = rb ? rb.x : ra.x + DIR_VEC[ra.dir][0] * 1.5, tz = rb ? rb.y : ra.y + DIR_VEC[ra.dir][1] * 1.5;
      o.position.set(lerp(ra.x, tx, p), 0.45, lerp(ra.y, tz, p));
      o.rotation.y = DIR_ANGLE[ra.dir];
      o.visible = !!rb || p < 0.5;
    }
    for (const rb of b.rockets || []) {
      if (!(a.rockets || []).some((r) => r.id === rb.id)) {
        const o = this._obj("rk" + rb.id, () => buildObject("rocket"));
        const launch = events.find((e) => e.type === "rocket_launch" && e.by === rb.owner);
        const sx = launch ? launch.x : rb.x, sz = launch ? launch.y : rb.y;
        o.position.set(lerp(sx, rb.x, p), 0.45, lerp(sz, rb.y, p));
        o.rotation.y = DIR_ANGLE[rb.dir];
        o.visible = p > 0.05;
      }
    }
    for (const mn of b === a ? a.mines || [] : [...(a.mines || []), ...(b.mines || [])]) {
      const o = this._obj("mn" + mn.id, () => buildObject("mine"));
      o.position.set(mn.x, 0, mn.y);
      const stillThere = (b.mines || []).some((m2) => m2.id === mn.id);
      o.visible = stillThere || p < 0.4;
      o.scale.setScalar(stillThere ? 1 : 1 + p);
    }

    // remove objects that no longer exist
    for (const [key, o] of this.objects) {
      if (o.userData.seen !== this.stamp) {
        this.dyn.remove(o);
        this.objects.delete(key);
      }
    }

    // ---- effects for this transition
    if (this.effectKey !== b || b === a) {
      this._clearEffects();
      if (b !== a) {
        this.effectKey = b;
        events.forEach((ev) => this._spawnEffect(ev, a));
      }
    }
    for (const e of this.effects) e.update(p, t);

    if (this.goalRing) this.goalRing.scale.setScalar(1 + Math.sin(t * 3) * 0.08);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  _sayFor(botId, extra) {
    const { frames, index = 0, progress = 0 } = extra;
    if (!frames) return extra.bubble && botId === 0 ? extra.bubble : null;
    const pos = index + progress;
    for (let i = Math.min(frames.length - 1, Math.ceil(pos)); i >= 0 && pos - i < 3.2; i--) {
      const say = (frames[i].events || []).filter((e) => e.type === "say" && (e.bot === undefined ? botId === 0 : e.bot === botId)).pop();
      if (say) return say.text;
    }
    return null;
  }

  _spawnEffect(ev, a) {
    const add = (obj, update) => {
      this.dyn.add(obj);
      this.effects.push({ obj, update });
    };
    if (ev.type === "laser" || ev.type === "rail") {
      const from = new THREE.Vector3(ev.fx, 0.5, ev.fy);
      let to = new THREE.Vector3(ev.tx, 0.5, ev.ty);
      if (!ev.hit) {
        const d = new THREE.Vector3(Math.sign(ev.tx - ev.fx), 0, Math.sign(ev.ty - ev.fy));
        to = to.sub(d.multiplyScalar(0.5));
      }
      const isEnemy = ev.by === "enemy";
      const color = ev.type === "rail" ? "#7fa8ff" : isEnemy ? "#ff4d6d" : BOT_COLORS[typeof ev.by === "number" ? ev.by % 4 : 0];
      const len = from.distanceTo(to) || 0.01;
      const geo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
      const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false });
      const beam = new THREE.Mesh(geo, m);
      const core = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: "#ffffff", transparent: true, depthWrite: false }));
      const g = new THREE.Group();
      g.add(beam, core);
      g.position.copy(from);
      g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
      const thick = ev.type === "rail" ? 0.11 : 0.07;
      add(g, (p) => {
        const grow = Math.min(1, p / 0.2);
        const fade = p < 0.4 ? 1 : Math.max(0, 1 - (p - 0.4) / 0.35);
        beam.scale.set(thick * (1 + (1 - fade)), len * grow, thick * (1 + (1 - fade)));
        core.scale.set(thick * 0.35, len * grow, thick * 0.35);
        beam.position.y = core.position.y = (len * grow) / 2;
        m.opacity = fade * 0.8;
        core.material.opacity = fade;
        g.visible = fade > 0;
      });
    } else if (["explode", "rocket_explode", "mine_explode"].includes(ev.type)) {
      const g = new THREE.Group();
      g.position.set(ev.x, 0.4, ev.y);
      const fire = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12),
        new THREE.MeshBasicMaterial({ color: "#ffcf5a", transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      g.add(fire);
      const bits = [];
      for (let i = 0; i < 14; i++) {
        const bit = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.07), new THREE.MeshBasicMaterial({ color: i % 2 ? "#ff6a3d" : "#ffd24a", transparent: true }));
        const a2 = (i / 14) * Math.PI * 2, up = 0.4 + ((i * 37) % 10) / 10;
        bit.userData.v = new THREE.Vector3(Math.cos(a2), up, Math.sin(a2));
        bits.push(bit);
        g.add(bit);
      }
      const big = ev.type === "explode" ? 1 : 0.8;
      add(g, (p) => {
        const q = Math.max(0, (p - 0.2) / 0.8);
        fire.scale.setScalar(0.1 + q * 0.7 * big);
        fire.material.opacity = 1 - q;
        for (const bit of bits) {
          bit.position.copy(bit.userData.v).multiplyScalar(q * 1.2 * big);
          bit.position.y -= q * q * 0.8;
          bit.material.opacity = 1 - q;
        }
        g.visible = p > 0.2;
      });
    } else if (ev.type === "pickup") {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.03, 8, 24), new THREE.MeshBasicMaterial({ color: "#7ff3ff", transparent: true }));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(ev.x, 0.3, ev.y);
      add(ring, (p) => { ring.scale.setScalar(1 + p); ring.material.opacity = 1 - p; });
    } else if (ev.type === "repair" || ev.type === "shield_up" || ev.type === "dash") {
      const bot = a.bots.find((x) => x.id === ev.bot);
      if (!bot) return;
      const color = ev.type === "repair" ? "#4ee06a" : ev.type === "dash" ? "#ff9a2e" : "#36d6ff";
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.45, 0.04, 8, 32), new THREE.MeshBasicMaterial({ color, transparent: true, blending: THREE.AdditiveBlending }));
      ring.rotation.x = Math.PI / 2;
      ring.position.set(bot.x, 0.1, bot.y);
      add(ring, (p) => { ring.position.y = 0.1 + p * 0.8; ring.material.opacity = 1 - p; ring.scale.setScalar(1 + p * 0.3); });
    }
  }

  dispose() {
    this._ro.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.scene.traverse((o) => {
      o.geometry?.dispose?.();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose?.());
    });
    this.canvas.remove();
    this.overlay.remove();
  }
}

/** Small rotating 3D preview of a robot (garage, shop). */
export class Turntable {
  constructor(container, loadout, { height = 260 } = {}) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.className = "turntable-canvas";
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 50);
    this.camera.position.set(1.7, 1.25, 1.9);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 0.35, 0);
    this.controls.enablePan = false;
    this.controls.minDistance = 1.4;
    this.controls.maxDistance = 4;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 2;
    this.controls.enableDamping = true;
    this.scene.add(new THREE.HemisphereLight("#dfe8ff", "#20264d", 1.3));
    const sun = new THREE.DirectionalLight("#ffffff", 2);
    sun.position.set(2, 4, 3);
    sun.castShadow = true;
    this.scene.add(sun);
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.06, 48),
      new THREE.MeshStandardMaterial({ color: "#1f2a5a", metalness: 0.4, roughness: 0.5 }));
    pad.position.y = -0.03;
    pad.receiveShadow = true;
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.78, 0.015, 8, 64),
      new THREE.MeshBasicMaterial({ color: "#36d6ff" }));
    rim.rotation.x = Math.PI / 2;
    this.scene.add(pad, rim);
    this.height = height;
    this.setLoadout(loadout);
    this.clock = new THREE.Clock();
    this._ro = new ResizeObserver(() => this.resize());
    this._ro.observe(container);
    this.resize();
    const loop = () => {
      if (this.dead) return;
      requestAnimationFrame(loop);
      if (!this.renderer.domElement.isConnected) return this.dispose();
      const t = this.clock.getElapsedTime();
      if (this.robot) animateRobot(this.robot, t, { moving: true });
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  setLoadout(loadout) {
    if (this.robot) this.scene.remove(this.robot);
    this.robot = buildRobot(loadout);
    this.robot.scale.setScalar(1.15);
    this.scene.add(this.robot);
  }

  resize() {
    const w = this.container.clientWidth || 260;
    this.renderer.setSize(w, this.height);
    this.camera.aspect = w / this.height;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    if (this.dead) return;
    this.dead = true;
    this._ro.disconnect();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
