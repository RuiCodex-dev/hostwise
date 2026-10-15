// Group-fairness scoring for a shortlist ranked separately for every guest.
//
// affinities: Map<candidateId, Array<number|null>>  (one raw Qloo affinity per guest)
// Each guest's affinities are min-max normalised across the pool, so a guest whose
// Qloo scores all sit in a narrow band still expresses a clear order of preference.
// The group score is "least misery" blended with the mean: one guest strongly
// disliking a pick costs more than a small gain for everyone else.

export const LEFT_OUT = 0.35;

export function normalisePerGuest(affinities, guestCount) {
  const ids = [...affinities.keys()];
  const fit = new Map(ids.map((id) => [id, new Array(guestCount).fill(0)]));
  for (let g = 0; g < guestCount; g++) {
    const vals = ids.map((id) => affinities.get(id)[g]).filter((v) => typeof v === "number");
    if (!vals.length) continue;
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    for (const id of ids) {
      const v = affinities.get(id)[g];
      if (typeof v !== "number") fit.get(id)[g] = 0;
      else fit.get(id)[g] = hi > lo ? (v - lo) / (hi - lo) : 1;
    }
  }
  return fit;
}

export function groupScore(fits, { minWeight = 0.6 } = {}) {
  if (!fits.length) return 0;
  const min = Math.min(...fits);
  const mean = fits.reduce((a, b) => a + b, 0) / fits.length;
  return minWeight * min + (1 - minWeight) * mean;
}

// Returns candidates sorted best-first with their per-guest fit and group score.
export function rankForGroup(affinities, guestCount, opts) {
  const fit = normalisePerGuest(affinities, guestCount);
  return [...fit.entries()]
    .map(([id, fits]) => ({
      id,
      fits,
      raw: affinities.get(id),
      score: groupScore(fits, opts),
      minFit: Math.min(...fits),
      leftOut: fits.map((f, g) => (f < LEFT_OUT ? g : -1)).filter((g) => g >= 0),
    }))
    .sort((a, b) => b.score - a.score || b.minFit - a.minFit);
}

// For a naive comparison: what would a single pooled ("everyone's favourites at once")
// recommendation have picked, and how fair is that pick? Used to show the value of
// per-guest ranking in the evidence panel.
export function fairnessGap(ranked, pooledTopId) {
  const pooled = ranked.find((r) => r.id === pooledTopId);
  const best = ranked[0];
  if (!pooled || !best) return null;
  return { pooledMinFit: pooled.minFit, chosenMinFit: best.minFit, improved: best.id !== pooled.id && best.minFit > pooled.minFit };
}
