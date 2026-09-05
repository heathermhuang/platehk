# Security Posture

This document captures the current application threat model, attack surface, and main hardening controls for `plate.hk`.

## Assessment Date

- Reviewed: 2026-09-05
- Scope:
  - static frontend
  - Cloudflare Worker API routes
  - OCR vision endpoint
  - generated public data artifacts
  - MCP and OAuth discovery surfaces
  - external sale-signal ingestion and the isolated WhatsApp introduction pilot

## System Overview

- Architecture: Cloudflare Worker plus Cloudflare Static Assets
- Primary data stores: generated static JSON artifacts under `data/` and `api/v1/`
- Sensitive integrations:
  - OpenAI Responses API for server-side plate vision OCR
  - Worker secrets for OCR, session signing, and optional OAuth clients
  - Stripe Checkout/refunds and an isolated OpenWA browser session on Render
- Primary public entry points:
  - `/api/search`
  - `/api/results`
  - `/api/issues`
  - `/api/issue`
  - `/api/health`
  - `/api/vision_session`
  - `/api/vision_plate`
  - `/api/oauth/token`
  - `/api/market_signal`
  - `/mcp`
  - `/.well-known/*` discovery documents
  - `/camera.html`

## Data Classification

- Public:
  - auction results
  - generated public API payloads
  - static search indexes
  - MCP and API discovery metadata
- Sensitive:
  - OpenAI API credentials
  - OCR session signing secrets
  - OAuth signing keys and client secrets
  - temporary user-submitted OCR image payloads in transit
  - rate-limit state and operational logs
  - introduction contacts, consent/match state, Stripe identifiers, proxy credentials, and WhatsApp session data

## Trust Boundaries

1. Browser -> public frontend
2. Browser or API client -> Cloudflare Worker API
3. Cloudflare Worker -> static asset binding
4. Cloudflare Worker -> OpenAI API
5. Build scripts -> generated public data
6. Market ingester -> public 28car listing pages
7. Browser -> WhatsApp/Meta when a buyer or seller opens the locally composed message link
8. WhatsApp -> isolated Render/OpenWA service -> encrypted single-instance state
9. Introduction service -> Stripe Checkout and refund APIs
10. OpenWA browser -> fixed proxy -> WhatsApp Web

## Attack Surface

### External

- Search and browse APIs that are intentionally public
- Vision OCR endpoint that accepts user-provided image payloads
- OAuth token endpoint for machine OCR clients
- MCP tool endpoint and discovery documents
- Static generated data that can be scraped at scale
- Exact-match external sale-signal lookup and outbound WhatsApp compose link

### Internal

- Worker isolate-local rate-limit state
- Worker secrets configured through Cloudflare
- Local build and deploy scripts
- Generated static asset publish directory under `.tmp/cloudflare-public`

## STRIDE Summary

| Threat | Component | Current Risk | Mitigation |
| --- | --- | --- | --- |
| Spoofing | Browser OCR requests | Medium | Same-origin checks plus signed vision session token and Strict cookie binding |
| Spoofing | Machine OCR clients | Medium | OAuth client credentials and scoped bearer tokens |
| Tampering | Query params / JSON body | Medium | Strict dataset validation, normalized query handling, JSON content-type enforcement |
| Information Disclosure | WhatsApp introduction data | High -> Lowered | Draft values remain client-side until Send; two-stage consent, buyer-specific match approval, encrypted state, and 30-day contact-record deletion |
| Information Disclosure | 28car seller data | Medium -> Lowered | Allowlisted ingestion schema discards seller names, phones, descriptions, photos, comments, and views |
| Repudiation | Paid introduction delivery | Medium -> Lowered | Stripe event IDs, idempotent outbox actions, unique group IDs, and buyer confirmation in the three-party group |
| Spoofing | Self-identified seller | High -> Medium | Seller is never presented as ownership-verified; buyer must approve that exact seller before payment and disclosure |
| Repudiation | Abuse visibility | Medium | Rate limiting, Worker error logging, and security summarization tooling |
| Information Disclosure | Secrets and local files | Medium | Worker secrets, ignored local env files, repository secret scan, and static publish allowlist |
| Denial of Service | Public read APIs | Medium | Endpoint-specific IP rate limiting, page-size caps, bounded static indexes, and cache-backed responses |
| Denial of Service | Vision OCR | High -> Lowered | Session token, size limits, minute/hour rate limiting, client backoff, and upstream timeout |
| Elevation of Privilege | OAuth token issuance | Medium | Fixed client map, timing-safe secret comparison, scoped access tokens, and JWKS verification |

## Current Controls

- Worker API responses use hardened headers:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: SAMEORIGIN`
  - `Referrer-Policy`
  - `Permissions-Policy`
  - `Cross-Origin-Resource-Policy`
  - `X-Robots-Tag`
- HTML asset responses use a Worker-managed content security policy.
- Public OCR endpoint protections:
  - POST-only
  - JSON content-type enforcement
  - request body size limit
  - same-origin request enforcement with required browser provenance headers
  - short-lived signed vision session token plus Strict HttpOnly cookie binding
  - OAuth bearer-token path for approved machine clients
  - minute/hour IP rate limits
  - HTTPS-only upstream to OpenAI
- Public read API protections:
  - endpoint-specific IP rate limits
  - public page-size caps on list/search endpoints
  - canonical bounded search indexes with no production fallback to full-dataset scans
  - sorted result chunks and issue shards that bound production pagination reads
  - fail-closed `503` responses when required search or result indexes are unavailable
  - normalized, bounded query inputs
  - no-store API response headers
  - cache-backed responses for hot static payloads
- Market and enquiry protections:
  - exact-plate signal responses, including a same-origin positive-only page batch capped at 200 candidates, rather than a browsable market feed
  - aggregate market snapshots are gitignored and exist only transiently on the private update runner
  - direct `/_market/*` requests blocked by the Worker
  - source URL host allowlisting and freshness expiry
  - active-listing verification before a WhatsApp action is shown
  - short form values are composed locally and never submitted to Plate.hk
  - no seller contact fields in the scrape output
  - introduction controls remain disabled unless both the Render service URL and secondary public number are configured
  - buyer consent, seller consent, buyer match approval, payment, group creation, and delivery confirmation are separate states
  - Stripe webhook signatures and amount/currency/session metadata are verified before group creation
  - introduction state is AES-256-GCM encrypted and limited to one persistent Render instance
  - stale outbox work is recoverable; Checkout, group creation, and refunds use deterministic idempotency controls
- Repository safeguards:
  - `scripts/scan_repo_secrets.py`
  - `.github/workflows/security.yml`
  - `.gitignore` rules for local secrets, logs, generated reports, and duplicate files
  - Cloudflare publish allowlist in `scripts/build_cloudflare_public.py`

## Residual Risks

1. Worker isolate-local rate limiting is best-effort and can reset across isolates.
2. Public search APIs remain intentionally anonymous; rate limiting reduces abuse but does not replace Cloudflare edge-level controls.
3. Vision OCR still incurs external API cost and should be monitored for unusual spikes.
4. Local developer secrets in ignored files remain a manual operational risk until rotated or moved fully into managed secret stores.
5. Static search indexes and public JSON artifacts intentionally expose auction data at scale, so abuse prevention is mostly rate/cost control rather than confidentiality.
6. WhatsApp receives a prefilled draft only after the user opens WhatsApp; the separate introduction service receives it only after the user presses Send.
7. A third-party listing signal can be stale or legally non-transferable even within the freshness window; human verification remains mandatory.
8. The approved daily full crawl remains dependent on 28car's public layout and `robots.txt`; the scraper fails closed, but source-policy and terms changes still require operational review.
9. OpenWA remains unofficial and may break or cause restriction of the secondary WhatsApp number. A fixed proxy does not remove this risk.
10. The seller is self-identified rather than ownership-verified. Plate.hk must not describe the seller or plate as verified.
11. Render, the proxy provider, WhatsApp/Meta, and Stripe are separate processors and availability dependencies.

## Required Operational Follow-Up

1. Keep `OPENAI_API_KEY`, OAuth keys, and token-signing secrets in Cloudflare Worker secrets only.
2. Review `/api/vision_plate` 403/429/502 rates after OCR changes.
3. Add centralized Cloudflare-native rate limiting for high-volume public endpoints.
4. Run `python3 scripts/scan_repo_secrets.py` before public commits or releases.
5. Keep `api/openapi.yaml`, API docs, and Worker routes aligned.
6. Review the daily crawl after any 28car policy, terms, or layout change.
7. Keep `STATE_ENCRYPTION_KEY`, Stripe secrets, proxy credentials, and the OpenWA profile only in Render-managed secret/storage surfaces.
8. Do not activate `INTRODUCTION_SERVICE_URL` and `INTRODUCTION_WHATSAPP_NUMBER` until a secondary-number QR canary and a Stripe test payment/refund pass.
9. Stop the pilot on repeated authentication failures, a WhatsApp restriction warning, or any mismatch between the authenticated and configured secondary number.

## Future Security Work

1. Add Cloudflare Rate Limiting or Durable Object backed counters for public APIs.
2. Add alerting thresholds on repeated `search_index_unavailable`, `results_index_unavailable`, `invalid_paging`, and `vision_token_invalid` patterns.
3. Consider user- or session-aware throttling if authenticated features are added later.
4. Move security-event aggregation to a Worker or Cloudflare log sink if operational monitoring needs grow.
