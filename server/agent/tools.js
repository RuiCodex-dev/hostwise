// The agent's tool belt. Every tool wraps one Qloo capability, returns a compact
// observation for the planner, and a provenance record the user can inspect
// (path + parameters, never the key). Tool definitions double as a JSON-schema
// description so an optional LLM planner can call the same tools.
import { describeRequest, ENTITY_TYPES, SEARCH_TYPE_OVERRIDES } from "../qloo.js";

export function trimToSentence(text, max) {
  const t = String(text || "").trim();
  if (!t) return null;
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  return end > Math.min(60, max * 0.3) ? cut.slice(0, end + 1) : `${cut.slice(0, cut.lastIndexOf(" "))}...`;
}

export function entitySummary(e) {
  const p = e.properties || {};
  const shortEn = Array.isArray(p.short_descriptions) ? p.short_descriptions.find((s) => s.language === "en")?.value : null;
  return {
    id: e.entity_id,
    name: e.name,
    type: e.subtype || e.types?.[0] || e.type || null,
    year: p.release_year || null,
    duration: typeof p.duration === "number" ? p.duration : null,
    rating: p.content_rating || null,
    image: p.image?.url || null,
    blurb: trimToSentence(shortEn || p.description || "", 260),
    popularity: typeof e.popularity === "number" ? e.popularity : null,
    disambiguation: e.disambiguation || null,
  };
}

export const TOOL_DEFS = [
  {
    name: "resolve_favourite",
    description: "Find the Qloo entity that matches a favourite a guest typed (film, show, artist, book, podcast, game or destination).",
    input: { text: "string", kind: Object.keys(ENTITY_TYPES).join("|") },
  },
  {
    name: "pooled_recommendations",
    description: "Ask Qloo for entities of one type that the whole table's favourites point to at once, with per-signal explainability.",
    input: { type: "entity type URN", signals: "entity IDs", take: "int" },
  },
  {
    name: "rank_for_guest",
    description: "Score a shortlist against one guest's favourites only (Qloo affinity per candidate).",
    input: { type: "entity type URN", signals: "one guest's entity IDs", candidates: "entity IDs" },
  },
  {
    name: "personal_picks",
    description: "Ask Qloo what one guest's favourites point to, to widen a shortlist that leaves that guest out.",
    input: { type: "entity type URN", signals: "one guest's entity IDs", take: "int" },
  },
  {
    name: "cuisine_affinity",
    description: "Ask Qloo which place/cuisine tags one guest's cross-domain taste leans towards.",
    input: { signals: "one guest's entity IDs" },
  },
  {
    name: "shared_ground",
    description: "Compare two guests' taste audiences: tags they share and tags that set them apart.",
    input: { a: "entity IDs", b: "entity IDs" },
  },
];

export function makeTools(qloo) {
  return {
    async resolve_favourite({ text, kind }) {
      const type = SEARCH_TYPE_OVERRIDES[kind] || ENTITY_TYPES[kind] || kind;
      const params = { query: text, types: type, take: 5 };
      const { body, cached, ms } = await qloo.search(text, type, 5);
      const results = (body.results || []).map(entitySummary);
      return { observation: results, provenance: { ...describeRequest("/search", params), cached, ms, count: results.length } };
    },

    async pooled_recommendations({ type, signals, take = 15, exclude = [], popularityMin }) {
      const params = {
        "filter.type": type,
        "filter.popularity.min": popularityMin,
        "signal.interests.entities": signals.join(","),
        "filter.exclude.entities": exclude.join(","),
        "feature.explainability": "true",
        take,
      };
      const { body, cached, ms } = await qloo.insights(params);
      const ents = body.results?.entities || [];
      const out = ents.map((e) => ({
        ...entitySummary(e),
        affinity: e.query?.affinity ?? null,
        explain: (e.query?.explainability?.["signal.interests.entities"] || []).map((x) => ({ id: x.entity_id, score: x.score })),
      }));
      return { observation: out, provenance: { ...describeRequest("/v2/insights", params), cached, ms, count: out.length } };
    },

    async rank_for_guest({ type, signals, candidates }) {
      const params = {
        "filter.type": type,
        "signal.interests.entities": signals.join(","),
        "filter.entities": candidates.join(","),
        take: Math.min(50, candidates.length),
      };
      const { body, cached, ms } = await qloo.insights(params);
      const scores = {};
      for (const e of body.results?.entities || []) scores[e.entity_id] = e.query?.affinity ?? null;
      return { observation: scores, provenance: { ...describeRequest("/v2/insights", params), cached, ms, count: Object.keys(scores).length } };
    },

    async personal_picks({ type, signals, take = 5, exclude = [], popularityMin }) {
      const params = {
        "filter.type": type,
        "filter.popularity.min": popularityMin,
        "signal.interests.entities": signals.join(","),
        "filter.exclude.entities": exclude.join(","),
        take,
      };
      const { body, cached, ms } = await qloo.insights(params);
      const out = (body.results?.entities || []).map((e) => ({ ...entitySummary(e), affinity: e.query?.affinity ?? null, explain: [] }));
      return { observation: out, provenance: { ...describeRequest("/v2/insights", params), cached, ms, count: out.length } };
    },

    async cuisine_affinity({ signals }) {
      const params = {
        "filter.type": "urn:tag",
        "filter.tag.types": "urn:tag:genre:place",
        "signal.interests.entities": signals.join(","),
        take: 50,
      };
      const { body, cached, ms } = await qloo.insights(params);
      const tags = (body.results?.tags || []).map((t) => ({ id: t.tag_id, name: t.name, affinity: t.query?.affinity ?? null }));
      return { observation: tags, provenance: { ...describeRequest("/v2/insights", params), cached, ms, count: tags.length } };
    },

    async shared_ground({ a, b }) {
      const params = { "a.signal.interests.entities": a.join(","), "b.signal.interests.entities": b.join(","), take: 12 };
      const { body, cached, ms } = await qloo.compare(a, b, 12);
      const r = body.results || {};
      const pick = (arr) => (arr || []).map((t) => ({ name: t.name, subtype: t.subtype, query: { score: t.query?.score ?? null } }));
      const obs = { shared: pick(r.tags), a: pick(r.a), b: pick(r.b) };
      return { observation: obs, provenance: { ...describeRequest("/v2/analysis/compare", params), cached, ms, count: obs.shared.length } };
    },
  };
}
