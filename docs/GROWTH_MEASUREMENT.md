# Search growth and repeat use

Review Hong Kong Web-search acquisition, useful lookup outcomes, and repeat use
as separate measurements. Traffic and source correctness alone do not establish
that Plate.hk is the preferred source.

## Three operating measures

| Measure | Definition | Source and action |
| --- | --- | --- |
| Hong Kong organic acquisition | Clicks, impressions and CTR for equally long consecutive periods, filtered to Hong Kong and Web search | Search Console; inspect query position and intent before changing a landing page |
| Lookup outcomes | `lookup_success / lookup_complete` for any result, and `lookup_exact_match / lookup_complete` for an exact mark, with no-result rate and errors alongside them | GA4 events; split by action, dataset and match mode before identifying difficult lookups |
| Returning Hong Kong users | Returning users divided by total users for the same reporting period and country | GA4 country report; assess whether useful features encourage repeat visits |

Returning-user share is not seven-day or thirty-day cohort retention. Use GA4's
same-age retention cohorts for those questions. Do not add new and returning
users together: a person can belong to both groups during a reporting period.

## Event contract

| Event | Meaning |
| --- | --- |
| `lookup_complete` | A valid, nonempty first-page lookup returned a visible result or an empty answer and remained settled for 1.5 seconds, or was committed with Enter or leaving the input; a plate-history navigation is immediate |
| `lookup_success` | That lookup returned at least one record; this does not prove satisfaction, accuracy or availability |
| `lookup_exact_match` | A settled lookup displayed at least one record matching the full normalized mark; this does not prove satisfaction, accuracy or availability |
| `lookup_no_result` | That lookup returned no records; this is distinct from a request failure |
| `lookup_error` | A valid first-page lookup could not be loaded |
| `plate_detail` | A dynamic or static plate-detail page was opened |
| `shortlist_save`, `compare_view`, `calendar_save` | Existing save, comparison and calendar actions |
| `auction_result_view` | A complete verified auction-round page was opened |
| `results_feed_open`, `results_feed_copy` | Interest in the feed; actual reader subscriptions cannot be observed |

`action` separates `main_lookup`, `plate_history`, and `round_lookup`. Parameters
include the public dataset, issue, result count, exact-match flag, elapsed time,
`match_mode`, the round's `outcome_filter`, and `result_outcome` (`found` or `empty`). Unfiltered browsing, invalid input,
pagination and identical incidental re-renders are excluded from lookup outcome
counts. Intentional input changes and retries can produce new observations.
Outcome counts are not distinct users or a person-level conversion funnel.
An empty result within one round is not equivalent to an empty full-history
search. A settled query can still be an intermediate or exploratory query;
settling is an observable interaction boundary, not proof of intent.

Product events from this release carry `measurement_version=settled_v2`.
The earlier implementation counted results after short typing pauses or each
round input change. Do not compare the old aggregate lookup rate directly with
this version or interpret fewer events as a traffic loss. Keep each version and
collection period explicit; new event definitions do not backfill historical data.

The shared analytics module honors DNT, Global Privacy Control, the existing
local opt-out and the production-host restriction. Page URLs and referrers omit
query strings. Only `utm_source`, `utm_medium` and `utm_campaign` values matching
a bounded public slug are copied into GA4's campaign fields before the search
UI updates the URL; source and medium must both be valid. Query text, raw URLs,
email addresses and other URL parameters are not copied into campaign fields.
The existing allowlisted normalized public mark can accompany lookup events.
Do not put personal data in
campaign tags or register individual plate values as custom dimensions.

## GA4 setup and verification

Use the existing Plate.hk property and web stream.

1. Verify real events in Realtime after the release. A queued browser event is
   not proof that GA4 received it.
2. Register event-scoped dimensions for `action`, `dataset`, `result_outcome`,
   `exact_match`, `match_mode`, `outcome_filter` and `measurement_version` if they
   are not already registered. Register `result_count`
   and `duration_ms` as event-scoped custom metrics if numerical breakdowns are
   needed. Keep the public plate value out of custom dimensions.
3. Use `lookup_exact_match` as the primary lookup key event. Keep
   `lookup_success` as the broader found-record measure. Neither represents a
   purchase or verified satisfaction; do not silently redefine any existing
   advertising conversion or delete historical configuration.
4. Build a Country × Event name report with Event count, and a Country report
   with Total users and Returning users. Inspect Hong Kong, mobile versus
   desktop, acquisition channels and landing pages using the same period.
5. Record reporting dates, filters, thresholding and collection start date.
   New custom definitions and outcome events are not historical backfills.
6. Verify an approved campaign link in Realtime and its source/medium in the
   acquisition report. Browser configuration or a successful deployment alone
   does not prove GA4 ingestion or explain an earlier Direct-traffic spike.

Google's [event parameter guidance](https://support.google.com/analytics/answer/13675006)
explains the difference between sending parameters and reporting them.

## Reproducible private scorecard

Export two **single-period** Search Console CSV ZIPs for consecutive complete
28-day windows. Use identical filters: property `plate.hk`, Search type `Web`,
Country `Hong Kong`. The export must include `Chart.csv` and `Filters.csv`;
`Queries.csv` and `Pages.csv` supply the optional opportunity breakdowns.
Enable all four performance metrics before exporting the query breakdown.

Export the GA4 reports above as English CSV. The event export must have
`Country`, `Event name`, and `Event count`; the user export must have `Country`,
`Total users`, and `Returning users`. Use one row per country/event and one row
per country respectively. Record the GA4 date selection explicitly.
For the new lookup definition, include `Measurement version` in the event
export and pass `--ga4-measurement-version settled_v2`. The scorecard rejects
mixed versions and keeps an absent exact-match measure unavailable. A report
whose version dimension has not yet been registered cannot prove that scope.

Keep all exports and results in the gitignored `.private/` directory:

```sh
python3 scripts/build_traffic_scorecard.py \
  --gsc-current .private/gsc-current.zip \
  --gsc-previous .private/gsc-previous.zip \
  --ga4-events .private/ga4-events.csv \
  --ga4-users .private/ga4-users.csv \
  --ga4-start YYYY-MM-DD --ga4-end YYYY-MM-DD \
  --output .private/traffic-scorecard.json
```

The script recomputes CTR and impression-weighted position from daily chart
rows, checks comparison windows/scopes, preserves all exported filters, and
keeps unavailable measurements explicit. It never sums distinct users across
countries. It rejects contradictory outcome counts. The new outcome events
must have been collected for the selected period before comparing them.

Search Console [exports](https://support.google.com/webmasters/answer/12919797)
can be truncated and can encode unavailable UI values as zero. Anonymous
queries are included in unfiltered chart totals but omitted from query tables;
see [query limitations](https://support.google.com/webmasters/answer/17011259).
Use chart totals rather than summing exported queries.

## Archive, feed and source guardrails

The curated archive covers nine verified rounds. Each added round must pass
the complete-handout verifier for marks, amounts, dispositions, source pages,
PDF hash and official proceeds. Normal builds do not discover or publish more
rounds automatically. English and Chinese pages share the verified inputs.

The Atom feeds are `/auction-results/feed.xml` and
`/auction-results/en/feed.xml`. Entry IDs are the canonical round URLs; update
dates come from the recorded verification dates, never the daily build clock.
Readers manage subscriptions. Calendar downloads are separate reminders and
do not automatically refresh.

## Evidence required for a preferred-source claim

Maintain a fixed set of result/price queries and compare Hong Kong visibility
with relevant alternatives over repeated complete periods. Pair that with
repeat use and a representative first-choice study of buyers and collectors.
Record the sample, questions, alternatives and observation dates. Rankings,
feed clicks, deployments and correct source tables cannot alone establish
market share, preference or AI citation uptake.
