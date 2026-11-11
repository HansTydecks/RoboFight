// Code editor wrapper: CodeMirror 5 if available, plain <textarea> otherwise.
/* global CodeMirror */

export class Editor {
  constructor(host, { value = "", onChange } = {}) {
    this.onChange = onChange || (() => {});
    this.activeLine = null;
    this.errorLine = null;
    if (typeof CodeMirror !== "undefined") {
      this.cm = CodeMirror(host, {
        value,
        mode: "python",
        lineNumbers: true,
        indentUnit: 4,
        tabSize: 4,
        indentWithTabs: false,
        matchBrackets: true,
        autoCloseBrackets: true,
        lineWrapping: false,
        inputStyle: "contenteditable",
        extraKeys: {
          Tab: (cm) =>
            cm.somethingSelected() ? cm.indentSelection("add") : cm.replaceSelection("    ", "end"),
          "Shift-Tab": (cm) => cm.indentSelection("subtract"),
          "Ctrl-Enter": () => this.onRun && this.onRun(),
          "Cmd-Enter": () => this.onRun && this.onRun(),
        },
      });
      this.cm.on("change", () => {
        this.clearMarks();
        this.onChange(this.value);
      });
    } else {
      this.ta = document.createElement("textarea");
      this.ta.className = "fallback-editor";
      this.ta.spellcheck = false;
      this.ta.value = value;
      this.ta.addEventListener("input", () => this.onChange(this.value));
      host.appendChild(this.ta);
    }
  }

  get value() {
    return this.cm ? this.cm.getValue() : this.ta.value;
  }

  set value(v) {
    if (this.cm) this.cm.setValue(v);
    else this.ta.value = v;
  }

  refresh() {
    this.cm?.refresh();
  }

  focus() {
    this.cm ? this.cm.focus() : this.ta.focus();
  }

  /** Insert text at cursor; continuation lines get the cursor line's indentation. */
  insert(text) {
    if (this.cm) {
      const cur = this.cm.getCursor();
      const line = this.cm.getLine(cur.line);
      const indent = line.match(/^\s*/)[0];
      const onEmptyLine = line.trim() === "";
      let t = text.replace(/\n/g, "\n" + indent);
      if (!onEmptyLine && cur.ch === line.length && text.includes("\n")) t = "\n" + indent + t;
      this.cm.replaceSelection(t, "end");
      this.cm.focus();
    } else {
      const { selectionStart: a, selectionEnd: b, value } = this.ta;
      this.ta.value = value.slice(0, a) + text + value.slice(b);
      this.ta.selectionStart = this.ta.selectionEnd = a + text.length;
      this.ta.focus();
      this.onChange(this.value);
    }
  }

  indent(dir) {
    if (!this.cm) return this.insert(dir > 0 ? "    " : "");
    if (dir > 0 && !this.cm.somethingSelected()) {
      const cur = this.cm.getCursor();
      this.cm.indentLine(cur.line, "add");
    } else {
      this.cm.indentSelection(dir > 0 ? "add" : "subtract");
    }
    this.cm.focus();
  }

  undo() {
    this.cm?.undo();
  }

  setActiveLine(n) {
    if (!this.cm || n === this.activeLine) return;
    if (this.activeLine != null) this.cm.removeLineClass(this.activeLine - 1, "background", "cm-active-run");
    this.activeLine = n;
    if (n != null && n <= this.cm.lineCount()) {
      this.cm.addLineClass(n - 1, "background", "cm-active-run");
    }
  }

  setErrorLine(n) {
    if (!this.cm) return;
    if (this.errorLine != null) this.cm.removeLineClass(this.errorLine - 1, "background", "cm-error-line");
    this.errorLine = n;
    if (n != null && n <= this.cm.lineCount()) {
      this.cm.addLineClass(n - 1, "background", "cm-error-line");
      this.cm.scrollIntoView({ line: n - 1, ch: 0 }, 60);
    }
  }

  clearMarks() {
    this.setActiveLine(null);
    this.setErrorLine(null);
  }
}
