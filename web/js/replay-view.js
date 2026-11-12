// Replay viewer: renderer (2D canvas or 3D three.js) + playback controls.
import { Arena } from "./renderer.js";
import { Player } from "./player.js";
import { icon } from "./ui.js";
import { sfxForEvents } from "./sound.js";

let three = null;
let partsCatalog = null;
export function setReplayParts(parts) {
  partsCatalog = parts;
}
/** Lazy-load three.js only when a 3D view is needed. */
export async function load3D() {
  if (!three) {
    const [scene, models] = await Promise.all([import("./three/scene3d.js"), import("./three/models.js")]);
    models.setPartsCatalog(partsCatalog);
    three = { ...scene, ...models };
  }
  return three;
}

export class ReplayView {
  constructor(host, { mode = "2d", onFrame, onEnd } = {}) {
    this.host = host;
    this.onFrame = onFrame || (() => {});
    this.onEnd = onEnd || (() => {});
    this.speed = 1;
    host.classList.add("replay-view");
    host.innerHTML = `
      <div class="canvas-wrap"></div>
      <div class="controls">
        <button class="btn icon-btn" data-c="back" title="Schritt zurück">${icon("stepb")}</button>
        <button class="btn icon-btn" data-c="play" title="Abspielen / Pause">${icon("play")}</button>
        <button class="btn icon-btn" data-c="fwd" title="Schritt vor">${icon("stepf")}</button>
        <button class="btn icon-btn" data-c="restart" title="Von vorn">${icon("restart")}</button>
        <button class="btn small speed" data-c="speed" title="Geschwindigkeit">1×</button>
        <input type="range" class="scrub" min="0" max="0" value="0" aria-label="Zeitleiste">
      </div>`;
    this.wrap = host.querySelector(".canvas-wrap");
    this.scrub = host.querySelector(".scrub");
    const c = (n) => host.querySelector(`[data-c="${n}"]`);
    c("play").onclick = () => { this.player.toggle(); this.updateButtons(); };
    c("fwd").onclick = () => { this.player.stepForward(); this.updateButtons(); };
    c("back").onclick = () => { this.player.stepBack(); this.updateButtons(); };
    c("restart").onclick = () => { this.player.seek(0); this.player.play(); this.updateButtons(); };
    c("speed").onclick = (e) => {
      const speeds = [1, 2, 4, 0.5];
      this.speed = speeds[(speeds.indexOf(this.speed) + 1) % speeds.length];
      this.player.setSpeed(this.speed);
      e.currentTarget.textContent = (this.speed === 0.5 ? "½" : this.speed) + "×";
    };
    this.scrub.oninput = () => { this.player.pause(); this.player.seek(+this.scrub.value); this.updateButtons(); };
    this._resize = () => this.renderer?.resize?.();
    window.addEventListener("resize", this._resize);
    this.ready = this.setMode(mode);
  }

  async setMode(mode) {
    const wasPlaying = this.player?.playing;
    const at = this.player?.index || 0;
    this.player?.destroy();
    this.renderer?.dispose?.();
    this.wrap.innerHTML = "";
    this.mode = mode;
    this.wrap.classList.toggle("is3d", mode === "3d");
    if (mode === "3d") {
      const { Scene3D } = await load3D();
      this.renderer = new Scene3D(this.wrap);
      if (this.meta) this.renderer.setMeta(this.meta);
    } else {
      const canvas = document.createElement("canvas");
      this.wrap.appendChild(canvas);
      this.renderer = new Arena(canvas);
    }
    this.player = new Player(this.renderer, {
      onFrame: (i, o) => {
        this.scrub.value = i;
        if (!o.seek && this.frames) sfxForEvents(this.frames[i]?.events);
        this.onFrame(i, this.frames?.[i], o);
      },
      onEnd: () => { this.updateButtons(); this.onEnd(); },
    });
    this.player.setSpeed(this.speed);
    if (this.frames) {
      this.player.load(this.map, this.frames);
      this.player.seek(at);
      if (wasPlaying) this.player.play();
    }
    this.updateButtons();
  }

  async load(map, frames, meta = { bots: [] }) {
    await this.ready;
    this.map = map;
    this.frames = frames;
    this.meta = meta;
    this.renderer.setMeta?.(meta);
    this.player.load(map, frames);
    this.scrub.max = Math.max(0, frames.length - 1);
    this.updateButtons();
  }

  play() {
    this.player.play();
    this.updateButtons();
  }

  /** Line of the given bot's code that is executing right now. */
  currentLine(botId = 0) {
    const f = this.frames;
    if (!f) return null;
    const i = this.player.index;
    const pick = (fr) => (fr ? (fr.lines ? fr.lines[String(botId)] : fr.line) : null);
    if (this.player.playing && f[i + 1]) return pick(f[i + 1]);
    return pick(f[i]);
  }

  updateButtons() {
    const b = this.host.querySelector('[data-c="play"]');
    if (b) b.innerHTML = icon(this.player?.playing ? "pause" : "play");
  }

  destroy() {
    window.removeEventListener("resize", this._resize);
    this.player?.destroy();
    this.renderer?.dispose?.();
  }
}
