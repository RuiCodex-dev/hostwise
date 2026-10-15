// Hostwise planner: a goal-driven agent loop over Qloo tools.
//
// For every goal (soundtrack, film, menu, seating, conversation) the agent
//   1. gathers candidates from the whole table's taste (pooled Qloo insights),
//   2. scores the shortlist against EACH guest separately (Qloo affinity),
//   3. critiques its own pick with a least-misery fairness test,
//   4. re-plans when someone would be left out (personal picks for that guest,
//      re-scored for everyone), and checks hard constraints (e.g. film length),
//   5. records evidence and provenance for every decision.
// The loop is deterministic; an optional LLM only words the host's note.
import { rankForGroup, fairnessGap, LEFT_OUT } from "./fairness.js";
import { bestSeating } from "./seating.js";
import { CUISINES, cuisineForTag, buildMenu, pickDish, dietNeeds } from "./cuisine.js";
import { sharedCard, contrastCard, destinationCard, filmCard, pickShared, pickDistinct, pairSimilarity, rankShared } from "./conversation.js";
import { makeTools } from "./tools.js";

export const MAX_GUESTS = 8;
const FILM_MAX_MINUTES = 140;

const G = (i) => `{{g${i}}}`;
const pct = (x) => `${Math.round(x * 100)}%`;

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

export function validateTable(input) {
  const guests = Array.isArray(input?.guests) ? input.guests : [];
  if (guests.length < 2) return "Add at least two guests.";
  if (guests.length > MAX_GUESTS) return `Hostwise plans for up to ${MAX_GUESTS} guests.`;
  for (const [i, g] of guests.entries()) {
    const favs = Array.isArray(g.favourites) ? g.favourites : [];
    if (!favs.length) return `Guest ${i + 1} needs at least one favourite.`;
    if (favs.length > 6) return `Guest ${i + 1} has more than six favourites.`;
    for (const f of favs) {
      if (typeof f?.id !== "string" || !/^[A-Za-z0-9-]{8,64}$/.test(f.id)) return "A favourite has an invalid Qloo id.";
    }
  }
  return null;
}

export class Planner {
  constructor({ qloo, narrator = null, emit = () => {} }) {
    this.tools = makeTools(qloo);
    this.qloo = qloo;
    this.narrator = narrator;
    this.emit = emit;
    this.step = 0;
  }

  think(text, extra = {}) {
    this.emit({ type: "thought", text, ...extra });
  }

  async call(tool, args, label) {
    const id = `t${++this.step}`;
    this.emit({ type: "tool", id, tool, label, status: "running" });
    try {
      const { observation, provenance } = await this.tools[tool](args);
      this.emit({ type: "tool", id, tool, label, status: "ok", provenance });
      return observation;
    } catch (err) {
      this.emit({ type: "tool", id, tool, label, status: "error", error: { code: err.code || "ERROR", message: err.message } });
      if (err.code === "QLOO_DAILY_CAP" || err.code === "QLOO_AUTH") throw err;
      return null;
    }
  }

  async run(input) {
    const guests = input.guests.map((g, i) => ({
      index: i,
      ids: g.favourites.map((f) => f.id),
      favourites: g.favourites.map((f) => ({ id: f.id, name: String(f.name || "").slice(0, 120), kind: f.kind || null })),
      diets: (g.diets || []).filter((d) => typeof d === "string"),
    }));
    this.guests = guests;
    this.owner = new Map();
    for (const g of guests) for (const id of g.ids) this.owner.set(id, g.index);
    const all = [...new Set(guests.flatMap((g) => g.ids))];

    const kinds = new Set(guests.flatMap((g) => g.favourites.map((f) => f.kind)).filter(Boolean));
    this.think(
      `Reading the table: ${guests.length} guests, ${all.length} favourites across ${kinds.size || "several"} domains. ` +
        `Nobody gave me a cuisine or a playlist, so I'll infer those from cross-domain taste.`,
      { phase: "understand" },
    );

    const plan = { guests: guests.length, sections: {} };

    const soundtrack = await this.goalEntities({
      key: "soundtrack", type: "urn:entity:artist", all, take: 15, label: "Soundtrack",
      intro: "Goal 1: a soundtrack the whole room can live with. Pooling everyone's favourites first.",
    });
    if (soundtrack) {
      const picks = soundtrack.ranked.slice(0, 9);
      // Sequence: crowd-pleasers on arrival (highest least-misery), adventurous picks late (widest spread).
      const spread = (r) => Math.max(...r.fits) - Math.min(...r.fits);
      const arrival = picks.slice(0, 3);
      const rest = picks.slice(3).sort((a, b) => spread(a) - spread(b));
      plan.sections.soundtrack = {
        arrival: arrival.map((r) => this.card(soundtrack, r)),
        dinner: rest.slice(0, 3).map((r) => this.card(soundtrack, r)),
        late: rest.slice(3, 6).map((r) => this.card(soundtrack, r)),
        replanned: soundtrack.replanned,
        baseline: soundtrack.baseline && { ...soundtrack.baseline, pooledName: soundtrack.pooledTopName },
      };
      this.emit({ type: "section", key: "soundtrack", data: plan.sections.soundtrack });
    }

    const film = await this.goalEntities({
      key: "film", type: "urn:entity:movie", all, take: 15, label: "After-dinner film",
      intro: "Goal 2: one film for after dinner that nobody has to sit through politely.",
    });
    if (film) {
      const rejected = [];
      const fitsEvening = (r) => {
        const e = film.byId.get(r.id);
        if (e?.duration && e.duration > FILM_MAX_MINUTES) {
          rejected.push({ name: e.name, reason: `${e.duration} min is long for after dinner` });
          return false;
        }
        return true;
      };
      const ok = film.ranked.filter(fitsEvening);
      if (rejected.length) this.think(`Constraint check: skipping ${rejected.map((r) => r.name).join(", ")} (over ${FILM_MAX_MINUTES} minutes).`, { phase: "critique" });
      const chosen = ok[0] || film.ranked[0];
      plan.sections.film = {
        pick: this.card(film, chosen),
        alternates: ok.slice(1, 3).map((r) => this.card(film, r)),
        rejected,
        replanned: film.replanned,
        baseline: film.baseline && { ...film.baseline, chosenMinFit: chosen.minFit, improved: chosen.minFit > film.baseline.pooledMinFit, pooledName: film.pooledTopName },
      };
      this.emit({ type: "section", key: "film", data: plan.sections.film });
    }

    plan.sections.menu = await this.goalMenu(guests);
    if (plan.sections.menu) this.emit({ type: "section", key: "menu", data: plan.sections.menu });

    const trip = await this.goalEntities({
      key: "trip", type: "urn:entity:destination", all, take: 10, label: "Shared daydream", allowReplan: false, popularityMin: 0.4,
      intro: "Goal 4: a place this table would love together, as a conversation prompt.",
    });

    const seating = await this.goalSeating(guests);
    const deck = [...(seating?.cards || [])];
    if (trip?.ranked?.[0]) deck.push(destinationCard(trip.byId.get(trip.ranked[0].id)));
    if (plan.sections.film?.pick) deck.push(filmCard(plan.sections.film.pick));
    if (seating) {
      plan.sections.seating = { order: seating.order, pairs: seating.pairs, weakest: seating.weakest };
      this.emit({ type: "section", key: "seating", data: plan.sections.seating });
    }
    plan.sections.deck = { cards: deck, trip: trip?.ranked?.[0] ? this.card(trip, trip.ranked[0]) : null };
    this.emit({ type: "section", key: "deck", data: plan.sections.deck });

    plan.note = await this.hostNote(plan);
    plan.usage = this.qloo.usage();
    this.think("Plan complete. Every pick above shows which favourites pulled it in and how well it fits each guest.", { phase: "done" });
    return plan;
  }

  card(goal, r) {
    const e = goal.byId.get(r.id) || { id: r.id, name: r.id };
    // Who pulled this in: explainability shares from the pooled call, summed per guest.
    const pulled = new Array(this.guests.length).fill(0);
    const via = [];
    for (const x of e.explain || []) {
      const g = this.owner.get(x.id);
      if (g === undefined) continue;
      pulled[g] += x.score;
      const fav = this.guests[g].favourites.find((f) => f.id === x.id);
      if (fav && x.score >= 0.2) via.push({ guest: g, favourite: fav.name });
    }
    return {
      id: e.id, name: e.name, year: e.year, image: e.image, blurb: e.blurb, duration: e.duration, rating: e.rating,
      fits: r.fits.map((f) => Math.round(f * 100) / 100),
      raw: r.raw.map((v) => (typeof v === "number" ? Math.round(v * 1000) / 1000 : null)),
      score: Math.round(r.score * 100) / 100,
      pulled: pulled.map((v) => Math.round(v * 100) / 100),
      via: via.slice(0, 4),
      source: e.source || "pooled",
    };
  }

  // Generic candidate -> per-guest ranking -> critique -> re-plan loop for one entity type.
  async goalEntities({ key, type, all, take, label, intro, allowReplan = true, popularityMin }) {
    this.think(intro, { phase: "goal", goal: key });
    const pooled = await this.call("pooled_recommendations", { type, signals: all, take, exclude: all, popularityMin }, `${label}: pooled taste`);
    if (!pooled || !pooled.length) {
      this.think(`Qloo returned nothing for ${label.toLowerCase()}; skipping this part of the plan.`, { phase: "critique", goal: key });
      return null;
    }
    const byId = new Map();
    const exclude = new Set(all);
    for (const e of pooled) if (!exclude.has(e.id)) byId.set(e.id, { ...e, source: "pooled" });
    if (!byId.size) return null;
    const pooledTop = [...byId.keys()][0];

    let affinities = await this.scoreForEveryone(type, [...byId.keys()], label);
    let ranked = rankForGroup(affinities, this.guests.length);
    const baseline = fairnessGap(ranked, pooledTop);
    let replanned = null;

    const best = ranked[0];
    this.think(
      `${label}: best shortlist pick is ${byId.get(best.id).name}; its weakest fit is ${pct(best.minFit)} (${best.fits.map((f, g) => `${G(g)} ${pct(f)}`).join(", ")}).`,
      { phase: "critique", goal: key },
    );

    if (allowReplan && best.leftOut.length) {
      const who = best.leftOut;
      this.think(
        `Critique: ${who.map(G).join(" and ")} would be left out (below ${pct(LEFT_OUT)} fit). Re-planning: asking Qloo for ${who.length > 1 ? "their" : "their"} own picks and re-scoring those for everyone.`,
        { phase: "replan", goal: key },
      );
      const fresh = [];
      for (const g of who) {
        const picks = await this.call("personal_picks", { type, signals: this.guests[g].ids, take: 6, exclude: [...exclude, ...byId.keys()], popularityMin }, `${label}: picks for ${G(g)}`);
        for (const e of picks || []) if (!byId.has(e.id) && !exclude.has(e.id)) {
          byId.set(e.id, { ...e, source: `widened for ${G(g)}` });
          fresh.push(e.id);
        }
      }
      if (fresh.length) {
        const extra = await this.scoreForEveryone(type, fresh, label);
        // Raw affinities are absolute, so the merged pool can be renormalised fairly.
        affinities = new Map([...affinities, ...extra]);
        ranked = rankForGroup(affinities, this.guests.length);
        const after = ranked[0];
        replanned = {
          leftOut: who,
          before: { name: byId.get(best.id).name, minFit: Math.round(best.minFit * 100) / 100 },
          after: { name: byId.get(after.id).name, minFit: Math.round(after.minFit * 100) / 100 },
          added: fresh.length,
        };
        this.think(
          after.id === best.id
            ? `Re-plan checked ${fresh.length} new options; ${byId.get(after.id).name} still balances the table best.`
            : `Re-plan worked: ${byId.get(after.id).name} lifts the weakest fit from ${pct(best.minFit)} to ${pct(after.minFit)}.`,
          { phase: "replan", goal: key },
        );
      }
    }
    // Re-measure the pooled pick against the final pool so the comparison is like-for-like.
    return { key, ranked, byId, baseline: fairnessGap(ranked, pooledTop) || baseline, replanned, pooledTopName: byId.get(pooledTop)?.name || null };
  }

  async scoreForEveryone(type, candidateIds, label) {
    const perGuest = await mapLimit(this.guests, 2, (g) =>
      this.call("rank_for_guest", { type, signals: g.ids, candidates: candidateIds }, `${label}: score for ${G(g.index)}`),
    );
    const aff = new Map(candidateIds.map((id) => [id, perGuest.map((scores) => (scores && typeof scores[id] === "number" ? scores[id] : null))]));
    return aff;
  }

  async goalMenu(guests) {
    this.think("Goal 3: a menu. Nobody named a cuisine, so I'm asking which food cultures each guest's films, music and books lean towards.", { phase: "goal", goal: "menu" });
    const perGuest = await mapLimit(guests, 2, (g) => this.call("cuisine_affinity", { signals: g.ids }, `Menu: cuisine lean for ${G(g.index)}`));
    const aff = new Map();
    const tagsFor = new Map();
    perGuest.forEach((tags, gi) => {
      for (const t of tags || []) {
        const c = cuisineForTag(t.name);
        if (!c || typeof t.affinity !== "number") continue;
        if (!aff.has(c.key)) aff.set(c.key, new Array(guests.length).fill(null));
        const row = aff.get(c.key);
        if (row[gi] === null || t.affinity > row[gi]) row[gi] = t.affinity;
        if (!tagsFor.has(c.key)) tagsFor.set(c.key, new Set());
        tagsFor.get(c.key).add(t.name);
      }
    });
    if (!aff.size) {
      this.think("No cuisine signal came back; falling back to a Mediterranean mezze, the easiest table to share.", { phase: "critique", goal: "menu" });
      return { ...buildMenu(CUISINES.find((c) => c.key === "mediterranean"), guests.flatMap((g) => g.diets)), evidence: [], fallback: true };
    }
    const ranked = rankForGroup(aff, guests.length);
    const top = ranked[0];
    const cuisine = CUISINES.find((c) => c.key === top.id);
    const diets = [...new Set(guests.flatMap((g) => g.diets))];
    this.think(
      `Menu: ${cuisine.label} balances the table best (weakest fit ${pct(top.minFit)}). ` +
        (diets.length ? `Adapting dishes for ${diets.length} dietary need${diets.length > 1 ? "s" : ""} locally; those are never sent to Qloo.` : "No dietary needs to adapt for."),
      { phase: "critique", goal: "menu" },
    );
    // Critique: if the chosen cuisine leaves a guest out, add one accent dish from that guest's own best cuisine.
    const accents = [];
    const unserved = [];
    for (const g of top.leftOut) {
      const theirs = [...ranked].sort((x, y) => y.fits[g] - x.fits[g])[0];
      if (!theirs || theirs.id === top.id || theirs.fits[g] - top.fits[g] < 0.3) {
        unserved.push(g);
        continue;
      }
      const c = CUISINES.find((x) => x.key === theirs.id);
      if (accents.some((a) => a.key === c.key)) {
        accents.find((a) => a.key === c.key).guests.push(g);
        continue;
      }
      const dish = pickDish(c.starter, dietNeeds(diets));
      accents.push({ key: c.key, label: c.label, dish: dish.dish, guests: [g] });
    }
    if (accents.length) {
      this.think(
        `Critique: ${top.leftOut.map(G).join(" and ")} sit${top.leftOut.length > 1 ? "" : "s"} low on ${cuisine.label}. Re-planning the menu: adding ${accents.map((a) => `${/^[AEIOU]/i.test(a.label) ? "an" : "a"} ${a.label} starter (${a.dish})`).join(" and ")} as a bridge.`,
        { phase: "replan", goal: "menu" },
      );
    }
    if (unserved.length) {
      this.think(
        `Critique: Qloo shows no clear cuisine lean for ${unserved.map(G).join(" and ")}, so no bridge dish would be evidence-based. Flagging it for the host instead of guessing.`,
        { phase: "critique", goal: "menu" },
      );
    }
    return {
      ...buildMenu(cuisine, diets),
      accents,
      unserved,
      fits: top.fits.map((f) => Math.round(f * 100) / 100),
      evidence: ranked.slice(0, 4).map((r) => ({
        key: r.id, label: CUISINES.find((c) => c.key === r.id).label, fits: r.fits.map((f) => Math.round(f * 100) / 100),
        tags: [...(tagsFor.get(r.id) || [])].slice(0, 3),
      })),
    };
  }

  async goalSeating(guests) {
    const n = guests.length;
    this.think(`Goal 5: seating and conversation. Comparing every pair of guests' taste audiences (${(n * (n - 1)) / 2} comparisons).`, { phase: "goal", goal: "seating" });
    const pairs = [];
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) pairs.push([a, b]);
    const results = await mapLimit(pairs, 2, ([a, b]) => this.call("shared_ground", { a: guests[a].ids, b: guests[b].ids }, `Seating: ${G(a)} × ${G(b)}`));
    const sim = Array.from({ length: n }, () => new Array(n).fill(0));
    const info = new Map();
    pairs.forEach(([a, b], k) => {
      const r = results[k] || { shared: [], a: [], b: [] };
      sim[a][b] = sim[b][a] = pairSimilarity(r.shared);
      info.set(`${a}-${b}`, r);
    });
    const seat = bestSeating(sim);
    const order = seat.order;
    const outPairs = [];
    const cards = [];
    const used = new Set();
    // Assign bridges to the pairs with the least shared ground first, so they get the best unique topic.
    const seatPairs = [];
    for (let k = 0; k < order.length; k++) {
      if (order.length === 2 && k === 1) break;
      const x = order[k];
      const y = order[(k + 1) % order.length];
      seatPairs.push(x < y ? [x, y] : [y, x]);
    }
    const bridgeFor = new Map();
    for (const [a, b] of [...seatPairs].sort((p, q) => sim[p[0]][p[1]] - sim[q[0]][q[1]])) {
      const t = pickShared(info.get(`${a}-${b}`)?.shared, used);
      if (t) used.add(t.name.toLowerCase());
      bridgeFor.set(`${a}-${b}`, t);
    }
    for (const [a, b] of seatPairs) {
      const r = info.get(`${a}-${b}`) || { shared: [], a: [], b: [] };
      const shared = bridgeFor.get(`${a}-${b}`);
      outPairs.push({ a, b, similarity: Math.round(sim[a][b] * 100) / 100, shared: rankShared(r.shared).slice(0, 4).map((t) => t.name), bridge: shared?.name || null });
      if (shared) cards.push(sharedCard(shared, a, b));
      else {
        const da = pickDistinct(r.a);
        const db = pickDistinct(r.b, new Set(da ? [da.name.toLowerCase()] : []));
        if (da && db) cards.push(contrastCard(da, db, a, b));
      }
    }
    // One friendly-debate card from the most different pair at the table.
    let far = null;
    for (const [a, b] of pairs) if (!far || sim[a][b] < sim[far[0]][far[1]]) far = [a, b];
    if (far) {
      const r = info.get(`${far[0]}-${far[1]}`);
      const da = pickDistinct(r?.a || []);
      const db = pickDistinct(r?.b || [], new Set(da ? [da.name.toLowerCase()] : []));
      if (da && db) cards.push(contrastCard(da, db, far[0], far[1]));
    }
    this.think(
      `Seating: ${order.map(G).join(" → ")} → back to ${G(order[0])}. I maximised the weakest neighbour pair first, then gave each pair its own conversation thread.`,
      { phase: "critique", goal: "seating" },
    );
    return { order, pairs: outPairs, weakest: Math.round(seat.weakest * 100) / 100, cards };
  }

  async hostNote(plan) {
    const s = plan.sections;
    const parts = [];
    if (s.menu) parts.push(`a ${s.menu.label} menu`);
    if (s.soundtrack?.arrival?.[0]) parts.push(`${s.soundtrack.arrival[0].name} as people arrive`);
    if (s.film?.pick) parts.push(`${s.film.pick.name} once the plates are cleared`);
    const fallback = `Tonight's thread: ${parts.join(", ")}. ${s.menu?.mood || ""}`.trim();
    if (!this.narrator) return { text: fallback, by: "template" };
    try {
      const text = await this.narrator.write(plan);
      return text ? { text, by: this.narrator.name } : { text: fallback, by: "template" };
    } catch {
      return { text: fallback, by: "template" };
    }
  }
}
