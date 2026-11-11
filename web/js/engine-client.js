// Talks to the Python worker. Restarts it if a run takes too long.
export class Engine {
  constructor({ onStatus } = {}) {
    this.onStatus = onStatus || (() => {});
    this.nextId = 1;
    this.pending = new Map();
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
    this.worker.onmessage = (e) => this._onMessage(e.data);
    this.worker.onerror = (e) => {
      this.onStatus("error", e.message);
      this._rejectReady(new Error(e.message));
    };
  }

  _onMessage(msg) {
    if (msg.type === "ready") {
      this.isReady = true;
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

  async run(mission, code, timeoutMs = 20000) {
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
      this.worker.postMessage({ id, mission, code });
    });
  }
}
