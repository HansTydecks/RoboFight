// Code editor with touch key bar – shared by missions and the arena.
import { Editor } from "./editor.js";
import { icon } from "./ui.js";

export function keybarHTML() {
  return `
    <div class="keybar" role="toolbar" aria-label="Tasten">
      <button data-k="indent">⇥ Einrücken</button><button data-k="dedent">⇤</button>
      <button data-k="robot.">robot.</button><button data-k="()">( )</button><button data-k=":">:</button>
      <button data-k=" = "> = </button><button data-k=" == ">==</button><button data-k=" < "><</button>
      <button data-k=" > ">></button><button data-k='"'>"</button><button data-k="[]">[ ]</button>
      <button data-k="undo">${icon("undo")}</button>
    </div>`;
}

export function createEditor(root, host, opts) {
  const editor = new Editor(host, opts);
  root.querySelectorAll(".keybar button").forEach((b) => {
    b.onmousedown = (e) => e.preventDefault();
    b.onclick = () => {
      const k = b.dataset.k;
      if (k === "indent") editor.indent(1);
      else if (k === "dedent") editor.indent(-1);
      else if (k === "undo") editor.undo();
      else editor.insert(k);
    };
  });
  root.querySelectorAll("[data-snippet]").forEach((b) => (b.onclick = () => editor.insert(b.dataset.snippet)));
  return editor;
}

export function countLines(code) {
  return code.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).length;
}
