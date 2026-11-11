// Copies the browser runtime files of our npm dependencies into web/vendor,
// so the game is fully self-hosted (no third-party CDN – important for schools / GDPR).
import { cpSync, mkdirSync, rmSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const nm = join(root, "node_modules");
const out = join(root, "web", "vendor");

const files = {
  pyodide: ["pyodide.js", "pyodide.asm.js", "pyodide.asm.wasm", "python_stdlib.zip", "pyodide-lock.json"],
  codemirror: ["lib/codemirror.js", "lib/codemirror.css", "mode/python/python.js",
    "addon/edit/matchbrackets.js", "addon/edit/closebrackets.js"],
};

if (!existsSync(nm)) {
  console.error("node_modules fehlt – bitte zuerst `npm install` ausführen.");
  process.exit(1);
}
rmSync(out, { recursive: true, force: true });
for (const [pkg, list] of Object.entries(files)) {
  for (const f of list) {
    const dest = join(out, pkg, f);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(join(nm, pkg, f), dest);
  }
}
console.log("Vendor-Dateien nach web/vendor kopiert.");
