// Integrity test over the real data/ dir: every file's name matches its slug,
// slugs are unique, and params bucket cleanly. Mirrors the CI gate's core rules.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { slugify, bucketOf } from '../src/lib.mjs';

const DATA_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const files = readdirSync(DATA_DIR).filter((f) => /\.ya?ml$/.test(f));

test('seed data dir is non-empty', () => {
  assert.ok(files.length > 0);
});

test('every data file matches slug(name) and buckets cleanly', () => {
  const slugs = new Set();
  for (const f of files) {
    const doc = parse(readFileSync(join(DATA_DIR, f), 'utf8'));
    const stem = f.replace(/\.ya?ml$/, '');
    assert.equal(stem, slugify(doc.name), `${f}: filename must equal slug(name)`);
    assert.ok(!slugs.has(stem), `${f}: duplicate slug`);
    slugs.add(stem);
    assert.doesNotThrow(() => bucketOf(doc.params), `${f}: params must bucket`);
    assert.ok(Array.isArray(doc.quick_facts) && doc.quick_facts.length > 0, `${f}: quick_facts list required`);
  }
});
