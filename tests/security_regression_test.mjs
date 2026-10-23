import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import worker from '../cloudflare-worker/src/index.mjs';
import { handleApiRequest } from '../cloudflare-worker/src/api.mjs';
import { issueVisionSessionToken, requireVisionSessionToken, cheapHashHex, getOAuthJwksDocument, httpPostJson } from '../cloudflare-worker/src/lib.mjs';
import { SOURCE_PATHS } from '../scripts/deploy_refresh_worker.mjs';

const env = { APP_SECURITY_TOKEN_SECRET: 'fixture-only-signing-key-at-least-32-bytes' };
const client = () => new Request('https://plate.test/api/vision_session', { headers: { 'user-agent': 'security-regression', 'cf-connecting-ip': '198.51.100.99' } });

test('vision sessions fail closed without a dedicated signing secret', async () => {
  for (const config of [{}, { OPENAI_API_KEY: 'a'.repeat(64) }, { APP_SECURITY_TOKEN_SECRET: 'short' }]) {
    await assert.rejects(issueVisionSessionToken(client(), config), error => error.code === 'vision_not_configured');
  }
});
test('legitimate vision sessions work and legacy 32-bit-key signatures cannot authenticate', async () => {
  const issued = await issueVisionSessionToken(client(), env);
  const request = new Request(client(), { headers: { ...Object.fromEntries(client().headers), cookie: issued.cookie.split(';')[0] } });
  await requireVisionSessionToken(request, env, issued.token);
  const payload = issued.token.split('.')[0];
  const oldKey = cheapHashHex(`${env.APP_SECURITY_TOKEN_SECRET}|platehk|vision-session`);
  const forged = `${payload}.${createHmac('sha256', oldKey).update(payload).digest('base64url')}`;
  await assert.rejects(requireVisionSessionToken(request, env, forged), error => error.code === 'vision_token_invalid');
  await assert.rejects(requireVisionSessionToken(request, { APP_SECURITY_TOKEN_SECRET: 'different-signing-secret-at-least-32-bytes' }, issued.token), error => error.code === 'vision_token_invalid');
});
test('JWKS never publishes RSA private components, symmetric material or extensions', async () => {
  const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' }, true, ['sign','verify']);
  const privateKey = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const document = getOAuthJwksDocument({ OAUTH_JWKS_JSON: JSON.stringify({ keys: [{ ...privateKey, kid: 'fixture', private_extension: 'never public' }, { kty: 'oct', k: 'secret' }] }) });
  assert.equal(document.keys.length, 1);
  for (const key of ['d','p','q','dp','dq','qi','oth','k','key_ops','private_extension']) assert.equal(document.keys[0][key], undefined);
  await crypto.subtle.importKey('jwk', document.keys[0], { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
});
test('encoded traversal never reaches the public asset passthrough', async () => {
  let calls = 0;
  const runtime = { ASSETS: { fetch() { calls++; return Response.json({ private_contact: 'fixture' }); } } };
  for (const path of ['/api/v1/..%2f..%2f_market/28car/contacts/A.json', '/api/v1/%252e%252e%252f_market/A.json', '/api/v1/..%5c..%5c_market/A.json', '/_market/28car/contacts/A.json']) {
    const response = await worker.fetch(new Request(`https://plate.test${path}`), runtime, {});
    assert.equal(response.status, 404, path);
  }
  assert.equal(calls, 0);
  assert.equal((await worker.fetch(new Request('https://plate.test/api/v1/index.json'), runtime, {})).status, 200);
  assert.equal(calls, 1);
});
test('contact pages have privacy headers on primary and preview hosts', async () => {
  for (const host of ['plate.hk', 'preview.example']) {
    for (const method of ['GET','HEAD']) {
      const response = await worker.fetch(new Request(`https://${host}/contact.html`, { method }), { ASSETS: { fetch() { return new Response('<html>contact</html>', { headers: { 'content-type': 'text/html' } }); } } }, {});
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'private, no-store');
      assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
    }
  }
});
test('unauthenticated browser OCR never consumes the upload stream', async () => {
  for (const token of ['', 'invalid']) {
    let pulls = 0;
    const request = new Request('https://plate.test/api/vision_plate', { method: 'POST', duplex: 'half', headers: {
      origin: 'https://plate.test', 'content-type': 'application/json', 'x-vision-token': token, 'cf-connecting-ip': '198.51.100.99',
    }, body: new ReadableStream({ pull(controller) { pulls++; controller.enqueue(new Uint8Array(1024)); } }, { highWaterMark: 0 }) });
    const response = await handleApiRequest(request, { ...env, VISION_PROVIDER: 'workers_ai', AI: { run() { assert.fail('must not infer'); } } }, {});
    assert.equal(response.status, 403);
    assert.equal(pulls, 0);
  }
});
test('OpenAI credentials are sent only to the canonical Responses endpoint with redirects disabled', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => { calls++; assert.equal(String(url), 'https://api.openai.com/v1/responses'); assert.equal(options.redirect, 'error'); return Response.json({ output_text: 'fixture' }); };
  try {
    for (const url of ['https://evil.test/responses','https://api.openai.com.evil.test/v1/responses','https://user@api.openai.com/v1/responses','https://api.openai.com/v1/responses?redirect=evil']) {
      await assert.rejects(httpPostJson({ OPENAI_API_KEY: 'fixture' }, url, {}), error => error.code === 'vision_not_configured');
    }
    assert.equal(calls, 0);
    assert.equal((await httpPostJson({ OPENAI_API_KEY: 'fixture' }, 'https://api.openai.com/v1/responses', {})).status, 200);
    assert.equal(calls, 1);
  } finally { globalThis.fetch = original; }
});
test('observer migrations participate in source provenance', () => {
  assert.ok(SOURCE_PATHS.includes('refresh-worker/migrations'));
});
