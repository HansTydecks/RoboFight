// Small DOM helpers shared by all screens.
import { icon } from "./icons.js";

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Tiny markdown: ```blocks```, `code`, newlines. */
export function md(text) {
  return esc(text)
    .replace(/```\n?([\s\S]*?)```/g, (_, c) => `<pre class="snippet">${c.replace(/\n$/, "")}</pre>`)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/\[([^\]]+)\]\((#[^)\s]*|https?:[^)\s]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\n(?![^<]*<\/pre>)/g, "<br>");
}

export function stars(n, total = 3, cls = "") {
  let s = "";
  for (let i = 0; i < total; i++) s += `<span class="star ${i < n ? "on" : ""} ${cls}">${icon("star")}</span>`;
  return s;
}

export function bolts(n) {
  return `<span class="bolts">${icon("nut")}<b>${n}</b></span>`;
}

export function toast(text, kind = "info", ms = 3200) {
  let host = $("#toasts");
  if (!host) {
    host = document.createElement("div");
    host.id = "toasts";
    document.body.appendChild(host);
  }
  const el = document.createElement("div");
  el.className = "toast " + kind;
  el.innerHTML = md(text);
  host.appendChild(el);
  setTimeout(() => el.classList.add("out"), ms);
  setTimeout(() => el.remove(), ms + 400);
}

export function openModal(html, { wide = false } = {}) {
  const m = $("#modal");
  const card = $(".modal-card", m);
  card.classList.toggle("wide", wide);
  card.innerHTML = html;
  m.hidden = false;
  return card;
}

export function closeModal() {
  const m = $("#modal");
  if (m) m.hidden = true;
}

export function confetti() {
  let seed = 7;
  const rnd = () => (seed = (seed * 9301 + 49297) % 233280) / 233280;
  return `<div class="confetti" aria-hidden="true">${Array.from({ length: 36 }, (_, i) =>
    `<i style="--i:${i};--x:${Math.round(rnd() * 100)};--dx:${Math.round(rnd() * 120 - 60)}px;` +
    `--r:${Math.round(rnd() * 720 - 360)}deg;--d:${(1.2 + rnd()).toFixed(2)}s;--delay:${Math.round(rnd() * 400)}ms"></i>`
  ).join("")}</div>`;
}

export function shake(el) {
  if (!el) return;
  el.classList.remove("shake");
  void el.offsetWidth;
  el.classList.add("shake");
}

export { icon };
