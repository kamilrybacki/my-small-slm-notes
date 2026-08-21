// Shared pure functions for build + validate + tests.
// No side effects, no filesystem — import these anywhere.

/** Bucket keys, in display order. */
export const BUCKETS = [
  { key: 'sub', label: 'Sub-1B → 3B', blurb: 'Ultra-compact models built for mobile devices and local processing (e.g. lightweight device assistants).' },
  { key: 'mid', label: '3B → 8B', blurb: 'Mid-range small models balancing general capability and low latency (e.g. many modern mini open-source releases).' },
  { key: 'large', label: '8B → 15B+', blurb: 'Higher-capacity compact models approaching the threshold of larger language systems.' },
];

/**
 * Deterministic size bucket from total params (in billions).
 * Rule (locked): params < 3 => sub ; 3 <= params <= 8 => mid ; params > 8 => large.
 * 8B lands in mid, 3B lands in mid — no gaps, no overlaps.
 */
export function bucketOf(params) {
  if (typeof params !== 'number' || Number.isNaN(params)) {
    throw new Error(`bucketOf: params must be a number, got ${params}`);
  }
  if (params < 3) return 'sub';
  if (params <= 8) return 'mid';
  return 'large';
}

/**
 * Canonical slug from a model name.
 * lowercase -> non-alnum runs to '-' -> trim leading/trailing '-'.
 * This is the identity key: the data filename MUST equal slug(name) + '.yaml'.
 */
export function slugify(name) {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Base name with size/version size-tokens stripped, for advisory near-duplicate
 * detection only. Removes tokens like "360m", "0.5b", "1.5b", "14b".
 */
export function baseName(name) {
  return String(name)
    .toLowerCase()
    .replace(/\b\d+(\.\d+)?\s*[bm]\b/g, ' ') // size tokens: 360m, 0.5b, 14b
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/** Classic Levenshtein edit distance. */
export function levenshtein(a, b) {
  a = String(a); b = String(b);
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let cur = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[n];
}

/** Similarity ratio in [0,1] from edit distance over max length. */
export function similarity(a, b) {
  const A = baseName(a), B = baseName(b);
  const maxLen = Math.max(A.length, B.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(A, B) / maxLen;
}

/**
 * Advisory near-duplicate finder. Flags a pair ONLY when base-names are close
 * AND params are equal. Different-size siblings (Qwen2.5-0.5B vs Qwen2.5-1.5B)
 * are never flagged. Returns array of {a, b, ratio}. NEVER used to block.
 */
export function findNearDuplicates(models, threshold = 0.85) {
  const hits = [];
  for (let i = 0; i < models.length; i++) {
    for (let j = i + 1; j < models.length; j++) {
      const a = models[i], b = models[j];
      if (a.params !== b.params) continue; // gate on equal params
      const ratio = similarity(a.name, b.name);
      if (ratio >= threshold) hits.push({ a: a.name, b: b.name, ratio });
    }
  }
  return hits;
}

/** Group models into ordered buckets, sorted by params asc then name. */
export function groupByBucket(models) {
  const groups = Object.fromEntries(BUCKETS.map((b) => [b.key, []]));
  for (const m of models) groups[bucketOf(m.params)].push(m);
  for (const key of Object.keys(groups)) {
    groups[key].sort((x, y) => x.params - y.params || x.name.localeCompare(y.name));
  }
  return groups;
}
