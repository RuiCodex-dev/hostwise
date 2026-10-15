import { test } from "node:test";
import assert from "node:assert/strict";
import { rankForGroup, normalisePerGuest, groupScore, fairnessGap } from "../server/agent/fairness.js";
import { bestSeating, permutations } from "../server/agent/seating.js";
import { cuisineForTag, buildMenu, pickDish, CUISINES } from "../server/agent/cuisine.js";
import { pickShared, rankShared, sharedCard, pairSimilarity } from "../server/agent/conversation.js";
import { Planner, validateTable } from "../server/agent/planner.js";
import { trimToSentence } from "../server/agent/tools.js";
import { makeFakeQloo, table } from "./fake-qloo.js";

test("normalisation is per guest, so a narrow band still ranks", () => {
  const aff = new Map([["a", [0.91, 0.5]], ["b", [0.92, 0.9]], ["c", [0.93, null]]]);
  const fit = normalisePerGuest(aff, 2);
  assert.deepEqual(fit.get("a"), [0, 0]);
  assert.equal(Math.round(fit.get("b")[0] * 100), 50);
  assert.deepEqual(fit.get("c"), [1, 0]); // missing affinity counts as no fit
});

test("least misery beats a pick one guest hates", () => {
  const aff = new Map([["crowd", [1, 1, 0.0]], ["fair", [0.7, 0.7, 0.7]], ["low", [0.2, 0.2, 0.2]]]);
  const ranked = rankForGroup(aff, 3);
  assert.equal(ranked[0].id, "fair");
  assert.deepEqual(ranked.find((r) => r.id === "crowd").leftOut, [2]);
  assert.ok(groupScore([1, 1, 0]) < groupScore([0.6, 0.6, 0.6]));
  const gap = fairnessGap(ranked, "crowd");
  assert.equal(gap.improved, true);
});

test("seating maximises the weakest neighbour pair", () => {
  // 0-1 and 2-3 love each other, 0-2 and 1-3 share nothing.
  const sim = [
    [0, 5, 0, 1],
    [5, 0, 1, 0],
    [0, 1, 0, 5],
    [1, 0, 5, 0],
  ];
  const best = bestSeating(sim);
  assert.equal(best.weakest, 1);
  assert.equal(best.order.length, 4);
  assert.equal([...permutations([1, 2, 3])].length, 6);
  assert.deepEqual(bestSeating([[0]]).order, [0]);
});

test("cuisine mapping ignores venue types and honours diets", () => {
  assert.equal(cuisineForTag("French"), CUISINES.find((c) => c.key === "french"));
  assert.equal(cuisineForTag("Pizza").key, "italian");
  assert.equal(cuisineForTag("Bar"), null);
  assert.equal(cuisineForTag("Coffee shop"), null);
  const menu = buildMenu(cuisineForTag("Italian"), ["vegan", "no_alcohol"]);
  assert.equal(menu.allZeroProof, true);
  for (const c of menu.courses) assert.equal(c.inclusive, true, c.course);
  const none = pickDish([{ name: "Steak", flags: [] }, { name: "Salad", flags: ["v"] }], ["gf"]);
  assert.equal(none.inclusive, false);
  assert.equal(none.alternative, undefined); // the salad isn't gluten-free either, so no false promise
  const split = pickDish([{ name: "Bread", flags: ["v", "vg"] }, { name: "Rice", flags: ["gf"] }], ["vg", "gf"]);
  assert.equal(split.inclusive, false);
  assert.ok(split.alternative);
});

test("every cuisine offers a vegan option for each course", () => {
  for (const c of CUISINES) {
    for (const course of ["starter", "main", "dessert"]) {
      assert.ok(c[course].some((d) => ["v", "vg", "df"].every((f) => d.flags.includes(f))), `${c.key} ${course}`);
    }
  }
});

test("conversation picks specific shared tags, never bland ones, and never repeats", () => {
  const tags = [
    { name: "Engaging", subtype: "urn:tag:style:qloo", query: { score: 0.95 } },
    { name: "Blues", subtype: "urn:tag:genre:music", query: { score: 0.9 } },
    { name: "Hero's Journey", subtype: "urn:tag:archetype:qloo", query: { score: 0.73 } },
  ];
  assert.ok(!rankShared(tags).some((t) => t.name === "Engaging"));
  assert.equal(pickShared(tags, new Set(["blues"])).name, "Hero's Journey");
  assert.equal(pickShared([{ name: "Engaging", subtype: "urn:tag:style:qloo", query: { score: 1 } }]), null);
  const card = sharedCard(tags[2], 0, 3);
  assert.match(card.text, /\{\{g0\}\}/);
  assert.match(card.text, /\{\{g3\}\}/);
  assert.ok(pairSimilarity(tags) > pairSimilarity([tags[0]]));
});

test("blurbs are trimmed at a sentence boundary", () => {
  const t = "First sentence is here. Second sentence goes on and on and on and on and on and on and on and on and on.";
  assert.equal(trimToSentence(t, 60), "First sentence is here.");
  assert.equal(trimToSentence("short", 60), "short");
  assert.equal(trimToSentence("", 60), null);
});

test("table validation", () => {
  assert.match(validateTable({ guests: [] }), /two guests/);
  assert.match(validateTable({ guests: [{ favourites: [{ id: "x" }] }, { favourites: [] }] }), /favourite/);
  assert.match(validateTable({ guests: [{ favourites: [{ id: "bad id!" }] }, { favourites: [{ id: "bad id!" }] }] }), /invalid/);
  assert.equal(validateTable(table(3)), null);
  assert.match(validateTable(table(9)), /up to 8/);
});

test("planner runs the full loop, emits provenance and never sees guest names", async () => {
  const qloo = makeFakeQloo();
  const events = [];
  const plan = await new Planner({ qloo, emit: (e) => events.push(e) }).run(table(3));
  for (const key of ["soundtrack", "film", "menu", "seating", "deck"]) assert.ok(plan.sections[key], key);
  assert.equal(plan.sections.seating.order.length, 3);
  assert.ok(plan.sections.deck.cards.length >= 3);
  const tools = events.filter((e) => e.type === "tool" && e.status === "ok");
  assert.ok(tools.every((e) => e.provenance && e.provenance.path && !JSON.stringify(e.provenance).toLowerCase().includes("api-key")));
  // Diets are handled locally: no Qloo request carries them.
  assert.ok(!JSON.stringify(qloo.calls).includes("vegan"));
  // The vegan guest gets an inclusive menu.
  assert.ok(plan.sections.menu.courses.every((c) => c.inclusive));
  assert.equal(plan.note.by, "template");
});

test("planner re-plans when a guest would be left out", async () => {
  const left = "G2000000-1111-2222-3333-444444444444";
  const qloo = makeFakeQloo({ leftOutGuestSignal: left });
  const events = [];
  const plan = await new Planner({ qloo, emit: (e) => events.push(e) }).run(table(3));
  const replans = events.filter((e) => e.type === "thought" && e.phase === "replan");
  assert.ok(replans.length >= 1, "expected a re-plan thought");
  assert.ok(events.some((e) => e.type === "tool" && e.tool === "personal_picks"));
  const r = plan.sections.film.replanned;
  assert.ok(r, "film section records the re-plan");
  assert.ok(r.leftOut.length >= 1);
  assert.ok(r.after.minFit > r.before.minFit);
  assert.ok(plan.sections.film.pick.id.startsWith("R"));
});

test("planner rejects films that are too long for after dinner", async () => {
  const qloo = makeFakeQloo();
  const orig = qloo.insights;
  qloo.insights = async (params) => {
    const r = await orig(params);
    for (const e of r.body.results?.entities || []) if (e.entity_id.endsWith("5")) e.properties.duration = 190;
    return r;
  };
  const plan = await new Planner({ qloo }).run(table(2));
  assert.ok(plan.sections.film.rejected.some((x) => /190 min/.test(x.reason)));
  assert.notEqual(plan.sections.film.pick.duration, 190);
});

test("a failing tool degrades a section instead of crashing the plan", async () => {
  const qloo = makeFakeQloo();
  qloo.compare = async () => {
    const e = new Error("boom");
    e.code = "QLOO_UPSTREAM";
    throw e;
  };
  const events = [];
  const plan = await new Planner({ qloo, emit: (e) => events.push(e) }).run(table(3));
  assert.ok(events.some((e) => e.type === "tool" && e.status === "error"));
  assert.ok(plan.sections.menu);
});
