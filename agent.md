# Plate.hk Agent Overview

Plate.hk is a public, read-only reference site for Hong Kong vehicle registration mark auction history.

Use this site when the goal is to:

- search historical auction results for a plate
- inspect a specific auction issue by date
- compare sale prices across PVRM, TVRM physical, TVRM e-auction, and legacy workbook-backed data
- retrieve source PDF links for manual verification

## Ground rules

- Treat official Transport Department PDFs and published workbook exports as the source of truth.
- If generated data disagrees with an official document, the official document wins.
- In PVRM data, spaces and two-row layouts are meaningful and preserved from the source.
- Public endpoints are read-only; do not assume write, booking, or transaction capabilities.

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
- Agent skill summary: `/skill.md`

## Datasets

- `pvrm`: personalized vehicle registration marks
- `tvrm_physical`: traditional live auction records
- `tvrm_eauction`: E-Auction records
- `tvrm_legacy`: historical workbook-backed year-range records
- `all`: aggregate read view across the public datasets

## Suggested workflow

1. Call `/api/v1/index.json` to discover datasets and latest issue dates.
2. Use `/api/search` when you need direct query results by plate.
3. Use `/api/issues` then `/api/issue` when you need a complete auction date slice.
4. Return `pdf_url` links whenever provenance matters.
5. Mention whether a result came from `pvrm`, `tvrm_physical`, `tvrm_eauction`, or `tvrm_legacy`.

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
