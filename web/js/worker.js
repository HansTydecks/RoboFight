// Web worker hosting Python (Pyodide) with the RoboFight engine.
// Messages: {id, type: "run" | "match" | "economy", ...}
/* global loadPyodide, importScripts */

const LOCAL = "../vendor/pyodide/";
const CDN = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";
const PY_FILES = ["__init__.py", "errors.py", "sandbox.py", "world.py", "robot_api.py", "runner.py",
  "data.py", "arena.py", "economy.py"];

let py = null;

async function fetchJSON(path) {
  const r = await fetch(path, { cache: "no-cache" });
  if (!r.ok) throw new Error("Datei fehlt: " + path);
  return r.json();
}

async function boot() {
  let indexURL = LOCAL;
  try {
    importScripts(LOCAL + "pyodide.js");
  } catch {
    importScripts(CDN + "pyodide.js");
    indexURL = CDN;
  }
  const pyodide = await loadPyodide({ indexURL });
  pyodide.FS.mkdirTree("/home/pyodide/robofight");
  await Promise.all(PY_FILES.map(async (f) => {
    const res = await fetch("../py/robofight/" + f, { cache: "no-cache" });
    if (!res.ok) throw new Error("Engine-Datei fehlt: " + f);
    pyodide.FS.writeFile("/home/pyodide/robofight/" + f, await res.text());
  }));
  const [parts, arenas, aiBots, missions, badges] = await Promise.all(
    ["parts", "arenas", "ai_bots", "missions", "badges"].map((n) => fetchJSON(`../${n}.json`)));
  await Promise.all(aiBots.map(async (b) => {
    b.code = await (await fetch("../bots/" + b.file, { cache: "no-cache" })).text();
  }));
  pyodide.runPython("import sys\nsys.path.insert(0, '/home/pyodide')\nimport robofight\nfrom robofight import data, economy");
  pyodide.globals.get("data").set_data_json(JSON.stringify({ parts, arenas, ai_bots: aiBots, missions, badges }));
  py = {
    runMission: pyodide.globals.get("robofight").run_mission_json,
    runMatch: pyodide.globals.get("robofight").run_match_json,
    economy: pyodide.globals.get("economy").call_json,
  };
  return { aiBots };
}

const ready = boot().then(
  ({ aiBots }) => postMessage({ type: "ready", aiBots }),
  (err) => postMessage({ type: "fatal", message: String(err) })
);

onmessage = async (e) => {
  const msg = e.data;
  await ready;
  try {
    let json;
    if (msg.type === "run") json = py.runMission(JSON.stringify(msg.mission), msg.code);
    else if (msg.type === "match") json = py.runMatch(JSON.stringify(msg.args));
    else if (msg.type === "economy") json = py.economy(msg.op, msg.profile ? JSON.stringify(msg.profile) : "", JSON.stringify(msg.args || {}));
    else throw new Error("unknown message " + msg.type);
    postMessage({ type: "result", id: msg.id, result: JSON.parse(json) });
  } catch (err) {
    postMessage({ type: "result", id: msg.id, error: String(err) });
  }
};
