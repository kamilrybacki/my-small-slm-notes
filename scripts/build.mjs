#!/usr/bin/env node
// Static builder. Reads data/*.yaml -> dist/index.html + dist/models.json.
// No framework. All rendered text is HTML-escaped. Runs in CI on push to main.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { BUCKETS, groupByBucket, bucketOf } from '../src/lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'data');
const DIST = join(ROOT, 'dist');

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function loadModels() {
  return readdirSync(DATA_DIR)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => parse(readFileSync(join(DATA_DIR, f), 'utf8')));
}

function fmtCtx(v) {
  if (v === 'unknown' || typeof v !== 'number') return esc(v);
  if (v >= 1024 && v % 1024 === 0) return `${v / 1024}K`;
  if (v >= 1000) return `${Math.round(v / 1000)}K`;
  return String(v);
}

function card(m) {
  const params = m.active_params
    ? `${esc(m.params)}B total · ${esc(m.active_params)}B active`
    : `${esc(m.params)}B`;
  const notes = m.notes.map((n) => `<li>${esc(n)}</li>`).join('');
  const tags = [
    `<span class="tag tag-params">${params}</span>`,
    `<span class="tag">${esc(m.modality)}</span>`,
    `<span class="tag">ctx ${fmtCtx(m.context_len)}</span>`,
    `<span class="tag">${esc(m.license)}</span>`,
    m.quant_available ? `<span class="tag tag-ok">quantized</span>` : `<span class="tag tag-muted">no quant</span>`,
  ].join('');
  return `<article class="card">
  <header class="card-h">
    <h3><a href="${esc(m.url)}" rel="noopener noreferrer" target="_blank">${esc(m.name)}</a></h3>
    <time>${esc(m.release_date)}</time>
  </header>
  <div class="tags">${tags}</div>
  <ul class="notes">${notes}</ul>
</article>`;
}

function section(bucket, models) {
  const cards = models.length
    ? models.map(card).join('\n')
    : `<p class="empty">No models yet.</p>`;
  return `<section class="bucket" id="${bucket.key}">
  <div class="bucket-h">
    <h2>${esc(bucket.label)} <span class="count">${models.length}</span></h2>
    <p class="blurb">${esc(bucket.blurb)}</p>
  </div>
  <div class="grid">${cards}</div>
</section>`;
}

function page(groups, total) {
  const nav = BUCKETS.map(
    (b) => `<a href="#${b.key}">${esc(b.label)} <span>${groups[b.key].length}</span></a>`
  ).join('');
  const sections = BUCKETS.map((b) => section(b, groups[b.key])).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>my-small-slm-notes</title>
<meta name="description" content="A curated aggregator of researched small language models, grouped by size class.">
<style>${CSS}</style>
</head>
<body>
<header class="top">
  <h1>my-small-slm-notes</h1>
  <p>A curated aggregator of small language models, grouped by size class. <strong>${total}</strong> models.</p>
  <nav class="nav">${nav}</nav>
</header>
<main>
${sections}
</main>
<footer class="foot">
  <p>Data lives as one YAML file per model in <code>data/</code>. Updated via reviewed pull requests. Built statically.</p>
</footer>
</body>
</html>`;
}

const CSS = `
:root{--bg:#1e2326;--surface:#272e33;--surface2:#2e383c;--fg:#d3c6aa;--muted:#859289;--accent:#a7c080;--accent2:#7fbbb3;--border:#3d484d;--radius:12px}
*{box-sizing:border-box}
body{margin:0;font:16px/1.55 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;background:var(--bg);color:var(--fg)}
a{color:var(--accent2);text-decoration:none}a:hover{text-decoration:underline}
.top{max-width:1100px;margin:0 auto;padding:3rem 1.25rem 1.5rem}
.top h1{margin:0 0 .25rem;font-size:2.2rem;color:var(--accent)}
.top p{margin:.25rem 0 1rem;color:var(--muted)}
.nav{display:flex;flex-wrap:wrap;gap:.5rem}
.nav a{background:var(--surface);border:1px solid var(--border);border-radius:999px;padding:.35rem .8rem;font-size:.9rem;color:var(--fg)}
.nav a span{color:var(--accent);font-weight:600;margin-left:.25rem}
main{max-width:1100px;margin:0 auto;padding:0 1.25rem 3rem}
.bucket{margin:2.5rem 0}
.bucket-h h2{margin:0;font-size:1.4rem;display:flex;align-items:center;gap:.5rem}
.bucket-h .count{font-size:.85rem;background:var(--surface2);color:var(--accent);border-radius:999px;padding:.1rem .55rem}
.blurb{margin:.35rem 0 1.25rem;color:var(--muted);max-width:70ch}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:1rem}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:1rem 1.1rem;display:flex;flex-direction:column;gap:.6rem}
.card-h{display:flex;justify-content:space-between;align-items:baseline;gap:.5rem}
.card-h h3{margin:0;font-size:1.05rem;word-break:break-word}
.card-h time{color:var(--muted);font-size:.8rem;white-space:nowrap}
.tags{display:flex;flex-wrap:wrap;gap:.35rem}
.tag{font-size:.75rem;background:var(--surface2);border:1px solid var(--border);border-radius:6px;padding:.15rem .5rem;color:var(--fg)}
.tag-params{background:var(--accent);color:#1e2326;font-weight:600;border-color:transparent}
.tag-ok{color:var(--accent)}
.tag-muted{color:var(--muted)}
.notes{margin:.2rem 0 0;padding-left:1.1rem;color:var(--fg)}
.notes li{margin:.15rem 0}
.empty{color:var(--muted)}
.foot{max-width:1100px;margin:0 auto;padding:2rem 1.25rem;border-top:1px solid var(--border);color:var(--muted);font-size:.85rem}
.foot code{background:var(--surface2);padding:.1rem .35rem;border-radius:4px}
@media (prefers-color-scheme:light){
:root{--bg:#fdf6e3;--surface:#f4f0d9;--surface2:#e9e3c8;--fg:#5c6a72;--muted:#829181;--accent:#8da101;--accent2:#3a94c5;--border:#ddd8be}
.tag-params{color:#fdf6e3}
}
`;

function main() {
  const models = loadModels();
  // guard: build must not silently drop a mis-bucketed model
  for (const m of models) bucketOf(m.params);
  const groups = groupByBucket(models);
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });
  writeFileSync(join(DIST, 'index.html'), page(groups, models.length));
  writeFileSync(join(DIST, 'models.json'), JSON.stringify(models, null, 2));
  // Shields.io endpoint badge — live model count on the README.
  mkdirSync(join(DIST, 'badges'), { recursive: true });
  writeFileSync(
    join(DIST, 'badges', 'model-count.json'),
    JSON.stringify({ schemaVersion: 1, label: 'models', message: String(models.length), color: '7fbbb3' })
  );
  console.log(`Built ${models.length} models -> dist/index.html + dist/models.json + badges/model-count.json`);
}

main();
