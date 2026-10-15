// Conversation cards built from Qloo's audience comparison between seated neighbours.
// Guests are referred to only by tokens like {{g0}}; the browser substitutes the
// names the host typed, which never leave the browser.

const g = (i) => `{{g${i}}}`;

// How interesting a shared tag is as a conversation opener, by Qloo tag subtype.
const SUBTYPE_WEIGHT = [
  [/archetype/, 1.0],
  [/theme/, 0.95],
  [/genre:music|subgenre/, 0.9],
  [/genre:media/, 0.85],
  [/instrument/, 0.7],
  [/keyword/, 0.7],
  [/plot/, 0.55],
  [/region/, 0.5],
  [/style|audience|character|characteristic|artist|music:qloo/, 0.35],
];

// Adjectives Qloo attaches to almost every audience: true, but they don't start a conversation.
const BLAND = /^(engaging|energetic|dynamic|passionate|loyal|dedicated|innovative|simple|complex|melodic|stylized|expressive|vocals|emotional|intense|popular|classic|modern|creative|drama|comedy|action|music|pop|rock|family|love|friendship|adventure|fiction|novel|film|movie|united states|united kingdom|english)$/i;

export function weight(tag) {
  for (const [re, w] of SUBTYPE_WEIGHT) if (re.test(tag.subtype || "")) return w;
  return 0.4;
}

export function rankShared(tags) {
  return [...(tags || [])]
    .filter((t) => t?.name && !BLAND.test(t.name.trim()))
    .map((t) => ({ ...t, interest: (t.query?.score ?? 0.5) * weight(t) }))
    .sort((a, b) => b.interest - a.interest);
}

// Similarity for seating: meaningful shared ground, not shared generic adjectives.
export function pairSimilarity(shared) {
  const r = rankShared(shared);
  return r.slice(0, 4).reduce((acc, t) => acc + t.interest, 0) + 0.02 * (shared?.length || 0);
}

export function sharedCard(tag, a, b) {
  const t = tag.name;
  const st = tag.subtype || "";
  let text;
  if (/archetype/.test(st)) text = `${g(a)} and ${g(b)}: you're both drawn to "${t}" stories. Which one changed how you see something?`;
  else if (/theme/.test(st)) text = `"${t}" runs through both your favourites, ${g(a)} and ${g(b)}. Where does it show up in your own life?`;
  else if (/genre:music|subgenre|instrument/.test(st)) text = `${g(a)}, ${g(b)}: Qloo hears ${t.toLowerCase()} in both your tastes. Each pick one track for after dessert, and defend it.`;
  else if (/genre:media/.test(st)) text = `${g(a)}, ${g(b)}: you share a soft spot for ${t.toLowerCase()}. Each name one the rest of the table has to see.`;
  else if (/region/.test(st)) text = `${t} keeps surfacing in both your tastes, ${g(a)} and ${g(b)}. Best thing you've eaten, watched or heard from there?`;
  else text = `"${t}" turns up in both your favourites, ${g(a)} and ${g(b)}. Coincidence, or a clue?`;
  return { kind: "common-ground", text, evidence: { tag: t, subtype: st, score: tag.query?.score ?? null, guests: [a, b] } };
}

export function contrastCard(tagA, tagB, a, b) {
  return {
    kind: "friendly-debate",
    text: `${g(a)} leans "${tagA.name}"; ${g(b)} leans "${tagB.name}". Each of you pitch the other one thing worth trying, in thirty seconds.`,
    evidence: { a: tagA.name, b: tagB.name, guests: [a, b] },
  };
}

export function destinationCard(dest) {
  return {
    kind: "table-question",
    text: `If this whole table took one trip together, the taste graph points to ${dest.name}. Who plans it, who packs light, who gets lost first?`,
    evidence: { entity: dest.name },
  };
}

export function filmCard(film) {
  return {
    kind: "table-question",
    text: `Before the film: if ${film.name} had a sequel starring this table, what would it be called?`,
    evidence: { entity: film.name },
  };
}

// Choose a bridge tag for a pair, avoiding tags already used elsewhere at the table.
export function pickShared(tags, used = new Set()) {
  const ranked = rankShared(tags);
  return ranked.find((t) => !used.has(t.name.toLowerCase())) || null;
}

const DISTINCT_PREF = /archetype|theme|subgenre|genre:music|genre:media|plot/;

export function pickDistinct(tags, avoid = new Set()) {
  const good = (tags || []).filter((t) => t?.name && !BLAND.test(t.name.trim()) && !avoid.has(t.name.toLowerCase()) && !/[,;]$/.test(t.name));
  return good.find((t) => DISTINCT_PREF.test(t.subtype || "")) || good[0] || null;
}
