#!/usr/bin/env node
// HuggingFace-grounded data writer. THIS is the tool Hermes runs: it never
// free-recalls params/license/context/date — it reads them from the HF API and
// the model's config.json, then writes one conforming data/<slug>.yaml per model.
//
// Curated fields (quick_facts, my_experience, modality, quant_available, active_params) come from
// scripts/models.manifest.json. Load-bearing facts come from HF.
//
// Usage:
//   node scripts/hf-sync.mjs                 # sync every id in the manifest
//   node scripts/hf-sync.mjs <hf-id> ...     # sync only the given HF id(s)
//
// After syncing, run `npm run validate` — hf-sync writes, the gate judges.

import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stringify } from 'yaml';
import { slugify } from '../src/lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'data');
const MANIFEST = join(ROOT, 'scripts', 'models.manifest.json');

const round2 = (n) => Math.round(n * 100) / 100;

const HF_TOKEN = process.env.HF_TOKEN || '';

async function getJson(url) {
  const headers = { 'User-Agent': 'my-small-slm-notes-sync' };
  if (HF_TOKEN) headers.Authorization = `Bearer ${HF_TOKEN}`; // unlocks gated config.json
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

async function fetchFacts(id) {
  const info = await getJson(`https://huggingface.co/api/models/${id}`);

  const total = info?.safetensors?.total;
  if (!total || typeof total !== 'number') {
    throw new Error(`${id}: no safetensors param count on HF — cannot ground 'params'.`);
  }
  const params = round2(total / 1e9);

  const license = info?.cardData?.license || 'unknown';
  const release_date = typeof info?.createdAt === 'string' ? info.createdAt.slice(0, 10) : 'unknown';

  // context window lives in config.json, not the model-info endpoint
  let context_len = 'unknown';
  try {
    const cfg = await getJson(`https://huggingface.co/${id}/resolve/main/config.json`);
    const mpe = cfg?.max_position_embeddings ?? cfg?.text_config?.max_position_embeddings;
    if (typeof mpe === 'number' && mpe > 0) context_len = mpe;
  } catch {
    /* leave as unknown */
  }

  return { params, license, release_date, context_len };
}

function toEntry(id, curated, facts) {
  const name = id.split('/').pop(); // HF repo name is the canonical model name
  const entry = {
    name,
    params: facts.params,
    ...(curated.active_params ? { active_params: curated.active_params } : {}),
    license: facts.license,
    context_len: facts.context_len,
    modality: curated.modality || 'text',
    release_date: facts.release_date,
    url: `https://huggingface.co/${id}`,
    quick_facts: curated.quick_facts,
    ...(Array.isArray(curated.my_experience) && curated.my_experience.length
      ? { my_experience: curated.my_experience }
      : {}),
    quant_available: curated.quant_available ?? false,
  };
  return { name, entry };
}

async function main() {
  const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8'));
  const only = process.argv.slice(2);
  const targets = only.length ? manifest.filter((m) => only.includes(m.id)) : manifest;
  if (only.length && targets.length !== only.length) {
    const missing = only.filter((id) => !manifest.some((m) => m.id === id));
    console.warn(`Not in manifest (skipped): ${missing.join(', ')}`);
  }

  let ok = 0;
  const failures = [];
  for (const m of targets) {
    try {
      const facts = await fetchFacts(m.id);
      const { name, entry } = toEntry(m.id, m, facts);
      const file = join(DATA_DIR, `${slugify(name)}.yaml`);
      writeFileSync(file, stringify(entry, { lineWidth: 0 }));
      console.log(`✓ ${name}  (${entry.params}B, ${entry.license}, ctx ${entry.context_len}, ${entry.release_date})`);
      ok++;
    } catch (e) {
      failures.push(`${m.id}: ${e.message}`);
      console.error(`✗ ${m.id}: ${e.message}`);
    }
  }

  console.log(`\nSynced ${ok}/${targets.length} model(s).`);
  if (failures.length) {
    console.error('Failures:\n  ' + failures.join('\n  '));
    process.exit(1);
  }
}

main();
