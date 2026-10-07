/**
 * Confidence intervals by resampling (methods 0.10, see /methods#uncertainty).
 * Every resample uses a seeded generator, so the same data always gives the same interval.
 */

export const BOOT = {
  /** Resamples for cell and block bootstraps (fast measures computed per request). */
  B: 400,
  /** Resamples per arrival date (run for every species and cell in the daily recompute). */
  B_ARRIVAL: 40,
  /** Two-sided interval: 95% for measures, 90% for arrival weeks (weekly resolution makes 95% mostly the full window). */
  LEVEL: 0.95,
  LEVEL_ARRIVAL: 0.9,
  /** Weeks per block when resampling a weekly series, to keep its autocorrelation. */
  BLOCK_WEEKS: 4,
};

/** Small, fast, seeded PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seed from a string (species name and context), so each measure has its own stable stream. */
export function seedOf(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Poisson draw: Knuth for small means, a rounded normal approximation for large ones. */
export function poisson(lambda: number, r: () => number): number {
  if (lambda <= 0) return 0;
  if (lambda < 30) {
    const L = Math.exp(-lambda);
    let k = 0, p = 1;
    do { k++; p *= r(); } while (p > L);
    return k - 1;
  }
  const u = 1 - r(), v = r();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return Math.max(0, Math.round(lambda + z * Math.sqrt(lambda)));
}

/** Percentile interval of finite values; null when too few resamples produced a value. */
export function interval(values: number[], level = BOOT.LEVEL, minN = 20): [number, number] | null {
  const v = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (v.length < minN) return null;
  const q = (p: number) => v[Math.min(v.length - 1, Math.max(0, Math.round(p * (v.length - 1))))];
  return [q((1 - level) / 2), q(1 - (1 - level) / 2)];
}

/** Indices drawn with replacement. */
export function resample(n: number, r: () => number): number[] {
  return Array.from({ length: n }, () => Math.floor(r() * n));
}

/** Moving block bootstrap indices for a series of length n. */
export function blockResample(n: number, block: number, r: () => number): number[] {
  const out: number[] = [];
  while (out.length < n) {
    const start = Math.floor(r() * Math.max(1, n - block + 1));
    for (let k = 0; k < block && out.length < n; k++) out.push(start + k);
  }
  return out;
}

export function pearson(x: number[], y: number[]): number | null {
  const n = x.length; if (n < 6) return null;
  const mx = x.reduce((s, v) => s + v, 0) / n, my = y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

/** Correlation of two weekly series with a moving block bootstrap interval. */
export function corrInterval(x: number[], y: number[], seed: string): [number, number] | null {
  const r = rng(seedOf(seed));
  const vals: number[] = [];
  for (let b = 0; b < BOOT.B; b++) {
    const idx = blockResample(x.length, BOOT.BLOCK_WEEKS, r);
    const v = pearson(idx.map((i) => x[i]), idx.map((i) => y[i]));
    if (v != null) vals.push(v);
  }
  return interval(vals);
}

export const round = (v: number, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/** Gamma(shape, scale) draw (Marsaglia and Tsang). */
export function gamma(shape: number, scale: number, r: () => number): number {
  if (shape <= 0) return 0;
  if (shape < 1) return gamma(shape + 1, scale, r) * Math.pow(r() || 1e-12, 1 / shape);
  const d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
  for (;;) {
    let x: number, v: number;
    do {
      const u1 = 1 - r(), u2 = r();
      x = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      v = 1 + c * x;
    } while (v <= 0);
    v = v * v * v;
    const u = r();
    if (u < 1 - 0.0331 * x ** 4 || Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v * scale;
  }
}

/**
 * Overdispersion of a weekly count series: how much more the counts scatter than Poisson around a 3-week moving average.
 * Detection counts depend on which stations happen to be running, so real series are far noisier than Poisson.
 */
export function dispersion(n: number[]): number {
  let s = 0, k = 0;
  for (let i = 1; i < n.length - 1; i++) {
    const fit = (n[i - 1] + n[i] + n[i + 1]) / 3;
    if (fit > 0) { s += (n[i] - fit) ** 2 / fit; k++; }
  }
  return k > 2 ? Math.max(1, s / (k - 1)) : 1;
}

/** Count with mean `mean` and variance phi * mean (gamma-Poisson), or plain Poisson when phi is 1. */
export function overdispersed(mean: number, phi: number, r: () => number): number {
  if (mean <= 0) return 0;
  if (phi <= 1.0001) return poisson(mean, r);
  return poisson(gamma(mean / (phi - 1), phi - 1, r), r);
}
