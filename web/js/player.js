// Replay player: steps through recorded frames with smooth interpolation.
const BASE_MS = 420;

export class Player {
  constructor(arena, { onFrame, onEnd } = {}) {
    this.arena = arena;
    this.onFrame = onFrame || (() => {});
    this.onEnd = onEnd || (() => {});
    this.frames = [];
    this.index = 0;
    this.progress = 0;
    this.playing = false;
    this.speed = 1;
    this.last = 0;
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  load(map, frames) {
    this.arena.setMap(map);
    this.frames = frames;
    this.index = 0;
    this.progress = 0;
    this.playing = false;
    this.onFrame(0, { seek: true });
  }

  get atEnd() {
    return this.index >= this.frames.length - 1;
  }

  play() {
    if (!this.frames.length) return;
    if (this.frames.length === 1) {
      // nothing to animate (e.g. program crashed before the first action)
      this.onEnd();
      return;
    }
    if (this.atEnd) this.seek(0);
    this.playing = true;
    this.last = performance.now();
  }

  pause() {
    this.playing = false;
  }

  toggle() {
    this.playing ? this.pause() : this.play();
  }

  setSpeed(s) {
    this.speed = s;
  }

  seek(i) {
    this.index = Math.max(0, Math.min(i, this.frames.length - 1));
    this.progress = 0;
    this.onFrame(this.index, { seek: true });
  }

  stepForward() {
    this.pause();
    if (this.progress > 0) this.progress = 0;
    if (!this.atEnd) {
      this.index++;
      this.onFrame(this.index, {});
    }
  }

  stepBack() {
    this.pause();
    this.seek(this.progress > 0 ? this.index : this.index - 1);
  }

  /** Line that is executing right now (the command leading to the next frame). */
  currentLine() {
    const next = this.frames[this.index + 1];
    if (this.playing && next) return next.line;
    return this.frames[this.index]?.line ?? null;
  }

  bubble() {
    const pos = this.index + this.progress;
    for (let i = Math.min(this.frames.length - 1, Math.ceil(pos)); i >= 0 && pos - i < 3.2; i--) {
      const say = (this.frames[i].events || []).filter((e) => e.type === "say").pop();
      if (say) return say.text;
    }
    return null;
  }

  destroy() {
    this.dead = true;
  }

  _loop(now) {
    if (this.dead) return;
    requestAnimationFrame(this._loop);
    if (!this.frames.length) return;
    if (this.playing) {
      const dt = now - this.last;
      this.last = now;
      this.progress += (dt * this.speed) / BASE_MS;
      while (this.progress >= 1 && this.playing) {
        this.progress -= 1;
        this.index++;
        this.onFrame(this.index, {});
        if (this.atEnd) {
          this.progress = 0;
          this.playing = false;
          this.onEnd();
        }
      }
    }
    const a = this.frames[this.index];
    const b = this.frames[this.index + 1];
    const p = this.playing && b ? this.progress : 0;
    this.arena.render(a, p > 0 ? b : a, p, {
      bubble: this.bubble(), frames: this.frames, index: this.index, progress: p,
    });
  }
}
