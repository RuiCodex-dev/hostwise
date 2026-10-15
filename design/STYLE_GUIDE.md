# Hostwise style guide

Hostwise should feel like a well-set table, not a dashboard: warm, editorial, quiet. Every
surface (app, Devpost images, video) uses this one system.

## Voice

- A thoughtful host talking to another host. Short sentences, specific nouns, no hype,
  no exclamation marks, no emoji.
- Always separate **what Qloo measured** (affinity, shared tags) from **what Hostwise
  decided** (the pick, the dish, the card). Say "Qloo's taste graph points to", never
  "Qloo knows you like".
- Guests are people, not data: never imply Hostwise knows anything about a guest beyond
  the favourites the host typed.

## Palette (CSS custom properties in `public/css/app.css`)

| Token | Hex | Use |
| --- | --- | --- |
| `--ink` | `#1E1916` | Body text on light, dark page chrome |
| `--aubergine` | `#3B2433` | Dark surfaces: hero, agent trace, footer |
| `--linen` | `#F3ECE1` | Light page background |
| `--paper` | `#FBF7F0` | Cards on linen |
| `--terracotta` | `#B4532F` | Primary action buttons (fill), low-fit bars |
| `--terracotta-d` | `#9A4425` | Small terracotta text: labels, eyebrows, card kinds |
| `--brass` | `#C1964A` | Focus rings, accents on dark, candle highlights |
| `--olive` | `#6F7450` | Fit bars, "ok" states |
| `--smoke` | `#685D55` | Secondary text |

Contrast measured with the WCAG formula (not estimated): ink on linen 14.8:1, smoke on
paper 6.0:1 and on linen 5.5:1, linen on aubergine 12.0:1, paper on terracotta 4.7:1 (button
text), terracotta-d on linen 5.5:1, brass on aubergine 5.2:1. Plain terracotta on linen is
only 4.2:1, so it is never used for small text. The first version of this guide used a
lighter smoke (`#7D7168`) and claimed 4.6:1; the measured value was 4.4:1, so it was
darkened.

## Type

- **Display:** Instrument Serif (regular + italic), SIL OFL 1.1, self-hosted from
  `public/fonts/`. Headlines, the host's note, guest names on the seating chart, pull
  quotes. Never bold; use italic for emphasis.
- **UI / body:** Hanken Grotesk 400/500/600/700, SIL OFL 1.1, self-hosted. Everything
  else. Numbers in the evidence panels use `font-variant-numeric: tabular-nums`.
- Scale (rem): 0.8125 / 0.9375 / 1.0625 / 1.25 / 1.625 / 2.25 / 3.25 / 4.5. Line height
  1.55 for body, 1.05 for display.

## Spacing and shape

- 4 px base scale: 4, 8, 12, 16, 24, 32, 48, 64, 96.
- Radii: 6 px controls, 14 px cards, 999 px chips. Hairline borders
  (`rgba(30,25,22,.12)`) rather than shadows; one soft shadow for floating layers only.
- Max content width 1200 px; reading width 64 ch.

## Icons

Lucide (ISC licence), one family only, 1.6 px stroke, drawn at 18 or 20 px, inherit
`currentColor`. Sprite in `public/img/icons.svg`.

## Imagery

- Warm editorial still-life photography: medium-format film look, Portra-like colour,
  candlelight plus blue-hour window light, aubergine shadows, linen, brass, stoneware.
- **No people, faces or hands.** No text, labels or logos inside images; every word is
  real typography laid over in HTML.
- Every plate is graded by `design/grade.py` (edge trim, aubergine shadow split-tone,
  saturation 0.93, gentle S-curve, seeded fine grain) so they read as one shoot.
- Generated imagery is mood only. Product UI in screenshots and the video is always the
  real app. Entity artwork (posters, artist photos) comes from Qloo's image URLs at
  runtime and is shown only as evidence for a pick.

## Motion

- Ease `cubic-bezier(.2,.7,.2,1)`, 180-320 ms. Sections of the plan fade and rise 8 px as
  the agent completes them; the trace appends line by line.
- `prefers-reduced-motion: reduce` turns all of it into instant state changes.

## Components

- **Guest card:** paper card, serif name field, favourites as chips with the Qloo
  artwork thumbnail, diet toggles as outline chips.
- **Agent trace:** aubergine panel; thoughts in serif italic, tool calls as compact rows
  (status dot, tool name, cached tag, expandable request without credentials).
- **Fit bars:** one olive bar per guest, 0-100, guest name left, value right, a
  terracotta tick at the table's weakest fit.
- **Conversation cards:** paper cards with a soft rotate (max 1.2 degrees), serif text.

## Accessibility

Visible brass focus ring (2 px + 2 px offset) on every interactive element; all controls
are native elements; live regions announce agent progress politely; images carry alt
text; colour is never the only signal (fit bars print their numbers).
