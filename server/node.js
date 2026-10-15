// Node entry point: wires config, the Qloo client and the request handler into
// node:http, and serves the static front end from /public.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "./config.js";
import { QlooClient } from "./qloo.js";
import { makeNarrator } from "./narrator.js";
import { createApp } from "./app.js";

const PUBLIC = resolve(fileURLToPath(new URL("../public", import.meta.url)));
const TYPES = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg",
  ".woff2": "font/woff2", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json",
};

const SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
  "permissions-policy": "camera=(), microphone=(), geolocation=()",
  "content-security-policy":
    "default-src 'self'; img-src 'self' data: https://images.qloo.com https://*.qloo.com; script-src 'self'; style-src 'self'; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
};

export function buildServer(config = loadConfig()) {
  const qloo = new QlooClient({ apiKey: config.qlooKey, baseUrl: config.qlooBaseUrl, dailyCap: config.dailyCallCap, cacheDir: config.cacheDir });
  const narrator = makeNarrator(config.llm);
  const app = createApp({ qloo, narrator, config });

  const server = createServer(async (req, res) => {
    try {
      const ip = clientIp(req, config.trustProxyHeader);
      const url = `http://${req.headers.host || "localhost"}${req.url}`;
      const body = req.method === "GET" || req.method === "HEAD" ? undefined : await readBody(req);
      const request = new Request(url, { method: req.method, headers: req.headers, body });
      const response = await app(request, { ip });
      if (response) return pipe(response, res);
      return serveStatic(req, res);
    } catch (err) {
      res.writeHead(500, { "content-type": "text/plain", ...SECURITY_HEADERS });
      res.end("Internal error");
    }
  });
  return { server, qloo };
}

// Client address for per-client rate limits. Behind a reverse proxy we control (for example
// nginx setting X-Real-IP), TRUST_PROXY_HEADER names the one header to believe and every
// other forwarding header is ignored, so a visitor cannot pick their own rate-limit bucket.
export function clientIp(req, trustHeader) {
  const remote = req.socket?.remoteAddress || "";
  if (trustHeader) {
    const value = (req.headers[trustHeader] || "").toString().split(",").pop().trim();
    return value || remote;
  }
  return (req.headers["fly-client-ip"] || req.headers["cf-connecting-ip"] || remote).toString();
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 64 * 1024) throw new Error("body too large");
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

async function pipe(response, res) {
  const headers = { ...SECURITY_HEADERS, ...Object.fromEntries(response.headers) };
  res.writeHead(response.status, headers);
  if (!response.body) return res.end();
  const reader = response.body.getReader();
  res.on("close", () => reader.cancel().catch(() => {}));
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    res.write(value);
  }
  res.end();
}

async function serveStatic(req, res) {
  let path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (path === "/" || !extname(path)) path = "/index.html";
  const file = normalize(join(PUBLIC, path));
  if (!file.startsWith(PUBLIC)) {
    res.writeHead(403, SECURITY_HEADERS);
    return res.end();
  }
  try {
    const s = await stat(file);
    if (!s.isFile()) throw new Error("not a file");
    const data = await readFile(file);
    const ext = extname(file);
    const longCache = [".woff2", ".webp", ".png", ".jpg"].includes(ext);
    res.writeHead(200, { ...SECURITY_HEADERS, "content-type": TYPES[ext] || "application/octet-stream", "cache-control": longCache ? "public, max-age=604800" : "no-cache" });
    res.end(req.method === "HEAD" ? undefined : data);
  } catch {
    res.writeHead(404, { ...SECURITY_HEADERS, "content-type": "text/plain" });
    res.end("Not found");
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = loadConfig();
  const { server } = buildServer(config);
  server.listen(config.port, () => {
    console.log(`Hostwise listening on http://localhost:${config.port} (Qloo credential: ${config.qlooKey ? "configured" : "MISSING"})`);
  });
  const stop = () => server.close(() => process.exit(0));
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
