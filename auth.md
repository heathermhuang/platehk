# Plate.hk auth.md: authentication for agents

## Public auction data

No account, API key, registration, or OAuth token is required for historical
auction searches, dataset discovery, comparisons, issue reads, or the public MCP
tools at `https://plate.hk/mcp`.

- API documentation: https://plate.hk/api.html
- OpenAPI: https://plate.hk/api/openapi.yaml
- MCP server card: https://plate.hk/.well-known/mcp/server-card.json
- Public data skill: https://plate.hk/skill.md

## Protected OCR

Machine access to `https://plate.hk/api/vision_plate` uses OAuth 2.0 client
credentials for operator-approved clients. Anonymous registration below does
not provision OCR credentials. Do not request credentials for public auction
data unless you want a revocable agent registration.

1. Obtain an approved client ID and client secret from the Plate.hk operator
   through an agreed private channel. Never place secrets in URLs or public text.
2. Read https://plate.hk/.well-known/oauth-protected-resource/api/vision_plate
   and https://plate.hk/.well-known/oauth-authorization-server for metadata.
3. POST an `application/x-www-form-urlencoded` body to
   `https://plate.hk/api/oauth/token` with `grant_type=client_credentials` and
   `scope=vision:ocr`. Authenticate with `client_secret_basic` (HTTP Basic) or
   `client_secret_post` as described by the authorization server.
4. Send the returned token in `Authorization: Bearer <access_token>` on OCR
   requests. Follow `expires_in`; never assume a token is permanent.

The OCR token audience is `https://plate.hk/api/vision_plate`. Credentials must
be configured by the operator before tokens can be issued. A public discovery
document alone does not establish that a client has been provisioned.

Browser camera use follows a separate same-origin, cookie-bound session flow.
Agent discovery grants no access to paid seller contacts, private snapshots, or
administrative actions. Purchase and contact disclosure require their existing
payment and browser-ownership checks.

## Anonymous agent registration

Agents may register without a user identity to obtain a revocable API key for
`auction:read`. Registration is optional: the same auction data remains public.
This flow does not verify a person's identity or create or link a user account.
It does not accept ID-JAGs, email assertions, or OAuth dynamic client registration.

1. Discover `agent_auth` at
   https://plate.hk/.well-known/oauth-authorization-server.
2. POST JSON to https://plate.hk/api/agent/register:

   ```json
   {"type":"anonymous","scope":"auction:read"}
   ```

   The 201 response includes `registration_id`, `access_token`, `token_type`,
   `scope`, `expires_in`, `expires_at`, `claim_token`, `claim_url`, and
   `revocation_uri`. Store credentials privately. Responses are never cached.
   Do not send names, email addresses, or credentials from other services.
3. Use `Authorization: Bearer <access_token>` with GET requests to
   `/api/search`, `/api/issues`, `/api/issue`, `/api/results`, `/api/comparables`,
   `/api/health`, and `/api/v1/*`, or POST read-only JSON-RPC requests to `/mcp`.
   Search still needs its documented dataset/query parameters. Inspect the
   registration at GET https://plate.hk/api/agent/session with the same header.
4. Credentials expire after 24 hours and cannot be refreshed or upgraded.
   A 401 `invalid_token` means expired, revoked, or invalid: discard the key and
   register again only if a new registration is needed. A 403
   `insufficient_scope` cannot be resolved by requesting a broader scope.
5. To hand revocation control to a human, share the `claim_token` privately and
   direct them to https://plate.hk/agent/claim. They paste it and click Take
   control. The page sends POST `/api/agent/claim` with JSON
   `{"claim_token":"<claim_token>"}` and returns a management token once.
   Claim tokens are single-use. Claiming grants control of this registration's
   revocation only; it does not identify the holder or increase read access.
   Keep the management token privately; the browser does not persist it.
6. POST an `application/x-www-form-urlencoded` body to
   https://plate.hk/api/agent/revoke with `token=<access_token>` to revoke your
   registration, or `token=<management_token>` for the human owner. The claim
   page offers the same revoke action. Revocation immediately invalidates the
   registration and its access/claim/management tokens. Per RFC 7009, invalid
   and already-revoked tokens also return 200 without revealing their status.

Registration bodies are limited to 2 KiB. Registration is capped at five per
minute and 40 per hour per IP, plus a service-wide cap of 500 per hour. On 429,
respect `Retry-After`; do not rotate identities or IPs to bypass the limit.
Registration state and rate limits use strongly consistent, SQLite-backed
Durable Objects. Only SHA-256 credential hashes are stored; expiry alarms remove
registration state. No new secret or third-party identity service is required.
