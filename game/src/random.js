// Solmara — deterministic seeded RNG (mulberry32) + small helpers.
// Plain ES module, no build step, no network requests.

// mulberry32: fast, small, deterministic PRNG. seed is any 32-bit integer.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Float in [min, max).
export function range(rng, min, max) {
  return min + rng() * (max - min);
}

// Integer in [min, max] inclusive.
export function rangeInt(rng, min, max) {
  return Math.floor(range(rng, min, max + 1));
}

// Random element of a non-empty array.
export function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length)];
}

// Alias of pick (same behaviour, friendlier name at call sites).
export function choice(rng, arr) {
  return pick(rng, arr);
}

// True with probability p (0..1).
export function chance(rng, p) {
  return rng() < p;
}

// In-place Fisher–Yates shuffle using the seeded rng; returns the array.
export function shuffle(rng, arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Weighted pick: entries are [value, weight]; weights need not sum to 1.
export function weighted(rng, entries) {
  let total = 0;
  for (const [, w] of entries) total += w;
  let roll = rng() * total;
  for (const [value, w] of entries) {
    roll -= w;
    if (roll <= 0) return value;
  }
  return entries[entries.length - 1][0];
}
