# Plate.hk authentication for agents

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
credentials for operator-approved clients. Plate.hk does not offer automatic
agent registration, identity assertion exchange, user claim flows, or dynamic
client registration. Do not invent a registration URL or request credentials
for public auction data.

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
