// Round-table seating from pairwise shared taste.
// sim[i][j] is a symmetric similarity (higher = more common ground). We search every
// circular arrangement (guest 0 fixed, so (n-1)! orders; n <= 8 keeps this tiny) and
// maximise the weakest neighbour pair first, then the total: nobody gets seated next
// to someone they have nothing to talk about if it can be avoided.

export function bestSeating(sim) {
  const n = sim.length;
  if (n <= 1) return { order: n ? [0] : [], weakest: 0, total: 0 };
  if (n === 2) return { order: [0, 1], weakest: sim[0][1], total: sim[0][1] };
  let best = null;
  const rest = [...Array(n).keys()].slice(1);
  for (const perm of permutations(rest)) {
    // Skip mirror images: a circular order and its reverse are the same table.
    if (perm[0] > perm[perm.length - 1]) continue;
    const order = [0, ...perm];
    let weakest = Infinity;
    let total = 0;
    for (let k = 0; k < n; k++) {
      const s = sim[order[k]][order[(k + 1) % n]];
      weakest = Math.min(weakest, s);
      total += s;
    }
    if (!best || weakest > best.weakest + 1e-9 || (Math.abs(weakest - best.weakest) <= 1e-9 && total > best.total)) {
      best = { order, weakest, total };
    }
  }
  return best;
}

export function* permutations(arr) {
  if (arr.length <= 1) {
    yield arr.slice();
    return;
  }
  for (let i = 0; i < arr.length; i++) {
    const rest = arr.slice(0, i).concat(arr.slice(i + 1));
    for (const p of permutations(rest)) yield [arr[i], ...p];
  }
}
