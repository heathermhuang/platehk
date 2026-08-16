# SEO and AEO measurement baseline

Plate.hk already publishes source-grounded plate pages, structured data, a sitemap, direct answers, and agent-readable discovery files. This workflow measures whether those surfaces are being discovered before more pages or metadata are added.

The baseline keeps four evidence planes separate:

- Search performance from Google Search Console and Bing Webmaster Tools
- Indexation, sitemap, manual-action, and Core Web Vitals status
- Point-in-time citations across ChatGPT, Claude, Gemini, and Perplexity
- Human accuracy review against Hong Kong Transport Department source documents

AI answers are non-deterministic. The workflow measures citation likelihood and answer quality; it cannot guarantee a future citation or ranking.

## Files and privacy

The tracked prompt corpus is `config/seo-aeo-prompts.json`. It contains 26 bilingual prompt variants grouped into 13 paired intents.

Real exports, AI response notes, and generated reports belong under `.private/seo-aeo/`, which is ignored by Git. Do not commit Search Console exports, account identifiers, private conversation links, or raw AI responses.

## Start a baseline

Create non-overwriting templates:

```bash
python3 scripts/build_seo_aeo_baseline.py --init
```

This creates:

- `.private/seo-aeo/ai-audit.csv`
- `.private/seo-aeo/gsc-queries.csv`
- `.private/seo-aeo/bing-queries.csv`
- `.private/seo-aeo/site-metrics.json`

The AI template contains 104 rows: every one of the 26 prompts on all four platforms. Initialization refuses to overwrite existing evidence.

Use a dated input directory for each recheck:

```bash
python3 scripts/build_seo_aeo_baseline.py \
  --init \
  --input-dir .private/seo-aeo/2026-08-16
```

## Collect search evidence

Use the same complete date range for Google and Bing. A 28-day window ending at least two days before collection is a practical default because recent Search Console data can still change.

### Google Search Console

1. Confirm the Plate.hk property is verified.
2. Record the shared search date window, Pages/indexation, Sitemaps, Manual Actions, and Core Web Vitals in `site-metrics.json`. Use `none` or `detected` for `manual_actions`.
3. Export the Performance search-results query table as CSV.
4. Save it as `gsc-queries.csv`.

The importer recognizes common headers such as `Top queries`, `Clicks`, `Impressions`, `CTR`, and `Position`.

### Bing Webmaster Tools

1. Confirm the Plate.hk site is verified.
2. Record sitemap and submitted/indexed URL counts in `site-metrics.json`.
3. Export the search-keyword table for the same date range.
4. Save it as `bing-queries.csv`.

The importer recognizes common `Query`, `Clicks`, `Impressions`, `CTR`, and `Average position` headers.

Header-only exports are accepted. They represent zero measured query rows and should be confirmed against the selected date range rather than treated as proof that tracking is configured correctly.

## Collect AI citation evidence

Run every prompt in a new conversation on each platform. Keep locale, account state, and web-search settings as consistent as the platforms allow.

For every row in `ai-audit.csv`, record:

- `audit_date`: observation date in `YYYY-MM-DD`
- `model_or_surface`: the visible model name or product surface
- `web_search_enabled`: whether live web search/browsing was enabled
- `brand_cited`: whether Plate.hk was named as a source
- `platehk_url_cited`: whether a Plate.hk URL was linked or cited
- `answer_accurate`: human judgment against the prompt's accuracy checks and official sources
- `competitor_cited`: whether another non-government data source was cited
- `cited_domains`: semicolon-separated source domains
- `answer_summary` and `notes`: short evidence notes, without private account data

All four yes/no score fields, the date, the model/surface, and the web-search state are required for a row to count as tested. A Plate.hk URL cannot be marked cited when `brand_cited` is `no`.

When judging accuracy:

- Treat Transport Department documents as authoritative.
- Keep historical auction prices separate from current valuation.
- Do not infer ownership or current availability from an auction record.
- Preserve the distinction between PVRM, TVRM physical, TVRM E-Auction, and workbook-backed legacy coverage.

## Build the scorecard

After all evidence is filled:

```bash
python3 scripts/build_seo_aeo_baseline.py
```

Strict mode exits without writing a completed baseline when evidence is missing. To preview the explicit gap report while collection is in progress:

```bash
python3 scripts/build_seo_aeo_baseline.py --allow-incomplete
```

Outputs are private by default:

- `.private/seo-aeo/baseline.json`: machine-readable measurements
- `.private/seo-aeo/baseline.md`: human scorecard and evidence-driven fix pack

The report includes:

- Google and Bing query totals, clicks, impressions, CTR, and weighted position
- Index coverage and Core Web Vitals evidence gates
- Non-branded queries with at least 10 impressions in positions 4 through 20
- Per-platform brand citation, Plate.hk URL citation, answer accuracy, and competitor citation rates
- Lost prompts ordered by prompt priority and platform coverage
- The exact prompt-corpus version and hash used for the observation matrix
- A fix pack derived only from measured lost-prompt and inaccurate-answer categories

## Recheck cadence

- Repeat the same AI matrix after 14 days using a new dated input directory.
- Repeat search and indexation measurement after 28 days using the same-length date window.
- Compare like-for-like windows and prompt sets. Do not declare a trend from one snapshot.
- Add or remove prompts only between baseline cycles, and record the corpus version when doing so.

The next content or technical SEO change should come from measured query opportunities, indexation gaps, inaccurate answers, or lost AI prompts—not from an unmeasured request to create more pages.
