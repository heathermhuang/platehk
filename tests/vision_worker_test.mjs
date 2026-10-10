import assert from 'node:assert/strict';
import { test } from 'node:test';
import { handleApiRequest } from '../cloudflare-worker/src/api.mjs';

let sequence = 0;
async function client(run) {
  const calls = [];
  const env = { APP_SECURITY_TOKEN_SECRET: 'test-only-signing-secret', VISION_PROVIDER: 'workers_ai', AI: { async run(...args) { calls.push(args); return run(...args); } } };
  const headers = { origin: 'https://plate.test', 'user-agent': 'vision-regression', 'cf-connecting-ip': `192.0.2.${++sequence}` };
  const session = await handleApiRequest(new Request('https://plate.test/api/vision_session', { headers }), env, {});
  const { token } = await session.json();
  headers.cookie = session.headers.get('set-cookie').split(';')[0];
  headers['content-type'] = 'application/json';
  return { calls, post: (body = {}, extraHeaders = {}) => handleApiRequest(new Request('https://plate.test/api/vision_plate', {
    method: 'POST', headers: { ...headers, ...extraHeaders }, body: JSON.stringify({ image_data_url: 'data:image/jpeg;base64,/9j/2Q==', vision_token: token, lang: 'en', ...body }),
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
