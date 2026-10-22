import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleApiRequest } from '../cloudflare-worker/src/api.mjs';
import { readJsonBody, issueOAuthAccessToken } from '../cloudflare-worker/src/lib.mjs';
import worker from '../cloudflare-worker/src/index.mjs';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

let sequence = 0;
async function client(run) {
  const calls = [];
  const env = { APP_SECURITY_TOKEN_SECRET: 'test-only-signing-secret', VISION_PROVIDER: 'workers_ai', AI: { async run(...args) { calls.push(args); return run(...args); } } };
  const headers = { origin: 'https://plate.test', 'user-agent': 'vision-regression', 'cf-connecting-ip': `192.0.2.${++sequence}` };
  const session = await handleApiRequest(new Request('https://plate.test/api/vision_session', { headers }), env, {});
  const { token } = await session.json();
  headers.cookie = session.headers.get('set-cookie').split(';')[0];
  headers['content-type'] = 'application/json';
  return { calls, post: (body = {}, extraHeaders = {}, signal) => handleApiRequest(new Request('https://plate.test/api/vision_plate', {
    method: 'POST', signal, headers: { ...headers, ...extraHeaders }, body: JSON.stringify({ image_data_url: 'data:image/jpeg;base64,/9j/2Q==', vision_token: token, lang: 'en', ...body }),
  }), env, {}) };
}
const result = (value) => ({ choices: [{ message: { content: `\`\`\`json\n${JSON.stringify(value)}\n\`\`\`` } }] });

test('native vision returns normalized plate with bounded image inference', async () => {
  const c = await client(() => result({ plate: 'AA 88', confidence: .99, plate_type: 'hong_kong', is_hong_kong_plate: true }));
  const r = await c.post(); assert.equal(r.status, 200); const data = await r.json();
  assert.equal(data.plate, 'AA88'); assert.equal(data.model, '@cf/qwen/qwen3.8-27b');
  const [model, input, options] = c.calls[0]; assert.equal(model, data.model);
  assert.equal(input.messages[0].content[1].image_url.url, 'data:image/jpeg;base64,/9j/2Q==');
  assert.equal(input.max_completion_tokens, 384); assert.equal(input.stream, false); assert.equal(input.store, false); assert.ok(options.signal instanceof AbortSignal);
});
test('native vision preserves Macau and Mainland exclusion', async () => {
  for (const [plate, plate_type] of [['MA-12-34', 'macau'], ['粤Z1234港', 'mainland_china']]) {
    const c = await client(() => result({ plate, plate_type, is_hong_kong_plate: false }));
    const data = await (await c.post()).json(); assert.equal(data.plate, ''); assert.equal(data.confidence, 0); assert.equal(data.ignored_plate_type, plate_type);
  }
});
test('session and origin checks run before native inference', async () => {
  const c = await client(() => { throw Error('must not run'); });
  assert.equal((await c.post({ vision_token: 'invalid' })).status, 403);
  assert.equal((await c.post({}, { origin: 'https://other.test' })).status, 403);
  assert.equal(c.calls.length, 0);
});
test('invalid and oversized uploads never invoke inference', async () => {
  const c = await client(() => { throw Error('must not run'); });
  assert.equal((await c.post({ image_data_url: 'data:text/html;base64,AAAA' })).status, 400);
  const data = `data:image/jpeg;base64,${Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64')}`;
  assert.equal((await c.post({ image_data_url: data })).status, 400); assert.equal(c.calls.length, 0);
});
test('provider failure returns a retryable error without exposing upstream details', async () => {
  const c = await client(() => { throw Error('private provider details'); });
  const r = await c.post(); assert.equal(r.status, 502); assert.deepEqual(await r.json(), { error: 'vision_upstream_error' });
});
test('one scan recovers from a transient native timeout or capacity failure', async () => {
  for (const code of [3007, 3040]) {
    let attempts = 0;
    const c = await client(() => {
      if (++attempts === 1) throw Object.assign(new Error('private provider details'), { code });
      return result({ plate: 'AA88', confidence: .99, is_hong_kong_plate: true });
    });
    const response = await c.post();
    assert.equal(response.status, 200);
    assert.equal((await response.json()).plate, 'AA88');
    assert.equal(attempts, 2);
  }
});
test('transient inference failure is bounded to two attempts and sanitized diagnostics', async () => {
  const originalWarn = console.warn;
  const diagnostics = [];
  console.warn = (...args) => diagnostics.push(args.join(' '));
  try {
    const c = await client(() => { throw Object.assign(new Error('private provider details'), { code: 3007 }); });
    const response = await c.post();
    assert.equal(response.status, 502);
    assert.deepEqual(await response.json(), { error: 'vision_upstream_error' });
    assert.equal(c.calls.length, 2);
    assert.match(diagnostics.join('\n'), /3007/);
    assert.doesNotMatch(diagnostics.join('\n'), /private provider details|base64|test-only-signing-secret|fixture-token/);
  } finally { console.warn = originalWarn; }
});
test('malformed inference output gets one recovery attempt, while valid non-HK output is final', async () => {
  let attempts = 0;
  const c = await client(() => ++attempts === 1 ? { response: '{"plate":' }
    : result({ plate: 'MA-12-34', plate_type: 'macau', is_hong_kong_plate: false }));
  const response = await c.post();
  assert.equal(response.status, 200);
  assert.equal((await response.json()).ignored_plate_type, 'macau');
  assert.equal(attempts, 2);
});
test('permanent native failures and an aborted client never trigger inference replay', async () => {
  for (const code of [3006, 3036, 3042]) {
    const c = await client(() => { throw Object.assign(new Error('private provider details'), { code }); });
    assert.equal((await c.post()).status, 502);
    assert.equal(c.calls.length, 1);
  }
  const controller = new AbortController();
  const c = await client(() => { controller.abort(); throw Object.assign(new Error('request ended'), { code: 3007 }); });
  assert.equal((await c.post({}, {}, controller.signal)).status, 502);
  assert.equal(c.calls.length, 1);
});
test('an exhausted overall inference deadline prevents a second provider request', async () => {
  const originalNow = Date.now;
  const started = originalNow();
  try {
    const c = await client(() => { Date.now = () => started + 30_001; throw Object.assign(new Error('late timeout'), { code: 3007 }); });
    assert.equal((await c.post()).status, 502);
    assert.equal(c.calls.length, 1);
  } finally { Date.now = originalNow; }
});
test('empty and malformed provider output return clear errors', async () => {
  for (const [output, error] of [[{}, 'vision_empty_output'], ...['not JSON', 'null', '[]'].map(response => [{ response }, 'vision_invalid_output'])]) {
    const c = await client(() => output); const r = await c.post(); assert.equal(r.status, 502); assert.deepEqual(await r.json(), { error });
  }
});
test('unusable model confidence is zero rather than null', async () => {
  const c = await client(() => result({ plate: 'AA88', confidence: 'not numeric', is_hong_kong_plate: true }));
  assert.equal((await (await c.post()).json()).confidence, 0);
});

test('explicit OpenAI deployments retain Responses API compatibility', async () => {
  const original = globalThis.fetch;
  const env = { APP_SECURITY_TOKEN_SECRET: 'test-only-signing-secret', OPENAI_API_KEY: 'test-only-provider-key' };
  const headers = { origin: 'https://plate.test', 'user-agent': 'vision-regression', 'cf-connecting-ip': `192.0.2.${++sequence}` };
  const session = await handleApiRequest(new Request('https://plate.test/api/vision_session', { headers }), env, {});
  const { token } = await session.json(); headers.cookie = session.headers.get('set-cookie').split(';')[0]; headers['content-type'] = 'application/json';
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://api.openai.com/v1/responses'); assert.equal(JSON.parse(init.body).max_output_tokens, 190);
    return Response.json({ output_text: JSON.stringify({ plate: 'AA88', confidence: .9, is_hong_kong_plate: true }) });
  };
  try {
    const r = await handleApiRequest(new Request('https://plate.test/api/vision_plate', { method: 'POST', headers, body: JSON.stringify({ image_data_url: 'data:image/jpeg;base64,/9j/2Q==', vision_token: token }) }), env, {});
    assert.equal(r.status, 200); assert.equal((await r.json()).plate, 'AA88');
  } finally { globalThis.fetch = original; }
});

// A zero-buffer source makes consumption/cancellation observable without relying
// on Content-Length or replacing the application reader/authentication boundary.
function streamedRequest(path, chunks, headers = {}) {
  const observed = { bytes: 0, cancelled: false };
  let position = 0;
  const body = new ReadableStream({
    pull(controller) {
      if (position === chunks.length) { controller.close(); return; }
      const chunk = chunks[position++];
      observed.bytes += chunk.byteLength;
      controller.enqueue(chunk);
    },
    cancel() { observed.cancelled = true; },
  }, { highWaterMark: 0 });
  const request = new Request(`https://plate.test${path}`, {
    method: 'POST', body, duplex: 'half', headers,
  });
  return { request, observed };
}
const encode = value => new TextEncoder().encode(value);
const repeatedChunks = (size, count) => Array.from({ length: count }, () => new Uint8Array(size).fill(32));

test('JSON byte limit cancels headerless and understated streams at the first overflowing chunk', async () => {
  for (const headers of [{}, { 'content-length': '1' }]) {
    const { request, observed } = streamedRequest('/api/vision_plate', repeatedChunks(16, 6), headers);
    await assert.rejects(readJsonBody(request, 32), error => error.code === 'payload_too_large' && error.status === 413);
    assert.equal(observed.bytes, 48);
    assert.equal(observed.cancelled, true);
  }
});

test('JSON limits count UTF-8 bytes and preserve multibyte text split across chunks', async () => {
  const bytes = encode('{"plate":"香港"}');
  const exact = streamedRequest('/api/vision_plate', [bytes.slice(0, 11), bytes.slice(11)]);
  assert.deepEqual(await readJsonBody(exact.request, bytes.length), { plate: '香港' });
  const over = streamedRequest('/api/vision_plate', [bytes]);
  await assert.rejects(readJsonBody(over.request, bytes.length - 1), error => error.status === 413);
});

test('oversized advertised body is cancelled without consuming a chunk', async () => {
  const { request, observed } = streamedRequest('/api/vision_plate', repeatedChunks(16, 6), { 'content-length': '96' });
  await assert.rejects(readJsonBody(request, 32), error => error.status === 413);
  assert.equal(observed.bytes, 0);
  assert.equal(observed.cancelled, true);
});

test('MCP cancels oversized streams and preserves ordinary public tool requests', async () => {
  const { request, observed } = streamedRequest('/mcp', repeatedChunks(16384, 8), { 'content-type': 'application/json' });
  const rejected = await worker.fetch(request, {}, {});
  assert.equal(rejected.status, 413);
  assert.equal(observed.bytes, 65536 + 16384);
  assert.equal(observed.cancelled, true);
  const accepted = await worker.fetch(new Request('https://plate.test/mcp', {
    method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    headers: { 'content-type': 'application/json' },
  }), {}, {});
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).result.tools.length, 4);
});

test('invalid OCR bearer is rejected before the request stream is consumed', async () => {
  const { request, observed } = streamedRequest('/api/vision_plate', repeatedChunks(1024, 4), {
    'content-type': 'application/json', authorization: 'Bearer invalid', 'cf-connecting-ip': '192.0.2.190',
  });
  const response = await handleApiRequest(request, { VISION_PROVIDER: 'workers_ai', AI: { run() { assert.fail('must not infer'); } } }, {});
  assert.equal(response.status, 403);
  assert.equal(observed.bytes, 0);
});

test('invalid bearer attempts cannot bypass the pre-authentication OCR IP limit', async () => {
  for (let attempt = 0; attempt < 180; attempt++) {
    const response = await handleApiRequest(new Request('https://plate.test/api/vision_plate', {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer invalid', 'cf-connecting-ip': '192.0.2.191' }, body: '{}',
    }), {}, {});
    assert.equal(response.status, 403);
  }
  const { request, observed } = streamedRequest('/api/vision_plate', repeatedChunks(1024, 4), {
    'content-type': 'application/json', authorization: 'Bearer invalid', 'cf-connecting-ip': '192.0.2.191',
  });
  assert.equal((await handleApiRequest(request, {}, {})).status, 429);
  assert.equal(observed.bytes, 0);
});

let oauthFixture;
async function oauth() {
  if (!oauthFixture) {
    const pair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
    const privateJwk = { ...await crypto.subtle.exportKey('jwk', pair.privateKey), kid: 'fixture' };
    const publicJwk = { ...await crypto.subtle.exportKey('jwk', pair.publicKey), kid: 'fixture' };
    const client = { client_id: 'fixture-client', client_secret: 'fixture-secret', scopes: ['vision:ocr'], token_ttl_seconds: 300 };
    const env = { OAUTH_ISSUER: 'https://plate.test', OAUTH_JWT_PRIVATE_JWK: JSON.stringify(privateJwk), OAUTH_JWKS_JSON: JSON.stringify({ keys: [publicJwk] }), OAUTH_CLIENTS_JSON: JSON.stringify({ [client.client_id]: client }) };
    const issued = await issueOAuthAccessToken(new Request('https://plate.test/api/oauth/token'), env, client);
    oauthFixture = { env, token: issued.access_token };
  }
  return oauthFixture;
}

test('approved OAuth OCR still reaches inference and oversized streams are cancelled', async () => {
  const { env, token } = await oauth();
  let calls = 0;
  const runtime = { ...env, VISION_PROVIDER: 'workers_ai', AI: { async run() { calls++; return result({ plate: 'AA88', confidence: 1 }); } } };
  const headers = { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'cf-connecting-ip': '192.0.2.192' };
  const response = await handleApiRequest(new Request('https://plate.test/api/vision_plate', {
    method: 'POST', headers, body: JSON.stringify({ image_data_url: 'data:image/jpeg;base64,/9j/2Q==' }),
  }), runtime, {});
  assert.equal(response.status, 200);
  assert.equal(calls, 1);
  const { request, observed } = streamedRequest('/api/vision_plate', repeatedChunks(1024 * 1024, 10), headers);
  assert.equal((await handleApiRequest(request, runtime, {})).status, 413);
  assert.equal(observed.bytes, 8 * 1024 * 1024);
  assert.equal(observed.cancelled, true);
  assert.equal(calls, 1);
});

test('OAuth form ingestion is byte-bounded while legitimate token issuance works', async () => {
  const { env } = await oauth();
  const { request, observed } = streamedRequest('/api/oauth/token', repeatedChunks(4096, 8), { 'content-type': 'application/x-www-form-urlencoded' });
  assert.equal((await handleApiRequest(request, env, {})).status, 413);
  assert.equal(observed.bytes, 12288);
  assert.equal(observed.cancelled, true);
  const response = await handleApiRequest(new Request('https://plate.test/api/oauth/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: 'fixture-client', client_secret: 'fixture-secret' }),
  }), env, {});
  assert.equal(response.status, 200);
  assert.equal((await response.json()).token_type, 'Bearer');
});

test('Workers runtime preserves body rejection and legitimate MCP behavior', async () => {
  const modules = ['index.mjs', 'api.mjs', 'lib.mjs', 'contact-unlock.mjs', 'mcp.mjs', 'agent-registration.mjs']
    .map(name => ({ type: 'ESModule', path: new URL(`../cloudflare-worker/src/${name}`, import.meta.url).pathname }));
  modules.push({ type: 'ESModule', path: new URL('../assets/decision-core.mjs', import.meta.url).pathname });
  const mf = new Miniflare(convertV4MiniflareOptions({ modules,
    compatibilityDate: '2026-03-24', compatibilityFlags: ['nodejs_compat'],
  }));
  try {
    const oversized = await mf.dispatchFetch('https://plate.test/mcp', {
      method: 'POST', body: ' '.repeat(65537), headers: { 'content-type': 'application/json' },
    });
    assert.equal(oversized.status, 413);
    const invalid = await mf.dispatchFetch('https://plate.test/api/vision_plate', {
      method: 'POST', body: 'not JSON', headers: { 'content-type': 'application/json', authorization: 'Bearer invalid' },
    });
    assert.equal(invalid.status, 403);
    const legitimate = await mf.dispatchFetch('https://plate.test/mcp', {
      method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    });
    assert.equal(legitimate.status, 200);
    assert.equal((await legitimate.json()).result.tools.length, 4);
  } finally { await mf.dispose(); }
});
