// Web worker that hosts Python (Pyodide) and the RoboFight engine.
// Runs off the main thread so a slow robot program never freezes the UI.
/* global loadPyodide, importScripts */

const LOCAL = "../vendor/pyodide/";
const CDN = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";
const PY_FILES = ["__init__.py", "errors.py", "world.py", "robot_api.py", "runner.py"];

let runMission = null;

async function boot() {
  let indexURL = LOCAL;
  try {
    importScripts(LOCAL + "pyodide.js");
  } catch {
    // Fallback if vendor files were not installed (npm install).
    importScripts(CDN + "pyodide.js");
    indexURL = CDN;
  }
  const pyodide = await loadPyodide({ indexURL });
  pyodide.FS.mkdirTree("/home/pyodide/robofight");
  for (const f of PY_FILES) {
    const res = await fetch("../py/robofight/" + f, { cache: "no-cache" });
    if (!res.ok) throw new Error("Engine-Datei fehlt: " + f);
    pyodide.FS.writeFile("/home/pyodide/robofight/" + f, await res.text());
  }
  pyodide.runPython(
    "import sys\nsys.path.insert(0, '/home/pyodide')\nfrom robofight import run_mission_json"
  );
  runMission = pyodide.globals.get("run_mission_json");
}

const ready = boot().then(
  () => postMessage({ type: "ready" }),
  (err) => postMessage({ type: "fatal", message: String(err) })
);

onmessage = async (e) => {
  const { id, mission, code } = e.data;
  await ready;
  try {
    const json = runMission(JSON.stringify(mission), code);
    postMessage({ type: "result", id, result: JSON.parse(json) });
  } catch (err) {
    postMessage({ type: "result", id, error: String(err) });
  }
};
