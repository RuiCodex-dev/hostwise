// Web-standard request handler: (Request, ctx) => Response.
// Runs under Node (server/node.js) and in any fetch-style runtime.
import { Planner, validateTable } from "./agent/planner.js";
import { makeTools, TOOL_DEFS } from "./agent/tools.js";
import { ENTITY_TYPES } from "./qloo.js";
import { DIETS } from "./agent/cuisine.js";

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers } });

export class RateLimiter {
  constructor(limit, windowMs) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.hits = new Map();
  }
  take(key, now = Date.now()) {
    const arr = (this.hits.get(key) || []).filter((t) => now - t < this.windowMs);
    if (arr.length >= this.limit) {
      this.hits.set(key, arr);
      return Math.ceil((this.windowMs - (now - arr[0])) / 1000);
    }
    arr.push(now);
    this.hits.set(key, arr);
    if (this.hits.size > 5000) this.hits.delete(this.hits.keys().next().value);
    return 0;
  }
}

export function createApp({ qloo, narrator = null, config }) {
  const planLimiter = new RateLimiter(config.planRateLimit, 10 * 60e3);
  const searchLimiter = new RateLimiter(config.searchRateLimit, 60e3);
  const tools = makeTools(qloo);

  return async function handle(request, ctx = {}) {
    const url = new URL(request.url);
    const ip = ctx.ip || "unknown";

    if (url.pathname === "/api/health") {
      return json({ ok: true, qloo: qloo.ready ? "configured" : "missing", narrator: narrator?.name || "template", usage: qloo.usage() });
    }

    if (url.pathname === "/api/meta") {
      return json({ kinds: Object.keys(ENTITY_TYPES).filter((k) => !["place", "brand", "person"].includes(k)), diets: Object.fromEntries(Object.entries(DIETS).map(([k, v]) => [k, v.label])), tools: TOOL_DEFS });
    }

    if (url.pathname === "/api/search" && request.method === "GET") {
      const q = (url.searchParams.get("q") || "").trim();
      const kind = url.searchParams.get("kind") || "movie";
      if (q.length < 2 || q.length > 80) return json({ error: "Type at least two characters." }, 400);
      if (!ENTITY_TYPES[kind]) return json({ error: "Unknown kind." }, 400);
      const wait = searchLimiter.take(ip);
      if (wait) return json({ error: "Slow down a little." }, 429, { "retry-after": String(wait) });
      try {
        const { observation } = await tools.resolve_favourite({ text: q, kind });
        return json({ results: observation.slice(0, 5) });
      } catch (err) {
        return json({ error: friendly(err) }, err.status === 429 ? 429 : 502);
      }
    }

    if (url.pathname === "/api/plan" && request.method === "POST") {
      let body;
      try {
        const text = await request.text();
        if (text.length > 20000) return json({ error: "Request too large." }, 413);
        body = JSON.parse(text);
      } catch {
        return json({ error: "Invalid JSON." }, 400);
      }
      const problem = validateTable(body);
      if (problem) return json({ error: problem }, 400);
      const wait = planLimiter.take(ip);
      if (wait) return json({ error: `You've planned a lot of dinners. Try again in ${Math.ceil(wait / 60)} min.` }, 429, { "retry-after": String(wait) });

      const enc = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const send = (ev) => controller.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));
          const planner = new Planner({ qloo, narrator, emit: send });
          try {
            const plan = await planner.run(body);
            send({ type: "done", plan });
          } catch (err) {
            send({ type: "error", message: friendly(err) });
          } finally {
            controller.close();
          }
        },
      });
      return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-store", "x-accel-buffering": "no" } });
    }

    if (url.pathname.startsWith("/api/")) return json({ error: "Not found." }, 404);
    return null; // let the host serve static files
  };
}

function friendly(err) {
  switch (err?.code) {
    case "QLOO_DAILY_CAP":
      return err.message;
    case "QLOO_AUTH":
      return "The server's Qloo credential is missing or was rejected.";
    case "QLOO_RATE_LIMIT":
      return "Qloo is busy right now. Give it a few seconds and try again.";
    default:
      return "Something went wrong talking to Qloo. Please try again.";
  }
}
