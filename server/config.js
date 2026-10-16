// Runtime configuration. The Qloo key is read at runtime only, from the environment
// or from a private key file outside the repository. It is never logged or returned.
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DEFAULT_KEY_FILE = join(homedir(), ".ruicodex-keys", "hackathons-2026.json");

export function loadQlooKey(env = process.env) {
  if (env.QLOO_API_KEY && env.QLOO_API_KEY.trim()) return env.QLOO_API_KEY.trim();
  const file = env.QLOO_KEY_FILE || DEFAULT_KEY_FILE;
  if (!existsSync(file)) return null;
  try {
    const data = JSON.parse(readFileSync(file, "utf8"));
    const key = data?.qloo?.api_key;
    return typeof key === "string" && key.trim() ? key.trim() : null;
  } catch {
    return null;
  }
}

export function loadConfig(env = process.env) {
  return {
    port: Number(env.PORT || 8787),
    qlooBaseUrl: env.QLOO_BASE_URL || "https://hackathon.api.qloo.com",
    qlooKey: loadQlooKey(env),
    // Hard ceiling on live Qloo calls per UTC day, to protect the event quota on a public demo.
    dailyCallCap: Number(env.QLOO_DAILY_CALL_CAP || 1500),
    // Plans per client address per 10 minutes.
    planRateLimit: Number(env.PLAN_RATE_LIMIT || 6),
    searchRateLimit: Number(env.SEARCH_RATE_LIMIT || 30),
    cacheDir: env.QLOO_CACHE_DIR || null,
    // Optional: the single forwarding header set by a trusted reverse proxy (e.g. "x-real-ip").
    trustProxyHeader: (env.TRUST_PROXY_HEADER || "").trim().toLowerCase() || null,
    llm: {
      anthropicKey: env.ANTHROPIC_API_KEY || null,
      anthropicModel: env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
      openaiKey: env.HOSTWISE_OPENAI_API_KEY || null,
      openaiBaseUrl: env.HOSTWISE_OPENAI_BASE_URL || "https://api.openai.com/v1",
      openaiModel: env.HOSTWISE_OPENAI_MODEL || "gpt-4o-mini",
    },
  };
}
