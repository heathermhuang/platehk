# Cloudflare Workers Handover for Claude Code

This project now has a full Cloudflare Workers runtime for the public site on `pvrm.hk`:
- static frontend files are served from Workers Assets
- `/api/*.php` compatibility routes are served by the Worker
- public data is served from `api/v1/*` static assets
- search/results/issues/issue are driven from static JSON and chunked dataset files
- OCR remains server-side and calls OpenAI from the Worker

DreamHost is no longer required for the `pvrm.hk` runtime path.

## What is already prepared

- Worker router:
  - `/Users/heatherm/Documents/Codex/PVRM/cloudflare-worker/src/index.mjs`
  - `/Users/heatherm/Documents/Codex/PVRM/cloudflare-worker/src/api.mjs`
  - `/Users/heatherm/Documents/Codex/PVRM/cloudflare-worker/src/lib.mjs`
- Wrangler config:
  - `/Users/heatherm/Documents/Codex/PVRM/wrangler.jsonc`
- Cloudflare publish build:
  - `/Users/heatherm/Documents/Codex/PVRM/scripts/build_cloudflare_public.py`
- Local env example:
  - `/Users/heatherm/Documents/Codex/PVRM/cloudflare-worker/.dev.vars.example`

## Runtime architecture

- Cloudflare Workers Static Assets serve the public frontend and static data.
- Worker handles dynamic API routes under `/api/*`.
- Search/results/issues/issue are built from static manifests, issue shards, presets, and chunked result files.
- OCR stays server-side and calls OpenAI from the Worker.

## Public assets staged for Cloudflare

`python3 scripts/build_cloudflare_public.py` builds:
- root HTML pages
- `assets/`
- `data/`
- `plates/`
- `mcp/`
- `api/v1/`
- `api/openapi.yaml`
- `robots.txt`, `sitemap.xml`, `llms.txt`, `sw.js`

Output directory:
- `/Users/heatherm/Documents/Codex/PVRM/.tmp/cloudflare-public`

## Worker env and bindings

Required:
- `OPENAI_API_KEY`

Recommended:
- `APP_SECURITY_TOKEN_SECRET`

## Commands

Install:

```bash
npm install
```

Build public assets:

```bash
npm run build:cloudflare:assets
```

Local dev:

```bash
npm run cf:dev
```

Deploy:

```bash
npm run cf:deploy
```

## Route compatibility

The Worker intentionally supports both:
- `/api/search.php?...`
- `/api/search?...`

That preserves current frontend behavior without forcing a front-end rewrite during migration.

## Important follow-up work for Claude Code

1. Replace isolate-local rate limiting with a Cloudflare-native control:
   - Rate Limiting binding
   - Durable Object
   - or another centralized counter
2. Add Worker-specific QA for:
   - `/api/search`
   - `/api/results`
   - `/api/issues`
   - `/api/issue`
   - `/api/vision_session`
   - `/api/vision_plate`
3. Validate Service Worker behavior under the new host and asset origin.
4. Update the frontend to prefer clean Worker routes after production parity is confirmed.

## Risk notes

- The Worker runtime is designed to preserve the current API contract first.
- The biggest remaining migration risk is behavior parity around:
  - search ranking
  - short-query throttling
  - cache behavior
  - OCR token/session enforcement
- `plate.hk` cutover should keep a rollback plan until Worker parity is verified on `pvrm.hk`.
