// Optional LLM layer. The planner works fully without it; when a key is configured,
// a model rewrites the host's note from the plan's evidence. It only ever sees Qloo
// entity/tag names and guest tokens like {{g0}}, never names, diets or the Qloo key.

function brief(plan) {
  const s = plan.sections;
  return JSON.stringify({
    guests: plan.guests,
    menu: s.menu && { cuisine: s.menu.label, mood: s.menu.mood, courses: s.menu.courses.map((c) => c.dish) },
    soundtrack: s.soundtrack && { arrival: s.soundtrack.arrival.map((a) => a.name), late: s.soundtrack.late.map((a) => a.name) },
    film: s.film?.pick?.name,
    seatingBridges: s.seating?.pairs?.map((p) => p.bridge).filter(Boolean),
  });
}

const SYSTEM =
  "You are Hostwise, a warm, understated dinner-party planner. Write a 2-3 sentence note to the host " +
  "summarising tonight's plan. Plain English, no lists, no emojis, no exclamation marks. Refer to guests " +
  "only with the exact tokens provided like {{g0}} if at all. Do not invent facts beyond the plan JSON.";

export function makeNarrator(cfg, fetchImpl = globalThis.fetch) {
  if (cfg.anthropicKey) {
    return {
      name: "claude",
      async write(plan) {
        const res = await fetchImpl("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: { "content-type": "application/json", "x-api-key": cfg.anthropicKey, "anthropic-version": "2023-06-01" },
          body: JSON.stringify({ model: cfg.anthropicModel, max_tokens: 220, system: SYSTEM, messages: [{ role: "user", content: brief(plan) }] }),
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return clean(data?.content?.find((c) => c.type === "text")?.text);
      },
    };
  }
  if (cfg.openaiKey) {
    return {
      name: "llm",
      async write(plan) {
        const res = await fetchImpl(`${cfg.openaiBaseUrl.replace(/\/$/, "")}/chat/completions`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${cfg.openaiKey}` },
          body: JSON.stringify({ model: cfg.openaiModel, max_tokens: 220, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: brief(plan) }] }),
          signal: AbortSignal.timeout(15000),
        });
        if (!res.ok) return null;
        const data = await res.json();
        return clean(data?.choices?.[0]?.message?.content);
      },
    };
  }
  return null;
}

function clean(text) {
  if (typeof text !== "string") return null;
  const t = text.trim().replace(/\s+/g, " ");
  return t.length > 10 && t.length < 900 ? t : null;
}
