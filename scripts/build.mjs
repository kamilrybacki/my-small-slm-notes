#!/usr/bin/env node
// Static builder. Reads data/*.yaml -> dist/index.html + dist/models.json.
// No framework. All rendered text is HTML-escaped. Runs in CI on push to main.
//
// Design: "Ruled Ledger" — field-notebook × Swiss spec-sheet. Paper-and-ink
// neutrals (warm graphite/cream in dark mode), Archivo display over a system
// sans body, hairline rules, numbered entries, oxide-red stamp accents.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { BUCKETS, groupByBucket, bucketOf } from '../src/lib.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = join(ROOT, 'data');
const DIST = join(ROOT, 'dist');

function loadModels() {
  return readdirSync(DATA_DIR)
    .filter((f) => /\.ya?ml$/.test(f))
    .map((f) => parse(readFileSync(join(DATA_DIR, f), 'utf8')));
}

// --- render ------------------------------------------------------------

// The day the DGX Spark longing officially began. Adjust to taste.
const DGX_SINCE = '2026-08-22';

const esc = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

function fmtCtx(v) {
  if (v === 'unknown' || typeof v !== 'number') return esc(v);
  if (v >= 1024 && v % 1024 === 0) return `${v / 1024}K`;
  if (v >= 1000) return `${Math.round(v / 1000)}K`;
  return String(v);
}

function fmtDate(v) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(v))
    ? `<time datetime="${esc(v)}">${esc(v)}</time>`
    : `<span>${esc(v)}</span>`;
}

function banner() {
  return `<aside class="plaque" aria-label="Days without a DGX Spark">
  <p class="plaque-title">Days without a DGX Spark</p>
  <p class="plaque-count"><span id="dgx-days" aria-live="polite">&mdash;</span></p>
</aside>`;
}

function factBlock(items, label, cls) {
  if (!Array.isArray(items) || items.length === 0) return '';
  const lis = items.map((x) => `<li>${esc(x)}</li>`).join('');
  return `<div class="notes-block ${cls}">
      <p class="notes-label">${label}</p>
      <ul class="notes">${lis}</ul>
    </div>`;
}

function card(m, n) {
  const no = String(n).padStart(3, '0');
  const params = m.active_params
    ? `${esc(m.params)}B total &middot; ${esc(m.active_params)}B active`
    : `${esc(m.params)}B`;
  const quant = m.quant_available ? 'quantized' : 'no quant';
  return `<article class="card">
  <div class="card-margin">
    <p class="card-no">No. ${no}</p>
    ${fmtDate(m.release_date)}
  </div>
  <div class="card-body">
    <h3 class="card-name"><a href="${esc(m.url)}" rel="noopener noreferrer" target="_blank">${esc(m.name)}</a></h3>
    <dl class="spec">
      <div class="spec-row"><dt>params</dt><dd>${params}</dd></div>
      <div class="spec-row"><dt>modality &middot; ctx</dt><dd>${esc(m.modality)} &middot; ${fmtCtx(m.context_len)}</dd></div>
      <div class="spec-row"><dt>license &middot; quant</dt><dd>${esc(m.license)} &middot; ${quant}</dd></div>
    </dl>
    ${factBlock(m.quick_facts, 'Quick facts', 'qf')}
    ${factBlock(m.my_experience, 'My experience', 'exp')}
  </div>
</article>`;
}

function section(bucket, models, idx, startNo) {
  const cards = models.length
    ? models.map((m, i) => card(m, startNo + i)).join('\n')
    : `<p class="empty">No models filed yet.</p>`;
  return `<section class="bucket" id="${bucket.key}" aria-labelledby="${bucket.key}-h">
  <div class="bucket-h">
    <p class="bucket-no">${String(idx + 1).padStart(2, '0')}</p>
    <h2 id="${bucket.key}-h">${esc(bucket.label)}</h2>
    <p class="bucket-count">${models.length} model${models.length === 1 ? '' : 's'}</p>
  </div>
  <p class="blurb">${esc(bucket.blurb)}</p>
  <div class="grid">${cards}</div>
</section>`;
}

function page(groups, total) {
  const nav = BUCKETS.map(
    (b, i) => `<a class="nav-row" href="#${b.key}"><span class="nav-no">${String(i + 1).padStart(2, '0')}</span><span class="nav-label">${esc(b.label)}</span><span class="nav-leader" aria-hidden="true"></span><span class="nav-count">${groups[b.key].length} models</span></a>`
  ).join('\n');
  let n = 1;
  const sections = BUCKETS.map((b, i) => {
    const s = section(b, groups[b.key], i, n);
    n += groups[b.key].length;
    return s;
  }).join('\n');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>my-small-slm-notes</title>
<meta name="description" content="A curated field guide to small language models, grouped by size class.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:ital,wght@0,500;0,600;0,700;1,500&display=swap" rel="stylesheet">
<style>${CSS}</style>
</head>
<body>
<a class="skip" href="#main">Skip to the catalog</a>
<div class="wrap">
<header class="top">
  <p class="kicker">A field guide, not a leaderboard</p>
  <h1>my-small-slm-notes</h1>
  <div class="top-sub">
    <p class="top-note">Curated notes on small language models, grouped by size class.</p>
    <p class="top-count"><strong>${total}</strong> specimens &middot; one YAML each</p>
  </div>
  <nav class="nav" aria-label="Size classes">
${nav}
  </nav>
</header>
<main id="main">
${sections}
</main>
${banner()}
<footer class="foot">
  <p>Data lives as one YAML file per model in <code>data/</code>. Updated via reviewed pull requests.</p>
  <p>Built statically &middot; no runtime deps</p>
</footer>
</div>
<script>
(function () {
  var el = document.getElementById('dgx-days');
  if (!el) return;
  function tick() {
    var d = Math.max(0, Math.floor((Date.now() - new Date('${DGX_SINCE}T00:00:00Z')) / 864e5));
    el.textContent = String(d);
  }
  tick();
  setInterval(tick, 36e5);
})();
</script>
</body>
</html>`;
}

const CSS = `
:root{
  --paper:#F6F4EE;--wash:#EFECE2;--ink:#211E18;--ink-soft:#3B372F;--muted:#635D52;
  --rule-strong:#211E18;--rule:#D9D4C8;--rule-faint:#E4DFD3;--dash:#8A8375;
  --green:#55682D;--green-deep:#3E4C20;--oxide:#A8432B;
  --display:'Archivo','Helvetica Neue',Helvetica,Arial,sans-serif;
  --body:system-ui,-apple-system,'Segoe UI','Helvetica Neue',Helvetica,Arial,sans-serif;
}
@media (prefers-color-scheme:dark){
  :root{
    --paper:#1F1D19;--wash:#27241F;--ink:#E9E3D3;--ink-soft:#CFC8B6;--muted:#A69E8B;
    --rule-strong:#E9E3D3;--rule:#3B372F;--rule-faint:#2D2A25;--dash:#7E7766;
    --green:#A9BC7A;--green-deep:#C2D398;--oxide:#D08B6F;
  }
}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 var(--body);font-variant-numeric:tabular-nums}
a{color:var(--green)}
a:hover{color:var(--green-deep)}
:focus-visible{outline:2px solid var(--oxide);outline-offset:2px}
h1,h2,h3{font-family:var(--display);letter-spacing:-0.01em}
.skip{position:absolute;left:-9999px;top:0;background:var(--ink);color:var(--paper);padding:.6rem 1rem;text-decoration:none;z-index:2}
.skip:focus{left:0}
.wrap{max-width:1020px;margin:0 auto;padding:clamp(20px,4.5vw,48px) clamp(18px,4.5vw,40px) 64px}

/* plaque */
.plaque{display:flex;align-items:center;justify-content:space-between;gap:clamp(16px,4vw,32px);border-top:2px solid var(--rule-strong);padding:clamp(12px,2.5vw,18px) 0;margin-top:clamp(40px,7vw,56px)}
.plaque p{margin:0}
.plaque-title{min-width:0;font-family:var(--display);font-weight:600;font-size:clamp(17px,4vw,26px);line-height:1.15}
.plaque-count{position:relative;flex:none;display:grid;place-items:center;min-width:88px;min-height:56px;padding:0 10px}
.plaque-count::before{content:"";position:absolute;inset:0;background:url(assets/dgx-spark.png) center/contain no-repeat;opacity:.2;pointer-events:none}
.plaque-count #dgx-days{position:relative;font-family:var(--display);font-weight:700;font-size:clamp(40px,10vw,56px);line-height:1;letter-spacing:-0.02em}

/* header */
.top{padding:clamp(28px,6vw,44px) 0 clamp(24px,5vw,36px)}
.kicker{font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;color:var(--oxide);font-weight:600;margin:0 0 10px}
.top h1{font-weight:700;font-size:clamp(32px,7vw,50px);letter-spacing:-0.03em;line-height:1.02;margin:0 0 14px}
.top-sub{display:flex;justify-content:space-between;align-items:baseline;gap:8px 24px;flex-wrap:wrap}
.top-note{margin:0;font-style:italic;color:var(--muted);font-size:15px}
.top-count{margin:0;font-size:12px;color:var(--muted)}
.top-count strong{color:var(--ink)}

/* index nav */
.nav{display:block;border-top:1px solid var(--rule-strong);margin-top:22px}
.nav-row{display:flex;align-items:baseline;gap:12px;min-height:44px;padding:11px clamp(8px,1.5vw,12px);margin-inline:calc(-1 * clamp(8px,1.5vw,12px));border-bottom:1px solid var(--rule);text-decoration:none;color:var(--ink)}
.nav-no{color:var(--oxide);font-weight:600;font-size:12px}
.nav-label{font-family:var(--display);font-weight:600;font-size:14px}
.nav-leader{flex:1;border-bottom:1px dotted var(--dash);margin:0 4px 4px;min-width:24px}
.nav-count{color:var(--muted);font-size:12px;white-space:nowrap}

/* buckets */
.bucket{margin-top:clamp(40px,7vw,56px);border-top:2px solid var(--rule-strong);padding-top:16px}
.bucket-h{display:flex;align-items:baseline;gap:14px 18px;flex-wrap:wrap}
.bucket-h p{margin:0}
.bucket-no{font-family:var(--display);font-weight:700;font-size:clamp(20px,4vw,26px);color:var(--oxide)}
.bucket-h h2{font-weight:600;font-size:clamp(20px,4vw,26px);letter-spacing:-0.02em;margin:0;flex:1}
.bucket-count{color:var(--muted);font-size:12px;white-space:nowrap}
.blurb{margin:8px 0 0;font-style:italic;color:var(--muted);font-size:14px;max-width:56ch}
.empty{color:var(--muted);font-style:italic}

/* cards */
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,420px),1fr));column-gap:clamp(28px,5vw,56px);margin-top:10px}
.card{border-bottom:1px solid var(--rule);padding:clamp(18px,3.5vw,26px) clamp(12px,2vw,16px);margin-inline:calc(-1 * clamp(12px,2vw,16px));display:grid;grid-template-columns:86px 1fr;gap:18px}
.card p{margin:0}
.card-margin{color:var(--muted);font-size:11px}
.card-no{color:var(--dash);letter-spacing:.04em}
.card-margin time,.card-margin span{display:block;margin-top:4px}
.card-name{margin:0;font-size:18px;font-weight:600;line-height:1.3;word-break:break-word}
.card-name a{color:var(--ink);text-decoration:none;border-bottom:1.5px solid var(--green)}
.card-name a:hover{color:var(--green-deep)}
.spec{margin:14px 0 12px}
.spec-row{display:flex;justify-content:space-between;align-items:baseline;gap:8px 16px;flex-wrap:wrap;padding:4px 0;border-bottom:1px solid var(--rule-faint)}
.spec-row:last-child{border-bottom:0}
.spec-row dt{font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.spec-row dd{margin:0;font-size:12.5px;color:var(--ink-soft);text-align:right}
.notes-block{margin-top:12px}
.notes-block + .notes-block{margin-top:12px;padding-top:12px;border-top:1px solid var(--rule-faint)}
.notes-label{margin:0 0 5px;font-size:10.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--muted)}
.notes-block.exp .notes-label{color:var(--oxide)}
.notes{list-style:none;margin:0;padding:0;font-size:13px;color:var(--ink-soft)}
.notes li{display:flex;gap:8px;margin-top:4px}
.notes li::before{content:"\\2014";color:var(--dash);flex:none}
.notes-block.exp .notes li::before{content:"\\25B8";color:var(--oxide)}
@media (max-width:520px){
  .card{grid-template-columns:1fr;gap:10px}
  .card-margin{display:flex;align-items:baseline;gap:12px}
  .card-margin time,.card-margin span{margin-top:0}
}

/* footer */
.foot{margin-top:0;border-top:1px solid var(--rule-strong);padding-top:clamp(20px,4vw,28px);display:flex;justify-content:space-between;gap:8px 24px;flex-wrap:wrap;color:var(--muted);font-size:12px}
.foot p{margin:0}
.foot code{font-family:ui-monospace,'SF Mono',Menlo,Consolas,monospace;font-size:11px;background:var(--wash);padding:.1rem .35rem}

@media (prefers-reduced-motion:no-preference){
  .nav-row,.card,a{transition:background-color .15s ease,color .15s ease}
  .nav-row:hover,.card:hover{background:var(--wash)}
}
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{transition:none!important;animation:none!important}
}
`;

// --- io ----------------------------------------------------------------

function main() {
  const models = loadModels();
  // guard: build must not silently drop a mis-bucketed model
  for (const m of models) bucketOf(m.params);
  const groups = groupByBucket(models);
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(DIST, { recursive: true });
  writeFileSync(join(DIST, 'index.html'), page(groups, models.length));
  writeFileSync(join(DIST, 'models.json'), JSON.stringify(models, null, 2));
  // Static assets (the gold DGX Spark photo lives at assets/dgx-spark.png).
  if (existsSync(join(ROOT, 'assets'))) {
    cpSync(join(ROOT, 'assets'), join(DIST, 'assets'), { recursive: true });
  }
  // Shields.io endpoint badge — live model count on the README.
  mkdirSync(join(DIST, 'badges'), { recursive: true });
  writeFileSync(
    join(DIST, 'badges', 'model-count.json'),
    JSON.stringify({ schemaVersion: 1, label: 'models', message: String(models.length), color: 'a8432b' })
  );
  console.log(`Built ${models.length} models -> dist/index.html + dist/models.json + badges/model-count.json`);
}

main();
