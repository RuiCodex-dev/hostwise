# Devpost submission draft: Hostwise

> Draft for the owner. Fill the two links once the repo is public and the demo is deployed.
> Nothing here has been submitted.

- **Project name:** Hostwise
- **Tagline (under 200 chars):** A hosting agent that plans dinner for people who don't share a
  taste: seating, menu, soundtrack, film and conversation, scored for every guest in Qloo's
  taste graph.
- **Live demo:** `https://<to be deployed>`
- **Code:** `https://github.com/<owner>/hostwise` (MIT)
- **Video (optional):** `video/demo-final.mp4` (1 min 28 s)
- **Built with:** Qloo Taste AI API (search, insights, explainability, tag insights,
  analysis/compare), Node.js 22, vanilla JavaScript, Server-Sent Events, HyperFrames (video)
- **Team / organisation:** Rui Codex

## Inspiration

Hosting a mixed table is a taste problem in disguise. New neighbours, a team offsite,
meeting the in-laws: people who don't know each other's tastes, and a host who wants nobody
to spend the evening being polite. Generic AI answers that problem with averages ("a
crowd-pleasing film and some pasta"), and averages are exactly what leaves one person out.

## What it does

The host adds each guest and two to four favourites in any domain (films, series, music,
books, podcasts, games, places) and ticks dietary needs. Hostwise's agent then plans the
evening and streams its reasoning as it goes:

- **Seating** for a round table, chosen so the weakest neighbour pair still has real common
  ground, with the shared thread for each pair.
- **A menu** inferred from cross-domain taste (Qloo place-tag affinities for each guest),
  turned into a cookable three-course menu with a drink and a zero-proof pairing, adapted
  to vegetarian, vegan, gluten-free, dairy-free, nut-free and no-alcohol needs.
- **A soundtrack in three moods:** safest common ground on arrival, one for each corner of
  the table at dinner, the opinion-splitters late.
- **An after-dinner film** that fits everyone and runs under 140 minutes.
- **Conversation cards** written from what neighbours share and where they differ.

Every pick shows its evidence: the fit for each guest, which favourites pulled it in, any
re-plan the agent made, and what a single pooled recommendation would have chosen instead.

## How we built it (the Qloo-powered part)

The agent is a goal-driven loop over six tools, each a thin wrapper over one Qloo
capability. For each goal it:

1. **Pools** the table: one `/v2/insights` call with everyone's entities as signals and
   `feature.explainability=true`, giving candidates plus per-signal contribution scores.
2. **Scores each guest alone:** `/v2/insights` with that guest's signals and
   `filter.entities=<shortlist>`, so every candidate gets an affinity per guest.
3. **Critiques** its pick with a least-misery test (0.6 × weakest fit + 0.4 × mean, per-guest
   normalised). Anyone below 35 % is "left out".
4. **Re-plans:** asks Qloo for the left-out guest's own picks, re-scores them for everyone,
   and keeps the fairest option. In the demo table, The Smiths would have left two guests at
   24 %; the re-plan finds Phoebe Bridgers at 38 %. The menu does the same with a bridge
   starter from the left-out guest's best cuisine.
5. **Seats and sparks** with `/v2/analysis/compare` between every pair of guests: shared
   tags become seating similarity and conversation cards; distinct tags become "friendly
   debate" cards.

Cuisine comes from `/v2/insights` with `filter.type=urn:tag` and
`filter.tag.types=urn:tag:genre:place`: Qloo tells us which food cultures a fan of
*Spirited Away* and Ryuichi Sakamoto leans towards; Hostwise maps those tags onto its own
20-cuisine dish library. Favourites are resolved with `/search`.

A typical six-guest evening takes about 50 tool calls in roughly 30 seconds on a cold cache.
The client caches privately on the server, paces requests, retries 429/5xx a bounded number
of times, and enforces a daily cap so a public demo can't drain the event quota.

**Redacted request-to-result example** (one guest scoring step):

```
GET /v2/insights
  filter.type=urn:entity:movie
  signal.interests.entities=<Coco>,<Rosalía>          (one guest's favourites)
  filter.entities=<15 shortlisted film ids>
  take=15
-> 15 affinities for this guest; repeated for each guest, then normalised and combined
```

The UI shows this for every call (expand any line in the agent trace); the credential is
sent server-side as a header and never displayed.

## Responsible data handling

Guest names never leave the browser (the server sees guest indexes; the page fills names
into `{{g0}}` tokens). Only Qloo entity ids, titles and types go to Qloo. Dietary needs are
handled by Hostwise's own dish library and never sent to Qloo. Results are presented as
aggregate taste affinities, labelled as Qloo evidence and kept separate from Hostwise's
interpretation. No Qloo response data is stored in the repository.

## Challenges we ran into

- **Averages hide people.** A single pooled recommendation regularly scored one guest near
  the bottom of their own taste (Lady Bird would have left one guest of the team-offsite table at 9 %; Hostwise's pick keeps everyone at 51 % or more). Per-guest scoring plus least-misery
  was the fix, and the counterfactual callout makes the difference visible.
- **Generic shared tags.** Audience comparison returns honest but bland overlap ("Engaging",
  "Passionate", "United States"). We weight tags by subtype (archetypes, themes and genres
  over adjectives) and never reuse a thread at the same table.
- **The long tail.** One small Scottish town topped the destination list for three
  unrelated tables; `filter.popularity.min` fixed it.
- **Rate limits.** Parallel per-guest scoring triggered 429s; we added request pacing and
  bounded retries.

## Accomplishments that we're proud of

A real agent loop with visible self-critique and re-planning, not a single prompt; every
decision traceable to a Qloo measurement; a product that feels like a well-set table rather
than a dashboard; and privacy by construction.

## What we learned

Cultural taste is most useful as evidence for trade-offs between people. Qloo's per-entity
explainability and `filter.entities` ranking turned out to be the two features that made
fairness measurable.

## What's next for Hostwise

Invitations that collect each guest's favourites privately, recurring dinner clubs that
rotate who gets the "late" playlist, and restaurant mode using Qloo place recommendations
with a location filter when the host would rather go out.

## AI disclosure

Mood imagery (table photographs with no people or text) was generated with Google Flow
(Nano Banana Pro) and graded by hand; narration uses Microsoft Edge neural TTS. All product
UI, footage, code, copy, dish library and music are original. Details:
`design/GENERATED_ASSETS.md`.

## Testing instructions for judges

Open the live demo, click **Try a sample table** (or **Team offsite**), then **Plan the
evening**. A first run takes about 30 seconds while the agent calls Qloo; expand any line
in the agent trace to see the exact request. No login is needed.
