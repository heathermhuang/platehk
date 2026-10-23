# Assessor validation and source repairs — 2026-10-23

Validated against canonical `main` at `5ed41e9214b103781f5c3fc124538ba413c4f79b`.
This is a source repair and local regression record, not a production assessment
or security clearance. No production secret values, contact records, GA4 data,
Stripe payments, Render disks, or GitHub access settings were inspected.

## Dispositions

“Fixed” means the cited source behavior was reproduced or traced and corrected.
It does not establish historical exploitation or deployment of the correction.
Configuration-dependent sinks are distinguished from public attacker access.

| ID | Current-source result and disposition |
| --- | --- |
| A1 | **Fixed.** Vision HMAC used an eight-character FNV result. Signing now uses the full dedicated secret with domain separation, rejects secrets shorter than 32 bytes, and has no provider/password/public fallback. Old-key signatures fail verification. |
| A2 | **Fixed.** JWKS object spreading could publish private RSA members. Publication now allows only RSA public fields and excludes symmetric keys and unknown extensions. Prior deployment exposure remains unknown. |
| A3 | **Fixed.** Refund completion ignored status. Only `succeeded` plus an ID completes the refund. Pending/action-required refunds retain the ID and are retrieved hourly; failed/canceled/malformed or unresolved refunds become dead outbox actions requiring operator attention. No live Stripe transaction was performed. |
| A4 | **Fixed.** The title prefix restricted issue selection but did not authenticate the event sender. Issue/comment notifications now require owner/member/collaborator association or the existing Actions bot; manual runs require main. |
| A5 | **Fixed.** Event hrefs admitted arbitrary origins. Published hrefs now require official hosts; bounded source reads validate each redirect. The previous requests had no application Authorization/Cookie headers; credential leakage was not established. |
| B1 | **Fixed.** Encoded separators could enter the `/api/v1/` asset passthrough before the private-path check. The Worker rejects encoded separators/double encoding before API routing; the local adapter also rejects decoded traversal and malformed encodings. Local runtime checks use synthetic shards only. Production exposure was not tested. |
| B2 | **Hardened configuration-dependent sink.** A custom base URL could receive the OpenAI bearer/image. Outbound vision requests now allow only the canonical OpenAI Responses endpoint and reject redirects. Arbitrary environment-write authority was not demonstrated. |
| B3 | **Fixed trust-boundary gap.** Repair jobs previously checked out the upstream event SHA. Upstream events must now identify this repository's main branch. The policy job pins a trusted main SHA reused for generation, validation and PR creation. Checkout credentials are not persisted in the write job; notification code is copied from the trusted revision before applying the generated patch and executed with isolated Python. Auto Heal and manual connection tests are also main-gated. |
| B4 | **Changed prospective collection.** Raw plate event parameters were sent to GA4. Aggregate lookup outcomes continue; raw plate values remain local. Historical retention/deletion is outside this change and unverified. |
| B5 | **Not independently established.** A remembered purchase can be reused by code already executing in the same origin. That requires a separate script-execution/compromised-origin foothold. The cited fragment-XSS path remains rejected; cookie ownership/payment checks were not bypassed by this claim. |
| B6 | **Fixed.** Preview HTML returned before contact privacy overrides. GET/HEAD contact responses now apply private/no-store and no-referrer on primary and preview hosts. |
| B7 | **Partly addressed; assurance limit retained.** Source security regressions now exercise weak/missing signing secrets and private JWK filtering. Runtime signing fails closed. The remote secrets gate checks names only; it cannot establish entropy, issuer correctness, historical JWKS safety, or deployed configuration. |
| B8 | **Fixed.** Both automated deployment commands now invoke the signing-secret gate. Native Workers AI does not require an unused OpenAI key. All browser OCR deployments require the dedicated signing secret. |
| B9 | **Hardened artifact handling.** Trusted-main policy reclassifies the failure evidence and compares action/status/classification rather than trusting `plan.json` alone. Output issue numbers are validated and URLs reconstructed. Logs remain untrusted hints; automatic escalation for qualifying failures is intentional and does not merge/deploy patches. External log control sufficient to cross an additional authority boundary was not established. |
| B10 | **Fixed outbound policy.** Market source reads now enforce the exact HTTPS market host on every redirect and bound response size. No secret-bearing request was found in the original path. |
| B11 | **Token sink fixed; shell claim unsupported in current source.** The controller URL was an environment value passed to Node, not interpolated into shell source. Token-bearing control requests now require the canonical controller URL before fetching. Variable-write ACLs remain uninspected. |
| P3 | **Fixed.** LNY inventory additions now require an official HTTPS PDF URL before either inventory is written. |
| P5 | **Fixed.** Observer migrations now participate in the source revision, dirty-source checks, remote-main comparison and preparation-time consistency checks. |
| P6 | **Data corruption not established.** The reported 42 groups / HKD 220,000 can be reproduced only when the source's decade/date identity is omitted. Examples include the same plate/amount/status in different decade sheets. No complete identity duplicates were found in the committed dataset rows examined. These may be repeated sales; no rows were deleted on that assumption. |
| P7 | **Fixed.** Both workbook amount parsers handle infinity/overflow without aborting. Legacy inputs are read before deleting prior output shards, so input failures preserve prior output. |
| P8 | **Source correction.** Exact overlap signatures now retain years and can suppress only within the original workbook sheet interval. The combined builder no longer suppresses year-range records by plate/price alone. Local fixtures prove that later resales cannot erase unrelated earlier decades. Existing crossing-cutoff workbook rows still have coarse date provenance; exact transaction identity requires source reconciliation. Committed generated snapshots were not rewritten; the corrected logic applies on the next validated rebuild. |
| P9 | **Raw source fields confirmed; unsafe publication sink not established.** Workbooks retain plate/result text as provenance. Reviewed generated-page builders escape text/validate inputs; JSON containing strings is not by itself executable HTML. No committed markup-bearing plate values were found in either workbook. This does not certify every possible consumer. |
| P11 | **Operational limitation retained.** OpenWA session/profile files are not encrypted by the workflow-state encryption code. Platform disk encryption, access controls and actual deployed contents were not examined. Encrypting or relocating a live linked-device profile requires a separate storage/recovery design; no live session was altered. |
| P15 | **Fixed.** Browser session authentication moved to `X-Vision-Token`, before streamed JSON ingestion. The browser and OpenAPI contract were updated together. OAuth remains authenticated before body consumption. |
| P19 | **Fixed for verified publication.** Observer-driven builders now reject missing-PDF network fallback instead of obtaining unpinned bytes. Manual source reads also enforce the official HTTPS host and redirect policy. Changed inputs continue through the existing hash verification/parser receipts. |

T1 remains rejected: no new evidence defeats the fragment-encoding argument.
The optional fragment-concatenation cleanup is not required to close a confirmed
XSS. R1 remains rejected: the report provides no current events-integrity bypass.

## Release and review boundaries

- Configure `APP_SECURITY_TOKEN_SECRET` from at least 32 random bytes before release.
  The names-only gate does not generate or inspect its value. Rotating it invalidates
  old five-minute browser sessions; old signatures are intentionally unsupported.
- Browser clients must send `X-Vision-Token` with the existing session cookie.
  Body-only browser credentials are rejected before upload consumption.
- Custom OpenAI proxies are no longer accepted by this vision credential path.
  The native Workers AI configuration is unchanged.
- Refund results still require reconciliation with Stripe. These local tests do not
  establish a live refund, bank settlement, or recovery of a historical failed refund.
- Existing generated datasets remain intact. Rebuild and review changed historical
  totals using the corrected overlap logic before claiming historical data repair.
- No merge, production deployment, credential rotation, GA4 deletion or live
  WhatsApp session migration is part of this PR.

## Validation

Eight core security regression cases fail on untouched `main` and pass on the
repair branch. They exercise signing, JWKS, encoded asset paths, contact headers,
pre-body authentication, outbound credentials and migration provenance.
Additional focused cases cover refunds, source URLs/redirects, verified PDF fetch
rejection, amount overflow, output preservation, controller destinations, repair
artifact handling, date-aware overlap and browser header compatibility.

The PR description records the final check and browser-test results.

Final local results: the required `scripts/check_site.sh` passed, including 213
Python tests and all invoked Worker, service and frontend checks. The 86 distinct
camera/contact browser cases passed across their configured Chromium/WebKit
desktop/mobile projects (84 initially, two corrected contract assertions on rerun).
A separate Wrangler `--local` fixture returned 200 for the public asset and 404
for the private shard and all three encoded-path variants, without exposing its
synthetic contact value. No remote binding was used for this fixture.
