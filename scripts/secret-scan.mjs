// Pre-commit secret scan. Checks every file git would commit (tracked + staged + untracked,
// minus ignored) for (a) the literal value of any locally configured key and (b) common
// credential patterns. Prints only file:line and the rule name, never the matched value.
// Exit code 1 on any finding.
import { execSync } from "node:child_process";
import { readFileSync, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const files = execSync("git ls-files --cached --others --exclude-standard", { encoding: "utf8" }).split("\n").filter(Boolean);

const literals = [];
for (const v of [process.env.QLOO_API_KEY, process.env.ANTHROPIC_API_KEY, process.env.OPENAI_API_KEY, process.env.HOSTWISE_OPENAI_API_KEY]) if (v && v.length >= 12) literals.push(v);
const keyFile = join(homedir(), ".ruicodex-keys", "hackathons-2026.json");
if (existsSync(keyFile)) {
  const walk = (o) => {
    if (typeof o === "string" && o.length >= 12 && !/\s/.test(o) && !/^https?:/.test(o) && !o.includes("@")) literals.push(o);
    else if (o && typeof o === "object") Object.values(o).forEach(walk);
  };
  try { walk(JSON.parse(readFileSync(keyFile, "utf8"))); } catch { /* ignore */ }
}

const RULES = [
  ["anthropic-key", /sk-ant-[A-Za-z0-9_-]{20,}/],
  ["openai-style-key", /\bsk-[A-Za-z0-9]{32,}/],
  ["aws-access-key", /\bAKIA[0-9A-Z]{16}\b/],
  ["google-api-key", /\bAIza[0-9A-Za-z_-]{35}\b/],
  ["private-key-block", /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ["assigned-secret", /(api[_-]?key|secret|password|token)["']?\s*[:=]\s*["'][A-Za-z0-9_\-+/]{24,}["']/i],
];

let findings = 0;
for (const f of files) {
  if (!existsSync(f) || statSync(f).size > 5_000_000) continue;
  if (/\.(png|jpe?g|webp|woff2?|mp4|mp3|wav|ico|zip)$/i.test(f)) continue;
  const lines = readFileSync(f, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const lit of literals) if (line.includes(lit)) { console.log(`${f}:${i + 1}  configured-key-value`); findings++; }
    for (const [name, re] of RULES) if (re.test(line)) { console.log(`${f}:${i + 1}  ${name}`); findings++; }
  });
}
console.log(findings ? `secret-scan: ${findings} finding(s) in ${files.length} files` : `secret-scan: clean (${files.length} files, ${literals.length} configured values checked)`);
process.exit(findings ? 1 : 0);
