// Talks to the Python worker. Restarts it if a run takes too long.
export class Engine {
  constructor({ onStatus } = {}) {
    this.onStatus = onStatus || (() => {});
    this.nextId = 1;
    this.pending = new Map();
    this.aiBots = [];
    this._spawn();
  }

  _spawn() {
    this.isReady = false;
    this.onStatus("loading");
    this.worker = new Worker("js/worker.js");
    this.ready = new Promise((resolve, reject) => {
      this._resolveReady = resolve;
      this._rejectReady = reject;
    });
    this.ready.catch(() => {});
    this.worker.onmessage = (e) => this._onMessage(e.data);
    this.worker.onerror = (e) => {
      this.onStatus("error", e.message);
      this._rejectReady(new Error(e.message));
    };
  }

  _onMessage(msg) {
    if (msg.type === "ready") {
      this.isReady = true;
      this.aiBots = msg.aiBots;
      this.onStatus("ready");
      this._resolveReady();
    } else if (msg.type === "fatal") {
      this.onStatus("error", msg.message);
      this._rejectReady(new Error(msg.message));
    } else if (msg.type === "result") {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      clearTimeout(p.timer);
      msg.error ? p.reject(new Error(msg.error)) : p.resolve(msg.result);
    }
  }

  async _send(payload, timeoutMs = 20000) {
    await this.ready;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        this.worker.terminate();
        this._spawn();
        const err = new Error("timeout");
        err.timeout = true;
        reject(err);
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.worker.postMessage({ id, ...payload });
    });
  }

  run(mission, code) {
    return this._send({ type: "run", mission, code });
  }

  match(args) {
    return this._send({ type: "match", args }, 60000);
  }

  /** Economy rules (Python). Resolves {profile, result} or rejects with a kid-friendly message. */
  async economy(op, profile, args) {
    const out = await this._send({ type: "economy", op, profile, args });
    if (out.error) throw Object.assign(new Error(out.error), { friendly: true });
    return out;
  }
}
