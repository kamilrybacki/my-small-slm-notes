#!/usr/bin/env node
// Validation gate. Runs in CI on every PR and on hermes/** pushes.
// FAILS the build (exit 1) on any hard violation. Advisory near-duplicate
// warnings are printed but NEVER fail the build.
//
// Hard checks:
//   1. YAML parses.
//   2. Schema valid (schema/model.schema.json) — all required fields present,
//      'unknown' sentinel allowed only where the schema permits it.
//   3. filename === slug(name) + '.yaml'  (identity == filename).
//   4. No two files resolve to the same slug (exact-slug collision).
//   5. No HTML angle-brackets or 'javascript:' in any text field (anti-injection).
// Advisory (warn only):
//   6. Near-duplicate names with EQUAL params.

import { readdirSync, readFileSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { slugify, findNearDuplicates } from '../src/lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'data');
const SCHEMA_PATH = join(ROOT, 'schema', 'model.schema.json');

const TEXT_FIELDS = ['name', 'license', 'modality', 'url'];
const INJECTION = /[<>]|javascript:/i;

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')));

const errors = [];
const warnings = [];
const seenSlugs = new Map(); // slug -> filename
const models = [];

const files = readdirSync(DATA_DIR).filter((f) => /\.ya?ml$/.test(f)).sort();

if (files.length === 0) {
  console.error('No data/*.yaml files found.');
  process.exit(1);
}

for (const file of files) {
  const path = join(DATA_DIR, file);
  const stem = basename(file).replace(/\.ya?ml$/, '');
  let doc;

  try {
    doc = parse(readFileSync(path, 'utf8'));
  } catch (e) {
    errors.push(`${file}: YAML parse error — ${e.message}`);
    continue;
  }

  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    errors.push(`${file}: must be a single YAML mapping.`);
    continue;
  }

  // 2. schema
  if (!validate(doc)) {
    for (const err of validate.errors) {
      errors.push(`${file}: ${err.instancePath || '/'} ${err.message}`);
    }
    continue; // no point on the rest if shape is wrong
  }

  // 3. filename == slug(name)
  const expected = slugify(doc.name);
  if (stem !== expected) {
    errors.push(`${file}: filename must be '${expected}.yaml' (slug of "${doc.name}"), got '${stem}.yaml'.`);
  }

  // 4. exact-slug collision (hard block)
  if (seenSlugs.has(expected)) {
    errors.push(`${file}: slug '${expected}' collides with ${seenSlugs.get(expected)}. Update that file instead of adding a duplicate.`);
  } else {
    seenSlugs.set(expected, file);
  }

  // 5. injection in text fields + list fields (quick_facts, my_experience)
  for (const f of TEXT_FIELDS) {
    if (typeof doc[f] === 'string' && INJECTION.test(doc[f])) {
      errors.push(`${file}: field '${f}' contains disallowed characters (<, >, or javascript:).`);
    }
  }
  for (const listField of ['quick_facts', 'my_experience']) {
    if (Array.isArray(doc[listField])) {
      doc[listField].forEach((n, i) => {
        if (typeof n === 'string' && INJECTION.test(n)) {
          errors.push(`${file}: ${listField}[${i}] contains disallowed characters (<, >, or javascript:).`);
        }
      });
    }
  }

  models.push(doc);
}

// 6. advisory near-duplicates (warn only, gated on equal params)
for (const { a, b, ratio } of findNearDuplicates(models)) {
  warnings.push(`Possible near-duplicate (same params): "${a}" ~ "${b}" (similarity ${ratio.toFixed(2)}). Verify at merge — this does NOT block.`);
}

// GitHub Actions annotations
for (const w of warnings) console.log(`::warning::${w}`);
for (const e of errors) console.log(`::error::${e}`);

console.log(`\nValidated ${models.length} model(s) across ${files.length} file(s).`);
console.log(`${warnings.length} advisory warning(s), ${errors.length} error(s).`);

if (errors.length > 0) {
  console.error('\nValidation FAILED.');
  process.exit(1);
}
console.log('Validation passed.');
