// Live smoke test: resolve a sample table through Qloo search, run the planner, print the trace.
// Uses a private disk cache (.cache/qloo, git-ignored) so reruns cost no Qloo calls.
import { readFileSync } from "node:fs";
import { loadConfig } from "../server/config.js";
import { QlooClient } from "../server/qloo.js";
import { makeTools } from "../server/agent/tools.js";
import { Planner } from "../server/agent/planner.js";

const id = process.argv[2] || "neighbours";
const cfg = loadConfig();
const qloo = new QlooClient({ apiKey: cfg.qlooKey, baseUrl: cfg.qlooBaseUrl, dailyCap: 400, cacheDir: ".cache/qloo" });
const tools = makeTools(qloo);
const table = JSON.parse(readFileSync("public/samples.json", "utf8")).tables.find((t) => t.id === id);
const guests = [];
for (const g of table.guests) {
  const favourites = [];
  for (const [text, kind] of g.favourites) {
    const { observation } = await tools.resolve_favourite({ text, kind });
    const top = observation[0];
    console.log(`resolve ${kind} "${text}" -> ${top ? `${top.name} (${top.disambiguation || top.year || ""})` : "NONE"}`);
    if (top) favourites.push({ id: top.id, name: top.name, kind });
  }
  guests.push({ favourites, diets: g.diets });
}
const names = table.guests.map((g) => g.name);
const sub = (s) => String(s).replace(/\{\{g(\d+)\}\}/g, (_, i) => names[i]);
const planner = new Planner({
  qloo,
  emit: (e) => {
    if (e.type === "thought") console.log(`  · ${sub(e.text)}`);
    if (e.type === "tool" && e.status !== "running") console.log(`    [${e.tool}] ${sub(e.label)} ${e.status}${e.provenance?.cached ? " (cached)" : ""} n=${e.provenance?.count ?? "-"}${e.error ? " " + e.error.code : ""}`);
  },
});
const plan = await planner.run({ guests });
const s = plan.sections;
console.log("\nSOUNDTRACK arrival:", s.soundtrack?.arrival.map((a) => a.name), "late:", s.soundtrack?.late.map((a) => a.name));
console.log("FILM:", s.film?.pick.name, s.film?.pick.fits, "alts:", s.film?.alternates.map((a) => a.name), "rejected:", s.film?.rejected);
console.log("FILM baseline:", s.film?.baseline, "replanned:", s.film?.replanned);
console.log("MENU:", s.menu?.label, s.menu?.courses.map((c) => c.dish), s.menu?.drink, s.menu?.evidence?.map((e) => `${e.label}:${e.fits}`));
console.log("SEATING:", s.seating?.order.map((i) => names[i]), s.seating?.pairs.map((p) => `${names[p.a]}-${names[p.b]}:${p.bridge}`));
console.log("DECK:"); for (const c of s.deck.cards) console.log("  -", sub(c.text));
console.log("NOTE:", sub(plan.note.text));
console.log("USAGE:", plan.usage);
