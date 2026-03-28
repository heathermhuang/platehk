# Security Posture

This document captures the current application threat model, the primary attack surface, and the main hardening controls for `plate.hk`.

## Assessment Date

- Reviewed: 2026-03-23
- Reviewer mode: `engineering-security-engineer`
- Scope:
  - static frontend
  - public PHP APIs
  - DreamHost shared-host deployment posture
  - OCR vision endpoint
  - generated public data artifacts

## System Overview

- Architecture: static frontend plus PHP API on shared hosting
- Primary data stores: MySQL auction database, generated static JSON artifacts, temporary filesystem cache
- Sensitive integrations:
  - OpenAI Responses API for server-side plate vision OCR
  - DreamHost-hosted MySQL
- Primary public entry points:
  - `/api/search.php`
  - `/api/results.php`
  - `/api/issues.php`
  - `/api/issue.php`
  - `/api/health.php`
  - `/api/vision_plate.php`
  - `/camera.html`

## Data Classification

- Public:
  - auction results
  - generated public API payloads
  - static search indexes
- Sensitive:
  - database credentials
  - OpenAI API credentials
  - temporary uploaded plate images sent to `vision_plate.php`
  - rate-limit state and server logs

## Trust Boundaries

1. Browser -> public frontend
2. Browser -> PHP API
3. PHP API -> MySQL
4. PHP API -> OpenAI API
5. Build scripts -> generated public data

## Attack Surface

### External

- Search and browse APIs that are intentionally public
- Vision OCR endpoint that accepts user-provided image payloads
- Shared-hosting web server configuration

### Internal

- Temporary API cache and rate-limit files under the system temp directory
- CLI-only sync workflow in `/api/admin/sync.php`
- Security event logs under `/logs/`

## STRIDE Summary

| Threat | Component | Current Risk | Mitigation |
| --- | --- | --- | --- |
| Spoofing | `vision_plate.php` origin | Medium | Same-origin enforcement on browser-submitted OCR requests |
| Tampering | Query params / JSON body | Medium | Strict dataset validation, normalized query handling, JSON content-type enforcement |
| Repudiation | Abuse visibility | Medium | Rate limiting and server-side error logging |
| Information Disclosure | Sensitive config and log files | High -> Lowered | `.htaccess` deny rules for config, env-like files, and runtime logs |
| Denial of Service | Public read APIs | High -> Lowered | Endpoint-specific IP rate limiting, page-size caps, short-query page caps, and cache-backed responses |
| Denial of Service | Vision OCR | High -> Lowered | Required same-origin browser headers, signed session token + Strict cookie binding, size limits, minute/hour rate limiting, client backoff |
| Elevation of Privilege | Admin sync path | Low | CLI-only execution path with no web access |

## Review Findings

### Fixed in this review

1. Public security telemetry was exposed over the web.
   - Risk: `logs/security-events.log` contained rate-limit and invalid-origin events that should not be public.
   - Fix: direct access to `/logs/` and `*.log` files is now denied in root Apache rules.

2. `vision_plate.php` accepted requests with no `Origin` and no `Referer`.
   - Risk: non-browser clients could bypass the intended same-origin browser-only constraint and spend OCR budget directly.
   - Fix: requests with neither `Origin` nor `Referer` are now rejected with `origin_required`, and `Sec-Fetch-Site` is checked when present.

3. OCR requests were browser-same-origin gated, but not bound to a short-lived browser session token.
   - Risk: request provenance checks reduced abuse, but did not force the client through a fresh same-origin token issuance step.
   - Fix: `vision_session.php` now issues a short-lived signed token plus Strict HttpOnly cookie; `vision_plate.php` requires both before upstream OCR is allowed.

4. Result row APIs did not consistently propagate `is_lny`.
   - Risk: frontend behavior depended on indirect PDF heuristics instead of explicit trusted metadata.
   - Fix: `results.php`, `search.php`, and `issue.php` now return row-level `is_lny`.

### Residual risks

1. Shared hosting remains the primary structural constraint.
   - Impact: PHP isolation, temp-file privacy, and filesystem permissions depend on host controls outside the app.

2. Public anonymous read APIs are intentionally open.
   - Impact: rate limiting reduces scraping and abuse cost, but does not replace CDN/WAF-level shielding.

3. OCR uses a paid external model.
   - Impact: cost spikes and abuse still need active monitoring even with tighter origin and rate-limit controls.

## Current Controls

- API responses use hardened headers:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: SAMEORIGIN`
  - `Referrer-Policy`
  - `Permissions-Policy`
  - `Cross-Origin-Resource-Policy`
  - `X-Robots-Tag`
- Public OCR endpoint protections:
  - POST-only
  - JSON content-type enforcement
  - request body size limit
  - same-origin request enforcement with required browser provenance headers
  - short-lived signed vision session token plus Strict HttpOnly cookie binding
  - minute/hour IP rate limits
  - HTTPS-only upstream to OpenAI
- Public read API protections:
  - endpoint-specific IP rate limits
  - public page-size caps on list/search endpoints
  - short-query page caps to reduce low-entropy dataset enumeration
  - normalized, bounded query inputs
  - no-store API caching headers
  - static/file cache for hot responses
- Security telemetry:
  - rate-limit, invalid-origin, and OCR upstream-failure events are written to `logs/security-events.log`
  - `scripts/summarize_security_events.py` can summarize recent event types, paths, and client fingerprints
- Deployment hardening:
  - direct access to `config.php`, `config.local.php`, `.env`, lockfiles, `/logs/`, and runtime `.log` files denied in Apache rules

## Residual Risks

1. Shared hosting means filesystem temp-cache and PHP runtime isolation depend on host configuration.
2. Public search APIs remain intentionally anonymous; rate limiting reduces abuse, but does not replace a WAF or CDN shielding layer.
3. Vision OCR still incurs external API cost and should be monitored for unusual spikes.
4. Local developer secrets in ignored files remain a manual operational risk until rotated or moved to environment variables.
5. Static search indexes and public JSON artifacts intentionally expose auction data at scale, so abuse prevention is mostly rate/cost control rather than confidentiality.

## Required Operational Follow-Up

1. Rotate the current database and OpenAI credentials that have existed in local config files.
2. Move runtime secrets to host environment variables or a managed secret store where possible.
3. Add periodic review of API error logs and rate-limit hits, especially for `vision_plate.php` and short-query search abuse.
4. Keep `.htaccess` rules aligned with any new entry points or new secret-bearing files.
5. Add alerting or periodic checks on OCR 403/429/502 rates so abuse and upstream failure patterns are visible early.
6. Periodically review `missing_origin`, `vision_token_invalid`, and `vision_token_expired` events to distinguish malicious traffic from legitimate browser breakage.

## Future Security Work

1. Add CDN or edge-level shielding for search endpoints if traffic grows materially.
2. Add alerting thresholds on repeated `search_window_exceeded`, `public_read_invalid_paging`, and `vision_token_invalid` events.
3. Consider user- or session-aware throttling if authenticated features are added later.
4. Consider moving security-event logging to a host-managed sink if shared-host filesystem access becomes a concern.
