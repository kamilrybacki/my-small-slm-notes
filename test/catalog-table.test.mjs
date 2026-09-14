import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('generated catalog exposes an accessible sortable model table', () => {
  execFileSync(process.execPath, ['scripts/build.mjs'], { cwd: ROOT, stdio: 'pipe' });
  const html = readFileSync(join(ROOT, 'dist', 'index.html'), 'utf8');

  assert.match(html, /<section class="catalog-table"[^>]*aria-labelledby="catalog-table-h"/);
  assert.match(html, /<table/);
  assert.match(html, /<caption>Sortable catalog of all models<\/caption>/);
  for (const column of ['Model', 'Released', 'Parameters', 'Active', 'Context', 'License', 'Modality', 'Quant']) {
    assert.match(html, new RegExp(`>${column}<`));
  }
  assert.match(html, /data-sort="release_date"/);
  assert.match(html, /data-sort="params"/);
  assert.match(html, /data-sort="context_len"/);
  assert.match(html, /aria-sort="descending"/);
  assert.match(html, /function sortCatalog/);

  const table = html.match(/<section class="catalog-table"[\s\S]*?<\/section>/)?.[0] ?? '';
  const releaseDates = [...table.matchAll(/data-release_date="([^"]*)"/g)].map((match) => match[1]);
  const knownDates = releaseDates.filter(Boolean);
  assert.equal(releaseDates[0], [...knownDates].sort().at(-1), 'newest known release starts the default descending table');
  assert.ok(releaseDates.includes(''), 'unknown releases remain represented as empty sort values');
  assert.doesNotMatch(table, /<time datetime="unknown">/, 'unknown is not emitted as an invalid time datetime');
});
