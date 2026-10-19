#!/usr/bin/env node
import assert from 'node:assert/strict';

const base = new URL(process.argv[2] || 'https://plate.hk');
if (base.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(base.hostname)) throw new Error('HTTPS is required');
const checks = [];
let registration;
async function request(path, { method = 'GET', json, form, token, status = 200 } = {}) {
  const headers = { 'user-agent': 'PlateHK-agent-registration-verification', 'cache-control': 'no-cache' };
  if (json) headers['content-type'] = 'application/json';
  if (form) headers['content-type'] = 'application/x-www-form-urlencoded';
  if (token) headers.authorization = `Bearer ${token}`;
  const response = await fetch(new URL(path, base), { method, headers, body: json ? JSON.stringify(json) : form ? new URLSearchParams(form) : undefined, redirect: 'error', signal: AbortSignal.timeout(30000) });
  assert.equal(response.status, status, `${method} ${path}`);
  checks.push({ path, method, status: response.status });
  return response.json();
}

try {
  const metadata = await request('/.well-known/oauth-authorization-server');
  assert.equal(metadata.agent_auth.register_uri, new URL('/api/agent/register', base).href);
  registration = await request('/api/agent/register', { method: 'POST', json: { type: 'anonymous', scope: 'auction:read' }, status: 201 });
  assert.equal(registration.scope, 'auction:read');
  const token = registration.access_token;
  const session = await request('/api/agent/session', { token });
  assert.equal(session.registration_id, registration.registration_id);
  const search = await request('/api/search?dataset=all&q=88&page=1&page_size=5&sort=amount_desc', { token });
  assert.ok(search.rows.length > 0 && search.rows.length <= 5);
  const mcp = await request('/mcp', { method: 'POST', token, json: { jsonrpc: '2.0', id: 1, method: 'tools/list' } });
  assert.equal(mcp.result.tools.length, 4);
  for (const path of ['/api/vision_plate', '/api/contact/reveal']) {
    const denied = await request(path, { method: 'POST', token, json: {}, status: 403 });
    assert.equal(denied.error, 'insufficient_scope');
  }
  const owner = await request('/api/agent/claim', { method: 'POST', json: { claim_token: registration.claim_token } });
  assert.equal(owner.claimed, true);
  assert.equal(owner.scope, 'auction:read');
  await request('/api/agent/claim', { method: 'POST', json: { claim_token: registration.claim_token }, status: 401 });
  await request('/api/agent/revoke', { method: 'POST', form: { token: owner.management_token } });
  await request('/api/agent/session', { token, status: 401 });
  await request('/api/search?dataset=all&q=88&page_size=5', { token, status: 401 });
  assert.equal((await request('/api/health')).ok, true);
  console.log(JSON.stringify({ verified_at: new Date().toISOString(), origin: base.origin, ok: true, scope: 'auction:read', checks }, null, 2));
} finally {
  if (registration?.access_token) await request('/api/agent/revoke', { method: 'POST', form: { token: registration.access_token } });
}
