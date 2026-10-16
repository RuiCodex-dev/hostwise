# Hostwise build/test QA (RUI-218), 2026-10-16

Project: `C:\Users\Admin\Desktop\Software\Hackathons\qloo-agentic` (origin `RuiCodex-dev/hostwise`, public).
Live demo: https://hostwise.ruicodex.com. Node v22.18.0 on MSI.

## 1. Clean clone and README setup

- Fresh clone into `scratchpad/clones/hostwise`: HEAD `aa8c438983b477b49e42bafad72b933d2d21b888`,
  identical to the local project HEAD; local working tree was clean at the start. 119 tracked files.
- `npm install` / `npm ci`: no dependencies, "up to date, 0 vulnerabilities" (npm install creates a
  trivial package-lock.json; none is committed).
- `npm test`: **24 tests, 24 pass, 0 fail** (~0.44 s test time), matching the README's "24 tests".
- `npm run secret-scan`: clean (120 files, 29 configured values checked).
- Docker: `docker build` succeeded (node:22-alpine), container served `/` 200 and
  `/api/health` -> `{"qloo":"missing"}`; container and image removed afterwards.
- **No-key mode.** The README never claims an offline/mock mode; tests are synthetic. Without a
  key (`QLOO_KEY_FILE=/nonexistent`), the server starts, logs `Qloo credential: MISSING`,
  serves the UI (200), `/api/health` reports `qloo:"missing"`, `/api/search` returns 502
  `"The server's Qloo credential is missing or was rejected."` and `/api/plan` streams one thought,
  a tool error and a clean `error` event. No stack traces. Note: with no env var the server
  silently reads `~/.ruicodex-keys/hackathons-2026.json` (DEFAULT_KEY_FILE), so on this machine
  "run without a key" needs `QLOO_KEY_FILE` pointed elsewhere.

## 2. Live demo over HTTP

### Static surface
- `/` 200 (0.85 s cold, 10,667 bytes); **index.html byte-identical to HEAD**.
- All **38 files under `public/` fetched live: 38 x 200, all byte-identical to the repo**, correct
  content types (woff2, webp, svg, css, js, json, jpg).
- Headers on every response: CSP (`default-src 'self'`, `script-src 'self'`, `frame-ancestors 'none'`,
  img-src self + images.qloo.com), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`,
  `Permissions-Policy`, HSTS `max-age=31536000`; `http://` 301 -> https. `Server: Microsoft-IIS/10.0`
  and `X-Powered-By: ARR/3.0` are exposed by the proxy (cosmetic).
- Caching: HTML/CSS/JS/JSON `no-cache`, fonts/images `public, max-age=604800`, API `no-store`.
- `/api/health` 200, `qloo:"configured"`, `dailyCap: 1000` (live config differs from the 1500
  default), usage counters only (no key).
- 404s: `/nope.html` 404 text, `/api/nope` 404 JSON, `/js/nope.js` 404. Path traversal
  (`/%2e%2e/server/config.js`, `/server/config.js`, `/package.json`) 404; `..%2f` 403 from IIS.
  **Defect:** extensionless unknown paths (`/nope`, `/.env`) returned 200 with the app page (soft 404).
  **Defect:** `HEAD /` returned `Content-Length: 0`.
- `GET /api/plan` 404, `OPTIONS` 404, `DELETE /` 200 (static fallthrough).

### Plan flow (the UI's "Try a sample table" -> "Plan the evening")
Endpoints read from `public/js/app.js`: `GET /samples.json`, `GET /api/search?q=&kind=` per favourite,
then `POST /api/plan` with `{guests:[{favourites:[{id,name,kind}],diets:[]}]}`, response SSE
`data: {json}\n\n` with events thought / tool (running|ok|error, provenance) / section / done / error.

| run | guests | searches | first SSE byte | plan total | tool calls | result |
| --- | ---: | --- | ---: | ---: | ---: | --- |
| neighbours (sample) | 4 | 12 x 200, 3.8 s, all resolved correctly | 167 ms | **14.4 s** | 30 ok / 0 err | all 5 sections |
| offsite sample, first 5 guests | 5 | 10 x 200, 3.6 s | 159 ms | **21.1 s** | 40 ok / 0 err | all 5 sections |
| 2 guests (Amélie vs Daft Punk) | 2 | - | - | 7.8 s | 12 ok | all 5 sections |
| 2 guests, valid-format but non-existent ids | 2 | - | - | 2.1 s | 6, all Qloo 400 | soundtrack/film/trip skipped with a thought, menu falls back to Mediterranean (flagged), seating from empty compare, empty deck; graceful |

Sections arrive incrementally (neighbours: soundtrack 4.2 s, film 8.9 s, menu 11.8 s,
seating+deck 14.4 s), so SSE streams through nginx + IIS/ARR.

Neighbours output (real Qloo data): soundtrack arrival The Smiths / Nirvana / R.E.M., dinner
The Beatles / Arctic Monkeys / Fiona Apple, late The Velvet Underground / Jeff Buckley / Radiohead;
film **Baby Driver** after a re-plan (La La Land would have left Jon at 31 %, Baby Driver lifts the
weakest fit to 40 %; pooled pick Whiplash 26 %), 5 films rejected for length (Boyhood 165 min,
Endgame 181 ...); menu **French bistro** with a Chinese bridge starter for Jon, evidence per cuisine
with Qloo tags; vegetarian dishes for Maya; seating Maya -> Jon -> Luc -> Priya with bridges
Hero's Journey / Funk / Blues / Self-discovery; 7 conversation cards, trip Palm Springs; every tool
event carries provenance (method, path, params, cached, ms, count), no credential.
5-guest offsite: soundtrack re-planned for Ana and Sofia (R.E.M. 31 % -> Paul McCartney 34 %),
film Marriage Story (min fit 51 % vs pooled Jojo Rabbit 46 %), Mediterranean menu with a British
bridge for Tom, Kenji flagged as unserved, vegan + gluten-free dishes, 8 unique cards, Reykjavik.

Leak check on all captured streams: no stack traces, no key/header names.

### Edge cases (live)
- `{}` / `[]` guests / 1 guest -> 400 "Add at least two guests."; 9 guests -> 400 "up to 8";
  empty favourites -> 400; bad id -> 400; 7 favourites -> 400; invalid JSON -> 400;
  `"hello"`/`null` body -> 400; 60 KB body -> 413 (app), 70 KB -> 413 (nginx).
- **Defect:** `{"guests":[null,null]}` -> **500 text/plain "Internal error"**.
- **Defect:** `diets:"vegan"` (string) -> 200 stream ending in `"Something went wrong talking to Qloo"`
  and it consumed one of the 6 plans/10 min.
- **Defect:** an unknown diet (`"bogus_diet"`) was counted ("Adapting dishes for 4 dietary needs").
- **Defect:** with 2 guests the deck repeated the same friendly-debate card twice (the most
  different pair is the only pair, and it had no shared thread).
- Search: `q` of 0/1 chars -> 400; nonsense `zzqxvbnmqwerty` -> `{"results":[]}`; `<script>`,
  SQL-ish and full-width/emoji queries -> 200 JSON (rendered via DOM text, not innerHTML).
  **Defect:** 81-char query -> 400 with the wrong message "Type at least two characters."
  **Defect:** `kind=__proto__` / `kind=toString` passed the `ENTITY_TYPES[kind]` check, called Qloo
  (counted as live calls + Qloo 400) and returned 502; `kind=place` (not offered in the UI) returned
  businesses with street addresses.
- Rate limit: 7th plan in 10 min -> 429 `Retry-After: 312`, "Try again in 6 min."; spoofed
  `X-Real-IP`/`X-Forwarded-For`/`CF-Connecting-IP`/`Fly-Client-IP` did not bypass it.
- Not tried live on purpose: the malformed-URL crash below (it would take the demo down).

## 3. Docs vs reality
- README test count 24: correct at HEAD (now 29 after fixes, docs updated). Tool/endpoint table
  matches `server/agent/tools.js`. `/api/meta` existed but was not listed (added).
- README/DEVPOST/YOUTUBE links: devpost.com/software/hostwise 200 (page embeds the YouTube video and
  links the demo and repo), qloo.devpost.com 200, qloo.com 200, GitHub repo 200, LICENSE 200
  (default branch is `main`), YouTube oEmbed 200 ("Hostwise – an AI host that plans dinner ...",
  author "Rui Codex"), og.jpg 200 (1200x630). README image `press/01-landing.png` and all
  referenced files (CREDITS.md, design/GENERATED_ASSETS.md, LICENSE-lucide.txt, fonts) exist.
- DEVPOST "about 50 tool calls in roughly 30 seconds" for six guests: consistent with 30 calls/14 s
  (4 guests) and 40 calls/21 s (5 guests).
- DEVPOST example "The Smiths would have left two guests at 24 %; the re-plan finds Phoebe Bridgers
  at 38 %" did not reproduce today (The Smiths now opens the soundtrack with no re-plan); Qloo results
  drift. Not edited, because DEVPOST.md mirrors the submitted Devpost text; suggest wording it as
  "in one run" if the Devpost page is edited before 2026-10-30.
- `video/demo-final.mp4` is cited as the source but is git-ignored (only on the local machine and
  YouTube); fine, just not in the public repo.
- YOUTUBE.md says channel "RuiCodexApps"; oEmbed reports author "Rui Codex" (@RuiCodex). Cosmetic.

## 4. Defects found and fixed (local commits, not pushed)

**Critical, found locally:** `GET /%E0%A4%A` crashes the Node process. `serveStatic` calls
`decodeURIComponent` (throws `URIError`); `return serveStatic(...)` inside the try block was not
awaited, so the rejection escaped the catch and Node 22 exited on the unhandled rejection
(reproduced on the clean clone: server dead after one request, stack in the log). Whether
nginx/IIS forwards such a path to the container was deliberately not tested on the live site.

| commit | change | redeploy needed |
| --- | --- | --- |
| `4e4a37f` | server: await pipe/serveStatic, 400 on malformed path, 404 for unknown paths, HEAD Content-Length; search kinds allow-list + "under 80 characters"; plan validation for null guests / non-array diets (400 before the limiter); unknown diets ignored; duplicate debate card removed; explicit abort of the agent when the SSE stream is cancelled; 5 new tests (24 -> 29), each verified to fail on `aa8c438` except the abort one (old code also stopped, by an exception) | **yes** (container) |
| `83a8420` | `og:image` absolute + `og:url`, `og:type`, image size, `twitter:card summary_large_image` | **yes** (static file in the container) |
| `11a08de` | README/PUBLISH_CHECKLIST: 29 tests, `/api/meta` listed | no |

Post-fix verification: `npm test` 29/29; secret-scan clean (125 files) and staged-diff grep clean;
fixed server run locally with the real key: malformed URL -> 400 and still alive, HEAD
Content-Length 10969, `/nope` and `/.env` 404, `kind=__proto__` 400 without a Qloo call; full
neighbours plan 30 tools / 16.3 s, same picks as live; 2-guest plan now has 3 unique cards and
"3 dietary needs" (bogus diet dropped). planner.js kept its CRLF line endings.

## 5. Not fixed (needs owner/parent decision)
- Quota exhaustion: `/api/search` allows 60 uncached queries/min per IP and every unique query is a
  live Qloo call; one client can use the live daily cap (1000) in ~17 minutes, after which the demo
  answers "used today's share" for everyone, including judges. Options: lower the search limit,
  a separate search sub-cap, or reserve part of the cap for plans.
- Proxy headers `Server: Microsoft-IIS/10.0` and `X-Powered-By: ARR/3.0` (IIS config, not repo).
- DEVPOST example numbers (see section 3).
- Untracked files `press/gallery/` and `video/demo-final.en.srt` were present in the project folder
  and were not touched (not created by this QA).

## 6. Processes
Started and stopped: no-key local server on :18787 (exited on the crash reproduction), Docker
image `hostwise-qa:rui218` + container on :28473 (stopped, image removed), fixed local server with
key on :28474 (killed, PID confirmed gone). Ports 18787/28473/28474 free at the end. No Chrome used.
Live Qloo usage from this QA: about 75 live calls on the demo's key (health showed `today: 117`
after the 5-guest run, including 8 Qloo 400s from the deliberate fake-id and prototype-kind probes),
plus ~42 calls from the local verification runs.
