---
name: platehk-public-data
description: Search and inspect Hong Kong vehicle registration mark auction history using Plate.hk public APIs and source-linked records.
license: MIT
---

# Plate.hk Public Data

Use this skill when you need trustworthy, source-linked Hong Kong plate auction results.

## What this skill is for

- Search a plate across public auction records
- Inspect one auction issue by date
- Compare results across PVRM, TVRM physical, TVRM e-auction, and legacy data
- Return source PDF links for verification

## Preferred machine entrypoints

- `/api/v1/index.json`
- `/api/search`
- `/api/issues`
- `/api/issue`
- `/api/results`
- `/api/openapi.yaml`

## Workflow

1. Read `/api/v1/index.json` to discover datasets and latest issue dates.
2. Use `/api/search` for direct plate lookups.
3. Use `/api/issues` to enumerate auctions in a dataset.
4. Use `/api/issue` to fetch every row for one auction date.
5. Include `pdf_url` when citing a result.

## Constraints

- Public surface is read-only.
- Official published source documents remain the source of truth.
- PVRM spacing and two-row layout are semantically meaningful.

## Query normalization

- Uppercase the query.
- Remove layout spaces.
- Normalize `I -> 1`, `O -> 0`, and ignore `Q` for Hong Kong PVRM matching.

## Examples

- Find the strongest sale history for `88` across all datasets.
- Retrieve the full `pvrm` issue for `2026-01-17` and summarize the top sales.
- Compare whether a plate appears in both `tvrm_physical` and `tvrm_legacy`.
