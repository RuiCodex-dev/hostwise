// Tiny DOM helpers. All user and API text goes through textContent, never innerHTML.
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === undefined || v === null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "style") el.style.cssText = v; // CSSOM, allowed under the strict CSP
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "dataset") Object.assign(el.dataset, v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children.flat()) {
    if (c === undefined || c === null || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return el;
}

const SVG = "http://www.w3.org/2000/svg";
export function s(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, String(v));
  for (const c of children.flat()) if (c !== undefined && c !== null) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

export function icon(name, cls = "icon") {
  const svg = s("svg", { class: cls, "aria-hidden": "true" });
  svg.append(s("use", { href: `/img/icons.svg#i-${name}` }));
  return svg;
}

export function img(src, alt, cls) {
  if (!src) return h("span", { class: cls ? `${cls} ph` : "ph", "aria-hidden": "true" });
  const el = h("img", { src, alt, class: cls, loading: "lazy", decoding: "async", referrerpolicy: "no-referrer" });
  el.addEventListener("error", () => el.replaceWith(h("span", { class: cls ? `${cls} ph` : "ph", "aria-hidden": "true" })), { once: true });
  return el;
}
