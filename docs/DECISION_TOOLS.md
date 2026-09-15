# Plate decision tools

The public search remains the default entry point. The decision tools add:

- `/prices.html`: price/history explanation and exact-plate lookup.
- `/discover.html`: complete-candidate search with prefix, suffix, digit-count,
  repeated/palindrome, historical-price and precise-date filters.
- `/plate.html?q=AA88`: paginated exact history and dated structural comparisons.
- `/shortlist.html`: up to 50 browser-local saved plates and comparison of up to four.
- `/auctions.html`: official-source calendar snapshots with downloadable one-day reminders.
- `/availability.html`: routes to official availability, application and transfer guidance.

`assets/decision-core.mjs` owns deterministic filter, comparison and calendar rules.
The Worker applies discovery filters before pagination. Unpriced results are excluded
when a price filter is active; year-range observations do not satisfy exact-date filters.
The existing search preserves exact-first relevance; discovery uses chronological results.
Input uses NFKC normalization, preserves invalid characters for validation, maps I/O to
1/0 and rejects Q. The camera/OCR normalizer retains its previous behavior.

`GET /api/comparables?q=...` first finds exact priced history, then uses the existing
complete search shards. It returns up to eight alternatives from the same source dataset
and letter/digit shape, sharing the stated fragment, ordered by date. Each alternative
uses its latest dated positive-price record. This is a bounded structural comparison,
not a valuation, semantic match, legal classification, ownership check or sale listing.

The build regenerates the decision pages from `data/events.json` and adds the shared
analytics entry point to public HTML. Existing generated plate pages also load the
comparison and save controls. Calendar files are snapshots, not ongoing subscriptions;
recurring application windows are explicitly distinguished from confirmed events.

## Measurement

The shared `assets/analytics.js` loads only on production hosts, honors DNT/GPC and
browser opt-out, disables advertising signals and strips query strings from page URLs.
Only allowlisted feature names and fields are transmitted. Contact messages and phone
numbers are excluded. Events include `search_complete`, `search_error`, `plate_detail`,
`discovery_search`, `shortlist_save`, `shortlist_remove`, `compare_view`, `official_link`
and `calendar_save`. The local environment does not send analytics.

GA4 property configuration must disable automatic history-based pageviews and automatic
site-search detection, since explicit page and completed-search events now own those
semantics. Recommended key events are `shortlist_save`, `compare_view`, `official_link`
and `calendar_save`; none represents a sale. Record the live configuration separately
from code verification. Historical reports cannot be repaired by adding future events.

## Search visibility

Prices, discovery, auctions and availability are bounded sitemap destinations.
Exact query and shortlist utility pages are noindex; filtered discovery variants are
noindex and retain a canonical unfiltered destination. Keep existing valid canonical
alternatives and redirects. The September research found both genuine plate URLs and
legacy query variants among discovered/crawled exclusions; indexing improvements must
be measured after recrawl, not inferred from deployment. No bulk indexing request is
required. User interviews and reminder adoption remain independent validation work.

## Verification

Run `node --test tests/decision_tools_test.mjs`, the existing Worker/frontend suites,
`python3 scripts/scan_repo_secrets.py` and `scripts/check_site.sh`. Browser checks should
cover ASCII/full-width equality, invalid and empty states, filter pagination, exact
history, source links, saved-list persistence, four-item comparison, English/Chinese
navigation, calendar download, and narrow-screen overflow. Full asset and generated-data
checks require a complete checkout and sufficient space for the existing dataset copies.
