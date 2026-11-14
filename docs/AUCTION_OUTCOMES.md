# Auction outcome contract

`scripts/auction_outcomes.py` owns the canonical vocabulary and enrichment step,
run at the start of `scripts/build_all_dataset.py`. `assets/auction-outcomes.js`
provides the matching bilingual formatters for browser views. A parity test keeps
the vocabularies aligned.

| `result_status` | Meaning |
| --- | --- |
| `sold` | A source identifies an auction sale |
| `assigned_special_fee` | Allocation to the applicant at a special fee after no bidder |
| `unsold` | The mark was unsold in that round; `amount_hkd` is null |
| `unknown` | The indexed amount does not retain enough evidence to establish an outcome |

Preserved PDF amount tokens must agree with the parsed amount before their `@`
marker or unmarked sale amount can supply an outcome. A price of HK$1,000 or
HK$5,000 alone establishes nothing. Workbook dispositions remain supported.
The verified handout registry is joined by dataset, auction date and normalized
mark; an amount mismatch stops the build. Omitted unsold marks are restored only
inside already-indexed, verified complete rounds. Other missing historical marks
remain outside the index; an empty search does not establish availability.

Both structural comparison methods require `sold`; allocations, unsold results,
unknown outcomes and coarse dates never contribute to their statistics. Older
cohorts display an age warning before their quartiles. Static plate-page amounts,
API records, plate-summary highest/latest amounts, dynamic cards, shortlist tables,
camera results and posters retain the disposition rather than presenting all
published amounts as sale prices.

The audit report publishes outcome counts, latest indexed rounds, and the count
and latest date of verified complete handouts per dataset. These are distinct from
file/format QA and from a live source check. The audit does not claim a source was
checked at build time. Outcome uncertainty is visible even when format QA passes.

Verification:

```sh
python3 scripts/build_all_dataset.py
python3 scripts/build_all_search_index.py
python3 scripts/build_hot_search_cache.py
python3 scripts/build_popular_plate_pages.py
python3 scripts/build_public_api.py
python3 scripts/build_audit_report.py
python3 -m unittest discover -s tests
node --test tests/decision_tools_test.mjs
npx playwright test e2e/auction-outcomes.spec.mjs
./scripts/check_site.sh
```

The regression suite checks a real `1 ZURU 1` allocation, unsold `9549`, English
and Chinese labels, share-poster text, discovery, saved comparisons, manual camera
lookup, API disposition fields, full handout parity and narrow-screen overflow.
