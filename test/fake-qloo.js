// A synthetic stand-in for the Qloo client. All ids, names and numbers are invented;
// no real Qloo response data is stored in this repository.
export const ids = (p, n) => Array.from({ length: n }, (_, i) => `${p}000000-0000-0000-0000-${String(i).padStart(12, "0")}`);

export function makeFakeQloo({ hated = new Set(), leftOutGuestSignal = null } = {}) {
  const calls = [];
  const pool = ids("C", 6); // pooled candidates
  const rescue = ids("R", 3); // only reachable through personal picks
  const ent = (id, extra = {}) => ({ entity_id: id, name: `Name ${id.slice(0, 2)}${id.slice(-2)}`, subtype: "urn:entity:movie", properties: { duration: 100, release_year: 2001 }, popularity: 0.9, ...extra });
  // Affinity of a candidate for a set of signals: deterministic and tunable.
  const aff = (signals, id) => {
    const s = signals.split(",");
    if (leftOutGuestSignal && s.length === 1 && s[0] === leftOutGuestSignal) {
      // This guest only likes the two candidates everyone else ranks lowest, so every pooled
      // pick leaves them out; the rescue candidates sit at the top of everyone's taste.
      if (id.startsWith("R")) return 0.95;
      const n = Number(id.slice(-1));
      return n === 0 ? 0.9 : n === 1 ? 0.85 : 0.5;
    }
    if (hated.has(id)) return 0.1;
    const base = id.startsWith("R") ? 0.9 : 0.6 + Number(id.slice(-1)) * 0.05;
    return base;
  };
  return {
    calls,
    ready: true,
    usage: () => ({ live: calls.length, cached: 0, errors: 0, today: calls.length, dailyCap: 999 }),
    async search(q, type) {
      calls.push(["search", q, type]);
      return { body: { results: [ent(ids("S", 1)[0], { name: q })] }, cached: false, ms: 1 };
    },
    async insights(params) {
      calls.push(["insights", params]);
      const signals = params["signal.interests.entities"];
      if (params["filter.type"] === "urn:tag") {
        const tags = [
          { tag_id: "urn:tag:genre:place:restaurant:italian", name: "Italian", query: { affinity: 0.9 } },
          { tag_id: "urn:tag:genre:place:restaurant:japanese", name: "Japanese", query: { affinity: signals.includes("G1") ? 0.99 : 0.5 } },
          { tag_id: "urn:tag:genre:place:restaurant:bar", name: "Bar", query: { affinity: 1 } },
        ];
        return { body: { results: { tags } }, cached: false, ms: 1 };
      }
      if (params["filter.entities"]) {
        const cand = params["filter.entities"].split(",");
        return { body: { results: { entities: cand.map((id) => ent(id, { query: { affinity: aff(signals, id) } })) } }, cached: false, ms: 1 };
      }
      const sigs = signals.split(",");
      const list = sigs.length === 1 && leftOutGuestSignal ? rescue : pool; // personal picks reach the rescue set
      const explain = { "signal.interests.entities": sigs.map((sid) => ({ entity_id: sid, score: 1 / sigs.length })) };
      return { body: { results: { entities: list.map((id) => ent(id, { query: { affinity: 0.8, explainability: explain } })) } }, cached: false, ms: 1 };
    },
    async compare(a, b) {
      calls.push(["compare", a, b]);
      const shared = [
        { name: "Engaging", subtype: "urn:tag:style:qloo", query: { score: 0.9 } },
        { name: `Thread ${a[0].slice(0, 2)}${b[0].slice(0, 2)}`, subtype: "urn:tag:theme:qloo", query: { score: 0.8 } },
        { name: "Folk", subtype: "urn:tag:genre:music", query: { score: 0.75 } },
      ];
      return { body: { results: { tags: shared, a: [{ name: "Whimsical", subtype: "urn:tag:subgenre:qloo" }], b: [{ name: "Gritty", subtype: "urn:tag:style:qloo" }] } }, cached: false, ms: 1 };
    },
  };
}

export const table = (n = 3) => ({
  guests: Array.from({ length: n }, (_, i) => ({ favourites: [{ id: `G${i}000000-1111-2222-3333-444444444444`, name: `Fav ${i}`, kind: "movie" }], diets: i === 0 ? ["vegan"] : [] })),
});
