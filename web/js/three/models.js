// Procedural 3D models for every robot part (three.js).
// buildRobot(loadout) returns a THREE.Group that faces +X (east) when rotation.y = 0.
// Later these can be swapped for GLTF models: keep the same function signatures.
import * as THREE from "three";

let PARTS = null;
export function setPartsCatalog(parts) {
  PARTS = parts;
}

const paintOf = (id) =>
  PARTS?.paints.find((p) => p.id === id) || { color: "#36d6ff", dark: "#147a99" };

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.45, metalness: 0.35, ...opts });
}
function glow(color, intensity = 1.6) {
  return new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: intensity, roughness: 0.3 });
}
function box(w, h, d, m) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
function cyl(rt, rb, h, m, seg = 16) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), m);
  mesh.castShadow = true;
  return mesh;
}
function sphere(r, m, seg = 16) {
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(r, seg, seg), m);
  mesh.castShadow = true;
  return mesh;
}
function at(obj, x, y, z) {
  obj.position.set(x, y, z);
  return obj;
}

const M = {
  dark: () => mat("#1a1f3d", { metalness: 0.5 }),
  metal: () => mat("#8a93b8", { metalness: 0.8, roughness: 0.3 }),
  rubber: () => mat("#151a35", { roughness: 0.9, metalness: 0 }),
};

// ------------------------------------------------------------------ chassis
function treads(group, len, width, spread, height = 0.16) {
  for (const side of [-1, 1]) {
    const t = box(len, height, width, M.rubber());
    at(t, 0, height / 2, side * spread);
    group.add(t);
    for (let i = 0; i < 4; i++) {
      const wheel = cyl(height * 0.42, height * 0.42, width + 0.02, M.metal(), 12);
      wheel.rotation.x = Math.PI / 2;
      at(wheel, -len / 2 + 0.07 + (i * (len - 0.14)) / 3, height / 2, side * spread);
      group.add(wheel);
    }
  }
}

function visor(group, x, y, w, h) {
  const v = box(0.06, h, w, mat("#0d1230", { metalness: 0.2 }));
  at(v, x, y, 0);
  group.add(v);
  for (const z of [-w * 0.22, w * 0.22]) {
    const eye = sphere(0.035, glow("#b8ffff", 2.2), 10);
    at(eye, x + 0.035, y + h * 0.1, z);
    eye.userData.eye = true;
    group.add(eye);
  }
}

const CHASSIS = {
  standard(paint) {
    const g = new THREE.Group();
    treads(g, 0.7, 0.14, 0.3);
    const body = box(0.56, 0.32, 0.5, mat(paint.color));
    at(body, 0, 0.36, 0);
    body.userData.paint = true;
    g.add(body);
    const top = box(0.44, 0.06, 0.4, mat(paint.dark));
    at(top, -0.02, 0.55, 0);
    g.add(top);
    visor(g, 0.29, 0.38, 0.34, 0.16);
    g.userData.top = 0.58;
    g.userData.back = -0.28;
    g.userData.side = 0.27;
    return g;
  },
  scout(paint) {
    const g = new THREE.Group();
    for (const [x, z] of [[0.22, 0.22], [0.22, -0.22], [-0.22, 0.22], [-0.22, -0.22]]) {
      const w = cyl(0.09, 0.09, 0.07, M.rubber(), 14);
      w.rotation.x = Math.PI / 2;
      g.add(at(w, x, 0.09, z));
    }
    const body = box(0.5, 0.22, 0.36, mat(paint.color));
    at(body, 0, 0.26, 0);
    body.userData.paint = true;
    g.add(body);
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.22, 4), mat(paint.dark));
    nose.rotation.z = -Math.PI / 2;
    nose.rotation.x = Math.PI / 4;
    g.add(at(nose, 0.34, 0.26, 0));
    const fin = box(0.18, 0.18, 0.03, mat(paint.dark));
    at(fin, -0.2, 0.44, 0);
    g.add(fin);
    visor(g, 0.24, 0.32, 0.24, 0.1);
    g.userData.top = 0.37;
    g.userData.back = -0.25;
    g.userData.side = 0.2;
    return g;
  },
  tank(paint) {
    const g = new THREE.Group();
    treads(g, 0.86, 0.2, 0.34, 0.2);
    const body = box(0.68, 0.36, 0.58, mat(paint.color));
    at(body, 0, 0.4, 0);
    body.userData.paint = true;
    g.add(body);
    const plate = box(0.08, 0.3, 0.6, mat(paint.dark));
    plate.rotation.z = 0.5;
    g.add(at(plate, 0.36, 0.38, 0));
    const top = box(0.5, 0.08, 0.46, mat(paint.dark));
    g.add(at(top, -0.04, 0.62, 0));
    visor(g, 0.35, 0.5, 0.3, 0.1);
    g.userData.top = 0.66;
    g.userData.back = -0.34;
    g.userData.side = 0.31;
    return g;
  },
  hover(paint) {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.04, 10, 32), glow("#7ff3ff", 2));
    ring.rotation.x = Math.PI / 2;
    g.add(at(ring, 0, 0.12, 0));
    const body = cyl(0.32, 0.26, 0.24, mat(paint.color), 24);
    at(body, 0, 0.3, 0);
    body.userData.paint = true;
    g.add(body);
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat(paint.dark));
    g.add(at(dome, 0, 0.42, 0));
    visor(g, 0.27, 0.32, 0.26, 0.1);
    g.userData.top = 0.6;
    g.userData.back = -0.3;
    g.userData.side = 0.3;
    g.userData.hover = true;
    return g;
  },
};

// ------------------------------------------------------------------ weapons (slot 0 = top turret, slot 1 = left shoulder)
const WEAPONS = {
  laser(slot) {
    const g = new THREE.Group();
    g.add(at(cyl(0.09, 0.11, 0.08, M.dark()), 0, 0.04, 0));
    const barrel = cyl(0.03, 0.03, 0.42, M.metal(), 10);
    barrel.rotation.z = Math.PI / 2;
    g.add(at(barrel, 0.2, 0.09, 0));
    const tip = sphere(0.04, glow("#5ff", 2.5), 10);
    g.add(at(tip, 0.42, 0.09, 0));
    g.userData.muzzle = new THREE.Vector3(0.45, 0.09, 0);
    return g;
  },
  rocket() {
    const g = new THREE.Group();
    g.add(at(box(0.3, 0.18, 0.18, mat("#3b4373")), 0.02, 0.1, 0));
    for (const [y, z] of [[0.05, -0.045], [0.05, 0.045], [0.14, -0.045], [0.14, 0.045]]) {
      const tube = cyl(0.035, 0.035, 0.04, mat("#0b0f22"), 10);
      tube.rotation.z = Math.PI / 2;
      g.add(at(tube, 0.18, y, z));
      const head = new THREE.Mesh(new THREE.ConeGeometry(0.028, 0.06, 8), mat("#ff4d6d"));
      head.rotation.z = -Math.PI / 2;
      g.add(at(head, 0.2, y, z));
    }
    return g;
  },
  mines() {
    const g = new THREE.Group();
    g.add(at(box(0.2, 0.16, 0.24, mat("#2b2f4a")), -0.04, 0.08, 0));
    for (let i = 0; i < 4; i++) {
      const stripe = box(0.21, 0.03, 0.05, mat(i % 2 ? "#111" : "#ffcf3a"));
      g.add(at(stripe, -0.04, 0.17, -0.09 + i * 0.06));
    }
    const mine = cyl(0.07, 0.07, 0.03, mat("#444a6e"));
    g.add(at(mine, -0.16, 0.03, 0));
    g.add(at(sphere(0.02, glow("#ff4d6d", 2.5), 8), -0.16, 0.06, 0));
    return g;
  },
  railgun() {
    const g = new THREE.Group();
    g.add(at(box(0.18, 0.08, 0.16, M.dark()), 0, 0.05, 0));
    for (const z of [-0.045, 0.045]) {
      const rail = box(0.56, 0.03, 0.025, M.metal());
      g.add(at(rail, 0.26, 0.1, z));
    }
    for (let i = 0; i < 4; i++) {
      const coil = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.015, 8, 16), glow("#6ea8ff", 2.2));
      coil.rotation.y = Math.PI / 2;
      g.add(at(coil, 0.08 + i * 0.12, 0.1, 0));
    }
    return g;
  },
};

// ------------------------------------------------------------------ modules
const MODULES = {
  turbo(base) {
    const g = new THREE.Group();
    for (const z of [-0.12, 0.12]) {
      const t = cyl(0.06, 0.08, 0.2, M.metal(), 12);
      t.rotation.z = Math.PI / 2;
      g.add(at(t, base.userData.back - 0.06, 0.28, z));
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.14, 10), glow("#ff9a2e", 2.4));
      flame.rotation.z = Math.PI / 2;
      flame.userData.flame = true;
      g.add(at(flame, base.userData.back - 0.22, 0.28, z));
    }
    return g;
  },
  armor(base) {
    const g = new THREE.Group();
    for (const side of [-1, 1]) {
      const p = box(0.5, 0.2, 0.04, M.metal());
      p.rotation.x = side * 0.25;
      g.add(at(p, 0, 0.36, side * (base.userData.side + 0.03)));
      for (const x of [-0.18, 0, 0.18]) g.add(at(sphere(0.02, M.dark(), 6), x, 0.38, side * (base.userData.side + 0.06)));
    }
    return g;
  },
  battery(base) {
    const g = new THREE.Group();
    for (const z of [-0.08, 0.08]) {
      const c = cyl(0.06, 0.06, 0.22, mat("#30386a"), 12);
      g.add(at(c, base.userData.back + 0.02, base.userData.top + 0.06, z));
      const band = cyl(0.062, 0.062, 0.04, glow("#4ee06a", 2), 12);
      g.add(at(band, base.userData.back + 0.02, base.userData.top + 0.1, z));
    }
    return g;
  },
  shield(base) {
    const g = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.metal());
    g.add(at(dome, 0.12, base.userData.top, 0.16));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.015, 8, 24), glow("#36d6ff", 2.4));
    ring.rotation.x = Math.PI / 2;
    g.add(at(ring, 0.12, base.userData.top + 0.01, 0.16));
    return g;
  },
  repair(base) {
    const g = new THREE.Group();
    const arm = cyl(0.025, 0.025, 0.3, M.metal(), 8);
    arm.rotation.x = 0.6;
    g.add(at(arm, -0.05, base.userData.top + 0.08, base.userData.side - 0.02));
    const head = box(0.1, 0.1, 0.03, mat("#ffffff"));
    const c1 = box(0.07, 0.022, 0.035, glow("#ff4d6d", 1.6));
    const c2 = box(0.022, 0.07, 0.035, glow("#ff4d6d", 1.6));
    const hg = new THREE.Group();
    hg.add(head, c1, c2);
    g.add(at(hg, -0.05, base.userData.top + 0.2, base.userData.side + 0.08));
    return g;
  },
  radar(base) {
    const g = new THREE.Group();
    g.add(at(cyl(0.015, 0.015, 0.2, M.metal(), 8), -0.14, base.userData.top + 0.1, -0.1));
    const dish = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 8, 0, Math.PI * 2, 0, Math.PI / 3),
      mat("#dfe4ff", { side: THREE.DoubleSide }));
    dish.rotation.z = Math.PI / 2 + 0.4;
    const spinner = new THREE.Group();
    spinner.add(dish);
    spinner.add(at(sphere(0.02, glow("#ffb020", 2), 8), 0.05, 0.02, 0));
    spinner.userData.spin = 2.5;
    g.add(at(spinner, -0.14, base.userData.top + 0.22, -0.1));
    return g;
  },
};

// ------------------------------------------------------------------ hats
const HATS = {
  none: () => new THREE.Group(),
  antenna(base) {
    const g = new THREE.Group();
    g.add(at(cyl(0.012, 0.012, 0.22, M.dark(), 6), -0.15, base.userData.top + 0.11, 0.12));
    g.add(at(sphere(0.035, glow("#3ee08f", 2.2), 10), -0.15, base.userData.top + 0.24, 0.12));
    return g;
  },
  propeller(base) {
    const g = new THREE.Group();
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mat("#ff4d6d"));
    g.add(at(cap, 0, base.userData.top, 0));
    g.add(at(cyl(0.01, 0.01, 0.08, M.dark(), 6), 0, base.userData.top + 0.12, 0));
    const blades = new THREE.Group();
    blades.add(at(box(0.3, 0.01, 0.05, mat("#ffcf3a")), 0, 0, 0));
    blades.add(at(box(0.05, 0.01, 0.3, mat("#36d6ff")), 0, 0, 0));
    blades.userData.spin = 9;
    g.add(at(blades, 0, base.userData.top + 0.16, 0));
    return g;
  },
  horns(base) {
    const g = new THREE.Group();
    for (const z of [-0.14, 0.14]) {
      const h = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 10), mat("#ff4d6d"));
      h.rotation.x = z > 0 ? 0.4 : -0.4;
      g.add(at(h, 0.05, base.userData.top + 0.08, z));
    }
    return g;
  },
  crown(base) {
    const g = new THREE.Group();
    const gold = mat("#ffd24a", { metalness: 0.9, roughness: 0.2 });
    g.add(at(cyl(0.12, 0.12, 0.06, gold, 20), 0, base.userData.top + 0.03, 0));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.09, 6), gold);
      g.add(at(spike, Math.cos(a) * 0.1, base.userData.top + 0.1, Math.sin(a) * 0.1));
    }
    g.add(at(sphere(0.025, glow("#ff4d6d", 1.5), 8), 0.12, base.userData.top + 0.04, 0));
    return g;
  },
};

// ------------------------------------------------------------------ assembly
export function buildRobot(loadout = {}) {
  const paint = paintOf(loadout.paint || "cyan");
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group(); // bobbing / hover wrapper
  root.add(bodyGroup);
  const base = (CHASSIS[loadout.chassis] || CHASSIS.standard)(paint);
  bodyGroup.add(base);

  const weapons = loadout.weapons || [];
  weapons.slice(0, 2).forEach((w, i) => {
    const fn = WEAPONS[w];
    if (!fn) return;
    const m = fn(i);
    if (i === 0) at(m, 0.02, base.userData.top, 0);
    else at(m, -0.02, base.userData.top - 0.12, -(base.userData.side + 0.12));
    base.add(m);
  });
  for (const mod of (loadout.modules || []).slice(0, 2)) {
    const fn = MODULES[mod];
    if (fn) base.add(fn(base));
  }
  base.add((HATS[loadout.hat] || HATS.none)(base));

  // shield bubble (hidden until active)
  const bubble = new THREE.Mesh(
    new THREE.SphereGeometry(0.62, 24, 16),
    new THREE.MeshStandardMaterial({ color: "#36d6ff", emissive: "#36d6ff", emissiveIntensity: 0.6,
      transparent: true, opacity: 0.22, depthWrite: false })
  );
  bubble.position.y = 0.35;
  bubble.visible = false;
  root.add(bubble);

  root.userData = { base, bodyGroup, bubble, hover: !!base.userData.hover, paint, top: base.userData.top };
  return root;
}

/** Per-frame animation of a robot model: spinning parts, hover bob, flames, hit flash. */
export function animateRobot(robot, t, { moving = false, hurt = 0, dead = false } = {}) {
  const ud = robot.userData;
  if (!ud.base) return;
  ud.bodyGroup.position.y = ud.hover ? 0.12 + Math.sin(t * 3) * 0.04 : moving ? Math.abs(Math.sin(t * 18)) * 0.015 : 0;
  ud.bodyGroup.rotation.z = dead ? 0.5 : 0;
  ud.bodyGroup.rotation.x = dead ? 0.3 : 0;
  robot.traverse((o) => {
    if (o.userData.spin) o.rotation.y = t * o.userData.spin;
    if (o.userData.flame) o.scale.x = moving ? 1.4 + Math.sin(t * 40) * 0.3 : 0.5;
    if (o.isMesh && o.userData.paint) {
      o.material.emissive = o.material.emissive || new THREE.Color();
      o.material.emissive.set(hurt > 0 ? "#ff2040" : "#000000");
      o.material.emissiveIntensity = hurt;
      o.material.color.set(dead ? "#444a66" : ud.paint.color);
    }
    if (o.userData.eye) o.visible = !dead;
  });
}

// ------------------------------------------------------------------ campaign objects
export function buildObject(kind) {
  const g = new THREE.Group();
  if (kind === "target") {
    g.add(at(cyl(0.03, 0.03, 0.35, M.metal(), 8), 0, 0.17, 0));
    const colors = ["#ff5470", "#ffffff", "#ff5470", "#ffffff"];
    colors.forEach((c, i) => {
      const r = cyl(0.3 - i * 0.07, 0.3 - i * 0.07, 0.04 + i * 0.005, mat(c, { metalness: 0 }), 24);
      r.rotation.z = Math.PI / 2;
      g.add(at(r, 0, 0.5, 0));
    });
    g.userData.billboard = true;
  } else if (kind === "sentry") {
    g.add(at(cyl(0.3, 0.34, 0.2, mat("#2b2f4a"), 16), 0, 0.1, 0));
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat("#4a3050"));
    g.add(at(head, 0, 0.2, 0));
    const eye = sphere(0.08, glow("#ff5470", 2.6), 10);
    eye.userData.blink = true;
    g.add(at(eye, 0, 0.33, 0));
  } else if (kind === "boss") {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.5, 0.5, 6), mat("#3a2466"));
    body.castShadow = true;
    g.add(at(body, 0, 0.3, 0));
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.04, 8, 6), glow("#a77bff", 2));
    ring.rotation.x = Math.PI / 2;
    g.add(at(ring, 0, 0.56, 0));
    const eye = sphere(0.14, glow("#ff5470", 2.8), 12);
    eye.userData.blink = true;
    g.add(at(eye, 0, 0.62, 0));
    g.userData.spinBody = body;
  } else if (kind === "friend") {
    const r = buildRobot({ chassis: "scout", weapons: [], modules: [], paint: "green", hat: "antenna" });
    r.scale.setScalar(0.85);
    g.add(r);
  } else if (kind === "crystal") {
    const c = new THREE.Mesh(new THREE.OctahedronGeometry(0.18), new THREE.MeshStandardMaterial({
      color: "#7ff3ff", emissive: "#4fd8ff", emissiveIntensity: 1.2, roughness: 0.1, metalness: 0.2,
      transparent: true, opacity: 0.9 }));
    c.scale.y = 1.5;
    g.add(at(c, 0, 0.4, 0));
    g.userData.crystal = c;
  } else if (kind === "mine") {
    g.add(at(cyl(0.16, 0.18, 0.06, mat("#444a6e"), 16), 0, 0.03, 0));
    const light = sphere(0.04, glow("#ff4d6d", 3), 8);
    light.userData.blink = true;
    g.add(at(light, 0, 0.08, 0));
  } else if (kind === "rocket") {
    const body = cyl(0.04, 0.04, 0.22, mat("#dfe4ff"), 10);
    body.rotation.z = Math.PI / 2;
    g.add(body);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.1, 10), mat("#ff4d6d"));
    head.rotation.z = -Math.PI / 2;
    g.add(at(head, 0.15, 0, 0));
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.16, 8), glow("#ff9a2e", 3));
    flame.rotation.z = Math.PI / 2;
    g.add(at(flame, -0.18, 0, 0));
    g.position.y = 0.45;
  }
  return g;
}
