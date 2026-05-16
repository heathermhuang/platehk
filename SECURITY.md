# Security Posture

This document captures the current application threat model, attack surface, and main hardening controls for `plate.hk`.

## Assessment Date

- Reviewed: 2026-05-16
- Scope:
  - static frontend
  - Cloudflare Worker API routes
  - OCR vision endpoint
  - generated public data artifacts
  - MCP and OAuth discovery surfaces

## System Overview

- Architecture: Cloudflare Worker plus Cloudflare Static Assets
- Primary data stores: generated static JSON artifacts under `data/` and `api/v1/`
- Sensitive integrations:
  - OpenAI Responses API for server-side plate vision OCR
  - Worker secrets for OCR, session signing, and optional OAuth clients
- Primary public entry points:
  - `/api/search`
  - `/api/results`
  - `/api/issues`
  - `/api/issue`
  - `/api/health`
  - `/api/vision_session`
  - `/api/vision_plate`
  - `/api/oauth/token`
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

## Trust Boundaries

1. Browser -> public frontend
2. Browser or API client -> Cloudflare Worker API
3. Cloudflare Worker -> static asset binding
4. Cloudflare Worker -> OpenAI API
5. Build scripts -> generated public data

## Attack Surface

### External

- Search and browse APIs that are intentionally public
- Vision OCR endpoint that accepts user-provided image payloads
- OAuth token endpoint for machine OCR clients
- MCP tool endpoint and discovery documents
- Static generated data that can be scraped at scale

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
| Repudiation | Abuse visibility | Medium | Rate limiting, Worker error logging, and security summarization tooling |
| Information Disclosure | Secrets and local files | Medium | Worker secrets, ignored local env files, repository secret scan, and static publish allowlist |
| Denial of Service | Public read APIs | Medium | Endpoint-specific IP rate limiting, page-size caps, short-query page caps, and cache-backed responses |
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
  - short-query page caps to reduce low-entropy dataset enumeration
  - normalized, bounded query inputs
  - no-store API response headers
  - cache-backed responses for hot static payloads
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

## Required Operational Follow-Up

1. Keep `OPENAI_API_KEY`, OAuth keys, and token-signing secrets in Cloudflare Worker secrets only.
2. Review `/api/vision_plate` 403/429/502 rates after OCR changes.
3. Add centralized Cloudflare-native rate limiting for high-volume public endpoints.
4. Run `python3 scripts/scan_repo_secrets.py` before public commits or releases.
5. Keep `api/openapi.yaml`, API docs, and Worker routes aligned.

## Future Security Work

1. Add Cloudflare Rate Limiting or Durable Object backed counters for public APIs.
2. Add alerting thresholds on repeated `query_window_exceeded`, `invalid_paging`, and `vision_token_invalid` patterns.
3. Consider user- or session-aware throttling if authenticated features are added later.
4. Move security-event aggregation to a Worker or Cloudflare log sink if operational monitoring needs grow.
