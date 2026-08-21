# Awesome SLMs

A curated, self-updating aggregator of **researched small language models**, grouped into three size classes:

| Section | Rule (total params) | For |
|---|---|---|
| **Sub-1B → 3B** | `params < 3` | Ultra-compact models for mobile / local processing. |
| **3B → 8B** | `3 ≤ params ≤ 8` | Mid-range small models — capability vs. latency. |
| **8B → 15B+** | `params > 8` | Higher-capacity compact models near the large-LLM threshold. |

Boundary rule is deterministic: `8B` lands in mid, `3B` lands in mid, no gaps.

## How it works (architecture)

This is a **git-driven static site** — there is no backend and no public write endpoint.

```
data/<slug>.yaml  ──(git push)──►  PR  ──(you merge)──►  main  ──►  build  ──►  GitHub Pages
   one file per model              validated in CI                  Node script
```

- **Source of truth:** one YAML file per model in [`data/`](data/). Filename **must** equal the model's slug.
- **Build:** `scripts/build.mjs` reads every `data/*.yaml`, sorts by params into the three buckets, and emits a single self-contained `dist/index.html` (+ `dist/models.json`). No framework.
- **Publish:** merging to `main` triggers `.github/workflows/deploy.yml` → GitHub Pages.

## Two ways to update

### 1. Automated — Hermes (homelab agent)

Hermes keeps the list fresh:

- **Trigger:** a weekly `agent-cron` **and** on-demand ("add model X" in Discord).
- **Facts are HuggingFace-grounded** — `params`, `context_len`, `license`, `release_date` come from the HF API / model card, never free-recall. `notes` are editorial.
- **Write path:** Hermes commits new/updated `data/*.yaml` to a `hermes/update-<date>` branch and `git push`es it using a **write-scoped deploy key** (see setup). It does **not** call `gh`.
- `.github/workflows/auto-pr.yml` opens a PR from that branch. **You review and merge.** Nothing reaches `main` (or the public site) without your merge.

### 2. Manual — you

Edit `data/<slug>.yaml` directly (GitHub web UI or a branch), open a PR, let CI pass, merge. Same single source of truth, same gate. See [CONTRIBUTING.md](CONTRIBUTING.md) for the schema.

## The validation gate (`scripts/validate.mjs`)

Every PR and every `hermes/**` push runs it. **Hard failures block merge:**

1. YAML parses.
2. Schema valid ([`schema/model.schema.json`](schema/model.schema.json)) — all required fields present.
3. `filename === slug(name) + '.yaml'`.
4. No two files resolve to the same slug (exact-slug collision → error; **update** the existing file instead).
5. No `<`, `>`, or `javascript:` in any text field (anti-injection — output is also HTML-escaped at build).

**Advisory only (warns, never blocks):** near-duplicate names **with equal params** (catches respellings like `SmolLM2-360M` vs `smollm-2-360m` while never flagging `Qwen2.5-0.5B` vs `Qwen2.5-1.5B`).

Unknown values: soft fields (`license`, `context_len`, `modality`, `release_date`) accept the literal `unknown`. `name`, `params`, `url` must be real.

## One-time setup (after the repo exists on GitHub)

### A. GitHub Pages
Repo **Settings → Pages → Source: GitHub Actions**.

### B. Branch protection on `main` — **required, or the gate is theater**
A write deploy key can otherwise push straight to `main` and skip CI. Lock it:

- Settings → Branches → add rule for `main`:
  - ✅ Require a pull request before merging.
  - ✅ Require status checks to pass → select **Validate data**.
  - ✅ Do not allow bypassing the above (include administrators, your call).
- Optional hardening (Rulesets): restrict the deploy key to push only `hermes/*` refs.

### C. Hermes deploy key (write-scoped, this repo only, in Vault)
```bash
ssh-keygen -t ed25519 -f awesome-slms-deploy -N "" -C "hermes-awesome-slms"
# GitHub: Settings → Deploy keys → Add → paste awesome-slms-deploy.pub → ✅ Allow write access
# Store the PRIVATE key in Vault (never baked into an image):
vault kv put secret/awesome-slms-deploy private_key=@awesome-slms-deploy
rm awesome-slms-deploy awesome-slms-deploy.pub
```
Hermes mounts the private key and pushes over SSH:
```bash
git remote set-url origin git@github.com:<owner>/awesome-slms.git
git checkout -b hermes/update-$(date +%Y%m%d)
git add data/ && git commit -m "chore(data): SLM update" && git push -u origin HEAD
```

> Note: PRs opened by the built-in `GITHUB_TOKEN` do not re-trigger `pull_request` workflows — that is why **Validate data** also runs on `push: hermes/**`, so the required check is present on the head commit regardless.

## Local development

```bash
npm install
npm test            # unit + data-integrity tests
npm run validate    # run the CI gate locally
npm run build       # -> dist/index.html + dist/models.json
```

## Layout

```
data/            one <slug>.yaml per model (source of truth)
schema/          JSON Schema for a model entry
src/lib.mjs      shared pure fns: bucketOf, slugify, dedup, grouping
scripts/build.mjs      YAML -> dist/index.html + models.json
scripts/validate.mjs   CI gate
test/            node:test suites
.github/workflows/     auto-pr · validate · deploy
```

## License
Code under [MIT](LICENSE). Model metadata is factual; each entry links its upstream source.
