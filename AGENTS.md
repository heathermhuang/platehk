# Agent Instructions

This repository is intended to be publishable. Keep local agent memory, machine-specific paths, credentials, generated duplicate files, and private handoff notes out of tracked changes.

Before preparing a public commit or release:
- Run `python3 scripts/scan_repo_secrets.py`.
- Run the relevant test suite for the touched area.
- Do not commit `.env` files, `.dev.vars`, dump files, logs, local browser reports, or files created as Finder/agent duplicates such as `* 2.*`.
- Prefer repo-relative paths in docs and reports instead of absolute local paths.


<claude-mem-context>
# Memory Context

# [PVRM] recent context, 2026-05-16 9:08pm GMT+8

Legend: 🎯session 🔴bugfix 🟣feature 🔄refactor ✅change 🔵discovery ⚖️decision
Format: ID TIME TYPE TITLE
Fetch details: get_observations([IDs]) | Search: mem-search skill

Stats: 50 obs (17,767t read) | 2,045,354t work | 99% savings

### May 12, 2026
2456 9:41p 🔵 PVRM Playwright E2E suite — 6/10 tests passing mid-run across desktop and mobile
2457 9:42p 🟣 PVRM — GitHub footer links fully implemented across all public pages
2461 " 🔵 PVRM wrangler build artifacts contain absolute /Users/ paths in source maps
2463 9:43p 🔵 PVRM .gstack/qa-reports contain absolute /Users/ paths in screenshot manifests
2464 9:46p 🟣 PVRM — GitHub footer links added to all public pages
2465 " ✅ PVRM repo hardening — .gitignore, absolute paths, and AGENTS.md updated
2466 " 🔵 PVRM security scan — no secrets in tracked files, PHP absent
2467 9:47p 🔵 PVRM GitHub footer link implementation — confirmed in index.html, landing.html, camera.html
### May 16, 2026
3086 12:38p 🟣 Hong Kong license plate recognition requirement — camera page
3088 12:42p ⚖️ Camera page — Hong Kong license plate recognition scope defined
3094 12:43p 🟣 Hong Kong license plate recognition — filter for HK plates only on camera page
3131 12:47p ⚖️ Camera page — HK license plate recognition with regional exclusion logic
3134 1:19p 🟣 PVRM vision_plate — multi-region plate exclusion implemented across PHP, Cloudflare Worker, and frontend
3135 " 🔵 PVRM deployment blocked — no CLOUDFLARE_API_TOKEN in environment, wrangler whoami timed out
3136 " 🔵 test_workflows and test_generated_data stalled — iCloud-evicted files blocking Python test runner
3152 1:32p 🔵 wrangler whoami crashes on Node.js v22 — miniflare.Mutex incompatibility
3153 " 🔵 PVRM pre-deploy changed files — 6 files modified across API, frontend, worker, and tests
3154 " 🔵 PVRM scripts/build_cloudflare_public.py — Cloudflare publish build architecture
3156 1:35p 🔵 wrangler@latest whoami hangs indefinitely — stuck reading node_modules package.json files
3157 " 🔵 rsync stalled on data/hot_search/all_amount_desc/222.json during Cloudflare build
3159 1:38p 🔵 248 of 264 hot_search/all_amount_desc files are iCloud-evicted — rsync build stalling on each download
3160 " 🔵 wrangler 4.77.0 + miniflare 4.20260317.2 incompatible with Node v22.14.0 — all wrangler commands crash
3161 1:40p 🔵 iCloud materialization of hot_search/all_amount_desc completed — rsync progressed to tvrm_physical
3166 1:44p ⚖️ Camera page — HK license plate recognition with regional exclusion logic
3172 1:47p 🔵 PVRM wrangler 4.77.0 crashes — miniflare.Mutex not exported in miniflare 4.20260317.2
3173 " 🔵 Multiple stuck git status processes accumulating in PVRM repo — required bulk kill
3176 1:49p 🔴 PVRM deployed to Cloudflare using wrangler 4.60.0 via npx — workaround for 4.77.0 crash
3177 " 🟣 PVRM camera page — HK-only plate recognition with Macau/Mainland exclusion shipped to production
3178 " 🟣 camera.html — mobile-responsive full-screen layout added for narrow/short viewports
3182 1:52p 🔵 PVRM wrangler 4.92.0 — miniflare.Mutex bug fixed but local install hangs; npx invocation works
3183 1:54p 🔵 PVRM wrangler local install hang — npx now also hangs after local wrangler@4.92.0 installed, resolves to same local binary
3184 1:57p 🔵 PVRM local wrangler hang confirmed as iCloud node_modules eviction — affects all versions including downgraded 4.60.0
3186 2:43p ⚖️ Camera page — HK license plate recognition with regional exclusion logic
3188 " 🔵 PVRM project — modified files include camera.js, vision_plate.php, and Cloudflare Worker API
3189 2:46p 🔵 PVRM repo — git diff hangs repeatedly, requires SIGKILL to clear
3190 " 🔵 PVRM project maps to GitHub repo heathermhuang/platehk on main branch
3191 2:48p 🔵 PVRM .git/index.lock regenerates — background Claude Code git processes (PPIDs 4543) keep recreating it
3192 2:50p 🔵 PVRM git commit hangs — iCloud-evicted objects block write-tree during commit
3193 2:52p 🔵 PVRM git write-tree succeeds instantly but git diff-tree hangs — iCloud blocks object reads not writes
3194 2:55p 🔵 PVRM HEAD commit object is iCloud-evicted — git read-tree HEAD hangs, write-tree from index works
3196 2:57p 🔴 PVRM iCloud-evicted git commit unblocked via git commit-tree + git update-ref workaround
3198 2:59p 🟣 HK license plate recognition shipped to platehk main — commit f9b40b9 pushed successfully
3365 8:36p 🔵 ARHOUSE — PHP files still present despite full Cloudflare Worker migration
3366 8:45p 🔴 PVRM — Legacy PHP/DreamHost runtime fully removed from repository
3367 " 🔄 PVRM — Frontend and tests migrated from .php URLs to clean Worker routes
3368 " 🔄 PVRM — Test suite migrated from PHP file assertions to Cloudflare Worker assertions
3369 " ✅ PVRM — Docs updated to reflect Cloudflare Worker-only architecture
3370 " 🔵 PVRM — PHP .php suffix stripping in Worker router was a migration shim now removed
3372 8:52p 🔵 ARHOUSE project contains legacy PHP files from old Dreamhost deployment
3376 8:57p 🔴 PVRM — Legacy PHP and DreamHost scaffolding fully removed from repository

Access 2045k tokens of past work via get_observations([IDs]) or mem-search skill.
</claude-mem-context>
