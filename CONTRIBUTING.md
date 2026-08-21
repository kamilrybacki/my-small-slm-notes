# Contributing a model

One model = one file: `data/<slug>.yaml`.

## Slug rule (filename)

`slug = name.toLowerCase()`, every run of non-alphanumeric characters → `-`, trimmed.

| name | filename |
|---|---|
| `SmolLM2-360M` | `smollm2-360m.yaml` |
| `Qwen2.5-0.5B` | `qwen2-5-0-5b.yaml` |
| `Phi-3.5-mini-instruct` | `phi-3-5-mini-instruct.yaml` |

CI **fails** if the filename doesn't match the slug of `name`. To fix a model, **edit its existing file** — do not add a second one.

## Schema

```yaml
name: SmolLM2-360M          # required, real. Never "unknown".
params: 0.36                # required, real. TOTAL params in B. Drives the bucket.
active_params: 1.3          # OPTIONAL — MoE only (active params in B).
license: Apache-2.0         # required. May be "unknown".
context_len: 8192           # required. Integer tokens, or "unknown".
modality: text              # required. e.g. text, text+vision. May be "unknown".
release_date: "2024-11-01"  # required. ISO YYYY-MM-DD, or "unknown".
url: https://huggingface.co/HuggingFaceTB/SmolLM2-360M  # required, real http(s).
quick_facts:                # required. Objective one-liners, >= 1 item.
  - Trained on 4T tokens.
  - Edge-friendly.
my_experience:              # OPTIONAL. Projects / infra where you use it.
  - Powers X in project Y.
quant_available: true       # required. Boolean.
```

### Rules
- `name`, `params`, `url` must be **real** — never `unknown`.
- Soft fields (`license`, `context_len`, `modality`, `release_date`) may be the literal `unknown` when a value genuinely isn't published. Presence is required; truthiness is not.
- `params` is **total** parameters. For MoE models add `active_params` separately.
- No `<`, `>`, or `javascript:` in any text field.

### Bucket
Computed from `params`, never stored: `< 3` → sub, `3–8` → mid, `> 8` → large.

## Before opening a PR
```bash
npm run validate && npm test && npm run build
```
Green locally → green in CI.
