import { h, icon, img } from "./dom.js";
import { makeRenderer } from "./render.js";

const KINDS = [
  ["movie", "Film"], ["tv_show", "Series"], ["artist", "Music"], ["book", "Book"],
  ["podcast", "Podcast"], ["video_game", "Game"], ["destination", "Place"],
];
const KIND_LABEL = Object.fromEntries(KINDS);
const DIETS = [
  ["vegetarian", "Vegetarian"], ["vegan", "Vegan"], ["gluten_free", "Gluten-free"],
  ["dairy_free", "Dairy-free"], ["nut_free", "Nut allergy"], ["no_alcohol", "No alcohol"],
];
const MAX_GUESTS = 8;
const MAX_FAVS = 4;
const STORE = "hostwise.table.v1";

const state = { guests: [], running: false };
const $ = (sel) => document.querySelector(sel);
const render = makeRenderer(() => state.guests.map((g, i) => g.name.trim() || `Guest ${i + 1}`));

// ---------- persistence (browser only) ----------
function save() {
  try { localStorage.setItem(STORE, JSON.stringify(state.guests)); } catch { /* storage may be blocked */ }
}
function load() {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) || "null");
    if (Array.isArray(v) && v.length) return v;
  } catch { /* ignore */ }
  return null;
}

// ---------- builder ----------
function newGuest() {
  return { name: "", favourites: [], diets: [] };
}

function renderGuests() {
  const root = $("#guests");
  root.replaceChildren(...state.guests.map((g, i) => guestCard(g, i)));
  $("#add-guest").disabled = state.guests.length >= MAX_GUESTS;
  validate();
}

function guestCard(g, i) {
  const node = $("#guest-tpl").content.firstElementChild.cloneNode(true);
  node.setAttribute("aria-label", `Guest ${i + 1}`);
  const nameInput = node.querySelector(".guest-name");
  nameInput.value = g.name;
  nameInput.placeholder = `Guest ${i + 1}`;
  nameInput.addEventListener("input", () => { g.name = nameInput.value; save(); });
  node.querySelector(".guest-remove").addEventListener("click", () => {
    state.guests.splice(i, 1);
    if (state.guests.length < 2) state.guests.push(newGuest());
    save(); renderGuests();
  });

  const favs = node.querySelector(".favs");
  g.favourites.forEach((f, k) => {
    favs.append(h("li", { class: "fav" },
      img(f.image, ""),
      h("span", { class: "meta" }, h("span", { class: "name" }, f.name), h("span", { class: "sub" }, [KIND_LABEL[f.kind], f.sub].filter(Boolean).join(" · "))),
      h("button", { type: "button", class: "icon-btn", "aria-label": `Remove ${f.name}`, onclick: () => { g.favourites.splice(k, 1); save(); renderGuests(); } }, icon("x")),
    ));
  });

  const form = node.querySelector(".fav-form");
  const kind = node.querySelector(".fav-kind");
  for (const [v, label] of KINDS) kind.append(h("option", { value: v }, label));
  kind.value = g.lastKind || "movie";
  kind.addEventListener("change", () => { g.lastKind = kind.value; });
  const text = node.querySelector(".fav-text");
  const results = node.querySelector(".fav-results");
  if (g.favourites.length >= MAX_FAVS) form.hidden = true;

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = text.value.trim();
    if (q.length < 2) return;
    results.hidden = false;
    results.replaceChildren(h("li", { class: "state" }, "Looking it up in Qloo..."));
    try {
      const list = await search(q, kind.value);
      if (!list.length) {
        results.replaceChildren(h("li", { class: "state" }, "No match. Try the original title or another type."));
        return;
      }
      results.replaceChildren(...list.map((r) => h("li", {}, h("button", {
        type: "button",
        onclick: () => {
          if (!g.favourites.some((f) => f.id === r.id)) {
            g.favourites.push({ id: r.id, name: r.name, kind: kind.value, image: r.image, sub: r.disambiguation || (r.year ? String(r.year) : "") });
          }
          save(); renderGuests();
          const again = document.querySelectorAll(".guest")[i]?.querySelector(".fav-text");
          again?.focus();
        },
      }, img(r.image, ""), h("span", { class: "meta" }, h("span", { class: "name" }, r.name), " ", h("span", { class: "sub muted small" }, r.disambiguation || r.year || ""))))));
      results.querySelector("button")?.focus();
    } catch (err) {
      results.replaceChildren(h("li", { class: "state" }, err.message));
    }
  });
  node.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !results.hidden) { results.hidden = true; text.focus(); }
  });

  const diets = node.querySelector(".diets");
  for (const [v, label] of DIETS) {
    const on = g.diets.includes(v);
    diets.append(h("button", {
      type: "button", class: "chip", "aria-pressed": on ? "true" : "false",
      onclick: (e) => {
        g.diets = on ? g.diets.filter((d) => d !== v) : [...g.diets, v];
        e.currentTarget.setAttribute("aria-pressed", on ? "false" : "true");
        save(); renderGuests();
      },
    }, label));
  }
  return node;
}

const searchCache = new Map();
async function search(q, kind) {
  const key = `${kind}|${q.toLowerCase()}`;
  if (searchCache.has(key)) return searchCache.get(key);
  const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&kind=${encodeURIComponent(kind)}`);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Search failed.");
  searchCache.set(key, data.results);
  return data.results;
}

function validate() {
  const btn = $("#plan-btn");
  const hint = $("#plan-hint");
  const filled = state.guests.filter((g) => g.favourites.length);
  let msg = "";
  if (state.guests.length < 2) msg = "Add at least two guests.";
  else if (filled.length < state.guests.length) msg = `${state.guests.length - filled.length} guest${state.guests.length - filled.length > 1 ? "s need" : " needs"} at least one favourite.`;
  btn.disabled = Boolean(msg) || state.running;
  hint.textContent = state.running ? "" : msg;
}

async function loadSample(id) {
  const res = await fetch("/samples.json");
  const { tables } = await res.json();
  const t = tables.find((x) => x.id === id);
  if (!t) return;
  document.getElementById("builder").scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  state.guests = t.guests.map((g) => ({ name: g.name, favourites: [], diets: [...g.diets] }));
  renderGuests();
  $("#plan-hint").textContent = `Finding ${t.title.toLowerCase()} favourites in Qloo...`;
  await Promise.all(t.guests.map(async (g, i) => {
    for (const [text, kind] of g.favourites) {
      try {
        const [top] = await search(text, kind);
        if (top) state.guests[i].favourites.push({ id: top.id, name: top.name, kind, image: top.image, sub: top.disambiguation || (top.year ? String(top.year) : "") });
      } catch { /* leave it out */ }
    }
  }));
  save(); renderGuests();
}

// ---------- planning ----------
async function plan() {
  if (state.running) return;
  state.running = true;
  validate();
  const evening = $("#evening");
  evening.hidden = false;
  $("#guest-names").textContent = joinNames(state.guests.map((g, i) => g.name.trim() || `Guest ${i + 1}`));
  $("#host-note").replaceChildren(h("span", { class: "skeleton-line" }), h("span", { class: "skeleton-line short" }));
  $("#trace").replaceChildren();
  $("#trace-usage").textContent = "";
  for (const sec of document.querySelectorAll(".plan-section")) { sec.dataset.state = "waiting"; sec.querySelector(".sec-body").replaceChildren(); }
  evening.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });

  // Only Qloo ids, titles and kinds plus dietary flags leave the browser. Names do not.
  const body = { guests: state.guests.map((g) => ({ favourites: g.favourites.map((f) => ({ id: f.id, name: f.name, kind: f.kind })), diets: g.diets })) };
  const tools = new Map();
  const trace = $("#trace");
  let liveCalls = 0, cachedCalls = 0;
  try {
    const res = await fetch("/api/plan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || "The planner could not start.");
    }
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let idx;
      while ((idx = buf.indexOf("\n\n")) >= 0) {
        const chunk = buf.slice(0, idx);
        buf = buf.slice(idx + 2);
        const line = chunk.split("\n").find((l) => l.startsWith("data: "));
        if (!line) continue;
        const ev = JSON.parse(line.slice(6));
        if (ev.type === "thought") trace.append(render.thought(ev));
        else if (ev.type === "tool") {
          if (tools.has(ev.id)) render.updateTool(tools.get(ev.id), ev);
          else { const li = render.tool(ev); tools.set(ev.id, li); trace.append(li); }
          if (ev.status === "ok") { ev.provenance?.cached ? cachedCalls++ : liveCalls++; }
          $("#trace-usage").textContent = `${tools.size} tool calls · ${liveCalls} live Qloo requests · ${cachedCalls} from cache`;
          { const sc = $("#trace-scroll"); sc.scrollTop = sc.scrollHeight; }
        } else if (ev.type === "section") showSection(ev.key, ev.data);
        else if (ev.type === "done") {
          $("#host-note").textContent = render.sub(ev.plan.note.text);
          for (const sec of document.querySelectorAll('.plan-section[data-state="waiting"]')) {
            sec.dataset.state = "done";
            sec.querySelector(".sec-body").replaceChildren(h("p", { class: "muted" }, "Qloo had nothing confident to say here, so the agent left it out rather than guess."));
          }
        } else if (ev.type === "error") throw new Error(ev.message);
      }
    }
  } catch (err) {
    $("#host-note").replaceChildren(h("span", { class: "error-box" }, err.message));
  } finally {
    state.running = false;
    validate();
  }
}

function showSection(key, data) {
  const sec = document.getElementById(`sec-${key}`);
  if (!sec || !render[key]) return;
  sec.querySelector(".sec-body").replaceChildren(render[key](data));
  sec.dataset.state = "done";
}

function joinNames(list) {
  if (list.length <= 2) return list.join(" and ");
  return `${list.slice(0, -1).join(", ")} and ${list[list.length - 1]}`;
}

// ---------- boot ----------
state.guests = load() || [newGuest(), newGuest(), newGuest()];
renderGuests();
$("#add-guest").addEventListener("click", () => {
  if (state.guests.length >= MAX_GUESTS) return;
  state.guests.push(newGuest());
  save(); renderGuests();
  document.querySelectorAll(".guest-name")[state.guests.length - 1]?.focus();
});
$("#plan-btn").addEventListener("click", plan);
$("#print-btn").addEventListener("click", () => window.print());
$("#edit-btn").addEventListener("click", () => document.getElementById("builder").scrollIntoView());
for (const b of document.querySelectorAll("[data-sample]")) b.addEventListener("click", () => loadSample(b.dataset.sample));
