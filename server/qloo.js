// Minimal Qloo Insights API client for the hackathon endpoint.
// - Key goes in the X-Api-Key header only; it is never logged, cached or returned.
// - Responses are cached privately in memory (and optionally on local disk, git-ignored).
// - Retries are bounded and only for 429/5xx/network errors.
// - A daily call cap protects the per-key event quota on a public demo.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export class QlooError extends Error {
  constructor(code, message, { status = 0, retryable = false } = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

// The /search endpoint spells one type differently from /v2/insights filter.type.
export const SEARCH_TYPE_OVERRIDES = { video_game: "urn:entity:videogame" };

export const ENTITY_TYPES = {
  movie: "urn:entity:movie",
  tv_show: "urn:entity:tv_show",
  artist: "urn:entity:artist",
  book: "urn:entity:book",
  podcast: "urn:entity:podcast",
  video_game: "urn:entity:video_game",
  destination: "urn:entity:destination",
  place: "urn:entity:place",
  brand: "urn:entity:brand",
  person: "urn:entity:person",
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export class QlooClient {
  constructor({ apiKey, baseUrl, dailyCap = 1500, cacheDir = null, fetchImpl = globalThis.fetch, ttlMs = 6 * 3600e3, maxEntries = 2000, retryDelayMs = 600, minIntervalMs = 250, searchShare = 0.4 }) {
    // Favourite look-ups (typing in the guest form) may use at most this share of the daily cap,
    // so one visitor typing quickly cannot spend the quota that judges need for whole plans.
    this.searchCap = Math.max(1, Math.floor(dailyCap * searchShare));
    this.minIntervalMs = minIntervalMs;
    this.nextSlot = 0;
    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.dailyCap = dailyCap;
    this.cacheDir = cacheDir;
    this.fetch = fetchImpl;
    this.ttlMs = ttlMs;
    this.maxEntries = maxEntries;
    this.retryDelayMs = retryDelayMs;
    this.cache = new Map();
    this.inflight = new Map();
    this.stats = { live: 0, cached: 0, errors: 0, day: today(), dayLive: 0, daySearchLive: 0, byStatus: {} };
    if (cacheDir) mkdirSync(cacheDir, { recursive: true });
  }

  get ready() {
    return Boolean(this.apiKey);
  }

  usage() {
    return { live: this.stats.live, cached: this.stats.cached, errors: this.stats.errors, byStatus: { ...this.stats.byStatus }, today: this.stats.dayLive, dailyCap: this.dailyCap, searchToday: this.stats.daySearchLive, searchCap: this.searchCap };
  }

  // GET a Qloo path with query params. Returns { body, cached, ms }.
  async get(path, params) {
    if (!this.apiKey) throw new QlooError("QLOO_AUTH", "No Qloo credential is configured on the server.");
    const qs = encodeParams(params);
    const key = createHash("sha256").update(`${path}?${qs}`).digest("hex").slice(0, 32);
    const t0 = Date.now();

    const hit = this.#readCache(key);
    if (hit) {
      this.stats.cached++;
      return { body: hit, cached: true, ms: Date.now() - t0 };
    }
    if (this.inflight.has(key)) {
      const body = await this.inflight.get(key);
      this.stats.cached++;
      return { body, cached: true, ms: Date.now() - t0 };
    }
    const p = this.#live(path, qs, path === "/search").then((body) => {
      this.#writeCache(key, body);
      return body;
    });
    this.inflight.set(key, p);
    try {
      const body = await p;
      return { body, cached: false, ms: Date.now() - t0 };
    } finally {
      this.inflight.delete(key);
    }
  }

  async #live(path, qs, isSearch = false) {
    let lastErr;
    for (let attempt = 0; attempt < 3; attempt++) {
      this.#rollDay();
      if (isSearch && this.stats.daySearchLive >= this.searchCap) {
        throw new QlooError("QLOO_DAILY_CAP", "The demo has used today's share of live favourite look-ups. Please try a sample table, or come back tomorrow.");
      }
      if (this.stats.dayLive >= this.dailyCap) {
        throw new QlooError("QLOO_DAILY_CAP", "The demo has used today's share of the Qloo event quota. Please try a sample table, or come back tomorrow.");
      }
      // Pace live requests so a burst of parallel tool calls stays under the per-key rate limit.
      const now = Date.now();
      const wait = Math.max(0, this.nextSlot - now);
      this.nextSlot = Math.max(now, this.nextSlot) + this.minIntervalMs;
      if (wait) await sleep(wait);
      this.stats.live++;
      this.stats.dayLive++;
      if (isSearch) this.stats.daySearchLive++;
      let res;
      try {
        res = await this.fetch(`${this.baseUrl}${path}?${qs}`, {
          headers: { "X-Api-Key": this.apiKey, Accept: "application/json" },
          signal: AbortSignal.timeout(20000),
        });
      } catch (err) {
        lastErr = new QlooError("QLOO_NETWORK", "Qloo could not be reached.", { retryable: true });
        this.stats.errors++;
        await sleep(this.retryDelayMs * (attempt + 1));
        continue;
      }
      if (res.ok) return res.json();
      this.stats.errors++;
      this.stats.byStatus[res.status] = (this.stats.byStatus[res.status] || 0) + 1;
      if (res.status === 401 || res.status === 403) {
        throw new QlooError(res.status === 401 ? "QLOO_AUTH" : "QLOO_FORBIDDEN", `Qloo refused the request (${res.status}).`, { status: res.status });
      }
      if (res.status === 429 || res.status >= 500) {
        lastErr = new QlooError(res.status === 429 ? "QLOO_RATE_LIMIT" : "QLOO_UPSTREAM", `Qloo answered ${res.status}.`, { status: res.status, retryable: true });
        const retryAfter = Number(res.headers.get("retry-after"));
        await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 5) * 1000 : this.retryDelayMs * (attempt + 1) * 2);
        continue;
      }
      throw new QlooError("QLOO_BAD_REQUEST", `Qloo rejected the request (${res.status}).`, { status: res.status });
    }
    throw lastErr;
  }

  #rollDay() {
    const d = today();
    if (d !== this.stats.day) {
      this.stats.day = d;
      this.stats.dayLive = 0;
      this.stats.daySearchLive = 0;
    }
  }

  #readCache(key) {
    const e = this.cache.get(key);
    if (e && e.expires > Date.now()) {
      this.cache.delete(key);
      this.cache.set(key, e); // LRU refresh
      return e.body;
    }
    if (this.cacheDir) {
      const f = join(this.cacheDir, `${key}.json`);
      if (existsSync(f)) {
        try {
          const { expires, body } = JSON.parse(readFileSync(f, "utf8"));
          if (expires > Date.now()) {
            this.cache.set(key, { expires, body });
            return body;
          }
        } catch {
          /* ignore a corrupt cache file */
        }
      }
    }
    return null;
  }

  #writeCache(key, body) {
    const expires = Date.now() + this.ttlMs;
    this.cache.set(key, { expires, body });
    while (this.cache.size > this.maxEntries) this.cache.delete(this.cache.keys().next().value);
    if (this.cacheDir) {
      try {
        writeFileSync(join(this.cacheDir, `${key}.json`), JSON.stringify({ expires, body }));
      } catch {
        /* disk cache is best effort */
      }
    }
  }

  // ---- typed helpers ---------------------------------------------------

  search(query, type, take = 5) {
    return this.get("/search", { query, types: type, take });
  }

  insights(params) {
    return this.get("/v2/insights", params);
  }

  compare(aIds, bIds, take = 12) {
    return this.get("/v2/analysis/compare", {
      "a.signal.interests.entities": aIds.join(","),
      "b.signal.interests.entities": bIds.join(","),
      take,
    });
  }
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function encodeParams(params) {
  const sp = new URLSearchParams();
  for (const k of Object.keys(params).sort()) {
    const v = params[k];
    if (v === undefined || v === null || v === "") continue;
    sp.set(k, Array.isArray(v) ? v.join(",") : String(v));
  }
  return sp.toString();
}

// A request description that is safe to show a user: no key, no headers.
export function describeRequest(path, params) {
  return { method: "GET", path, params: Object.fromEntries(Object.entries(params).filter(([, v]) => v !== undefined && v !== "")) };
}
