import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  bucketOf,
  slugify,
  baseName,
  levenshtein,
  similarity,
  findNearDuplicates,
  groupByBucket,
} from '../src/lib.mjs';

test('bucketOf boundaries are deterministic', () => {
  assert.equal(bucketOf(0.36), 'sub');
  assert.equal(bucketOf(2.99), 'sub');
  assert.equal(bucketOf(3), 'mid'); // 3B lands in mid
  assert.equal(bucketOf(7.25), 'mid');
  assert.equal(bucketOf(8), 'mid'); // 8B lands in mid
  assert.equal(bucketOf(8.01), 'large'); // just over -> large
  assert.equal(bucketOf(14.77), 'large');
});

test('bucketOf rejects non-numbers', () => {
  assert.throws(() => bucketOf('unknown'));
  assert.throws(() => bucketOf(NaN));
});

test('slugify is canonical', () => {
  assert.equal(slugify('SmolLM2-360M'), 'smollm2-360m');
  assert.equal(slugify('Qwen2.5-0.5B'), 'qwen2-5-0-5b');
  assert.equal(slugify('Phi-3.5-mini-instruct'), 'phi-3-5-mini-instruct');
  assert.equal(slugify('  Weird__Name!! '), 'weird-name');
});

test('baseName strips size tokens', () => {
  assert.equal(baseName('Qwen2.5-0.5B'), 'qwen2 5');
  assert.equal(baseName('SmolLM2-360M'), 'smollm2');
});

test('levenshtein basic', () => {
  assert.equal(levenshtein('abc', 'abc'), 0);
  assert.equal(levenshtein('abc', 'abd'), 1);
  assert.equal(levenshtein('', 'abc'), 3);
});

test('similarity ignores size suffix', () => {
  // same base once size stripped
  assert.ok(similarity('SmolLM2-360M', 'smollm 2 360m') > 0.8);
});

test('findNearDuplicates only flags equal-params pairs', () => {
  const models = [
    { name: 'Qwen2.5-0.5B', params: 0.5 },
    { name: 'Qwen2.5-1.5B', params: 1.5 },
    { name: 'SmolLM2-360M', params: 0.36 },
    { name: 'SmolLM 2 360M', params: 0.36 },
  ];
  const hits = findNearDuplicates(models);
  // Qwen 0.5 vs 1.5 must NOT be flagged (different params).
  assert.ok(!hits.some((h) => h.a.includes('Qwen') && h.b.includes('Qwen')));
  // The two SmolLM2-360M spellings (same params) SHOULD be flagged.
  assert.ok(hits.some((h) => h.a.includes('SmolLM') && h.b.includes('SmolLM')));
});

test('groupByBucket sorts by params then name', () => {
  const groups = groupByBucket([
    { name: 'B', params: 5 },
    { name: 'A', params: 5 },
    { name: 'Tiny', params: 0.5 },
    { name: 'Big', params: 12 },
  ]);
  assert.equal(groups.sub.length, 1);
  assert.deepEqual(groups.mid.map((m) => m.name), ['A', 'B']);
  assert.equal(groups.large[0].name, 'Big');
});
