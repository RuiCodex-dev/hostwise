# Publish checklist (needs the owner's approval)

Nothing in this project has been pushed, published or deployed. The repository is local
git only. Two separate approvals are needed before submission:

1. **Publishing the repository** (public GitHub repo with the MIT licence visible).
2. **Deploying the hosted demo** (the rules disqualify demos that "only run locally").

Deadline: **2026-10-30 23:45 EDT = 2026-10-31 04:45 Belgium.** Target: everything live by
2026-10-28.

## Before either step

- [ ] `npm test` passes (23 tests).
- [ ] `npm run secret-scan` is clean (checks tracked and untracked files for the configured
      key values and common credential patterns).
- [ ] `git log -p | grep -i "x-api-key\|api_key"` shows only code, never a value.
- [ ] `.cache/` (Qloo responses) and `design/gen/` (raw generations) are git-ignored and not
      in any commit (`git ls-files .cache design/gen` prints nothing).

## 1. Publish the repository (owner approval A)

```sh
gh repo create hostwise --public --source . --remote origin --push \
  --description "Hostwise: a hosting agent that plans dinner for people who don't share a taste, grounded in Qloo's taste graph."
gh repo edit --add-topic qloo,agent,hackathon,recommendations
```

GitHub detects `LICENSE` (MIT) and shows it in the About panel, as the rules require. The
repo contains no Qloo response data (Qloo's guide asks that it not be published).

## 2. Deploy the hosted demo (owner approval B)

The server is a single Node 22 process with no runtime dependencies and one secret,
`QLOO_API_KEY`. The kit notes that serverless is not a supported route for the Qloo MCP
harness; Hostwise calls the REST API directly, but a small always-on container is still the
simplest and safest host (in-memory cache, Server-Sent Events, no cold starts).

### Recommended: Fly.io (always on, about USD 2-3 a month)

One-time, from the project root (`fly.toml` and `Dockerfile` are ready):

```sh
fly launch --copy-config --no-deploy --name hostwise-ruicodex
fly secrets set QLOO_API_KEY="<event key>"     # type it, do not paste into a file
fly deploy
```

Afterwards `fly deploy` is the one command for every update. Health check:
`https://hostwise-ruicodex.fly.dev/api/health` must report `"qloo":"configured"`.

### Option comparison

| Host | Cost | Pros | Cons |
| --- | --- | --- | --- |
| **Fly.io** (recommended) | ~USD 2-3/month, card required | Always on (`min_machines_running = 1`), Docker as-is, EU region, `fly secrets` | Needs a card on file |
| **Render** free web service | Free | `render.yaml` blueprint ready, set `QLOO_API_KEY` in the dashboard | Sleeps after 15 min idle; first judge visit waits ~30-60 s; in-memory cache lost on sleep |
| **Owner's server** (e.g. `hostwise.ruicodex.com`) | Free (existing host) | Full control, own domain | Needs Node 22 + a reverse proxy rule (IIS ARR or similar) + TLS; must not disturb existing sites |
| **Cloudflare Workers** | Free tier | Global, no cold starts | Needs a Workers entry point (the handler is web-standard, but `node:fs` cache and Node adapter would need adapting); cache per isolate only |

Render one-liner alternative: dashboard -> New -> Blueprint -> this repo, then add
`QLOO_API_KEY` as a secret env var.

### After deploying

- [ ] Open the URL, run **Team offsite**, confirm the plan completes and the trace shows
      live calls.
- [ ] `/api/health` reports `configured`; no key anywhere in page source or responses.
- [ ] Optional: set `QLOO_DAILY_CALL_CAP` lower if the event announces a small quota.

## 3. Devpost (owner step)

- Paste `docs/DEVPOST.md` into the submission, fill in the demo and repo URLs.
- Upload screenshots from `press/` and the thumbnail `video/thumbnail.png`.
- Optional video: `video/demo-final.mp4` (needs uploading to YouTube/Vimeo first; owner
  step). Vertical teaser: `video/teaser-vertical.mp4` if present.
- Team/organisation field: **Rui Codex**.
