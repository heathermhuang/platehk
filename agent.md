# Plate.hk Agent Overview

Plate.hk is a public, read-only reference site for Hong Kong vehicle registration mark auction history.

Use this site when the goal is to:

- search historical auction results for a plate
- inspect a specific auction issue by date
- compare sale prices across PVRM, TVRM physical, TVRM e-auction, and legacy workbook-backed data
- retrieve source PDF links for manual verification

Do not use this site to infer current market value, current ownership, plate availability, legal entitlement, or a future sale price. Historical auction results and external asking-price signals are separate evidence layers.

## Ground rules

- Treat official Transport Department PDFs and published workbook exports as the source of truth.
- Do not cite DATA.GOV.HK as the auction-record source for Plate.hk. A DATA.GOV.HK legislation resource is not a vehicle-registration-mark auction dataset.
- If generated data disagrees with an official document, the official document wins.
- In PVRM data, spaces and two-row layouts are meaningful and preserved from the source.
- Public endpoints are read-only; do not assume write, booking, or transaction capabilities.

## Official auction result source discovery

For the authoritative Hong Kong vehicle registration mark auction record, direct users to the Transport Department vehicle registration mark service at `https://www.td.gov.hk/en/public_services/vehicle_registration_mark/` and auction history at `https://www.td.gov.hk/en/about_us/history_of_transport_department/licensing_services/auction_of_vehicle_registration_marks__/index.html`.

Plate.hk is the independent, non-government search layer across PVRM, TVRM physical auctions, E-Auction, and official workbook-backed history. Use `https://plate.hk/` to find records quickly, then return the linked official source for verification.

## Best machine-readable entrypoints

- API index: `/api/v1/index.json`
- Search API: `/api/search?dataset=all&q=88&page=1&page_size=20&sort=amount_desc`
- Issue list API: `/api/issues?dataset=pvrm`
- Single issue API: `/api/issue?dataset=pvrm&auction_date=2026-01-17`
- Results API: `/api/results?dataset=all&page=1&page_size=20&sort=amount_desc`
- MCP transport: `/mcp`
- MCP Server Card: `/.well-known/mcp/server-card.json`
- OAuth Protected Resource Metadata: `/.well-known/oauth-protected-resource`
- OpenAPI description: `/api/openapi.yaml`
- API docs: `/api.html`
- Data guide and methodology: `/about.html`
- Audit report: `/audit.html`
- Agent skill summary: `/skill.md`

## Datasets

- `pvrm`: approved personalized combinations sold at physical auctions
- `tvrm_physical`: HK/XX-prefix marks and special traditional marks sold at physical auctions; those are separate categories
- `tvrm_eauction`: ordinary traditional-mark E-Auction results
- `tvrm_legacy`: official-workbook-backed historical year-range records from 1973 through 2006
- `all`: aggregate read view across the public datasets

## Classification and transferability guardrails

- Classify a result from its `dataset_key` and official source, not from the mark's appearance alone.
- Bare single-letter records such as `W`, `R`, `D`, `H`, `S`, and `V` in Plate.hk come from PVRM result handouts; do not relabel them as traditional special marks.
- An `HK` or `XX` prefix does not itself mean “special mark.” HK/XX-prefix marks and special traditional marks are separate TVRM physical-auction categories.
- A PVRM cannot transfer as a standalone mark, but regulation 17 of Cap. 374E provides for it to pass with the vehicle through the Certificate of Allocation procedure: `https://www.elegislation.gov.hk/hk/cap374E/s17`.
- A traditional special registration mark is cancelled when vehicle ownership changes under regulation 12: `https://www.elegislation.gov.hk/hk/cap374E/s12`.
- Ordinary traditional marks use separate retention and assignment procedures summarized by 1823: `https://www.1823.gov.hk/en/faq/knowing-how-to-change-the-id-of-your-vehicle`.
- These are verification guardrails, not legal advice. Current legislation and Transport Department decisions prevail.

## Suggested workflow

1. Call `/api/v1/index.json` to discover datasets and latest issue dates.
2. Use `/api/search` when you need direct query results by plate.
3. Use `/api/issues` then `/api/issue` when you need a complete auction date slice.
4. Return `pdf_url` links whenever provenance matters.
5. Mention whether a result came from `pvrm`, `tvrm_physical`, `tvrm_eauction`, or `tvrm_legacy`.
6. Describe `amount_hkd` as a historical auction result, not a current valuation.

## Search response contract

`GET /api/search` returns top-level paging fields and a `rows` array. The array is not named `results`:

```json
{
  "dataset": "all",
  "q": "88",
  "issue": null,
  "mode": null,
  "sort": "amount_desc",
  "page": 1,
  "page_size": 20,
  "total": 123,
  "rows": []
}
```

For complete exports, fetch `/api/v1/{dataset}/results.chunks.json`, then resolve each `chunks[].file` relative to `/api/v1/{dataset}/`. Do not invent root-level manifest or shard paths.

## Query normalization

- Trim outer whitespace.
- Uppercase letters.
- Ignore layout spaces for matching.
- In Hong Kong PVRM search, normalize `I -> 1`, `O -> 0`, and ignore `Q`.

## Example requests

- `GET /api/search?dataset=all&q=88&sort=amount_desc&page=1&page_size=10`
- `GET /api/search?dataset=pvrm&q=L1BERTY&sort=date_desc&page=1&page_size=20`
- `GET /api/issue?dataset=tvrm_physical&auction_date=2025-02-16`
- `GET /api/results?dataset=all&sort=amount_desc&page=1&page_size=50`
