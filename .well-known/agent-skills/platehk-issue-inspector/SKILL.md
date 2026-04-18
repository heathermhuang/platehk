---
name: platehk-issue-inspector
description: Inspect one Plate.hk auction issue in full, including the issue metadata, source link, and complete result rows.
license: MIT
---

# Plate.hk Issue Inspector

Use this skill when a user wants the full result set for one auction issue.

## Inputs

- `dataset`: one of `pvrm`, `tvrm_physical`, `tvrm_eauction`, `tvrm_legacy`
- `auction_date`: ISO date when the issue is day-based, or the issue key returned by the manifest

## Workflow

1. Call `/api/issues?dataset=...` to validate that the issue exists.
2. Call `/api/issue?dataset=...&auction_date=...`.
3. Summarize the issue metadata:
   - `auction_date`
   - `auction_date_label`
   - `date_precision`
   - `is_lny`
   - `pdf_url`
4. Use the returned rows directly instead of scraping the HTML page.
5. Cite the `pdf_url` when the user needs provenance.

## Constraints

- Treat the API response as read-only public data.
- If an issue is missing, say so instead of guessing.
- Official source publications remain authoritative.
