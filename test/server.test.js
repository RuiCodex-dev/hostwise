import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { QlooClient, encodeParams, describeRequest } from "../server/qloo.js";
import { createApp, RateLimiter } from "../server/app.js";
import { loadQlooKey } from "../server/config.js";
import { makeNarrator } from "../server/narrator.js";
import { clientIp } from "../server/node.js";
import { makeFakeQloo, table } from "./fake-qloo.js";

const FAKE_KEY = "test-key-not-real-0000";
const cfg = { planRateLimit: 2, searchRateLimit: 3 };

function mockFetch(responses) {
  const seen = [];
  const fn = async (url, init) => {
    seen.push({ url, init });
    const r = responses.shift() || { status: 200, body: { results: [] } };
    return new Response(JSON.stringify(r.body ?? {}), { status: r.status, headers: r.headers || {} });
  };
  fn.seen = seen;
  return fn;
}

test("client sends the key only as a header, caches, and retries 429 a bounded number of times", async () => {
  const f = mockFetch([{ status: 429 }, { status: 200, body: { results: [{ name: "x" }] } }]);
  const q = new QlooClient({ apiKey: FAKE_KEY, baseUrl: "https://hackathon.api.qloo.com", fetchImpl: f, retryDelayMs: 1, minIntervalMs: 0 });
  const a = await q.search("Amelie", "urn:entity:movie", 3);
  assert.equal(a.cached, false);
  assert.equal(f.seen.length, 2);
  assert.ok(!f.seen[0].url.includes(FAKE_KEY));
  assert.equal(f.seen[0].init.headers["X-Api-Key"], FAKE_KEY);
  const b = await q.search("Amelie", "urn:entity:movie", 3);
  assert.equal(b.cached, true);
  assert.equal(f.seen.length, 2);
  assert.equal(q.usage().byStatus[429], 1);
  assert.ok(!JSON.stringify(q.usage()).includes(FAKE_KEY));
});

test("client gives up after three attempts and does not retry auth errors", async () => {
  const f = mockFetch([{ status: 503 }, { status: 503 }, { status: 503 }, { status: 503 }]);
  const q = new QlooClient({ apiKey: FAKE_KEY, baseUrl: "https://x.test", fetchImpl: f, retryDelayMs: 1, minIntervalMs: 0 });
  await assert.rejects(q.insights({ "filter.type": "urn:entity:movie" }), (e) => e.code === "QLOO_UPSTREAM" && !e.message.includes(FAKE_KEY));
  assert.equal(f.seen.length, 3);
  const f2 = mockFetch([{ status: 401 }]);
  const q2 = new QlooClient({ apiKey: FAKE_KEY, baseUrl: "https://x.test", fetchImpl: f2, retryDelayMs: 1, minIntervalMs: 0 });
  await assert.rejects(q2.insights({ a: 1 }), (e) => e.code === "QLOO_AUTH");
  assert.equal(f2.seen.length, 1);
});

test("daily cap stops live calls", async () => {
  const f = mockFetch([]);
  const q = new QlooClient({ apiKey: FAKE_KEY, baseUrl: "https://x.test", fetchImpl: f, dailyCap: 1, minIntervalMs: 0 });
  await q.insights({ a: 1 });
  await assert.rejects(q.insights({ a: 2 }), (e) => e.code === "QLOO_DAILY_CAP");
});

test("no key configured is a clear error, not a request", async () => {
  const f = mockFetch([]);
  const q = new QlooClient({ apiKey: null, baseUrl: "https://x.test", fetchImpl: f });
  await assert.rejects(q.search("x", "urn:entity:movie"), (e) => e.code === "QLOO_AUTH");
  assert.equal(f.seen.length, 0);
});

test("params encode deterministically and requests describe without credentials", () => {
  assert.equal(encodeParams({ b: 2, a: [1, 2], c: "", d: undefined }), "a=1%2C2&b=2");
  const d = describeRequest("/v2/insights", { x: 1, y: "" });
  assert.deepEqual(d, { method: "GET", path: "/v2/insights", params: { x: 1 } });
});

test("config prefers the environment, then the private key file", () => {
  const dir = mkdtempSync(join(tmpdir(), "hostwise-"));
  try {
    const file = join(dir, "keys.json");
    writeFileSync(file, JSON.stringify({ qloo: { api_key: "from-file" } }));
    assert.equal(loadQlooKey({ QLOO_KEY_FILE: file }), "from-file");
    assert.equal(loadQlooKey({ QLOO_KEY_FILE: file, QLOO_API_KEY: "from-env" }), "from-env");
    assert.equal(loadQlooKey({ QLOO_KEY_FILE: join(dir, "missing.json") }), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("API: health never exposes the key; unknown routes 404; static falls through", async () => {
  const app = createApp({ qloo: makeFakeQloo(), config: cfg });
  const h = await app(new Request("http://x/api/health"));
  const text = await h.text();
  assert.equal(h.status, 200);
  assert.ok(!/api[_-]?key/i.test(text));
  assert.equal((await app(new Request("http://x/api/nope"))).status, 404);
  assert.equal(await app(new Request("http://x/index.html")), null);
});

test("API: search validates input and rate-limits per client", async () => {
  const app = createApp({ qloo: makeFakeQloo(), config: cfg });
  assert.equal((await app(new Request("http://x/api/search?q=a&kind=movie"), { ip: "1" })).status, 400);
  assert.equal((await app(new Request("http://x/api/search?q=abc&kind=spaceship"), { ip: "1" })).status, 400);
  for (let i = 0; i < 3; i++) assert.equal((await app(new Request("http://x/api/search?q=Amelie&kind=movie"), { ip: "2" })).status, 200);
  assert.equal((await app(new Request("http://x/api/search?q=Amelie&kind=movie"), { ip: "2" })).status, 429);
  assert.equal((await app(new Request("http://x/api/search?q=Amelie&kind=movie"), { ip: "3" })).status, 200);
});

test("API: plan streams agent events and a final plan over SSE", async () => {
  const app = createApp({ qloo: makeFakeQloo(), config: cfg });
  const res = await app(new Request("http://x/api/plan", { method: "POST", body: JSON.stringify(table(3)) }), { ip: "9" });
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/event-stream/);
  const body = await res.text();
  const events = body.split("\n\n").filter(Boolean).map((c) => JSON.parse(c.replace(/^data: /, "")));
  assert.ok(events.some((e) => e.type === "thought"));
  assert.ok(events.some((e) => e.type === "tool"));
  assert.ok(events.some((e) => e.type === "section" && e.key === "menu"));
  assert.equal(events.at(-1).type, "done");
  const bad = await app(new Request("http://x/api/plan", { method: "POST", body: "{nope" }), { ip: "9" });
  assert.equal(bad.status, 400);
});

test("rate limiter window", () => {
  const rl = new RateLimiter(2, 1000);
  assert.equal(rl.take("a", 0), 0);
  assert.equal(rl.take("a", 10), 0);
  assert.ok(rl.take("a", 20) > 0);
  assert.equal(rl.take("a", 1500), 0);
});

test("narrator is optional and falls back cleanly", async () => {
  assert.equal(makeNarrator({}), null);
  let sent;
  const n = makeNarrator({ anthropicKey: "k", anthropicModel: "m" }, async (url, init) => {
    sent = JSON.parse(init.body);
    return new Response(JSON.stringify({ content: [{ type: "text", text: "A warm evening of small plates and old songs." }] }), { status: 200 });
  });
  const plan = { guests: 2, sections: { menu: { label: "Italian trattoria", mood: "m", courses: [{ dish: "d" }] }, film: { pick: { name: "F" } } } };
  assert.match(await n.write(plan), /warm evening/);
  assert.ok(!JSON.stringify(sent).includes("vegan"));
  const failing = makeNarrator({ openaiKey: "k", openaiBaseUrl: "https://x.test/v1", openaiModel: "m" }, async () => new Response("no", { status: 500 }));
  assert.equal(await failing.write(plan), null);
});

test("client address: trusted proxy header only when configured", () => {
  const req = (headers) => ({ headers, socket: { remoteAddress: "127.0.0.1" } });
  // Default (e.g. Fly.io): the platform header is used.
  assert.equal(clientIp(req({ "fly-client-ip": "203.0.113.5" }), null), "203.0.113.5");
  // Behind our own proxy: spoofed platform headers are ignored, the trusted header wins.
  assert.equal(clientIp(req({ "fly-client-ip": "198.51.100.1", "x-real-ip": "203.0.113.9" }), "x-real-ip"), "203.0.113.9");
  // Trusted header missing: fall back to the socket, never to a client-supplied header.
  assert.equal(clientIp(req({ "cf-connecting-ip": "198.51.100.2" }), "x-real-ip"), "127.0.0.1");
});
