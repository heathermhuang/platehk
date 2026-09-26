# Complete auction-result pages

The result archive at `/auction-results/index.html` contains a curated initial
batch of three rounds, with original English HTML under `/auction-results/en/`.
The archive complements the general historical search index. It preserves every
listed mark and the disposition from each complete official handout.

## Source and amount rules

- `sold`: a competitive auction sale; included in sale counts and rankings.
- `special_fee`: an `@` amount, allocated to the original applicant after no bidder;
  excluded from competitive-sale counts and rankings.
- `unsold`: `U/S`; amount is absent, not zero. The general search may omit these rows.
- Official proceeds are reproduced separately and reconcile to competitive-sale
  amounts plus special fees, where present. They do not establish the sold count.
- A `*` on the traditional handout identifies a special registration mark, whose
  handout footnote states it is not transferable. Do not infer this status from its
  lettering or number pattern.
- The online-round issue key is its opening date. Display the whole verified range;
  do not describe the key as each mark's sale or payment date.
- These historical amounts establish neither current value, ownership nor
  availability. The Transport Department document remains the final authority.

The personalized table lists one-row marks. The official PDF remains the source
for two-row arrangements and `n/a` labels.

## Build and verify

The explicitly curated inputs live in `config/auction_result_pages.json`. Each
round records the complete PDF's URL, SHA-256, page count, date range, verification
date, official proceeds and mark-level source pages. No PDF, local path or private
handoff is tracked.

```sh
python3 scripts/build_auction_result_pages.py
python3 scripts/verify_auction_result_sources.py --pdf-dir /path/to/official-handouts
python3 -m unittest discover -s tests -p 'test_auction_result_pages.py'
npx playwright test e2e/auction-results.spec.mjs
```

The verifier compares independent raw-cell/text extraction against every curated
mark, amount, disposition, source page and special-mark flag, and checks the entire
source hash, page count and official proceeds. A changed PDF requires a source
review; a matching total alone is insufficient.

The normal popular-page build retains all eight archive URLs in the sitemap and
renders the fixed publication set. The Cloudflare publish builder also renders
it directly from the same inputs. The auction tool links both language variants.
The existing Auto Update Data workflow stages the generated archive and continues
to own deployment and market-snapshot verification.

Adding another round requires a reviewed input change and complete source
verification. The build does not discover or publish new rounds automatically.
Keep `verified_on` accurate when source content changes; do not replace it with
the daily build date. Keep reciprocal `hreflang`, self-canonical links and native
visible language consistent. Indexing and AI citation selection require separate
observations after release; passing builds and source checks do not prove uptake.
